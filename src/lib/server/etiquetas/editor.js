/**
 * El editor de etiquetas del panel (/admin/etiquetas) contra la base, con el interruptor
 * `etiquetas_db` prendido. Usa las MISMAS operaciones que el editor del archivo
 * (src/lib/utils/tagConfig.js: crear, editar, mover, renombrar, fusionar, alias), así la página
 * es una sola:
 *
 * 1. las etiquetas de la base pasan a la forma del archivo (`recordsToRawTags`);
 * 2. se les aplican las operaciones (`applyTagOps`, que valida igual que siempre);
 * 3. el resultado vuelve a registros (`tagsToRecords`) y se compara con lo que había, por objeto:
 *    solo se escriben las etiquetas que cambiaron.
 *
 * Renombrar (decisión de gorrite): quien edita elige. Por defecto (`keepAlias: false`) el nombre
 * viejo NO queda como alias y las publicaciones que lo usan se reescriben con un commit
 * (`planTagRenameInPosts`, rename.js: lo hace quien llama, panel.js); con `keepAlias: true` el
 * nombre viejo queda como alias y no se toca ninguna publicación.
 *
 * Diferencias con el archivo:
 * - Una etiqueta renombrada sigue siendo el mismo objeto (su texto de la wiki, su historial y su
 *   dirección se mantienen); el alias con el nombre viejo es un objeto nuevo.
 * - El texto de la wiki y los demás datos que el archivo no tiene (`body`, `wiki_*`) se conservan.
 *
 * `planDbTagEdit` es pura (con pruebas); `applyDbTagPlan` escribe con saveObject().
 * Solo imports relativos.
 */
import { applyTagOps, describeOp, lineDiff } from '../../utils/tagConfig.js';
import { saveObject } from '../objects/save.js';
import { TAG_TYPE } from '../objects/types/etiqueta.js';
import { ObjectError } from '../objects/errors.js';
import { freeTagSlug } from './importer.js';
import { DATA_KEYS, recordsToRawTags, tagsToRecords } from './model.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./model.js').TagRecord} TagRecord */
/** @typedef {TagRecord & { id: number, slug: string, version: number }} StoredTag */
/** @typedef {import('../../utils/tagConfig.js').TagOp} TagOp */

/**
 * @typedef {{
 *   summary: string[],
 *   warnings: string[],
 *   deletes: StoredTag[],
 *   renames: { tag: StoredTag, key: string }[],
 *   creates: string[],
 *   writes: { key: string, id: number | null, version: number | null, record: TagRecord, data: Record<string, unknown> }[],
 *   changes: { key: string, kind: 'create' | 'update' | 'delete', before: string, after: string }[]
 * }} DbTagPlan
 */

/** Como `clean` de tagConfig: espacios de más afuera. @param {unknown} s */
const clean = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();

/** Los datos que vienen del archivo (los que el editor cambia). @param {Record<string, unknown>} data */
function fileData(data) {
	return Object.fromEntries(
		DATA_KEYS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]])
	);
}

/** Los datos que el archivo no tiene (texto de la wiki…), que se conservan. @param {Record<string, unknown>} data */
function extraData(data) {
	return Object.fromEntries(
		Object.entries(data).filter(([k]) => k !== 'key' && !DATA_KEYS.includes(/** @type {any} */ (k)))
	);
}

/**
 * Texto de una etiqueta para la vista previa (una línea por dato).
 *
 * @param {TagRecord | null} r
 */
export function describeTagRecord(r) {
	if (!r) return '';
	const lines = [`nombre: ${r.key}`];
	if (r.aliasOf) return [...lines, `alias de: ${r.aliasOf}`].join('\n');
	if (r.title !== r.key) lines.push(`nombre visible: ${r.title}`);
	const d = r.data;
	if (d.icon) lines.push(`ícono: ${d.icon}`);
	if (d.color) lines.push(`color: ${d.color}`);
	if (d.image) lines.push(`imagen: ${d.image}`);
	if (d.meta_venta) lines.push(`meta de venta: ${d.meta_venta}`);
	if (r.parents.length) lines.push(`madres: ${r.parents.map((p) => p.key).join(', ')}`);
	if (r.related.length) lines.push(`relacionadas: ${r.related.join(', ')}`);
	if (d.description) lines.push(`descripción: ${String(d.description).replace(/\n/g, '\n  ')}`);
	return lines.join('\n');
}

/**
 * Qué escribir en la base para aplicar `ops` a las etiquetas `current` (TODAS, también las
 * ocultas: lo que falte se borraría). Tira un Error con un mensaje para la persona si una
 * operación no tiene sentido (como el editor del archivo).
 *
 * @param {readonly StoredTag[]} current
 * @param {readonly TagOp[]} ops
 * @returns {DbTagPlan}
 */
export function planDbTagEdit(current, ops) {
	if (!ops.length) throw new Error('No hay cambios.');
	/** @type {string[]} */
	const warnings = [];
	const byKey = new Map(current.map((t) => [t.key, t]));
	const entries = recordsToRawTags(current).map((value) => ({ value }));
	const before = tagsToRecords(entries.map((e) => e.value)).records;
	const after = tagsToRecords(applyTagOps(entries, [...ops]).map((e) => e.value)).records;

	// Qué objeto es cada nombre de después: el mismo nombre, salvo los renombrados.
	/** @type {Map<string, string | null>} nombre de después → nombre de antes */
	const origOf = new Map();
	/** @type {Set<string>} */
	const renamedAway = new Set();
	for (const op of ops) {
		if (op.type !== 'rename') continue;
		const to = clean(op.to);
		if (to === op.from) continue;
		const o = origOf.has(op.from)
			? /** @type {string | null} */ (origOf.get(op.from))
			: renamedAway.has(op.from)
				? null
				: op.from;
		origOf.delete(op.from);
		renamedAway.add(op.from);
		origOf.set(to, o);
	}
	/** @param {string} key nombre de después @returns {StoredTag | undefined} */
	const storedOf = (key) => {
		const o = origOf.has(key) ? origOf.get(key) : renamedAway.has(key) ? null : key;
		return o == null ? undefined : byKey.get(o);
	};
	/** Identidad de un nombre de después (el id, o `new:` + nombre). @param {string} key */
	const identAfter = (key) => {
		const s = storedOf(key);
		return s ? String(s.id) : `new:${key}`;
	};
	/** @param {string} key */
	const identBefore = (key) => {
		const s = byKey.get(key);
		return s ? String(s.id) : `new:${key}`;
	};
	/**
	 * Lo que se compara, con las relaciones por objeto (renombrar una madre no cambia a sus hijas).
	 *
	 * @param {TagRecord} r
	 * @param {(key: string) => string} ident
	 */
	const fingerprint = (r, ident) =>
		JSON.stringify([
			r.key,
			r.title,
			Object.entries(fileData(r.data)).sort(([a], [b]) => a.localeCompare(b)),
			r.parents.map((p) => [ident(p.key), p.orden]),
			r.related.map(ident),
			r.aliasOf ? ident(r.aliasOf) : null
		]);
	/**
	 * Hijas de cada madre, en orden: si cambia, se reescriben todas (el orden es relativo).
	 *
	 * @param {readonly TagRecord[]} records
	 * @param {(key: string) => string} ident
	 */
	const siblings = (records, ident) => {
		/** @type {Map<string, { ident: string, orden: number }[]>} */
		const m = new Map();
		for (const r of records) {
			for (const p of r.parents) {
				const list = m.get(ident(p.key)) ?? [];
				list.push({ ident: ident(r.key), orden: p.orden });
				m.set(ident(p.key), list);
			}
		}
		return new Map(
			[...m].map(([k, list]) => [
				k,
				JSON.stringify(list.sort((a, b) => a.orden - b.orden).map((x) => x.ident))
			])
		);
	};

	const beforeByIdent = new Map(before.map((r) => [identBefore(r.key), r]));
	/** @type {Set<string>} */
	const dirty = new Set();
	const sibBefore = siblings(before, identBefore);
	const sibAfter = siblings(after, identAfter);
	for (const [parent, seq] of sibAfter) {
		if (sibBefore.get(parent) === seq) continue;
		for (const r of after) {
			if (r.parents.some((p) => identAfter(p.key) === parent)) dirty.add(identAfter(r.key));
		}
	}

	/** @type {DbTagPlan} */
	const plan = {
		summary: ops.map(describeOp),
		warnings,
		deletes: [],
		renames: [],
		creates: [],
		writes: [],
		changes: []
	};
	/** @type {Set<number>} */
	const kept = new Set();
	for (const r of after) {
		const stored = storedOf(r.key);
		const ident = identAfter(r.key);
		const prev = beforeByIdent.get(ident);
		if (stored) kept.add(stored.id);
		const changed =
			!stored ||
			!prev ||
			dirty.has(ident) ||
			fingerprint(prev, identBefore) !== fingerprint(r, identAfter);
		if (!changed) continue;
		if (stored && stored.key !== r.key) plan.renames.push({ tag: stored, key: r.key });
		if (!stored) plan.creates.push(r.key);
		const extra = stored ? extraData(stored.data) : {};
		if (r.aliasOf && Object.keys(extra).length) {
			warnings.push(
				`«${r.key}» pasa a ser alias de «${r.aliasOf}»: su texto de la wiki queda guardado en el historial, pero deja de verse.`
			);
		}
		plan.writes.push({
			key: r.key,
			id: stored?.id ?? null,
			version: stored?.version ?? null,
			record: r,
			data: r.aliasOf ? { key: r.key } : { key: r.key, ...extra, ...r.data }
		});
		plan.changes.push({
			key: r.key,
			kind: stored ? 'update' : 'create',
			before: describeTagRecord(prev ?? null),
			after: describeTagRecord(r)
		});
	}
	for (const t of current) {
		if (kept.has(t.id)) continue;
		plan.deletes.push(t);
		plan.changes.push({ key: t.key, kind: 'delete', before: describeTagRecord(t), after: '' });
	}
	return plan;
}

/**
 * La vista previa con la misma forma que la del archivo (`previewOf` de tagEditor.js): un
 * «archivo» por etiqueta que cambia.
 *
 * @param {DbTagPlan} plan
 * @param {{ max?: number }} [opts]
 */
export function dbPreviewOf(plan, { max = 60 } = {}) {
	const KIND = { create: 'nueva', update: 'cambia', delete: 'se borra' };
	return {
		summary: plan.summary,
		warnings: plan.warnings,
		total: plan.changes.length,
		files: plan.changes.slice(0, max).map((c) => {
			const hunks = lineDiff(c.before ? `${c.before}\n` : '', c.after ? `${c.after}\n` : '', 50);
			const lines = hunks.flatMap((h) => h.lines);
			return {
				path: `«${c.key}» (${KIND[c.kind]})`,
				added: lines.filter((l) => l.t === '+').length,
				removed: lines.filter((l) => l.t === '-').length,
				hunks,
				more: 0
			};
		})
	};
}

/** @param {unknown} error */
function describeError(error) {
	if (error instanceof ObjectError) {
		if (error.code === 'version_conflict') {
			return 'alguien la cambió mientras tanto: recargá la página y volvé a intentar';
		}
		const details = error.errors.map((e) => e.message).join(' ');
		return details ? `${error.message} ${details}` : error.message;
	}
	return String(error instanceof Error ? error.message : error);
}

/**
 * Escribe un plan. Orden: borrar, cambiar nombres (libera los nombres viejos), crear las nuevas
 * (solo con su nombre), y por último datos y relaciones. No es una sola tanda: si algo falla,
 * lo anterior queda guardado y el error dice qué etiqueta fue.
 *
 * @param {D1Database} db
 * @param {DbTagPlan} plan
 * @param {{ actor: string, now?: number }} ctx
 * @returns {Promise<{ written: number, errors: string[] }>}
 */
export async function applyDbTagPlan(db, plan, { actor, now = Date.now() }) {
	/** @type {string[]} */
	const errors = [];
	let written = 0;
	/** @type {Map<number, number>} id → versión actual */
	const versions = new Map();
	/** @type {Map<string, number>} nombre de después → id */
	const ids = new Map();
	const { results: all } = await db
		.prepare(
			`SELECT id, slug, version, deleted_at, json_extract(data, '$.key') AS key FROM objects
			WHERE type = ?1`
		)
		.bind(TAG_TYPE)
		.all();
	const slugs = new Set(all.map((o) => String(o.slug)));
	for (const o of all) {
		if (o.deleted_at == null) ids.set(String(o.key), Number(o.id));
	}
	/** @param {{ id: number, version: number }} t */
	const versionOf = (t) => versions.get(t.id) ?? t.version;
	/**
	 * @param {string} key
	 * @param {() => Promise<import('../objects/read.js').StoredObject>} fn
	 */
	const attempt = async (key, fn) => {
		try {
			const saved = await fn();
			versions.set(saved.id, saved.version);
			written++;
			return saved;
		} catch (error) {
			errors.push(`«${key}»: ${describeError(error)}`);
			return null;
		}
	};

	for (const t of plan.deletes) {
		const ok = await attempt(t.key, () =>
			saveObject(
				db,
				{ id: t.id, type: TAG_TYPE, version: versionOf(t), deleted: true },
				{ actor, now }
			)
		);
		if (ok) ids.delete(t.key);
	}
	if (errors.length) return { written, errors };

	// Nombres nuevos: primero los que no pisan el nombre viejo de otro renombrado.
	const pending = [...plan.renames];
	while (pending.length) {
		const i = Math.max(
			0,
			pending.findIndex((r) => !pending.some((o) => o !== r && o.tag.key === r.key))
		);
		const [{ tag, key }] = pending.splice(i, 1);
		const ok = await attempt(key, () =>
			saveObject(
				db,
				{
					id: tag.id,
					type: TAG_TYPE,
					version: versionOf(tag),
					title: tag.title === tag.key ? key : tag.title,
					data: { ...tag.data, key }
				},
				{ actor, now }
			)
		);
		if (ok) {
			if (ids.get(tag.key) === tag.id) ids.delete(tag.key);
			ids.set(key, tag.id);
		}
	}
	if (errors.length) return { written, errors };

	for (const key of plan.creates) {
		const slug = freeTagSlug(key, slugs);
		const saved = await attempt(key, () =>
			saveObject(db, { type: TAG_TYPE, title: key, slug, data: { key } }, { actor, now })
		);
		if (saved) {
			slugs.add(saved.slug);
			ids.set(key, saved.id);
		}
	}
	if (errors.length) return { written, errors };

	for (const w of plan.writes) {
		const id = w.id ?? ids.get(w.key);
		if (id === undefined) continue;
		/** @param {string} k */
		const to = (k) => {
			const target = ids.get(k);
			if (target === undefined) errors.push(`«${w.key}»: no se encontró «${k}»`);
			return target;
		};
		const r = w.record;
		const edges = {
			hijo_de: r.parents.flatMap((p) => {
				const t = to(p.key);
				return t === undefined ? [] : [{ to: t, data: { orden: p.orden } }];
			}),
			relacionada_con: r.related.flatMap((k) => {
				const t = to(k);
				return t === undefined ? [] : [t];
			}),
			alias_de: r.aliasOf
				? (() => {
						const t = to(/** @type {string} */ (r.aliasOf));
						return t === undefined ? [] : [t];
					})()
				: []
		};
		const version = versions.get(id) ?? w.version ?? undefined;
		await attempt(w.key, () =>
			saveObject(
				db,
				{
					id,
					type: TAG_TYPE,
					version,
					title: r.title,
					data: w.data,
					edges
				},
				{ actor, now }
			)
		);
	}
	return { written, errors };
}

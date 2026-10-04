/**
 * Etiquetas: la forma intermedia entre el archivo de hoy (src/lib/utils/hardcodedTags.js + los
 * textos de la wiki) y los objetos `etiqueta` de la base. Funciones puras, sin base ni Vite: las
 * usan el importador (Worker y script de Node), la lectura y las pruebas.
 *
 * - `tagsToRecords` lee el archivo como lo lee hoy `tagsFactory` (src/lib/utils/tags.js): las
 *   hijas que no están declaradas existen igual, `aka` y `aliasOf` son alias, y un alias que
 *   aparece como hija o relacionada cuenta como la etiqueta de la que es alias.
 * - `recordsToRawTags` hace el camino de vuelta: la lista que `tagsFactory` espera. Las pruebas
 *   verifican que el viaje de ida y vuelta da el mismo árbol (model.test.js).
 *
 * Solo imports relativos.
 */
import YAML from 'yaml';
import { asText as str, asTextList as strList } from '../../utils/text.js';

/**
 * Una etiqueta como se guarda (sin ids de la base: las relaciones van por `key`).
 *
 * @typedef {{
 *   key: string,
 *   title: string,
 *   data: Record<string, unknown>,
 *   parents: { key: string, orden: number }[],
 *   related: string[],
 *   aliasOf: string | null
 * }} TagRecord
 */

/** Los campos del archivo de hoy que se copian (el resto, como funciones agregadas, no). */
const RAW_KEYS = /** @type {const} */ ([
	'id',
	'visible_name',
	'icon',
	'color',
	'description',
	'image',
	'children',
	'related',
	'aka',
	'aliasOf'
]);

/** Campos de datos que vienen del archivo, con el mismo nombre. */
export const DATA_KEYS = /** @type {const} */ (['icon', 'color', 'description', 'image']);

/**
 * Copia limpia de una entrada del archivo (tagsFactory le agrega cosas a los objetos que recibe).
 *
 * @param {Record<string, unknown>} t
 */
function cleanEntry(t) {
	/** @type {Record<string, any>} */
	const out = {};
	for (const k of RAW_KEYS) {
		const v = t?.[k];
		if (v === undefined || v === null) continue;
		out[k] = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v : String(v);
	}
	return out;
}

/**
 * Separa el frontmatter del cuerpo de un .md.
 *
 * @param {string} raw
 */
export function splitMarkdown(raw) {
	const text = String(raw).replace(/\r\n?/g, '\n');
	const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
	if (!m) return { frontmatter: '', body: text };
	return { frontmatter: m[1], body: text.slice(m[0].length) };
}

/**
 * Lee un texto de la wiki: a qué etiqueta pertenece (`wiki:`), título, resumen, autores y cuerpo.
 *
 * @param {string} raw
 */
export function parseWikiFile(raw) {
	const { frontmatter, body } = splitMarkdown(raw);
	let meta = {};
	try {
		const parsed = frontmatter.trim() ? YAML.parse(frontmatter, { schema: 'failsafe' }) : {};
		meta = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		meta = {};
	}
	const m = /** @type {Record<string, unknown>} */ (meta);
	return {
		wiki: str(m.wiki),
		title: str(m.title),
		summary: str(m.summary),
		authors: strList(m.authors),
		tags: strList(m.tags),
		body: body.replace(/^(?:[ \t]*\n)+/, '').trimEnd()
	};
}

/**
 * El archivo de etiquetas (y los textos de la wiki) como registros para la base.
 *
 * @param {readonly Record<string, unknown>[]} rawTags el contenido de hardcodedTags.js
 * @param {readonly { name: string, raw: string }[]} [wikiFiles] los .md de la wiki (`name` sin .md)
 * @returns {{ records: TagRecord[], warnings: string[] }}
 */
export function tagsToRecords(rawTags, wikiFiles = []) {
	/** @type {string[]} */
	const warnings = [];
	const entries = rawTags.map(cleanEntry);
	/** @type {Map<string, Record<string, any>>} */
	const byId = new Map();
	for (const e of entries) {
		if (typeof e.id !== 'string') continue;
		if (!e.id.trim()) {
			warnings.push('hay una etiqueta sin nombre: no se importa');
			continue;
		}
		byId.set(e.id, e); // como un Map: la última gana, en el lugar de la primera
	}

	// Alias: `aliasOf` y `aka` (como en tagsFactory, el último que lo nombra gana).
	/** @type {Map<string, string>} */
	const alias = new Map();
	for (const e of byId.values()) {
		if (e.aliasOf) alias.set(e.id, e.aliasOf);
	}
	for (const e of byId.values()) {
		for (const a of e.aka ?? []) {
			if (!a || a === e.id) continue;
			if (byId.has(a) && !byId.get(a)?.aliasOf) {
				warnings.push(`«${a}» es una etiqueta y también un alias de «${e.id}»: queda como alias`);
			}
			alias.set(a, e.id);
		}
	}

	/** @type {Map<string, TagRecord>} */
	const records = new Map();
	/** @param {string} key */
	const ensure = (key) => {
		let r = records.get(key);
		if (!r) {
			r = { key, title: key, data: {}, parents: [], related: [], aliasOf: null };
			records.set(key, r);
		}
		return r;
	};
	/** @param {string} key */
	const resolve = (key) => alias.get(key) ?? key;
	/** @param {string} key */
	const isCanonical = (key) => !alias.has(key) && byId.has(key);

	for (const e of byId.values()) {
		if (!isCanonical(e.id)) continue;
		const r = ensure(e.id);
		if (e.visible_name && e.visible_name !== e.id) r.title = e.visible_name;
		// (Como los guarda la base: las de una línea, sin espacios en las puntas.)
		for (const k of DATA_KEYS) {
			const v = k === 'description' ? e[k] : e[k]?.trim();
			if (v?.trim()) r.data[k] = v;
		}
	}

	// Hijas (las no declaradas existen igual, como en tagsFactory).
	for (const e of byId.values()) {
		if (!isCanonical(e.id)) continue;
		(e.children ?? []).forEach((/** @type {string} */ child, /** @type {number} */ i) => {
			const key = resolve(child);
			if (!key) return;
			if (alias.has(child) && !isCanonical(key) && !records.has(key)) {
				warnings.push(`«${child}» es alias de «${key}», que no existe: no se importa`);
				return;
			}
			if (key === e.id) return;
			const r = ensure(key);
			if (!r.parents.some((p) => p.key === e.id)) r.parents.push({ key: e.id, orden: i });
		});
	}

	// Relacionadas (las declaradas en cada una; al leer se muestran en los dos sentidos).
	for (const e of byId.values()) {
		if (!isCanonical(e.id)) continue;
		const r = /** @type {TagRecord} */ (records.get(e.id));
		for (const rel of e.related ?? []) {
			const key = resolve(rel);
			if (!records.has(key)) {
				warnings.push(`«${e.id}» está relacionada con «${rel}», que no existe: no se importa`);
				continue;
			}
			if (key !== e.id && !r.related.includes(key)) r.related.push(key);
		}
	}

	// Textos de la wiki: el cuerpo de su etiqueta.
	for (const file of [...wikiFiles].sort((a, b) => a.name.localeCompare(b.name))) {
		if (file.name.startsWith('_')) continue;
		const w = parseWikiFile(file.raw);
		if (!w.wiki) {
			warnings.push(`wiki/${file.name}.md no dice de qué etiqueta es (wiki:): no se importa`);
			continue;
		}
		const key = resolve(w.wiki);
		if (!records.has(key)) {
			warnings.push(`wiki/${file.name}.md es de «${w.wiki}», que no estaba: se crea la etiqueta`);
		}
		const r = ensure(key);
		if (r.data.body !== undefined) {
			warnings.push(`«${key}» tiene dos textos de la wiki: queda wiki/${file.name}.md`);
		}
		if (w.body) r.data.body = w.body;
		if (w.title) r.data.wiki_title = w.title;
		if (w.summary) r.data.wiki_summary = w.summary;
		if (w.authors.length) r.data.wiki_authors = w.authors;
		if (w.tags.length) r.data.wiki_tags = w.tags;
	}

	// Alias al final (apuntan a etiquetas que ya existen).
	for (const [key, target] of alias) {
		const to = resolve(target);
		if (!records.has(to) || alias.has(to)) {
			warnings.push(`«${key}» es alias de «${target}», que no existe: no se importa`);
			continue;
		}
		if (records.has(key)) continue; // (no pasa: una canónica nunca está en `alias`)
		records.set(key, { key, title: key, data: {}, parents: [], related: [], aliasOf: to });
	}

	return { records: [...records.values()], warnings };
}

/**
 * Los registros (de la base) como la lista que espera `tagsFactory`: las etiquetas en el orden en
 * que vienen, con sus `children` ordenados por `orden`, y los alias como `{ id, aliasOf }`.
 *
 * @param {readonly TagRecord[]} records
 * @returns {RawTag[]}
 */
export function recordsToRawTags(records) {
	/** @type {Map<string, { key: string, orden: number, i: number }[]>} */
	const children = new Map();
	records.forEach((r, i) => {
		if (r.aliasOf) return;
		for (const p of r.parents) {
			const list = children.get(p.key) ?? [];
			list.push({ key: r.key, orden: p.orden, i });
			children.set(p.key, list);
		}
	});
	/** @type {any[]} */
	const out = [];
	for (const r of records) {
		if (r.aliasOf) continue;
		/** @type {Record<string, unknown>} */
		const t = { id: r.key };
		if (r.title && r.title !== r.key) t.visible_name = r.title;
		for (const k of DATA_KEYS) if (r.data[k] !== undefined) t[k] = r.data[k];
		const kids = children.get(r.key);
		if (kids?.length) {
			t.children = kids.sort((a, b) => a.orden - b.orden || a.i - b.i).map((c) => c.key);
		}
		if (r.related.length) t.related = [...r.related];
		out.push(t);
	}
	for (const r of records) {
		if (r.aliasOf) out.push({ id: r.key, aliasOf: r.aliasOf });
	}
	return out;
}

/**
 * Lo que se compara para saber si una etiqueta cambió en el archivo desde la última importación.
 *
 * @param {TagRecord} r
 */
export function recordFingerprint(r) {
	const data = Object.fromEntries(Object.entries(r.data).sort(([a], [b]) => a.localeCompare(b)));
	return JSON.stringify([r.key, r.title, data, r.parents, r.related, r.aliasOf]);
}

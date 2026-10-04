/**
 * Los eventos de prueba del modo demo como objetos `evento` de la base del preview (docs/demo.md),
 * para `reloadDemoData` (./seed.js). Desde «solo base» el sitio lee los eventos solo de la base:
 * los `.md` en `demo_files` ya no se ven.
 *
 * **DECIDIDO POR CLAUDE, A CONFIRMAR** (gorrite): cada evento de prueba es SIEMPRE el mismo objeto,
 * de un día para el otro. Su identidad es su «lugar» en la lista de eventos de prueba
 * (`data.extra.demo_slot`, p. ej. `noche-latex-4`: la cuarta Noche Látex), no su dirección (que
 * lleva la fecha y cambia en cada recarga). Recargar actualiza ese objeto en su lugar (dirección,
 * fechas, título, personas, etiquetas, lugar) con saveObject(): la cantidad de objetos y de edges no
 * crece. Cada guardado deja su revisión (`object_revisions`, fuente `demo`): el historial es «todo,
 * para siempre» y no se borra; crece unas 18 filas chicas por cada vez que alguien aprieta
 * «Recargar datos de prueba», solo en la base del preview.
 *
 * Qué toca, y nada más:
 * - los objetos `evento` con dirección `demo-*` y la marca `demo_slot` (los del seed);
 * - un evento `demo-*` sin la marca que tiene la dirección que le toca hoy a uno de prueba (por
 *   ejemplo, uno importado desde Contenido → Importar con los `.md` de la rama `demo`, que genera
 *   este mismo seed): si ese lugar todavía no tiene objeto, lo adopta (le pone la marca); si ya
 *   tiene, lo da de baja (borrado suave, con otra dirección) para liberar la dirección. En los dos
 *   casos le saca su fila de `content_sources` (si no, su dirección vieja taparía la nueva).
 * Un evento que no es `demo-*` nunca se toca: si tiene la dirección que le tocaba a uno de prueba,
 * ese se saltea (`skipped`).
 *
 * Solo imports relativos (corre en el Worker y en las pruebas sin Vite).
 */
import { saveObject } from '../objects/save.js';
import { coreTypes, validateData } from '../objects/types/index.js';
import { markdownToEvent } from '../contenido/markdown.js';
import { dehydrateContent } from '../contenido/relaciones.js';
import { revisionStatement } from '../contenido/revisions.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La clave de `data.extra` que dice qué evento de prueba es un objeto. */
export const DEMO_SLOT_KEY = 'demo_slot';
/** Las relaciones del evento que el seed deja como las define (las que no manda, vacías). */
const EDGE_KINDS = ['lugar', 'persona', 'etiqueta', 'parte', 'portada'];

/**
 * @typedef {object} DemoEventInput
 * @prop {string} slot identidad estable (no cambia de un día para el otro)
 * @prop {string} slug la dirección de hoy (`demo-…-AAAA-MM-DD`)
 * @prop {string} markdown el evento como .md (`eventMarkdown`)
 * @prop {number | null} venueId el lugar de prueba («sucede en»), o ninguno
 */

/**
 * @typedef {{ id: number, slug: string, version: number }} Row
 */

/**
 * @param {string} slug
 */
const isDemoSlug = (slug) => slug.startsWith('demo-');

/**
 * Guarda los eventos de prueba como objetos (crea los que faltan, actualiza los que ya están).
 *
 * @param {D1Database} db
 * @param {{ events: DemoEventInput[], actor: string, now: number, tables: Set<string> }} opts
 * @returns {Promise<{ saved: number, created: number, retired: number, venuesLinked: number, skipped: string[] }>}
 */
export async function saveDemoEvents(db, { events, actor, now, tables }) {
	const out = {
		saved: 0,
		created: 0,
		retired: 0,
		venuesLinked: 0,
		skipped: /** @type {string[]} */ ([])
	};
	if (!tables.has('objects') || !tables.has('edges') || !events.length) return out;
	// Solo direcciones de prueba: nada fuera de `demo-*` se crea ni se mueve.
	const foreign = events.find((e) => !isDemoSlug(e.slug));
	if (foreign)
		throw new Error(`Evento de prueba con una dirección que no es demo-*: ${foreign.slug}`);
	const hasSources = tables.has('content_sources');
	const hasRevisions = tables.has('object_revisions');
	const def = /** @type {import('../objects/types/index.js').CoreType} */ (coreTypes.get('evento'));

	/**
	 * Lo que va en la misma tanda de cada guardado: sacar la fila de `content_sources` (la dirección
	 * del evento es la del objeto) y la revisión.
	 * @param {number | null} id
	 */
	const also = (id) => (/** @type {import('../objects/save.js').SavedRef} */ self) => [
		...(hasSources && id !== null
			? [db.prepare('DELETE FROM content_sources WHERE object_id = ?1').bind(id)]
			: []),
		...(hasRevisions ? [revisionStatement(db, self, 'demo')] : [])
	];

	// 1. Los objetos de prueba que ya hay, por su lugar.
	const { results: marked } = await db
		.prepare(
			`SELECT id, slug, version, json_extract(data, '$.extra.${DEMO_SLOT_KEY}') AS slot
			FROM objects
			WHERE type = 'evento' AND slug LIKE 'demo-%'
				AND json_extract(data, '$.extra.${DEMO_SLOT_KEY}') IS NOT NULL
			ORDER BY id`
		)
		.all();
	/** @type {Map<string, Row>} */
	const bySlot = new Map();
	/** @type {Row[]} */
	const leftovers = [];
	const wanted = new Set(events.map((e) => e.slot));
	for (const r of marked) {
		const row = { id: Number(r.id), slug: String(r.slug), version: Number(r.version) };
		const slot = String(r.slot);
		if (wanted.has(slot) && !bySlot.has(slot)) bySlot.set(slot, row);
		else leftovers.push(row);
	}
	const ownIds = new Set([...bySlot.values()].map((r) => r.id));

	// 2. Quién más tiene las direcciones de hoy (por su dirección o por la de su .md importado).
	const targets = events.map((e) => e.slug);
	const { results: holders } = await db
		.prepare(
			hasSources
				? `SELECT o.id, o.slug, o.version, s.legacy_slug FROM objects o
					LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = 'calendario'
					WHERE o.type = 'evento' AND (o.slug IN (SELECT value FROM json_each(?1))
						OR s.legacy_slug IN (SELECT value FROM json_each(?1)))
					ORDER BY o.id`
				: `SELECT id, slug, version, NULL AS legacy_slug FROM objects
					WHERE type = 'evento' AND slug IN (SELECT value FROM json_each(?1)) ORDER BY id`
		)
		.bind(JSON.stringify(targets))
		.all();
	const slotOfTarget = new Map(events.map((e) => [e.slug, e.slot]));
	/** @type {Set<string>} */
	const skip = new Set();
	/** @type {Set<number>} los que ya se resolvieron acá (adoptados o dados de baja) */
	const touched = new Set();
	for (const h of holders) {
		const row = { id: Number(h.id), slug: String(h.slug), version: Number(h.version) };
		if (ownIds.has(row.id)) continue; // uno de prueba: lo resuelve el orden de abajo
		const target = slotOfTarget.has(row.slug) ? row.slug : String(h.legacy_slug);
		const slot = /** @type {string} */ (slotOfTarget.get(target));
		if (!isDemoSlug(row.slug)) {
			skip.add(slot); // no es de prueba: nunca se toca
			continue;
		}
		touched.add(row.id);
		if (!bySlot.has(slot)) {
			bySlot.set(slot, row);
			ownIds.add(row.id);
			continue;
		}
		if (await retire(row)) out.retired++;
		else skip.add(slot);
	}

	// Los de prueba que sobran (un lugar que ya no está en la lista): borrado suave, una vez.
	for (const row of leftovers) {
		if (touched.has(row.id)) continue;
		const cur = await db
			.prepare('SELECT deleted_at FROM objects WHERE id = ?1')
			.bind(row.id)
			.first();
		if (cur && cur.deleted_at == null) {
			await saveObject(
				db,
				{ id: row.id, type: def.type, version: row.version, deleted: true },
				{ actor, now, also: also(null) }
			);
		}
	}

	// 3. Guardar, en un orden en que ninguna dirección choque: si la dirección que le toca a uno la
	// tiene todavía otro de prueba, primero se mueve ese.
	/** @type {Map<string, string>} dirección actual → lugar, de los objetos de prueba */
	const holderOf = new Map();
	for (const [slot, row] of bySlot) holderOf.set(row.slug, slot);
	let pending = events.filter((e) => {
		if (skip.has(e.slot)) out.skipped.push(e.slug);
		return !skip.has(e.slot);
	});
	while (pending.length) {
		const next = [];
		for (const e of pending) {
			const blocker = holderOf.get(e.slug);
			if (blocker && blocker !== e.slot) next.push(e);
			else await write(e);
		}
		if (next.length === pending.length) {
			// Un ciclo (no pasa con fechas corridas todas igual): uno a una dirección provisoria.
			const slot = /** @type {string} */ (holderOf.get(next[0].slug));
			const row = /** @type {Row} */ (bySlot.get(slot));
			const saved = await saveObject(
				db,
				{ id: row.id, type: def.type, version: row.version, slug: `demo-provisorio-${row.id}` },
				{ actor, now, also: also(null) }
			);
			holderOf.delete(row.slug);
			row.slug = saved.slug;
			row.version = saved.version;
			holderOf.set(row.slug, slot);
		}
		pending = next;
	}
	return out;

	/**
	 * Da de baja un evento `demo-*` sin la marca que tiene la dirección de uno de prueba.
	 * @param {Row} row
	 */
	async function retire(row) {
		try {
			await saveObject(
				db,
				{
					id: row.id,
					type: def.type,
					version: row.version,
					slug: `${row.slug.slice(0, 80).replace(/-+$/, '')}-baja-${row.id}`,
					deleted: true
				},
				{ actor, now, also: also(row.id) }
			);
			return true;
		} catch (error) {
			console.error('[demo] no se pudo dar de baja un evento de prueba viejo:', row.slug, error);
			return false;
		}
	}

	/** @param {DemoEventInput} e */
	async function write(e) {
		const mapped = markdownToEvent(e.slug, e.markdown);
		const extra = /** @type {Record<string, unknown>} */ (mapped.data.extra ?? {});
		const validated = validateData(def, {
			...mapped.data,
			extra: { ...extra, [DEMO_SLOT_KEY]: e.slot }
		});
		if (!validated.ok) {
			throw new Error(
				`Evento de prueba inválido (${e.slug}): ${validated.errors.map((x) => x.message).join('; ')}`
			);
		}
		const split = await dehydrateContent(db, 'calendario', validated.data);
		/** @type {Record<string, import('../objects/edges.js').EdgeInput[]>} */
		const edges = Object.fromEntries(EDGE_KINDS.map((k) => [k, []]));
		Object.assign(edges, split.edges ?? {});
		edges.lugar = e.venueId ? [{ to: e.venueId, data: null }] : [];
		const row = bySlot.get(e.slot);
		const saved = await saveObject(
			db,
			{
				...(row ? { id: row.id, version: row.version, deleted: false } : {}),
				type: def.type,
				slug: e.slug,
				title: mapped.title,
				data: split.data,
				edges,
				visibility: mapped.visibility
			},
			{ actor, now, also: also(row?.id ?? null) }
		);
		if (row) holderOf.delete(row.slug);
		else out.created++;
		holderOf.set(saved.slug, e.slot);
		bySlot.set(e.slot, { id: saved.id, slug: saved.slug, version: saved.version });
		out.saved++;
		if (e.venueId) out.venuesLinked++;
	}
}

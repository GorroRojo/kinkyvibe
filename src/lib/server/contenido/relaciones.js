/**
 * Las relaciones del contenido (eventos y material) que se guardan como edges y se leen dentro de
 * `data`, juntas: las personas con perfil (./personasEdges.js, solo eventos) y las etiquetas
 * (./etiquetasEdges.js, eventos y material).
 *
 * Quien lee de a muchos (el panel, la importación, la página de un post) usa
 * {@link contentEdgesOf}/{@link hydrateContent}: UNA consulta para los dos tipos de edge, para todos
 * los objetos pedidos (nunca una por objeto). Quien guarda usa {@link dehydrateContent}.
 *
 * Solo imports relativos (la importación se prueba sin Vite).
 */
import { dehydratePersonas, PERSONA_EDGE, withPersonaEdges } from './personasEdges.js';
import { dehydrateTags, TAG_EDGE, TAG_EDGE_TYPES, withTagEdges } from './etiquetasEdges.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./personasEdges.js').PersonaEdgeRow} PersonaEdgeRow */
/** @typedef {import('./etiquetasEdges.js').TagEdgeRow} TagEdgeRow */
/** @typedef {{ personas: PersonaEdgeRow[], tags: TagEdgeRow[] }} ContentEdges */

/**
 * Los edges `persona` y `etiqueta` de esos objetos, por id (una consulta). Lectura interna: traen
 * cualquier perfil y cualquier etiqueta, como antes estaban en el JSON.
 *
 * @param {D1Database} db
 * @param {readonly number[]} ids
 * @returns {Promise<Map<number, ContentEdges>>}
 */
export async function contentEdgesOf(db, ids) {
	/** @type {Map<number, ContentEdges>} */
	const out = new Map();
	const want = [...new Set(ids)];
	if (!want.length) return out;
	const { results } = await db
		.prepare(
			`SELECT e.from_id, e.kind, e.data, o.slug,
				CASE WHEN e.kind = ?2 THEN json_extract(o.data, '$.key') END AS key
			FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.kind IN (?1, ?2) AND e.from_id IN (SELECT value FROM json_each(?3))
			ORDER BY e.from_id, e.kind, e.position, e.id`
		)
		.bind(PERSONA_EDGE, TAG_EDGE, JSON.stringify(want))
		.all();
	for (const r of results) {
		let data = null;
		try {
			data = r.data == null ? null : JSON.parse(String(r.data));
		} catch {
			data = null;
		}
		const id = Number(r.from_id);
		const entry = out.get(id) ?? { personas: [], tags: [] };
		if (r.kind === PERSONA_EDGE) entry.personas.push({ slug: String(r.slug), data });
		else if (typeof r.key === 'string') entry.tags.push({ key: r.key, data });
		out.set(id, entry);
	}
	return out;
}

/**
 * Pura: `data` de un objeto de contenido con sus relaciones adentro (la lista de personas y la de
 * etiquetas enteras). Otros tipos, o sin edges, tal cual.
 *
 * @param {string} type
 * @param {Record<string, any>} data
 * @param {Partial<ContentEdges> | undefined} edges
 * @returns {Record<string, any>}
 */
export function withContentEdges(type, data, edges) {
	if (!edges) return data;
	let out = data;
	if (type === 'evento') out = withPersonaEdges(out, edges.personas);
	if (TAG_EDGE_TYPES.has(type)) out = withTagEdges(out, edges.tags);
	return out;
}

/**
 * Objetos de la base con sus relaciones dentro de `data` (ver {@link withContentEdges}): para todo
 * lo que arma la metadata, el .md o compara con un .md. Una consulta para todos.
 *
 * @template {{ id: number, type: string, data: Record<string, any> }} O
 * @param {D1Database} db
 * @param {readonly O[]} objects
 * @returns {Promise<O[]>}
 */
export async function hydrateContent(db, objects) {
	const wanted = objects.filter((o) => o.type === 'evento' || TAG_EDGE_TYPES.has(o.type));
	if (!wanted.length) return [...objects];
	const edges = await contentEdgesOf(
		db,
		wanted.map((o) => o.id)
	);
	return objects.map((o) =>
		edges.has(o.id) ? { ...o, data: withContentEdges(o.type, o.data, edges.get(o.id)) } : o
	);
}

/**
 * Para guardar un evento o un material: `data` sin lo que va como edges y los edges que lo
 * reemplazan (`persona` y `etiqueta`; ver ./personasEdges.js y ./etiquetasEdges.js).
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {Record<string, unknown>} data ya validado
 * @returns {Promise<{ data: Record<string, unknown>, edges?: Record<string, import('../objects/edges.js').EdgeInput[]> }>}
 */
export async function dehydrateContent(db, category, data) {
	const personas = await dehydratePersonas(db, category, data);
	const tags = await dehydrateTags(db, category, personas.data);
	const edges = { ...personas.edges, ...tags.edges };
	return Object.keys(edges).length ? { data: tags.data, edges } : { data: tags.data };
}

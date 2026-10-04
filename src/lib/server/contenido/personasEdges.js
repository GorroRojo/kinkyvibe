/**
 * Personas de un evento como edges (regla 4 de docs/objetos.md: las relaciones son edges, nunca
 * ids ni direcciones dentro del JSON).
 *
 * La lista única de personas (`[{ profile?, name?, role }]`, src/lib/utils/personasList.js) se
 * guarda partida:
 *
 * - cada **perfil** es un edge `persona` (evento → perfil) con `data: { roles, at }`: sus roles y,
 *   para cada uno, su lugar en la lista (`at[i]` es el lugar de `roles[i]`). Un perfil con dos
 *   roles es un solo edge (los edges son únicos por evento, tipo y perfil);
 * - los **nombres** sin perfil quedan en `data.personas` (no son relaciones), en su orden;
 * - una dirección que no es de ningún perfil vivo (no existe o está borrado) tampoco es una
 *   relación (no hay a qué apuntar): queda en `data.personas` como `{ profile, role }`, como
 *   estaba. El próximo guardado la pasa a edge si para entonces existe el perfil.
 *
 * Al leer, {@link hydratePersonas} vuelve a armar la lista entera, en el mismo orden: la metadata,
 * el .md que arma la base y lo que compara la importación salen igual que antes. Al guardar,
 * {@link dehydratePersonas} la parte de nuevo. Solo los eventos (el material todavía guarda la
 * lista entera en `data.personas`: docs/objetos.md, «Pendiente»).
 *
 * Las lecturas de acá son internas (panel, importación, listas): traen los edges de cualquier
 * perfil (también oculto o borrado), igual que antes estaba la dirección en el JSON. Qué perfiles
 * se muestran lo sigue decidiendo un solo lugar: src/lib/server/personas/index.js.
 *
 * Solo imports relativos (la importación se prueba sin Vite).
 */
import { hasPersonaItems, reshapePersonas } from '../../utils/personasList.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../../utils/personasList.js').PersonaItem} PersonaItem */

export const PERSONA_EDGE = 'persona';
const PROFILE_TYPE = 'perfil';
const EVENT_CATEGORY = 'calendario';

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Un edge `persona` como lo lee {@link hydratePersonas}: la dirección del perfil y su `data`.
 * @typedef {{ slug: string, data: unknown }} PersonaEdgeRow
 */

/**
 * Los roles de un edge con su lugar en la lista. Un `data` sin `at` (la forma de
 * `personasToEdges`, sin orden) o roto va al final, en orden.
 *
 * @param {unknown} data
 * @returns {{ role: string, at: number }[]}
 */
function rolesOf(data) {
	if (!isRecord(data) || !Array.isArray(data.roles)) return [];
	const at = Array.isArray(data.at) ? data.at : [];
	return data.roles.flatMap((role, i) => {
		if (typeof role !== 'string') return [];
		const pos = at[i];
		return [{ role, at: Number.isSafeInteger(pos) && pos >= 0 ? pos : Infinity }];
	});
}

/**
 * Pura: la lista entera a partir de lo que quedó en `data.personas` y los edges. Cada rol de un
 * edge vuelve a su lugar (`at`); lo de `data.personas` llena los demás lugares, en su orden.
 *
 * @param {readonly PersonaItem[]} kept lo de `data.personas`
 * @param {readonly PersonaEdgeRow[]} edges
 * @returns {PersonaItem[]}
 */
export function mergePersonaItems(kept, edges) {
	const placed = edges
		.flatMap((e) => rolesOf(e.data).map((r) => ({ ...r, item: { profile: e.slug, role: r.role } })))
		.sort((a, b) => a.at - b.at);
	/** @type {PersonaItem[]} */
	const out = [];
	let k = 0;
	let p = 0;
	while (k < kept.length || p < placed.length) {
		if (p < placed.length && (placed[p].at <= out.length || k >= kept.length)) {
			out.push(placed[p++].item);
		} else {
			out.push(kept[k++]);
		}
	}
	return out;
}

/**
 * Pura: parte la lista. Los perfiles que están en `idBySlug` (perfiles vivos) van a edges, uno por
 * perfil con todos sus roles y sus lugares; lo demás queda en la lista, en orden.
 *
 * @param {readonly PersonaItem[]} items
 * @param {ReadonlyMap<string, number>} idBySlug
 * @returns {{ kept: PersonaItem[], edges: { to: number, data: { roles: string[], at: number[] } }[] }}
 */
export function splitPersonaItems(items, idBySlug) {
	/** @type {PersonaItem[]} */
	const kept = [];
	/** @type {Map<number, { roles: string[], at: number[] }>} */
	const byId = new Map();
	items.forEach((it, i) => {
		const id = typeof it.profile === 'string' ? idBySlug.get(it.profile) : undefined;
		if (id === undefined) {
			kept.push(it);
			return;
		}
		const data = byId.get(id) ?? { roles: [], at: [] };
		data.roles.push(it.role);
		data.at.push(i);
		byId.set(id, data);
	});
	return { kept, edges: [...byId].map(([to, data]) => ({ to, data })) };
}

/**
 * Los perfiles vivos por dirección (solo los pedidos).
 *
 * @param {D1Database} db
 * @param {readonly string[]} slugs
 * @returns {Promise<Map<string, number>>}
 */
async function liveProfileIds(db, slugs) {
	/** @type {Map<string, number>} */
	const out = new Map();
	const want = [...new Set(slugs)];
	if (!want.length) return out;
	const { results } = await db
		.prepare(
			`SELECT id, slug FROM objects WHERE type = ?1 AND deleted_at IS NULL
			AND slug IN (SELECT value FROM json_each(?2))`
		)
		.bind(PROFILE_TYPE, JSON.stringify(want))
		.all();
	for (const r of results) out.set(String(r.slug), Number(r.id));
	return out;
}

/**
 * Para guardar un evento: `data` sin los perfiles de `personas` y los edges `persona` que los
 * reemplazan (siempre, también vacío: guardar reemplaza los edges de ese tipo). Otras categorías,
 * tal cual y sin edges.
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {Record<string, unknown>} data ya validado
 * @returns {Promise<{ data: Record<string, unknown>, edges?: Record<string, { to: number, data: { roles: string[], at: number[] } }[]> }>}
 */
export async function dehydratePersonas(db, category, data) {
	if (category !== EVENT_CATEGORY) return { data };
	const items = Array.isArray(data.personas) ? /** @type {PersonaItem[]} */ (data.personas) : [];
	const slugs = items.flatMap((it) => (typeof it.profile === 'string' ? [it.profile] : []));
	const { kept, edges } = splitPersonaItems(items, await liveProfileIds(db, slugs));
	const out = { ...data };
	if (kept.length) out.personas = kept;
	else delete out.personas;
	return { data: out, edges: { [PERSONA_EDGE]: edges } };
}

/**
 * Los edges `persona` de esos eventos, por id del evento (una consulta).
 *
 * @param {D1Database} db
 * @param {readonly number[]} ids
 * @returns {Promise<Map<number, PersonaEdgeRow[]>>}
 */
export async function personaEdgesOf(db, ids) {
	/** @type {Map<number, PersonaEdgeRow[]>} */
	const out = new Map();
	const want = [...new Set(ids)];
	if (!want.length) return out;
	// Lectura interna (ver arriba): cualquier perfil, como estaba la dirección en el JSON.
	const { results } = await db
		.prepare(
			`SELECT e.from_id, e.data, o.slug FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.kind = ?1 AND e.from_id IN (SELECT value FROM json_each(?2))
			ORDER BY e.from_id, e.position, e.id`
		)
		.bind(PERSONA_EDGE, JSON.stringify(want))
		.all();
	for (const r of results) {
		let data = null;
		try {
			data = r.data == null ? null : JSON.parse(String(r.data));
		} catch {
			data = null;
		}
		const id = Number(r.from_id);
		const list = out.get(id) ?? [];
		list.push({ slug: String(r.slug), data });
		out.set(id, list);
	}
	return out;
}

/**
 * Pura: `data` de un evento con la lista entera (lo de `data.personas` más los edges). Sin edges,
 * tal cual. Lo guardado con la forma de antes de la lista única (`authors` + `extra.personas`) que
 * tenga edges pasa primero a la lista única (los `at` cuentan sobre ella).
 *
 * @param {Record<string, any>} data
 * @param {readonly PersonaEdgeRow[] | undefined} edges
 * @returns {Record<string, any>}
 */
export function withPersonaEdges(data, edges) {
	if (!edges?.length) return data;
	const base = hasPersonaItems(data) ? data : reshapePersonas(data, EVENT_CATEGORY);
	const kept = Array.isArray(base.personas) ? base.personas : [];
	// Si `data.personas` ya nombra a uno de esos perfiles, es una lista entera escrita sin partir
	// (por ejemplo, por el código de antes de la migración 0035): manda esa, sin repetir a nadie.
	const linked = new Set(edges.map((e) => e.slug));
	if (kept.some((it) => typeof it?.profile === 'string' && linked.has(it.profile))) return data;
	return { ...base, personas: mergePersonaItems(kept, edges) };
}

/**
 * Objetos de la base con la lista de personas entera en `data` (ver {@link withPersonaEdges}):
 * para todo lo que arma la metadata, el .md o compara con un .md. Solo toca los eventos.
 *
 * @template {{ id: number, type: string, data: Record<string, any> }} O
 * @param {D1Database} db
 * @param {readonly O[]} objects
 * @returns {Promise<O[]>}
 */
export async function hydratePersonas(db, objects) {
	const events = objects.filter((o) => o.type === 'evento');
	if (!events.length) return [...objects];
	const edges = await personaEdgesOf(
		db,
		events.map((o) => o.id)
	);
	return objects.map((o) =>
		o.type === 'evento' && edges.has(o.id)
			? { ...o, data: withPersonaEdges(o.data, edges.get(o.id)) }
			: o
	);
}

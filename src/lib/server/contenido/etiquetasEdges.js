/**
 * Etiquetas de un evento o un material como edges (regla 4 de docs/objetos.md: las relaciones son
 * edges, nunca ids ni nombres de otros objetos dentro del JSON).
 *
 * La lista de etiquetas (`data.tags`, los `key` de las etiquetas, como los nombran los .md) se
 * guarda partida, igual que las personas (./personasEdges.js):
 *
 * - cada `key` que es de una **etiqueta viva** (objeto `etiqueta` sin borrar con ese `key`; un
 *   alias es una etiqueta más, y se apunta a ella tal cual) es un edge `etiqueta`
 *   (post → etiqueta) con `data: { at: [...] }`: su lugar (o sus lugares, si la lista la repite)
 *   en la lista. `position` sigue el orden de la lista;
 * - un `key` que no es de ninguna etiqueta viva no es una relación (no hay a qué apuntar): queda
 *   en `data.tags` como texto, en su orden. El próximo guardado lo pasa a edge si para entonces
 *   existe la etiqueta.
 *
 * Al leer, {@link withTagEdges} vuelve a armar la lista entera, en el mismo orden y con el `key`
 * que la etiqueta tiene HOY: las listas, los filtros, el .ics, el RSS, la búsqueda, el .md que arma
 * la base y «Descargar todo» salen igual que antes. Al guardar, {@link dehydrateTags} la parte de
 * nuevo.
 *
 * Las lecturas de acá son internas (deciden qué mostrar, como antes el JSON): traen el `key` de
 * cualquier etiqueta (también oculta o borrada). Qué se muestra de cada etiqueta lo sigue decidiendo
 * el árbol de etiquetas del sitio (`currentSiteTags`).
 *
 * Solo imports relativos (la importación se prueba sin Vite).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

export const TAG_EDGE = 'etiqueta';
const TAG_TYPE = 'etiqueta';
/** Las categorías cuyas etiquetas van como edges (las del contenido en la base). */
const TAG_CATEGORIES = new Set(['calendario', 'material']);
/** Los tipos de objeto cuyas etiquetas van como edges. */
export const TAG_EDGE_TYPES = new Set(['evento', 'material']);

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Un edge `etiqueta` como lo leen las funciones de acá: el `key` actual de la etiqueta y el `data`
 * del edge.
 * @typedef {{ key: string, data: unknown }} TagEdgeRow
 */

/**
 * Los lugares de un edge en la lista. Un `data` sin `at` o roto va al final, en el orden de los
 * edges (una vez).
 *
 * @param {unknown} data
 * @returns {number[]}
 */
function placesOf(data) {
	const at = isRecord(data) && Array.isArray(data.at) ? data.at : null;
	if (!at) return [Infinity];
	const places = at.filter((n) => Number.isSafeInteger(n) && n >= 0);
	return places.length ? places : [Infinity];
}

/**
 * Pura: la lista entera a partir de lo que quedó en `data.tags` y los edges. Cada edge vuelve a su
 * lugar (`at`); lo de `data.tags` llena los demás lugares, en su orden.
 *
 * @param {readonly unknown[]} kept lo de `data.tags`
 * @param {readonly TagEdgeRow[]} edges
 * @returns {unknown[]}
 */
export function mergeTagItems(kept, edges) {
	const placed = edges
		.flatMap((e, i) => placesOf(e.data).map((at) => ({ at, i, key: e.key })))
		.sort((a, b) => a.at - b.at || a.i - b.i);
	/** @type {unknown[]} */
	const out = [];
	let k = 0;
	let p = 0;
	while (k < kept.length || p < placed.length) {
		if (p < placed.length && (placed[p].at <= out.length || k >= kept.length)) {
			out.push(placed[p++].key);
		} else {
			out.push(kept[k++]);
		}
	}
	return out;
}

/**
 * Pura: parte la lista. Los `key` que están en `idByKey` (etiquetas vivas) van a edges, uno por
 * etiqueta con todos sus lugares, en el orden de la lista; lo demás queda en la lista, en orden.
 *
 * @param {readonly unknown[]} tags
 * @param {ReadonlyMap<string, number>} idByKey
 * @returns {{ kept: unknown[], edges: { to: number, data: { at: number[] } }[] }}
 */
export function splitTagItems(tags, idByKey) {
	/** @type {unknown[]} */
	const kept = [];
	/** @type {Map<number, number[]>} */
	const byId = new Map();
	tags.forEach((tag, i) => {
		const id = typeof tag === 'string' ? idByKey.get(tag) : undefined;
		if (id === undefined) {
			kept.push(tag);
			return;
		}
		const at = byId.get(id) ?? [];
		at.push(i);
		byId.set(id, at);
	});
	return { kept, edges: [...byId].map(([to, at]) => ({ to, data: { at } })) };
}

/**
 * Las etiquetas vivas por `key` (solo los pedidos). Usa el índice único de `key` (migración 0029).
 *
 * @param {D1Database} db
 * @param {readonly string[]} keys
 * @returns {Promise<Map<string, number>>}
 */
async function liveTagIds(db, keys) {
	/** @type {Map<string, number>} */
	const out = new Map();
	const want = [...new Set(keys)];
	if (!want.length) return out;
	const { results } = await db
		.prepare(
			`SELECT id, json_extract(data, '$.key') AS key FROM objects
			WHERE type = ?1 AND deleted_at IS NULL
			AND json_extract(data, '$.key') IN (SELECT value FROM json_each(?2))`
		)
		.bind(TAG_TYPE, JSON.stringify(want))
		.all();
	for (const r of results) out.set(String(r.key), Number(r.id));
	return out;
}

/**
 * Para guardar un evento o un material: `data` sin las etiquetas que son edges y los edges
 * `etiqueta` que las reemplazan (siempre, también vacío: guardar reemplaza los edges de ese tipo).
 * Otras categorías, tal cual y sin edges.
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {Record<string, unknown>} data ya validado
 * @returns {Promise<{ data: Record<string, unknown>, edges?: Record<string, { to: number, data: { at: number[] } }[]> }>}
 */
export async function dehydrateTags(db, category, data) {
	if (!TAG_CATEGORIES.has(category)) return { data };
	const tags = Array.isArray(data.tags) ? data.tags : [];
	const keys = tags.flatMap((t) => (typeof t === 'string' ? [t] : []));
	const { kept, edges } = splitTagItems(tags, await liveTagIds(db, keys));
	const out = { ...data };
	if (kept.length) out.tags = kept;
	else delete out.tags;
	return { data: out, edges: { [TAG_EDGE]: edges } };
}

/**
 * @param {unknown} value `edges.data` como viene de la base
 * @returns {unknown}
 */
function parseEdgeData(value) {
	if (value == null) return null;
	try {
		return JSON.parse(String(value));
	} catch {
		return null;
	}
}

/**
 * Los edges `etiqueta` de esos objetos, por id (una consulta).
 *
 * @param {D1Database} db
 * @param {readonly number[]} ids
 * @returns {Promise<Map<number, TagEdgeRow[]>>}
 */
export async function tagEdgesOf(db, ids) {
	/** @type {Map<number, TagEdgeRow[]>} */
	const out = new Map();
	const want = [...new Set(ids)];
	if (!want.length) return out;
	// Lectura interna (ver arriba): cualquier etiqueta, como estaba el `key` en el JSON.
	const { results } = await db
		.prepare(
			`SELECT e.from_id, e.data, json_extract(t.data, '$.key') AS key
			FROM edges e JOIN objects t ON t.id = e.to_id
			WHERE e.kind = ?1 AND e.from_id IN (SELECT value FROM json_each(?2))
			ORDER BY e.from_id, e.position, e.id`
		)
		.bind(TAG_EDGE, JSON.stringify(want))
		.all();
	for (const r of results) {
		if (typeof r.key !== 'string') continue;
		const id = Number(r.from_id);
		const list = out.get(id) ?? [];
		list.push({ key: r.key, data: parseEdgeData(r.data) });
		out.set(id, list);
	}
	return out;
}

/**
 * Para leer los edges `etiqueta` en la MISMA consulta que el objeto (sin una vuelta más a la base):
 * una columna con la lista `[{ key, data }]` como JSON, para la fila de `objects` con ese alias.
 * Se lee con {@link tagEdgesFromColumn}.
 *
 * @param {string} alias
 */
export function tagEdgesColumn(alias) {
	return `(SELECT json_group_array(json_object('key', json_extract(t.data, '$.key'), 'data', json(e.data)))
		FROM (SELECT * FROM edges WHERE from_id = ${alias}.id AND kind = '${TAG_EDGE}'
			ORDER BY position, id) e
		JOIN objects t ON t.id = e.to_id)`;
}

/**
 * @param {unknown} value la columna de {@link tagEdgesColumn}
 * @returns {TagEdgeRow[]}
 */
export function tagEdgesFromColumn(value) {
	if (typeof value !== 'string' || !value) return [];
	try {
		const list = JSON.parse(value);
		return Array.isArray(list)
			? list
					.filter((e) => isRecord(e) && typeof e.key === 'string')
					.map((e) => ({ key: String(e.key), data: e.data ?? null }))
			: [];
	} catch {
		return [];
	}
}

/**
 * Pura: `data` con la lista de etiquetas entera (lo de `data.tags` más los edges). Sin edges, tal
 * cual.
 *
 * @param {Record<string, any>} data
 * @param {readonly TagEdgeRow[] | undefined} edges
 * @returns {Record<string, any>}
 */
export function withTagEdges(data, edges) {
	if (!edges?.length) return data;
	const kept = Array.isArray(data.tags) ? data.tags : [];
	// Si `data.tags` ya nombra a una de esas etiquetas, es una lista entera escrita sin partir (por
	// ejemplo, por el código de antes de la migración 0042): manda esa, sin repetir ninguna.
	const linked = new Set(edges.map((e) => e.key));
	if (kept.some((t) => typeof t === 'string' && linked.has(t))) return data;
	return { ...data, tags: mergeTagItems(kept, edges) };
}

/**
 * El árbol de etiquetas liviano para todas las páginas y los detalles aparte (docs/etiquetas.md).
 *
 * El layout raíz manda en cada página el árbol de la base (`data.siteTags`): con eso se dibuja cada
 * chip (nombre, emoji, color heredado), se resuelven los alias y el buscador arma sus sugerencias.
 * La descripción, las relacionadas y la imagen de cada etiqueta (más de un tercio de la lista) solo
 * las usan unas pocas páginas (la Kinkipedia y las descripciones de las etiquetas elegidas en
 * /material, /amigues y /todo): esas páginas las mandan aparte (`data.siteTagDetails`) y el layout
 * raíz las junta con el árbol (`withTagDetails`).
 *
 * En el servidor nada cambia: el árbol en uso es siempre la lista completa (`hooks.server.js`).
 */

/** Los campos que no viajan en el árbol de todas las páginas. */
export const DETAIL_KEYS = /** @type {const} */ (['description', 'related', 'image']);

/**
 * @typedef {Record<string, unknown>} RawTagEntry
 * @typedef {Record<string, Partial<Record<(typeof DETAIL_KEYS)[number], unknown>>>} TagDetails
 *   por id, solo las etiquetas que tienen alguno de esos campos
 */

/** @type {WeakMap<object, { slim: RawTagEntry[], details: TagDetails }>} */
const split = new WeakMap();

/**
 * Separa la lista de la base en el árbol liviano y los detalles (recordado por lista: es el mismo
 * objeto mientras la lista no cambie).
 *
 * @param {readonly RawTagEntry[]} rawTags
 */
export function splitTagList(rawTags) {
	let s = split.get(rawTags);
	if (!s) {
		/** @type {RawTagEntry[]} */
		const slim = [];
		/** @type {TagDetails} */
		const details = {};
		for (const t of rawTags) {
			/** @type {RawTagEntry} */
			const light = {};
			/** @type {Record<string, unknown>} */
			const extra = {};
			for (const [k, v] of Object.entries(t)) {
				if (/** @type {readonly string[]} */ (DETAIL_KEYS).includes(k)) extra[k] = v;
				else light[k] = v;
			}
			slim.push(light);
			if (Object.keys(extra).length) details[String(t.id)] = extra;
		}
		s = { slim, details };
		split.set(rawTags, s);
	}
	return s;
}

/**
 * La lista completa a partir del árbol liviano y los detalles (sin tocar ninguno de los dos).
 *
 * @param {readonly RawTagEntry[]} slim
 * @param {TagDetails | null | undefined} details
 * @returns {RawTagEntry[]}
 */
export function mergeTagDetails(slim, details) {
	if (!details) return [...slim];
	return slim.map((t) => {
		const d = details[String(t.id)];
		return d ? { ...t, ...d } : t;
	});
}

/** @type {readonly RawTagEntry[] | null} */
let base = null;
/** @type {TagDetails} los detalles juntados hasta ahora para `base` */
let known = {};
/** @type {RawTagEntry[] | null} */
let merged = null;
/** @type {WeakSet<object>} los objetos de detalles ya juntados */
let seen = new WeakSet();

/**
 * Para el navegador: el árbol de la base con los detalles que mandó alguna página. Los detalles se
 * van juntando (una página sin detalles no los saca: tener de más nunca está mal, y así el árbol no
 * se rearma en cada navegación). Devuelve el mismo objeto mientras nada cambie, así `useSiteTags`
 * no rearma los stores.
 *
 * @param {readonly RawTagEntry[] | null | undefined} slim
 * @param {TagDetails | null | undefined} details
 * @returns {readonly RawTagEntry[] | null}
 */
export function withTagDetails(slim, details) {
	if (!slim) return null;
	if (slim !== base) {
		base = slim;
		known = {};
		merged = null;
		seen = new WeakSet();
	}
	if (details && !seen.has(details)) {
		seen.add(details);
		let changed = false;
		for (const [id, d] of Object.entries(details)) {
			if (JSON.stringify(known[id]) !== JSON.stringify(d)) {
				known[id] = d;
				changed = true;
			}
		}
		if (changed) merged = null;
	}
	if (!merged) merged = Object.keys(known).length ? mergeTagDetails(slim, known) : [...slim];
	return merged;
}

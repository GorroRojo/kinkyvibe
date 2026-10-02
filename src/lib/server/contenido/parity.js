/**
 * Paridad entre un .md y su objeto en la base: ¿la página muestra lo mismo?
 *
 * Compara «metadata» (la forma que dan los .md) después de {@link normalizeMeta}, que deja de lado
 * solo lo que las páginas tratan igual:
 * - vacíos: `''`, `null`, `false` y `[]` cuentan como «no está» (un `summary: ''` del .md y un
 *   resumen que no está se muestran igual);
 * - espacios al principio y al final de los textos (la base los saca);
 * - textos repetidos en una lista (etiquetas dos veces);
 * - números escritos como texto en los campos de texto (`featured: 1` y `"1"` son la misma
 *   imagen);
 * - el fin de un evento que termina «antes» de empezar el mismo día: se compara cuándo termina de
 *   verdad (`eventEnd`, el día siguiente), que es lo que muestran la página y el .ics.
 *
 * Funciones puras. Solo imports relativos.
 */

/** @param {unknown} v */
const isBlank = (v) =>
	v === undefined ||
	v === null ||
	v === false ||
	(typeof v === 'string' && v.trim() === '') ||
	(Array.isArray(v) && v.length === 0);

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeValue(value) {
	if (typeof value === 'string') return value.trim();
	if (Array.isArray(value)) {
		const items = value.map(normalizeValue).filter((v) => !isBlank(v));
		if (items.every((v) => typeof v === 'string')) return [...new Set(items)];
		return items;
	}
	if (value && typeof value === 'object') {
		/** @type {Record<string, unknown>} */
		const out = {};
		for (const key of Object.keys(value).sort()) {
			const v = normalizeValue(/** @type {Record<string, unknown>} */ (value)[key]);
			if (!isBlank(v)) out[key] = v;
		}
		return out;
	}
	return value;
}

/** Fin real: si termina antes de empezar el mismo día (en Argentina), es el día siguiente. */
function realEnd(/** @type {unknown} */ start, /** @type {unknown} */ end) {
	const s = Date.parse(String(start ?? ''));
	const e = Date.parse(String(end ?? ''));
	if (Number.isNaN(e)) return end;
	const day = (/** @type {number} */ ms) =>
		new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
	const fixed = !Number.isNaN(s) && e < s && day(e) === day(s) ? e + 24 * 60 * 60 * 1000 : e;
	return new Date(fixed).toISOString();
}

/**
 * @param {Record<string, unknown>} meta
 * @param {{ textKeys?: Iterable<string> }} [opts] claves que son texto (un número ahí se compara
 *   como texto)
 * @returns {Record<string, unknown>}
 */
export function normalizeMeta(meta, { textKeys = [] } = {}) {
	const text = new Set(textKeys);
	/** @type {Record<string, unknown>} */
	const copy = { ...meta };
	for (const key of text) {
		if (typeof copy[key] === 'number') copy[key] = String(copy[key]);
	}
	if (copy.category === 'calendario' && copy.end !== undefined) {
		copy.end = realEnd(copy.start, copy.end);
	}
	return /** @type {Record<string, unknown>} */ (normalizeValue(copy));
}

/**
 * Qué claves difieren entre dos metadatas ya normalizadas (vacío = iguales).
 *
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 * @returns {string[]}
 */
export function metaDiff(a, b) {
	const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
	return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/**
 * Qué campos de `data` cambian entre dos versiones (para informar qué trae un .md cambiado).
 *
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @returns {string[]}
 */
export function dataDiff(before, after) {
	return metaDiff(
		/** @type {Record<string, unknown>} */ (normalizeValue(before ?? {})),
		/** @type {Record<string, unknown>} */ (normalizeValue(after ?? {}))
	);
}

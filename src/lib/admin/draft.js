/**
 * Borradores locales de los editores del panel: mientras hay cambios sin guardar, el editor guarda
 * lo que la persona hizo en localStorage (solo en este navegador), así no se pierde si cambia de
 * pestaña, navega a otro lado o cierra la ventana. Al volver al editor se recupera.
 *
 * Cada borrador se guarda con la versión del archivo de la que partió (`base`, por ejemplo el sha
 * del archivo): si el archivo cambió desde entonces, el borrador queda marcado como `stale` y el
 * editor pregunta antes de recuperarlo (recuperarlo pisaría lo que cambió otra persona).
 *
 * Todas las funciones reciben el storage para poder probarlas; el storage puede faltar o tirar
 * error (ventanas privadas, storage lleno o bloqueado): entonces no hacen nada.
 */

export const DRAFT_PREFIX = 'kv-draft:';
/** Los borradores más viejos que esto se descartan. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const VERSION = 1;

/**
 * @typedef {object} Draft
 * @prop {unknown} data lo que guardó el editor
 * @prop {number} savedAt
 * @prop {boolean} stale el archivo cambió desde que se empezó el borrador
 */

/**
 * Clave del borrador de un objeto, por ejemplo `draftKey('evento', 'fiesta-2026-10')`.
 * @param {string} kind
 * @param {string} id
 */
export function draftKey(kind, id) {
	return `${DRAFT_PREFIX}${kind}:${id}`;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} key
 * @param {unknown} data
 * @param {{ base?: string, now?: number }} [opts]
 * @returns {boolean} si se pudo guardar
 */
export function saveDraft(storage, key, data, { base = '', now = Date.now() } = {}) {
	if (!storage || !key) return false;
	try {
		storage.setItem(key, JSON.stringify({ v: VERSION, base, savedAt: now, data }));
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} key
 * @param {{ base?: string, now?: number, maxAgeMs?: number }} [opts]
 * @returns {Draft | null}
 */
export function loadDraft(
	storage,
	key,
	{ base = '', now = Date.now(), maxAgeMs = DRAFT_MAX_AGE_MS } = {}
) {
	if (!storage || !key) return null;
	/** @type {any} */
	let parsed;
	try {
		const raw = storage.getItem(key);
		if (!raw) return null;
		parsed = JSON.parse(raw);
	} catch {
		parsed = null;
	}
	const valid =
		parsed &&
		typeof parsed === 'object' &&
		parsed.v === VERSION &&
		typeof parsed.savedAt === 'number' &&
		'data' in parsed;
	if (!valid || now - parsed.savedAt > maxAgeMs) {
		clearDraft(storage, key);
		return null;
	}
	return {
		data: parsed.data,
		savedAt: parsed.savedAt,
		stale: Boolean(base) && Boolean(parsed.base) && parsed.base !== base
	};
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} key
 */
export function clearDraft(storage, key) {
	if (!storage || !key) return;
	try {
		storage.removeItem(key);
	} catch {
		// Sin storage no hay nada que borrar.
	}
}

/**
 * "hace un momento", "hace 5 minutos", "hace 2 horas", "hace 3 días".
 * @param {number} savedAt
 * @param {number} [now]
 */
export function draftAge(savedAt, now = Date.now()) {
	const min = Math.floor(Math.max(0, now - savedAt) / 60000);
	if (min < 1) return 'hace un momento';
	if (min < 60) return min === 1 ? 'hace 1 minuto' : `hace ${min} minutos`;
	const h = Math.floor(min / 60);
	if (h < 24) return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
	const d = Math.floor(h / 24);
	return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

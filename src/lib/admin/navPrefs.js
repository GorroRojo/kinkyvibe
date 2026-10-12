/**
 * Preferencias del menú del panel de cada persona, en localStorage (puede fallar en ventanas
 * privadas o con el storage bloqueado: entonces vale lo de siempre y el menú anda igual):
 * "Ocultar lo que viene" (las secciones próximamente).
 */

export const HIDE_SOON_KEY = 'kv-panel-hide-soon';

/**
 * @param {string} key
 * @returns {string | null}
 */
function read(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/**
 * @param {string} key
 * @param {string | null} value `null` borra
 */
function write(key, value) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Sin storage: dura hasta recargar.
	}
}

/** @returns {boolean} */
export function readHideSoon() {
	return read(HIDE_SOON_KEY) === '1';
}

/** @param {boolean} hide */
export function saveHideSoon(hide) {
	write(HIDE_SOON_KEY, hide ? '1' : null);
}

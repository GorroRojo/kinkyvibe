/**
 * Preferencias del menú del panel de cada persona, en localStorage (puede fallar en ventanas
 * privadas o con el storage bloqueado: entonces vale lo de siempre y el menú anda igual):
 * - qué área de la barra lateral abrió por última vez;
 * - "Ocultar lo que viene" (las secciones próximamente).
 */
import { NAV_AREAS } from './nav.js';

export const OPEN_AREA_KEY = 'kv-panel-area';
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

/**
 * Un id de área válido o `null`.
 * @param {unknown} value
 */
export function parseArea(value) {
	return NAV_AREAS.some((a) => a.id === value) ? /** @type {string} */ (value) : null;
}

/** @returns {string | null} */
export function readOpenArea() {
	return parseArea(read(OPEN_AREA_KEY));
}

/** @param {string | null} area */
export function saveOpenArea(area) {
	write(OPEN_AREA_KEY, parseArea(area));
}

/** @returns {boolean} */
export function readHideSoon() {
	return read(HIDE_SOON_KEY) === '1';
}

/** @param {boolean} hide */
export function saveHideSoon(hide) {
	write(HIDE_SOON_KEY, hide ? '1' : null);
}

/**
 * Qué área se ve abierta: la de la página actual; si la página no es de ningún área (Inicio), la
 * última que la persona abrió.
 * @param {string | null | undefined} activeArea
 * @param {string | null | undefined} saved
 */
export function pickOpenArea(activeArea, saved) {
	return parseArea(activeArea) ?? parseArea(saved);
}

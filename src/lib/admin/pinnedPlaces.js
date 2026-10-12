/**
 * «Fijados» de la barra lateral del panel (opción C, parte 2, gorrite 11/10): las páginas que cada
 * admin fija con 📌 (en una fila de Recientes o en un resultado de «Ir a…»). Van arriba de
 * Recientes, hasta {@link PIN_MAX}, en el orden que elija la persona (se arrastran, o con los
 * botones «Subir» y «Bajar», que andan con el teclado).
 *
 * Como Recientes (`recentPlaces.js`): en localStorage, con la clave de cada login
 * (`kv-panel-fijados:<login>`), solo en ese navegador. Si el storage falla (ventana privada,
 * bloqueado), no hay fijados y el menú anda igual.
 *
 * Qué se puede fijar ({@link canPin}): una página del panel que existe. No las «Próximamente»
 * (todavía no hay nada que abrir), ni Inicio ni las secciones de la barra (ya están a un clic).
 */
import { soonItemAt } from './nav.js';
import { parsePlaces, sectionHrefs } from './recentPlaces.js';
import { sidebarKey } from './sidebarMode.js';

export const PIN_KEY = 'kv-panel-fijados';
/** Cuántas páginas se pueden fijar como mucho. */
export const PIN_MAX = 7;

/** @typedef {import('./recentPlaces.js').RecentPlace} PinnedPlace */

/**
 * Clave de localStorage de cada admin (el login, limpio, como en `sidebarMode.js`).
 * @param {string | null | undefined} login
 */
export function pinKey(login) {
	return sidebarKey(login).replace(/^kv-panel-lateral/, PIN_KEY);
}

/**
 * La URL sin `?…`, `#…` ni la barra del final.
 * @param {string} href
 */
const pathOf = (href) => href.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';

/**
 * Si una página se puede fijar: del panel, que no sea «Próximamente» ni una sección de la barra.
 * @param {unknown} href
 * @param {{ flags?: Record<string, boolean> }} [opts]
 * @returns {href is string}
 */
export function canPin(href, opts) {
	if (typeof href !== 'string' || href.startsWith('//')) return false;
	if (!/^\/admin(\/|$|[?#])/.test(href)) return false;
	const path = pathOf(href);
	if (soonItemAt(path)) return false;
	return !sectionHrefs(opts).has(path);
}

/**
 * Lo guardado, validado: solo páginas que se pueden fijar, sin repetir, hasta {@link PIN_MAX}.
 * @param {string | null} raw
 * @returns {PinnedPlace[]}
 */
export function parsePinned(raw) {
	return parsePlaces(raw, PIN_MAX).filter((p) => canPin(p.href));
}

/**
 * @param {PinnedPlace[]} list
 * @param {string} href
 */
export const isPinned = (list, href) => list.some((p) => p.href === href);

/**
 * Fija una página al final de la lista. Si ya estaba, no se puede fijar o ya hay
 * {@link PIN_MAX}, devuelve la misma lista.
 * @param {PinnedPlace[]} list
 * @param {PinnedPlace} place
 * @param {{ flags?: Record<string, boolean> }} [opts]
 * @returns {PinnedPlace[]}
 */
export function addPin(list, place, opts) {
	if (!canPin(place.href, opts) || isPinned(list, place.href) || list.length >= PIN_MAX) {
		return list;
	}
	/** @type {PinnedPlace} */
	const clean = { href: place.href, label: place.label };
	if (place.context) clean.context = place.context;
	return [...list, clean];
}

/**
 * @param {PinnedPlace[]} list
 * @param {string} href
 * @returns {PinnedPlace[]}
 */
export function removePin(list, href) {
	return list.filter((p) => p.href !== href);
}

/**
 * Mueve un fijado de la posición `from` a la `to` (arrastrar o «Subir»/«Bajar»). Fuera de rango,
 * la misma lista.
 * @param {PinnedPlace[]} list
 * @param {number} from
 * @param {number} to
 * @returns {PinnedPlace[]}
 */
export function movePin(list, from, to) {
	if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

/**
 * @param {string | null | undefined} login
 * @returns {PinnedPlace[]}
 */
export function readPinned(login) {
	try {
		return parsePinned(localStorage.getItem(pinKey(login)));
	} catch {
		return [];
	}
}

/**
 * @param {string | null | undefined} login
 * @param {PinnedPlace[]} list
 */
export function savePinned(login, list) {
	try {
		localStorage.setItem(pinKey(login), JSON.stringify(list));
	} catch {
		// Sin storage: duran hasta recargar.
	}
}

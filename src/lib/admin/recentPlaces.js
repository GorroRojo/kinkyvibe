/**
 * «Recientes» de la barra lateral del panel (opción C, decisión 0038): las últimas páginas que
 * abrió cada admin, como los «Shortcuts» de Stripe. La barra muestra las que entran, hasta
 * {@link RECENT_SHOWN}.
 *
 * Se guardan en localStorage, con la clave de cada login (`kv-panel-recientes:<login>`, como el
 * panel lateral en `sidebarMode.js`): valen para ese navegador. Puede fallar (ventana privada,
 * storage bloqueado): entonces no hay recientes y el menú anda igual. Quedan en el navegador de la
 * persona y no salen de ahí (pueden tener el nombre de un evento o de una persona).
 *
 * No se guardan Inicio ni las páginas que ya son una sección de la barra (serían el mismo link dos
 * veces), ni las páginas de error.
 */
import { EVENT_TABS, NAV, activeNavItem, navGroupOf, navItem, sideSections } from './nav.js';
import { sidebarKey } from './sidebarMode.js';

export const RECENT_KEY = 'kv-panel-recientes';
/** Cuántas se muestran como mucho. */
export const RECENT_SHOWN = 7;
/** Cuántas se guardan: una más, porque la página en la que estás no se muestra. */
export const RECENT_KEPT = RECENT_SHOWN + 1;
/** Largo máximo del nombre (el resto se corta con «…»). */
const MAX_LABEL = 80;

/**
 * Un lugar de Recientes (y de Fijados, `pinnedPlaces.js`): `label` es el nombre que se ve,
 * `context` (opcional) la línea chica de abajo (el evento, la sección). Los guardados antes de la
 * parte 2 no tienen `context`: se ven solo con su nombre.
 * @typedef {{ href: string, label: string, context?: string }} RecentPlace
 */

/**
 * Clave de localStorage de cada admin (el login, limpio, como en `sidebarMode.js`).
 * @param {string | null | undefined} login
 */
export function recentKey(login) {
	return sidebarKey(login).replace(/^kv-panel-lateral/, RECENT_KEY);
}

/**
 * @param {unknown} href
 * @returns {href is string}
 */
const isPanelPath = (href) =>
	typeof href === 'string' && /^\/admin(\/|$)/.test(href) && !href.startsWith('//');

/**
 * Lo guardado, validado: solo páginas del panel con nombre, sin repetir, hasta {@link RECENT_KEPT}.
 * @param {string | null} raw
 * @returns {RecentPlace[]}
 */
export function parseRecent(raw) {
	return parsePlaces(raw, RECENT_KEPT);
}

/**
 * Una lista de lugares guardada, validada: solo páginas del panel con nombre, sin repetir, hasta
 * `limit`. La usan Recientes y Fijados.
 * @param {string | null} raw
 * @param {number} limit
 * @returns {RecentPlace[]}
 */
export function parsePlaces(raw, limit) {
	if (!raw) return [];
	/** @type {unknown} */
	let value;
	try {
		value = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];
	/** @type {RecentPlace[]} */
	const out = [];
	for (const v of value) {
		if (!v || typeof v !== 'object') continue;
		const { href, label, context } = /** @type {Record<string, unknown>} */ (v);
		if (!isPanelPath(href) || typeof label !== 'string' || !label.trim()) continue;
		if (out.some((r) => r.href === href)) continue;
		/** @type {RecentPlace} */
		const place = { href, label: label.trim().slice(0, MAX_LABEL) };
		if (typeof context === 'string' && context.trim()) {
			place.context = context.trim().slice(0, MAX_LABEL);
		}
		out.push(place);
		if (out.length >= limit) break;
	}
	return out;
}

/**
 * Las URLs que ya están en la barra lateral (Inicio y el link de cada sección).
 * @param {{ flags?: Record<string, boolean> }} [opts]
 */
export function sectionHrefs(opts) {
	return new Set(sideSections(opts).map((s) => s.href));
}

/**
 * Si una página se guarda en Recientes.
 * @param {string} pathname
 * @param {{ flags?: Record<string, boolean>, status?: number }} [opts]
 */
export function shouldRemember(pathname, { flags = {}, status = 200 } = {}) {
	const path = pathname.replace(/\/+$/, '') || '/';
	if (status >= 400 || !isPanelPath(path)) return false;
	return !sectionHrefs({ flags }).has(path);
}

/**
 * El nombre de una página para Recientes, armado con el título de la página (su `<h1>`):
 * - la ficha de un evento: el evento y la pestaña («Fiesta de Primavera · Órdenes»);
 * - una sección del menú que no está en la barra (Transferencias, Agenda…): su nombre;
 * - cualquier otra (una persona, un perfil, un formulario): la sección y el título
 *   («Personas · Ana Ejemplo»).
 * No usa el título de la pestaña del navegador: al navegar puede quedar el de la página anterior.
 * @param {{ pathname: string, heading?: string | null }} page
 * @returns {string}
 */
export function recentLabel({ pathname, heading }) {
	const clip = (/** @type {string} */ s) =>
		s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1).trimEnd()}…` : s;
	const path = pathname.replace(/\/+$/, '') || '/';
	const h = String(heading ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const exact = NAV.find((i) => i.href === path);
	if (exact) return clip(exact.label);
	const ev = path.match(/^\/admin\/eventos\/([^/]+)(\/[^/]+)?$/);
	if (ev && !NAV.some((i) => i.href === `/admin/eventos/${ev[1]}`)) {
		const tab = EVENT_TABS.find((t) => t.suffix === (ev[2] ?? ''));
		let name = h;
		if (!name) {
			try {
				name = decodeURIComponent(ev[1]);
			} catch {
				name = ev[1];
			}
		}
		return clip(tab && tab.id !== 'resumen' ? `${name} · ${tab.label}` : name);
	}
	const section = activeNavItem(path)?.label ?? '';
	if (h && section && h !== section) return clip(`${section} · ${h}`);
	return clip(h || section || 'Panel');
}

/**
 * El nombre de una página en dos partes, para la fila de Recientes y Fijados: `label` (lo que se
 * ve en negrita) y `context` (la línea chica de abajo):
 * - la ficha de un evento: la pestaña y el evento («Órdenes» / «Fiesta de Primavera»); en el
 *   Resumen, el evento y «Evento»;
 * - una sección del menú: su nombre y su grupo («Transferencias» / «Ventas»);
 * - cualquier otra (una persona, un formulario): el título y la sección («Ana Ejemplo» /
 *   «Personas»).
 * @param {{ pathname: string, heading?: string | null }} page
 * @returns {{ label: string, context: string }}
 */
export function recentParts({ pathname, heading }) {
	const clip = (/** @type {string} */ s) =>
		s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1).trimEnd()}…` : s;
	const path = pathname.replace(/\/+$/, '') || '/';
	const h = String(heading ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const exact = NAV.find((i) => i.href === path);
	if (exact) {
		const group = navGroupOf(exact.area);
		const context = group && group.label !== exact.label ? group.label : '';
		return { label: clip(exact.label), context };
	}
	const ev = path.match(/^\/admin\/eventos\/([^/]+)(\/[^/]+)?$/);
	if (ev && !NAV.some((i) => i.href === `/admin/eventos/${ev[1]}`)) {
		const tab = EVENT_TABS.find((t) => t.suffix === (ev[2] ?? ''));
		let name = h;
		if (!name) {
			try {
				name = decodeURIComponent(ev[1]);
			} catch {
				name = ev[1];
			}
		}
		if (tab && tab.id !== 'resumen') return { label: clip(tab.label), context: clip(name) };
		return { label: clip(name), context: 'Evento' };
	}
	const section = activeNavItem(path)?.label ?? '';
	if (h && section && h !== section) return { label: clip(h), context: clip(section) };
	return { label: clip(h || section || 'Panel'), context: '' };
}

/**
 * El ícono de una página del panel para Recientes y Fijados (un `{ icon, emoji }` para
 * `NavIcon`): en la ficha de un evento, el de su pestaña; si no, el de su sección del menú.
 * @param {string} href
 * @returns {{ icon?: import('./nav.js').NavItem['icon'], emoji: string }}
 */
export function placeIcon(href) {
	const path = href.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
	const ev = path.match(/^\/admin\/eventos\/([^/]+)(\/[^/]+)?$/);
	if (ev && !NAV.some((i) => i.href === `/admin/eventos/${ev[1]}`)) {
		const tab = EVENT_TABS.find((t) => t.suffix === (ev[2] ?? ''));
		if (tab) return { icon: tab.icon, emoji: tab.emoji };
	}
	const item = activeNavItem(path) ?? navItem('inicio');
	return { icon: item?.icon, emoji: item?.emoji ?? '' };
}

/**
 * Suma una página arriba de todo (si ya estaba, la sube) y deja {@link RECENT_KEPT}.
 * @param {RecentPlace[]} list
 * @param {RecentPlace} place
 * @returns {RecentPlace[]}
 */
export function addRecent(list, place) {
	const rest = list.filter((r) => r.href !== place.href);
	return [place, ...rest].slice(0, RECENT_KEPT);
}

/**
 * Las que se muestran: sin la página en la que estás, ni las que ya son una sección de la barra
 * (por si el menú cambió), ni las fijadas (`pinned`: sus URLs, ya están arriba), hasta
 * {@link RECENT_SHOWN}.
 * @param {RecentPlace[]} list
 * @param {string} currentPath
 * @param {{ flags?: Record<string, boolean>, pinned?: string[] }} [opts]
 * @returns {RecentPlace[]}
 */
export function visibleRecent(list, currentPath, opts) {
	const here = currentPath.replace(/\/+$/, '') || '/';
	const sections = sectionHrefs(opts);
	const pinned = new Set(opts?.pinned ?? []);
	return list
		.filter((r) => r.href !== here && !sections.has(r.href) && !pinned.has(r.href))
		.slice(0, RECENT_SHOWN);
}

/**
 * @param {string | null | undefined} login
 * @returns {RecentPlace[]}
 */
export function readRecent(login) {
	try {
		return parseRecent(localStorage.getItem(recentKey(login)));
	} catch {
		return [];
	}
}

/**
 * @param {string | null | undefined} login
 * @param {RecentPlace[]} list
 */
export function saveRecent(login, list) {
	try {
		localStorage.setItem(recentKey(login), JSON.stringify(list));
	} catch {
		// Sin storage: duran hasta recargar.
	}
}

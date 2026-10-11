/**
 * La navegación del bot por «pantallas» (docs/telegram.md): qué lleva cada botón en su
 * `callback_data` (hasta 64 bytes) y qué lleva un deep link `t.me/<bot>?start=<algo>` (hasta 64
 * caracteres, solo `A-Za-z0-9_-`). Funciones puras.
 *
 * Nada de estado en la base: el botón lleva todo lo que hace falta (pantalla, página y a dónde
 * vuelve «‹ Volver»). Un botón viejo sigue andando; si el evento ya no está entre los próximos
 * públicos, el bot lo dice y no cambia el mensaje.
 *
 * | Pantalla                      | `callback_data`        |
 * | ----------------------------- | ---------------------- |
 * | Inicio                        | `h`                    |
 * | Lista (página `p`, desde 0)   | `l:<v>:<p>`            |
 * | Detalle de un evento          | `e:<id>:<v>`           |
 * | Buscar / cancelar la búsqueda | `s` / `sx`             |
 * | Lo que sigo / Fondo / Ayuda   | `g` / `fo` / `a`       |
 * | Seguir: opciones / seguir     | `f:<id>` / `fy:<id>:<etiqueta>` |
 * | El contador «1/3» (no hace nada) | `x`                 |
 *
 * `v` es la lista: `d` hoy, `w` semana, `f` finde, `p` próximos; en el detalle también `n` (sin
 * lista: vino de una búsqueda o de un link, y «Volver» va al inicio). `id` es la dirección del
 * evento si es corta y simple, si no `#<hash>`; `<etiqueta>` es un hash corto del nombre.
 * También se entienden los botones de antes (`ev:<id>` y `ls`, keyboards.js).
 */
import { parseCallbackData as parseLegacy } from './keyboards.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */
/** @typedef {'d' | 'w' | 'f' | 'p'} ListView */
/** @typedef {ListView | 'n'} BackView */
/**
 * @typedef {{ screen: 'home' }
 *   | { screen: 'list', view: ListView, page: number }
 *   | { screen: 'event', id: string, back: BackView }
 *   | { screen: 'search' }
 *   | { screen: 'search_cancel' }
 *   | { screen: 'sigo' }
 *   | { screen: 'fondo' }
 *   | { screen: 'help' }
 *   | { screen: 'follow', id: string }
 *   | { screen: 'follow_do', id: string, tag: string }
 *   | { screen: 'noop' }
 *   | { screen: 'legacy_event', token: string }} NavState
 */

/** Límite de Telegram para `callback_data`, en bytes. */
export const CALLBACK_MAX_BYTES = 64;

/** Límite de Telegram para el parámetro de `?start=`. */
export const START_PARAM_MAX = 64;

/** Hasta dónde una dirección de evento va tal cual en un botón (el resto, con hash). */
export const NAV_SLUG_MAX = 40;

/** Las listas y su comando. */
export const LIST_VIEWS = Object.freeze({ d: 'hoy', w: 'semana', f: 'finde', p: 'proximos' });

const SAFE_SLUG = /^[A-Za-z0-9._~-]+$/;
const HASH_ID = /^#[0-9a-z]{1,7}$/;
const TAG_HASH = /^[0-9a-z]{1,7}$/;

/** @param {string} s */
export const byteLength = (s) => new TextEncoder().encode(s).length;

/**
 * FNV-1a de 32 bits, en base 36 (hasta 7 caracteres): corto, estable y sin async. Solo distingue
 * entre unas decenas de eventos o etiquetas; no protege nada.
 *
 * @param {string} s
 */
export function shortHash(s) {
	let h = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(s)) {
		h ^= byte;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36);
}

/**
 * El id de un evento en un botón: la dirección si es simple y entra en {@link NAV_SLUG_MAX}
 * bytes; si no, `#<hash>`.
 *
 * @param {string} slug
 */
export function navId(slug) {
	return SAFE_SLUG.test(slug) && byteLength(slug) <= NAV_SLUG_MAX ? slug : `#${shortHash(slug)}`;
}

/**
 * El evento al que apunta un id, **entre los que se pueden mostrar**. `undefined` si ya no está.
 *
 * @param {BotEvent[]} events
 * @param {string} id
 */
export function findByNavId(events, id) {
	return events.find((e) => navId(e.slug) === id);
}

/** @param {unknown} id */
const isNavId = (id) =>
	typeof id === 'string' &&
	((SAFE_SLUG.test(id) && byteLength(id) <= NAV_SLUG_MAX) || HASH_ID.test(id));

/** @param {unknown} v @returns {v is ListView} */
export const isListView = (v) => v === 'd' || v === 'w' || v === 'f' || v === 'p';

/**
 * Arma el `callback_data` de una pantalla. Tira si no entra en 64 bytes (no debería pasar: los
 * ids ya vienen acotados).
 *
 * @param {Exclude<NavState, { screen: 'legacy_event' }>} state
 * @returns {string}
 */
export function encodeNav(state) {
	/** @type {string} */
	let data;
	switch (state.screen) {
		case 'home':
			data = 'h';
			break;
		case 'list':
			data = `l:${state.view}:${Math.max(0, Math.floor(state.page))}`;
			break;
		case 'event':
			data = `e:${state.id}:${state.back}`;
			break;
		case 'search':
			data = 's';
			break;
		case 'search_cancel':
			data = 'sx';
			break;
		case 'sigo':
			data = 'g';
			break;
		case 'fondo':
			data = 'fo';
			break;
		case 'help':
			data = 'a';
			break;
		case 'follow':
			data = `f:${state.id}`;
			break;
		case 'follow_do':
			data = `fy:${state.id}:${state.tag}`;
			break;
		default:
			data = 'x';
	}
	if (byteLength(data) > CALLBACK_MAX_BYTES) throw new Error('callback_data demasiado largo');
	return data;
}

/** Los que no llevan nada más. @type {Record<string, NavState>} */
const FIXED = {
	h: { screen: 'home' },
	s: { screen: 'search' },
	sx: { screen: 'search_cancel' },
	g: { screen: 'sigo' },
	fo: { screen: 'fondo' },
	a: { screen: 'help' },
	x: { screen: 'noop' }
};

/**
 * Lee el `callback_data` de un botón tocado. `null` si no es uno nuestro (o si está roto).
 *
 * @param {unknown} data
 * @returns {NavState | null}
 */
export function decodeNav(data) {
	if (typeof data !== 'string' || data.length === 0) return null;
	if (byteLength(data) > CALLBACK_MAX_BYTES) return null;
	if (Object.prototype.hasOwnProperty.call(FIXED, data)) return FIXED[data];
	const parts = data.split(':');
	const [kind] = parts;
	if (kind === 'l' && parts.length === 3) {
		const [, view, page] = parts;
		if (isListView(view) && /^\d{1,3}$/.test(page)) return { screen: 'list', view, page: +page };
		return null;
	}
	if (kind === 'e' && parts.length === 3) {
		const [, id, back] = parts;
		if (isNavId(id) && (isListView(back) || back === 'n')) return { screen: 'event', id, back };
		return null;
	}
	if (kind === 'f' && parts.length === 2) {
		return isNavId(parts[1]) ? { screen: 'follow', id: parts[1] } : null;
	}
	if (kind === 'fy' && parts.length === 3) {
		const [, id, tag] = parts;
		return isNavId(id) && TAG_HASH.test(tag) ? { screen: 'follow_do', id, tag } : null;
	}
	// Los botones de antes (mensajes viejos que quedaron en los chats).
	const legacy = parseLegacy(data);
	if (legacy?.kind === 'list') return { screen: 'list', view: 'p', page: 0 };
	if (legacy?.kind === 'event') return { screen: 'legacy_event', token: legacy.token };
	return null;
}

// ---------------------------------------------------------------------------------------------
// Deep links: `t.me/<bot>?start=<algo>` (y lo que llega como `/start <algo>`).
// ---------------------------------------------------------------------------------------------

const DEEP_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * El id de un evento en un deep link (solo `A-Za-z0-9_-`): la dirección si sirve y entra; si no,
 * `_<hash>` (ninguna dirección de evento empieza con `_`).
 *
 * @param {string} slug
 * @param {number} room cuántos caracteres quedan
 */
function deepId(slug, room) {
	return DEEP_SLUG.test(slug) && slug.length <= room ? slug : `_${shortHash(slug)}`;
}

/**
 * El parámetro de `?start=` para abrir algo por chat privado: una lista, el detalle de un evento
 * (`ev-<id>`) o «Seguir» de un evento (`seguir-<id>`).
 *
 * @param {{ screen: 'list', view: ListView } | { screen: 'event' | 'follow', slug: string }
 *   | { screen: 'sigo' | 'fondo' | 'search' | 'home' }} target
 */
export function startParam(target) {
	switch (target.screen) {
		case 'list':
			return LIST_VIEWS[target.view];
		case 'event':
			return `ev-${deepId(target.slug, START_PARAM_MAX - 3)}`;
		case 'follow':
			return `seguir-${deepId(target.slug, START_PARAM_MAX - 7)}`;
		case 'sigo':
			return 'sigo';
		case 'fondo':
			return 'fondo';
		case 'search':
			return 'buscar';
		default:
			return 'inicio';
	}
}

/**
 * Lee el parámetro de `/start` (lo que vino del deep link). `null` si no es uno de estos (por
 * ejemplo, el código de vincular, que lo mira router.js).
 *
 * @param {string} param
 * @returns {{ screen: 'list', view: ListView } | { screen: 'event', deep: string }
 *   | { screen: 'follow', deep: string } | { screen: 'sigo' | 'fondo' | 'search' | 'home' } | null}
 */
export function parseStartParam(param) {
	if (typeof param !== 'string' || param.length > START_PARAM_MAX) return null;
	for (const [view, name] of Object.entries(LIST_VIEWS)) {
		if (param === name) return { screen: 'list', view: /** @type {ListView} */ (view) };
	}
	if (param === 'sigo' || param === 'fondo') return { screen: param };
	if (param === 'buscar') return { screen: 'search' };
	if (param === 'inicio') return { screen: 'home' };
	const m = /^(ev|seguir)-([A-Za-z0-9_-]{1,61})$/.exec(param);
	if (!m) return null;
	return m[1] === 'ev' ? { screen: 'event', deep: m[2] } : { screen: 'follow', deep: m[2] };
}

/**
 * El evento de un deep link, entre los que se pueden mostrar.
 *
 * @param {BotEvent[]} events
 * @param {string} deep
 */
export function findByDeepId(events, deep) {
	return events.find(
		(e) =>
			deepId(e.slug, START_PARAM_MAX - 7) === deep || deepId(e.slug, START_PARAM_MAX - 3) === deep
	);
}

/**
 * `https://t.me/<bot>?start=<param>`, o `null` sin el usuario del bot.
 *
 * @param {string | null | undefined} botUsername
 * @param {string} param
 */
export function startLink(botUsername, param) {
	if (!botUsername) return null;
	return `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(param)}`;
}

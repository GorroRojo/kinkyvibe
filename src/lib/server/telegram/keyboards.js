/**
 * Botones del bot de Telegram (teclados "inline", decisión 0029). Funciones puras.
 *
 * Cada botón de un evento lleva en `callback_data` un id corto: `ev:<dirección>` si la dirección
 * entra (Telegram admite hasta 64 bytes) y tiene solo caracteres simples; si no, `ev:#<hash>`.
 * El id no da acceso a nada: al tocarlo, el bot lo busca **entre los próximos eventos públicos**
 * (los de `events.js`), así que un id viejo o inventado da «ya no está disponible».
 */
import { eventUrl } from './format.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */

/** Límite de Telegram para `callback_data`, en bytes. */
export const CALLBACK_DATA_MAX_BYTES = 64;

/** Botones de eventos por mensaje (igual que la lista de texto). */
export const KEYBOARD_MAX = 8;

const EVENT_PREFIX = 'ev:';
/** `callback_data` del botón que vuelve a la lista de próximos. */
export const LIST_CALLBACK = 'ls';

const SAFE_SLUG = /^[A-Za-z0-9._~-]+$/;

/** @param {string} s */
const byteLength = (s) => new TextEncoder().encode(s).length;

/**
 * FNV-1a de 32 bits, en base 36: corto, estable y sin async. Solo distingue eventos entre los
 * próximos (unas decenas), no protege nada.
 *
 * @param {string} s
 */
function shortHash(s) {
	let h = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(s)) {
		h ^= byte;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36);
}

/**
 * El id del evento que va en el botón.
 *
 * @param {string} slug
 */
export function eventToken(slug) {
	if (SAFE_SLUG.test(slug) && byteLength(EVENT_PREFIX + slug) <= CALLBACK_DATA_MAX_BYTES) {
		return slug;
	}
	return `#${shortHash(slug)}`;
}

/** @param {string} slug */
export function eventCallbackData(slug) {
	return EVENT_PREFIX + eventToken(slug);
}

/**
 * Lee el `callback_data` de un botón tocado. `null` si no es uno nuestro.
 *
 * @param {unknown} data
 * @returns {{ kind: 'event', token: string } | { kind: 'list' } | null}
 */
export function parseCallbackData(data) {
	if (typeof data !== 'string' || data.length === 0) return null;
	if (byteLength(data) > CALLBACK_DATA_MAX_BYTES) return null;
	if (data === LIST_CALLBACK) return { kind: 'list' };
	if (data.startsWith(EVENT_PREFIX)) {
		const token = data.slice(EVENT_PREFIX.length);
		if (SAFE_SLUG.test(token) || /^#[0-9a-z]{1,7}$/.test(token)) return { kind: 'event', token };
	}
	return null;
}

/**
 * El evento al que apunta un id, entre los que se pueden mostrar. `undefined` si ya no está.
 *
 * @param {BotEvent[]} events
 * @param {string} token
 */
export function findByToken(events, token) {
	return events.find((e) => eventToken(e.slug) === token);
}

/**
 * Acorta un texto para un botón (los botones largos se cortan feo en el celular).
 *
 * @param {string} text
 * @param {number} max
 */
export function truncate(text, max) {
	const chars = Array.from(text.trim());
	return chars.length <= max
		? chars.join('')
		: `${chars
				.slice(0, max - 1)
				.join('')
				.trimEnd()}…`;
}

/**
 * Un botón «Ver: <título>» por evento, uno por fila.
 *
 * @param {BotEvent[]} events
 */
export function eventListKeyboard(events) {
	return {
		inline_keyboard: events
			.slice(0, KEYBOARD_MAX)
			.map((e) => [
				{ text: `Ver: ${truncate(e.title, 32)}`, callback_data: eventCallbackData(e.slug) }
			])
	};
}

/**
 * Debajo del detalle: abrir en el sitio (solo con https, Telegram rechaza otros links en botones)
 * y volver a la lista.
 *
 * @param {BotEvent} event
 * @param {string} origin
 */
export function eventDetailKeyboard(event, origin) {
	/** @type {Array<Array<Record<string, string>>>} */
	const rows = [];
	if (origin.startsWith('https://')) {
		rows.push([{ text: 'Abrir en el sitio', url: eventUrl(origin, event.slug) }]);
	}
	rows.push([{ text: '« Próximos eventos', callback_data: LIST_CALLBACK }]);
	return { inline_keyboard: rows };
}

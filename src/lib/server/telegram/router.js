/**
 * Qué responde el bot a cada mensaje (decisión 0029, fase 1: solo lectura).
 *
 * `handleUpdate` recibe un "update" de Telegram y devuelve la respuesta como un objeto
 * `sendMessage`, que el webhook contesta en el mismo pedido (así no hace falta guardar el token
 * del bot ni llamar a la API de Telegram), o `null` si no hay nada que contestar. No tiene reglas
 * propias de visibilidad: lo que se puede mostrar lo decide `deps.listUpcoming`.
 */
import {
	ASK_EVENT_TEXT,
	ERROR_TEXT,
	NOT_FOUND_TEXT,
	UNKNOWN_TEXT,
	formatChoices,
	formatEvent,
	formatEventList,
	formatHelp
} from './format.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */

/**
 * @typedef {{
 *   listUpcoming: () => Promise<BotEvent[]>,
 *   origin: string
 * }} Deps
 */

/**
 * "/evento@MiBot taller" → `{ name: 'evento', args: 'taller' }`. `null` si no es un comando.
 *
 * @param {unknown} text
 */
export function parseCommand(text) {
	if (typeof text !== 'string') return null;
	const match = /^\/([a-z0-9_]{1,32})(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
	if (!match) return null;
	return { name: match[1].toLowerCase(), args: (match[2] ?? '').trim() };
}

/** Minúsculas y sin tildes, para buscar sin que importe cómo se escribió. */
const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Los eventos que coinciden con lo buscado: primero la dirección exacta; si no, todas las
 * palabras dentro del título.
 *
 * @param {BotEvent[]} events
 * @param {string} query
 */
export function matchEvents(events, query) {
	const q = fold(query.trim());
	if (!q) return [];
	const exact = events.filter((e) => fold(e.slug) === q);
	if (exact.length > 0) return exact;
	const words = q.split(/\s+/);
	return events.filter((e) => {
		const haystack = fold(e.title);
		return words.every((w) => haystack.includes(w));
	});
}

/**
 * @param {number | string} chatId
 * @param {string} text
 */
function reply(chatId, text) {
	return {
		method: 'sendMessage',
		chat_id: chatId,
		text,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true }
	};
}

/**
 * @param {any} update
 * @param {Deps} deps
 */
export async function handleUpdate(update, deps) {
	const message = update?.message;
	const chatId = message?.chat?.id;
	if (typeof chatId !== 'number' && typeof chatId !== 'string') return null;
	const command = parseCommand(message?.text);
	if (!command) return null;
	const { origin } = deps;

	try {
		switch (command.name) {
			case 'start':
			case 'ayuda':
			case 'help':
				return reply(chatId, formatHelp(origin));
			case 'proximos':
				return reply(chatId, formatEventList(await deps.listUpcoming(), origin));
			case 'evento': {
				if (!command.args) return reply(chatId, ASK_EVENT_TEXT);
				const found = matchEvents(await deps.listUpcoming(), command.args);
				if (found.length === 0) return reply(chatId, NOT_FOUND_TEXT);
				if (found.length === 1) return reply(chatId, formatEvent(found[0], origin));
				return reply(chatId, formatChoices(found, origin));
			}
			default:
				return reply(chatId, UNKNOWN_TEXT);
		}
	} catch (error) {
		console.error('[telegram] error al armar la respuesta:', error);
		return reply(chatId, ERROR_TEXT);
	}
}

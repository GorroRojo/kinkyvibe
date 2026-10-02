/**
 * Qué responde el bot a cada mensaje y a cada botón (decisión 0029, fase 1: solo lectura).
 *
 * `handleUpdate` recibe un "update" de Telegram y devuelve la respuesta como un método de la API
 * (`sendMessage`, `editMessageText` o `answerCallbackQuery`), que el webhook contesta en el mismo
 * pedido (así no hace falta guardar el token del bot ni llamar a la API de Telegram), o `null` si
 * no hay nada que contestar. No tiene reglas propias de visibilidad: lo que se puede mostrar lo
 * decide `deps.listUpcoming`, también cuando se toca un botón viejo.
 */
import {
	ERROR_TEXT,
	NOT_FOUND_TEXT,
	UNAVAILABLE_TEXT,
	UNKNOWN_TEXT,
	formatChoices,
	formatEvent,
	formatEventList,
	formatHelp,
	formatPickList
} from './format.js';
import {
	eventDetailKeyboard,
	eventListKeyboard,
	findByToken,
	parseCallbackData
} from './keyboards.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */

/**
 * Un método de la API de Telegram para contestar en el mismo pedido (`method` + sus parámetros).
 *
 * @typedef {{ method: string } & Record<string, any>} BotMethod
 */

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
const fold = (/** @type {string} */ s) =>
	s
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Las palabras de fecha de un evento, en hora de Argentina y sin tildes: el día de la semana
 * («sabado», «sab»), el mes («octubre», «oct») y el día y mes en números.
 *
 * @param {string} iso
 */
export function dateWords(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	/** @param {Intl.DateTimeFormatOptions} opts */
	const part = (opts) =>
		fold(new Intl.DateTimeFormat('es-AR', { timeZone: TIME_ZONE, ...opts }).format(date)).replace(
			'.',
			''
		);
	const weekday = part({ weekday: 'long' });
	const month = part({ month: 'long' });
	return {
		words: new Set([weekday, weekday.slice(0, 3), month, month.slice(0, 3)]),
		day: Number(part({ day: 'numeric' })),
		month: Number(part({ month: 'numeric' }))
	};
}

/**
 * ¿Esta palabra buscada es la fecha del evento? «sábado», «sab», «15/10», «15-10-2031».
 *
 * @param {string} word ya pasada por `fold`
 * @param {ReturnType<typeof dateWords>} when
 */
function matchesDate(word, when) {
	if (!when) return false;
	if (when.words.has(word)) return true;
	const numeric = /^(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?$/.exec(word);
	return Boolean(numeric && Number(numeric[1]) === when.day && Number(numeric[2]) === when.month);
}

/**
 * Los eventos que coinciden con lo buscado: primero la dirección exacta; si no, cada palabra
 * tiene que estar dentro del título (vale un pedazo: «cuer» encuentra «cuerdas») o ser la fecha
 * del evento («sábado», «15/10»). Sin importar tildes ni mayúsculas.
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
		const when = dateWords(e.start);
		return words.every((w) => haystack.includes(w) || matchesDate(w, when));
	});
}

/**
 * @param {number | string} chatId
 * @param {string} text
 * @param {object} [replyMarkup]
 * @returns {BotMethod}
 */
function reply(chatId, text, replyMarkup) {
	return {
		method: 'sendMessage',
		chat_id: chatId,
		text,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true },
		...(replyMarkup ? { reply_markup: replyMarkup } : {})
	};
}

/**
 * Cambia el mensaje del botón tocado (así el chat no se llena de mensajes).
 *
 * @param {number | string} chatId
 * @param {number} messageId
 * @param {string} text
 * @param {object} replyMarkup
 * @returns {BotMethod}
 */
function edit(chatId, messageId, text, replyMarkup) {
	return {
		method: 'editMessageText',
		chat_id: chatId,
		message_id: messageId,
		text,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true },
		reply_markup: replyMarkup
	};
}

/**
 * Contesta el botón tocado con un aviso chiquito (y corta el "cargando" del botón).
 *
 * @param {string} callbackId
 * @param {string} text
 * @returns {BotMethod}
 */
function answer(callbackId, text) {
	return { method: 'answerCallbackQuery', callback_query_id: callbackId, text };
}

/**
 * Alguien tocó un botón. Telegram acepta un solo método como respuesta del webhook, así que:
 * si el evento sigue entre los próximos, se cambia el mensaje por su detalle (`editMessageText`;
 * el "cargando" del botón se va solo a los pocos segundos); si ya no está, o no hay mensaje que
 * cambiar, se contesta el botón con un aviso (`answerCallbackQuery`).
 *
 * @param {any} callback
 * @param {Deps} deps
 * @returns {Promise<BotMethod | null>}
 */
async function handleCallback(callback, deps) {
	const callbackId = callback?.id;
	if (typeof callbackId !== 'string' || !callbackId) return null;
	const chatId = callback?.message?.chat?.id;
	const messageId = callback?.message?.message_id;
	const canEdit =
		(typeof chatId === 'number' || typeof chatId === 'string') && typeof messageId === 'number';
	const data = parseCallbackData(callback?.data);
	if (!data) return answer(callbackId, UNKNOWN_TEXT);

	try {
		const events = await deps.listUpcoming();
		if (data.kind === 'list') {
			if (!canEdit) return answer(callbackId, UNAVAILABLE_TEXT);
			return edit(
				chatId,
				messageId,
				formatEventList(events, deps.origin),
				eventListKeyboard(events)
			);
		}
		const event = findByToken(events, data.token);
		if (!event || !canEdit) return answer(callbackId, UNAVAILABLE_TEXT);
		return edit(
			chatId,
			messageId,
			formatEvent(event, deps.origin),
			eventDetailKeyboard(event, deps.origin)
		);
	} catch (error) {
		console.error('[telegram] error al contestar un botón:', error);
		return answer(callbackId, ERROR_TEXT);
	}
}

/**
 * Botones para una lista (ninguno si está vacía).
 *
 * @param {BotEvent[]} events
 */
const keyboardFor = (events) => (events.length > 0 ? eventListKeyboard(events) : undefined);

/**
 * @param {any} update
 * @param {Deps} deps
 * @returns {Promise<BotMethod | null>}
 */
export async function handleUpdate(update, deps) {
	if (update?.callback_query) return handleCallback(update.callback_query, deps);
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
			case 'proximos': {
				const events = await deps.listUpcoming();
				return reply(chatId, formatEventList(events, origin), keyboardFor(events));
			}
			case 'evento': {
				const events = await deps.listUpcoming();
				if (!command.args)
					return reply(chatId, formatPickList(events, origin), keyboardFor(events));
				const found = matchEvents(events, command.args);
				if (found.length === 0) return reply(chatId, NOT_FOUND_TEXT);
				if (found.length === 1) {
					return reply(
						chatId,
						formatEvent(found[0], origin),
						eventDetailKeyboard(found[0], origin)
					);
				}
				return reply(chatId, formatChoices(found, origin), eventListKeyboard(found));
			}
			default:
				return reply(chatId, UNKNOWN_TEXT);
		}
	} catch (error) {
		console.error('[telegram] error al armar la respuesta:', error);
		return reply(chatId, ERROR_TEXT);
	}
}

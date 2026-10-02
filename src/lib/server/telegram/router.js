/**
 * Qué responde el bot a cada mensaje y a cada botón (decisión 0029). Fase 1: eventos, solo
 * lectura. Fase 2: vincular el chat con una cuenta (`/vincular`, `/desvincular`, `/silenciar`,
 * `/reanudar`), solo por chat privado y con `deps.accounts` (que da `null` con algún interruptor
 * apagado).
 *
 * `handleUpdate` recibe un "update" de Telegram y devuelve la respuesta como un método de la API
 * (`sendMessage`, `editMessageText` o `answerCallbackQuery`), que el webhook contesta en el mismo
 * pedido (así no hace falta guardar el token del bot ni llamar a la API de Telegram), o `null` si
 * no hay nada que contestar. No tiene reglas propias de visibilidad: lo que se puede mostrar lo
 * decide `deps.listUpcoming`, también cuando se toca un botón viejo. No sabe de la base: lo de
 * las cuentas pasa por `deps.accounts` (link.js).
 */
import {
	ACCOUNTS_OFF_TEXT,
	LINK_ASK_CODE_TEXT,
	LINK_INVALID_TEXT,
	LINK_TOO_MANY_TEXT,
	MUTED_TEXT,
	NOT_LINKED_TEXT,
	PRIVATE_ONLY_TEXT,
	UNLINKED_TEXT,
	UNMUTED_TEXT,
	formatLinked,
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
 * Lo que el bot puede hacer con las cuentas (fase 2). `chatId` es siempre el del chat privado.
 *
 * @typedef {{
 *   link: (code: string, chatId: number | string) => Promise<'linked' | 'invalid' | 'too_many'>,
 *   unlink: (chatId: number | string) => Promise<boolean>,
 *   setMuted: (chatId: number | string, muted: boolean) => Promise<boolean>
 * }} BotAccounts
 */

/**
 * @typedef {{
 *   listUpcoming: () => Promise<BotEvent[]>,
 *   origin: string,
 *   accounts?: () => Promise<BotAccounts | null>
 * }} Deps
 */

/** Los comandos de la cuenta (fase 2). */
const ACCOUNT_COMMANDS = new Set(['vincular', 'desvincular', 'silenciar', 'reanudar']);

/** Lo que trae "/start" cuando viene del link con el código (8 letras y números). */
const START_CODE = /^[A-Za-z0-9]{8}$/;

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
 * `/vincular`, `/desvincular`, `/silenciar` y `/reanudar`: solo por chat privado (en un grupo,
 * cualquiera del grupo vería el código o recibiría los avisos de otra persona).
 *
 * @param {{ name: string, args: string }} command
 * @param {any} chat
 * @param {Deps} deps
 * @returns {Promise<string>}
 */
async function accountCommand(command, chat, deps) {
	if (chat?.type !== 'private') return PRIVATE_ONLY_TEXT;
	const accounts = deps.accounts ? await deps.accounts() : null;
	if (!accounts) return ACCOUNTS_OFF_TEXT;
	const chatId = chat.id;
	switch (command.name) {
		case 'vincular': {
			if (!command.args) return LINK_ASK_CODE_TEXT;
			const r = await accounts.link(command.args, chatId);
			if (r === 'linked') return formatLinked(deps.origin);
			return r === 'too_many' ? LINK_TOO_MANY_TEXT : LINK_INVALID_TEXT;
		}
		case 'desvincular':
			return (await accounts.unlink(chatId)) ? UNLINKED_TEXT : NOT_LINKED_TEXT;
		case 'silenciar':
			return (await accounts.setMuted(chatId, true)) ? MUTED_TEXT : NOT_LINKED_TEXT;
		default:
			return (await accounts.setMuted(chatId, false)) ? UNMUTED_TEXT : NOT_LINKED_TEXT;
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
				// El link `t.me/<bot>?start=<código>` de Mi rincón llega como "/start <código>".
				if (START_CODE.test(command.args)) {
					const linkCommand = { name: 'vincular', args: command.args };
					return reply(chatId, await accountCommand(linkCommand, message.chat, deps));
				}
			// falls through
			case 'ayuda':
			case 'help': {
				const accounts = deps.accounts ? await deps.accounts() : null;
				return reply(chatId, formatHelp(origin, { accounts: Boolean(accounts) }));
			}
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
				if (ACCOUNT_COMMANDS.has(command.name)) {
					return reply(chatId, await accountCommand(command, message.chat, deps));
				}
				return reply(chatId, UNKNOWN_TEXT);
		}
	} catch (error) {
		console.error('[telegram] error al armar la respuesta:', error);
		return reply(chatId, ERROR_TEXT);
	}
}

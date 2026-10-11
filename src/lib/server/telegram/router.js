/**
 * Qué responde el bot a cada mensaje y a cada botón (decisiones 0029 y 0034, docs/telegram.md).
 *
 * - Fase 1: eventos, solo lectura, ahora como «pantallas» (screens.js) que se navegan con botones
 *   (nav.js): `/start` es el inicio y los comandos son atajos a las mismas pantallas.
 * - Fase 2: vincular el chat con una cuenta (`/vincular`, `/desvincular`, `/silenciar`,
 *   `/reanudar`), solo por chat privado y con `deps.accounts` (que da `null` con algún
 *   interruptor apagado).
 *
 * `planUpdate` recibe un "update" de Telegram y devuelve un plan (deliver.js): los métodos de la
 * API a llamar. Con el token cargado (`deps.media`), el webhook lo corre con run.js; sin token,
 * `handleUpdate` devuelve un solo método para contestar en el mismo pedido, como antes.
 *
 * No tiene reglas propias de visibilidad: lo que se puede mostrar lo decide `deps.listUpcoming`,
 * también cuando se toca un botón viejo. No sabe de la base: lo de las cuentas pasa por
 * `deps.accounts` (link.js). En los grupos, solo lo público (deliver.js: efímeros).
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
	PICK_EVENT_TEXT,
	FOLLOW_ALREADY_TEXT,
	FOLLOW_FULL_TEXT,
	FOLLOW_GONE_TEXT,
	FOLLOW_TOO_MANY_TEXT,
	followedText
} from './format.js';
import { ACCOUNT_COMMAND_NAMES, HANDLED_COMMANDS } from './commands.js';
import { answerOnly, deliverScreen, singleMethod } from './deliver.js';
import {
	decodeNav,
	encodeNav,
	findByDeepId,
	findByNavId,
	navId,
	parseStartParam,
	startLink,
	startParam
} from './nav.js';
import { cardFor, navigate } from './navigate.js';
import {
	SEARCH_PROMPT_HEAD,
	followScreen,
	listScreen,
	noticeScreen,
	privateOnlyScreen,
	searchResultsScreen,
	sigoScreen,
	unlinkedScreen
} from './screens.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */
/** @typedef {import('./deliver.js').BotMethod} BotMethod */
/** @typedef {import('./deliver.js').BotPlan} BotPlan */
/** @typedef {import('./deliver.js').Where} Where */
/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/** @typedef {import('./nav.js').NavState} NavState */

/**
 * Lo que el bot puede hacer con las cuentas (fase 2). `chatId` es siempre el del chat privado.
 * `follows`: «Seguir» y «Lo que sigo» (seguir.js, decisión 0034).
 *
 * @typedef {{
 *   link: (code: string, chatId: number | string) => Promise<'linked' | 'invalid' | 'too_many'>,
 *   unlink: (chatId: number | string) => Promise<boolean>,
 *   setMuted: (chatId: number | string, muted: boolean) => Promise<boolean>,
 *   follows?: import('./seguir.js').BotFollows
 * }} BotAccounts
 */

/**
 * @typedef {import('./navigate.js').NavDeps & {
 *   accounts?: () => Promise<BotAccounts | null>,
 *   media?: boolean
 * }} Deps `media`: hay token, así que se pueden usar fotos y varios métodos (run.js)
 */

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
 * Una pantalla de solo texto (respuestas de la cuenta, avisos).
 *
 * @param {string} text
 * @returns {Screen}
 */
const textScreen = (text) => ({ text, keyboard: [] });

/** @param {any} chat */
const isGroup = (chat) => chat?.type === 'group' || chat?.type === 'supergroup';

/**
 * El contexto de las pantallas para este chat.
 *
 * @param {Deps} deps
 * @param {boolean} group
 * @param {BotAccounts | null} [accounts] con «Lo que sigo» prendido
 * @returns {ScreenCtx}
 */
function screenCtx(deps, group, accounts = null) {
	return {
		origin: deps.origin,
		chat: group ? 'group' : 'private',
		now: deps.now ? deps.now() : Date.now(),
		botUsername: deps.botUsername ?? null,
		sigo: Boolean(accounts?.follows)
	};
}

/**
 * El botón «⭐ Seguir» de una tarjeta, solo con «Lo que sigo» prendido: en privado abre las
 * opciones; en un grupo, el chat privado con el bot (`?start=seguir-<id>`).
 *
 * @param {BotEvent} event
 * @param {ScreenCtx} ctx
 * @returns {import('./screens.js').Button | null}
 */
function followButton(event, ctx) {
	if (!ctx.sigo) return null;
	if (ctx.chat === 'private') {
		return {
			text: '⭐ Seguir',
			callback_data: encodeNav({ screen: 'follow', id: navId(event.slug) })
		};
	}
	const link = startLink(ctx.botUsername, startParam({ screen: 'follow', slug: event.slug }));
	return link ? { text: '⭐ Seguir ↗', url: link } : null;
}

/**
 * «Lo que sigo» y «Seguir»: lo único personal. Solo por chat privado, con «Lo que sigo» prendido
 * y el chat vinculado a una cuenta, mirado en cada mensaje. En un grupo, el link al privado.
 *
 * @param {{ screen: 'sigo' } | { screen: 'follow', id?: string, deep?: string }
 *   | { screen: 'follow_do', id: string, tag: string }} state
 * @param {number | string} chatId
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {BotAccounts | null} accounts
 * @returns {Promise<{ screen: Screen, toast?: string } | { toast: string }>}
 */
async function personalScreen(state, chatId, ctx, deps, accounts) {
	const follows = accounts?.follows;
	if (!follows) return { toast: ACCOUNTS_OFF_TEXT };
	if (ctx.chat === 'group') {
		return {
			screen: privateOnlyScreen(startLink(ctx.botUsername, startParam({ screen: 'sigo' })))
		};
	}
	const accountId = await follows.accountFor(chatId);
	if (!accountId) return { screen: unlinkedScreen(ctx) };
	if (state.screen === 'sigo') return { screen: sigoScreen(await follows.titles(accountId), ctx) };

	const events = await deps.listUpcoming();
	const event =
		'deep' in state && state.deep
			? findByDeepId(events, state.deep)
			: findByNavId(events, /** @type {string} */ (state.id));
	if (!event) return { toast: UNAVAILABLE_TEXT };
	const targets = await follows.targets(event.slug);
	/** @type {string | undefined} */
	let toast;
	if (state.screen === 'follow_do') {
		const target = targets.find((t) => t.hash === state.tag);
		if (!target) return { toast: FOLLOW_GONE_TEXT };
		const r = await follows.follow(accountId, target.key);
		toast =
			r === 'created' || r === 'created_telegram'
				? followedText(target.title, { telegram: r === 'created_telegram' })
				: r === 'already'
					? FOLLOW_ALREADY_TEXT
					: r === 'too_many'
						? FOLLOW_TOO_MANY_TEXT
						: r === 'full'
							? FOLLOW_FULL_TEXT
							: FOLLOW_GONE_TEXT;
	}
	const following = await follows.following(
		accountId,
		targets.map((t) => t.key)
	);
	const screen = followScreen(
		event,
		targets.map((t) => ({ ...t, following: following.has(t.key) })),
		ctx
	);
	return toast ? { screen, toast } : { screen };
}

/**
 * ¿Es la respuesta al mensaje de Buscar? Solo por chat privado.
 *
 * @param {any} message
 */
function isSearchReply(message) {
	const prompt = message?.reply_to_message;
	return (
		message?.chat?.type === 'private' &&
		typeof message?.text === 'string' &&
		!message.text.startsWith('/') &&
		prompt?.from?.is_bot === true &&
		typeof prompt?.text === 'string' &&
		prompt.text.startsWith(SEARCH_PROMPT_HEAD)
	);
}

/**
 * El link al chat privado con el bot que abre lo mismo (para los grupos que no dejan mostrarlo
 * a una sola persona).
 *
 * @param {NavState} state
 * @param {Deps} deps
 */
function privateLinkFor(state, deps) {
	const param =
		state.screen === 'list'
			? startParam({ screen: 'list', view: state.view })
			: startParam({ screen: 'home' });
	return startLink(deps.botUsername, param);
}

/**
 * ¿Están prendidas las cuentas (fase 2)? `null` si no.
 *
 * @param {Deps} deps
 */
const accountsOf = async (deps) => (deps.accounts ? await deps.accounts() : null);

/**
 * Alguien tocó un botón.
 *
 * @param {any} callback
 * @param {Deps} deps
 * @returns {Promise<BotPlan | null>}
 */
async function planCallback(callback, deps) {
	const callbackId = callback?.id;
	if (typeof callbackId !== 'string' || !callbackId) return null;
	const message = callback?.message;
	const chatId = message?.chat?.id;
	if (typeof chatId !== 'number' && typeof chatId !== 'string') {
		return answerOnly(callbackId, UNAVAILABLE_TEXT);
	}
	const group = isGroup(message.chat);
	/** @type {Where} */
	const where = {
		kind: 'callback',
		callbackId,
		chatId,
		group,
		// En los efímeros `message_id` es 0: se usa `ephemeral_message_id`.
		...(typeof message.message_id === 'number' && message.message_id > 0
			? { messageId: message.message_id }
			: {}),
		...(typeof callback?.from?.id === 'number' ? { userId: callback.from.id } : {}),
		...(typeof message.ephemeral_message_id === 'number'
			? { ephemeralId: message.ephemeral_message_id }
			: {}),
		isPhoto: Array.isArray(message.photo)
	};
	const state = decodeNav(callback?.data);
	if (!state) return answerOnly(callbackId, UNKNOWN_TEXT);
	if (state.screen === 'noop') return answerOnly(callbackId);
	if (state.screen === 'search_cancel') {
		if (group || !where.messageId) return answerOnly(callbackId);
		return {
			steps: [{ method: 'deleteMessage', chat_id: chatId, message_id: where.messageId }],
			callback: { id: callbackId }
		};
	}
	try {
		const accounts = await accountsOf(deps);
		const ctx = screenCtx(deps, group, accounts);
		const result =
			state.screen === 'sigo' || state.screen === 'follow' || state.screen === 'follow_do'
				? await personalScreen(state, chatId, ctx, deps, accounts)
				: await navigate(state, ctx, deps, {
						accounts: Boolean(accounts),
						follow: (event) => followButton(event, ctx)
					});
		if (!('screen' in result)) return answerOnly(callbackId, result.toast);
		const plan = deliverScreen(result.screen, where, {
			media: Boolean(deps.media),
			privateLink: privateLinkFor(state, deps)
		});
		const toast = 'toast' in result ? result.toast : undefined;
		if (typeof toast === 'string' && toast && plan.callback) {
			plan.callback = { ...plan.callback, text: toast };
		}
		return plan;
	} catch (error) {
		console.error('[telegram] error al contestar un botón:', error);
		return answerOnly(callbackId, ERROR_TEXT);
	}
}

/**
 * `/start <algo>` que vino de un deep link (`?start=semana`, `?start=ev-<id>`…). `null` si no
 * es uno de esos.
 *
 * @param {string} param
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {number | string} chatId
 * @param {BotAccounts | null} accounts
 * @returns {Promise<Screen | null>}
 */
async function startScreen(param, ctx, deps, chatId, accounts) {
	const target = parseStartParam(param);
	if (!target) return null;
	if (target.screen === 'sigo' || target.screen === 'follow') {
		const r = await personalScreen(target, chatId, ctx, deps, accounts);
		return 'screen' in r ? r.screen : noticeScreen(r.toast);
	}
	if (target.screen === 'list') {
		const r = await navigate({ screen: 'list', view: target.view, page: 0 }, ctx, deps);
		return 'screen' in r ? r.screen : null;
	}
	if (target.screen === 'event') {
		const events = await deps.listUpcoming();
		const event = findByDeepId(events, target.deep);
		if (!event) return noticeScreen(UNAVAILABLE_TEXT);
		return cardFor(event, 'n', events, ctx, deps, { follow: followButton(event, ctx) });
	}
	if (target.screen === 'fondo' || target.screen === 'search' || target.screen === 'home') {
		const r = await navigate({ screen: target.screen }, ctx, deps);
		return 'screen' in r ? r.screen : null;
	}
	return null;
}

/**
 * La pantalla de un comando.
 *
 * @param {{ name: string, args: string }} command
 * @param {any} message
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {BotAccounts | null} accounts
 * @returns {Promise<Screen>}
 */
async function commandScreen(command, message, ctx, deps, accounts) {
	/** @param {NavState} state */
	const go = async (state) => {
		const r = await navigate(state, ctx, deps, {
			accounts: Boolean(accounts),
			follow: (event) => followButton(event, ctx)
		});
		return 'screen' in r ? r.screen : noticeScreen(r.toast);
	};
	switch (command.name) {
		case 'start': {
			// El link `t.me/<bot>?start=<código>` de Mi rincón llega como "/start <código>".
			if (START_CODE.test(command.args)) {
				const linkCommand = { name: 'vincular', args: command.args };
				return textScreen(await accountCommand(linkCommand, message.chat, deps));
			}
			if (command.args) {
				const screen = await startScreen(command.args, ctx, deps, message.chat.id, accounts);
				if (screen) return screen;
			}
			return go({ screen: 'home' });
		}
		case 'ayuda':
		case 'help':
			return go({ screen: 'help' });
		case 'proximos':
			return go({ screen: 'list', view: 'p', page: 0 });
		case 'hoy':
			return go({ screen: 'list', view: 'd', page: 0 });
		case 'semana':
			return go({ screen: 'list', view: 'w', page: 0 });
		case 'finde':
			return go({ screen: 'list', view: 'f', page: 0 });
		case 'buscar':
			return go({ screen: 'search' });
		case 'fondo':
			return go({ screen: 'fondo' });
		case 'evento': {
			const events = await deps.listUpcoming();
			if (!command.args) {
				return listScreen('p', events, 0, ctx, events.length ? { intro: PICK_EVENT_TEXT } : {});
			}
			const found = matchEvents(events, command.args);
			if (found.length === 0) return noticeScreen(NOT_FOUND_TEXT);
			if (found.length === 1) {
				return cardFor(found[0], 'n', events, ctx, deps, { follow: followButton(found[0], ctx) });
			}
			return searchResultsScreen(command.args, found, ctx, {
				head: 'Encontré varios eventos. ¿Cuál querés ver? Tocá uno.'
			});
		}
		default:
			if (command.name === 'sigo') {
				const r = await personalScreen({ screen: 'sigo' }, message.chat.id, ctx, deps, accounts);
				return 'screen' in r ? r.screen : textScreen(r.toast);
			}
			if (ACCOUNT_COMMAND_NAMES.has(command.name)) {
				return textScreen(await accountCommand(command, message.chat, deps));
			}
			return noticeScreen(UNKNOWN_TEXT);
	}
}

/**
 * @param {any} update
 * @param {Deps} deps
 * @returns {Promise<BotPlan | null>}
 */
export async function planUpdate(update, deps) {
	if (update?.callback_query) return planCallback(update.callback_query, deps);
	const message = update?.message;
	const chatId = message?.chat?.id;
	if (typeof chatId !== 'number' && typeof chatId !== 'string') return null;
	const group = isGroup(message.chat);
	/** @type {Where} */
	const where = {
		kind: 'command',
		chatId,
		group,
		...(typeof message?.from?.id === 'number' ? { userId: message.from.id } : {}),
		...(typeof message?.ephemeral_message_id === 'number'
			? { ephemeralId: message.ephemeral_message_id }
			: {})
	};
	const send = (/** @type {Screen} */ screen) =>
		deliverScreen(screen, where, { media: Boolean(deps.media) });

	try {
		if (isSearchReply(message)) {
			const query = message.text.trim().slice(0, 100);
			const found = matchEvents(await deps.listUpcoming(), query);
			return send(searchResultsScreen(query, found, screenCtx(deps, group)));
		}
		const command = parseCommand(message?.text);
		if (!command) return null;
		// La lista de comandos vive en commands.js (también la que se registra en Telegram).
		if (!HANDLED_COMMANDS.has(command.name)) return send(textScreen(UNKNOWN_TEXT));
		const accounts = await accountsOf(deps);
		const ctx = screenCtx(deps, group, accounts);
		return send(await commandScreen(command, message, ctx, deps, accounts));
	} catch (error) {
		console.error('[telegram] error al armar la respuesta:', error);
		return send(textScreen(ERROR_TEXT));
	}
}

/**
 * Sin token: un solo método para contestar en el mismo pedido del webhook (o `null`).
 *
 * @param {any} update
 * @param {Deps} deps
 * @returns {Promise<BotMethod | null>}
 */
export async function handleUpdate(update, deps) {
	return singleMethod(await planUpdate(update, { ...deps, media: false }));
}

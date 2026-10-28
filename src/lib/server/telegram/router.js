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
import { escapeHtml, formatAdminLinked, formatLinked, followedText } from './format.js';
import { ACCOUNT_COMMAND_NAMES, ADMIN_COMMAND_NAMES, HANDLED_COMMANDS } from './commands.js';
import { answerOnly, deliverScreen, singleMethod } from './deliver.js';
import {
	ADMIN_START_PREFIX,
	clipQuery,
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
import { parseInlineQuery, planInlineQuery, selectInline, similarInline } from './inline.js';
import { backToResults, docHash, docScreen, siteResultsScreen } from './siteScreens.js';
import { noResultsHelp, noResultsScreen, offersFollow } from './noResults.js';
import { sectionDocScreen, sectionScreen, sectionTagsScreen, sectionView } from './sections.js';
import {
	adminRow,
	doorAppUrl,
	isSearchPrompt,
	followScreen,
	listScreen,
	noticeScreen,
	privateOnlyScreen,
	searchResultsScreen,
	sigoScreen,
	unlinkedScreen
} from './screens.js';
import {
	isPastTicket,
	ticketScreen,
	ticketsForView,
	ticketsScreen,
	ticketsUnlinkedScreen
} from './misEntradas.js';
import { botText } from './texts.js';
import { decodeAdminNav } from './adminNav.js';
import { adminResult } from './adminBot.js';
import { normalizeSearch, objectKey, trackUso } from './uso.js';

/**
 * Un texto de «Textos del bot» que también es aviso de un botón (texto solo), para un mensaje:
 * escapado para el HTML de Telegram.
 *
 * @param {string} key
 */
const htmlOf = (key) => escapeHtml(botText(key));

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
 *   follows?: import('./seguir.js').BotFollows,
 *   tickets?: import('./tickets.js').BotTickets
 * }} BotAccounts `tickets`: «🎟 Mis entradas» (tickets.js, misEntradas.js).
 */

/**
 * Vincular el Telegram de une admin (la puerta por Telegram, decisión 0037, adminLink.js): recibe
 * lo que vino después de `/start` (`adm_<código>`) y el id del usuario de Telegram.
 *
 * @typedef {(param: string, telegramUserId: number) =>
 *   Promise<{ linked: string } | 'invalid' | 'too_many'>} BotAdminLink
 */

/**
 * ¿Este usuario de Telegram es une admin vinculade que puede abrir la puerta? (puerta.js,
 * `botDoor`). Para el botón «🚪 Puerta» del inicio.
 *
 * @typedef {(telegramUserId: number) => Promise<boolean>} BotDoor
 */

/**
 * @typedef {import('./navigate.js').NavDeps & {
 *   accounts?: () => Promise<BotAccounts | null>,
 *   adminLink?: BotAdminLink | null,
 *   inline?: import('./inline.js').InlineDeps | null,
 *   door?: BotDoor | null,
 *   admin?: import('./adminData.js').BotAdmin | null,
 *   media?: boolean
 * }} Deps `media`: hay token, así que se pueden usar fotos y varios métodos (run.js).
 *   `inline`: el modo inline (inline.js); sin él, un `inline_query` no se contesta.
 *   `adminLink`: sin base o con `telegram_puerta` apagado, `null` (el bot contesta que no se
 *   puede). `door`: lo mismo; se llama solo al mostrar el inicio por chat privado.
 *   `admin`: «📊 Estado» y «🔔 Mis avisos» (decisión 0041, adminData.js); `null` sin base o con
 *   `telegram_admin` apagado.
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

/**
 * ¿El comando va para otro bot? «/ayuda@OtroBot» en un grupo donde este bot ve todos los mensajes
 * (es admin o tiene el modo privacidad apagado): no se contesta. Sin el usuario del bot
 * (`TELEGRAM_BOT_USERNAME`) no se puede saber y se contesta como antes.
 *
 * @param {unknown} text
 * @param {string | null | undefined} botUsername
 */
export function forOtherBot(text, botUsername) {
	if (typeof text !== 'string' || !botUsername) return false;
	const to = /^\/[a-z0-9_]{1,32}@(\w+)/i.exec(text.trim())?.[1];
	return !!to && to.toLowerCase() !== botUsername.toLowerCase();
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
	if (chat?.type !== 'private') return botText('vincular.solo_privado');
	const accounts = deps.accounts ? await deps.accounts() : null;
	if (!accounts) return htmlOf('vincular.apagado');
	const chatId = chat.id;
	const notLinked = () => botText('vincular.sin_vincular');
	switch (command.name) {
		case 'vincular': {
			if (!command.args) return botText('vincular.pedir_codigo');
			const r = await accounts.link(command.args, chatId);
			if (r === 'linked') {
				trackUso(deps.usage, 'vincular', 'cuenta');
				return formatLinked(deps.origin);
			}
			return botText(r === 'too_many' ? 'vincular.muchos' : 'vincular.codigo_malo');
		}
		case 'desvincular': {
			if (!(await accounts.unlink(chatId))) return notLinked();
			trackUso(deps.usage, 'desvincular', 'cuenta');
			return botText('vincular.desvinculado');
		}
		case 'silenciar':
			return (await accounts.setMuted(chatId, true)) ? botText('vincular.silenciado') : notLinked();
		default:
			return (await accounts.setMuted(chatId, false)) ? botText('vincular.reanudado') : notLinked();
	}
}

/**
 * `/start adm_<código>`: el link de «Vincular Telegram» del panel (Ajustes → Admins). Solo por
 * chat privado; no depende de «Lo que sigo» (les admins no tienen cuenta pública). Si sale bien,
 * la confirmación trae el botón que abre la puerta (Mini App, `web_app` solo anda en privado).
 *
 * @param {string} param
 * @param {any} message
 * @param {Deps} deps
 * @returns {Promise<Screen>}
 */
async function adminLinkCommand(param, message, deps) {
	if (message?.chat?.type !== 'private') return textScreen(botText('vincular.solo_privado'));
	const userId = message?.from?.id;
	if (!deps.adminLink || typeof userId !== 'number') {
		return textScreen(botText('puerta.apagada'));
	}
	const r = await deps.adminLink(param, userId);
	if (typeof r === 'object' && r) {
		trackUso(deps.usage, 'vincular', 'admin');
		// Vincular anda con la puerta o con «Telegram para admins» prendidos (0037, 0041): cada
		// botón, solo con lo suyo. `door: null` es la puerta apagada (el webhook siempre lo pasa);
		// sin `door` (las pruebas de antes), el botón de la puerta como siempre.
		return {
			text: formatAdminLinked(r.linked),
			keyboard: [
				...(deps.door !== null
					? [[{ text: botText('puerta.boton'), web_app: { url: doorAppUrl(deps.origin) } }]]
					: []),
				...(deps.admin ? [adminRow()] : [])
			]
		};
	}
	return textScreen(botText(r === 'too_many' ? 'vincular.muchos' : 'puerta.link_malo'));
}

/**
 * Une admin vinculade con «Telegram para admins» prendido (decisión 0041), mirado **en cada
 * mensaje y cada botón**: solo por chat privado con esa misma persona (el id del chat privado es
 * el del usuario), con `deps.admin`, el vínculo y la lista `ADMINS` (adminData.js). Si algo falla,
 * `null` (como si no fuera admin).
 *
 * @param {Deps} deps
 * @param {any} chat
 * @param {unknown} userId
 * @returns {Promise<import('./adminLink.js').AdminIdentity | null>}
 */
async function adminFor(deps, chat, userId) {
	if (!deps.admin || chat?.type !== 'private' || typeof userId !== 'number') return null;
	if (String(chat.id) !== String(userId)) return null;
	try {
		return await deps.admin.who(userId);
	} catch (error) {
		console.error('[telegram] no se pudo mirar si es admin:', /** @type {Error} */ (error)?.name);
		return null;
	}
}

/**
 * Un botón de admins (adminNav.js). A quien no es admin vinculade (o con el interruptor apagado,
 * o en un grupo) le contesta **lo mismo que a un botón que no es nuestro**: no dice que existe ni
 * muestra nada, aunque el botón esté armado a mano.
 *
 * @param {import('./adminNav.js').AdminNavState} state
 * @param {any} callback
 * @param {Where} where
 * @param {Deps} deps
 * @returns {Promise<BotPlan>}
 */
async function planAdminCallback(state, callback, where, deps) {
	const callbackId = /** @type {string} */ (callback.id);
	const who = await adminFor(deps, callback?.message?.chat, callback?.from?.id);
	if (!who || !deps.admin) return answerOnly(callbackId, botText('errores.no_entendi'));
	try {
		const result = await adminResult(state, who, screenCtx(deps, false), deps.admin);
		if (!('screen' in result)) return answerOnly(callbackId, result.toast);
		const plan = deliverScreen(result.screen, where, { media: Boolean(deps.media) });
		if (result.toast && plan.callback) plan.callback = { ...plan.callback, text: result.toast };
		return plan;
	} catch (error) {
		console.error('[telegram] error en lo de admins:', /** @type {Error} */ (error)?.name);
		return answerOnly(callbackId, botText('errores.algo_salio_mal'));
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
		sigo: Boolean(accounts?.follows),
		site: Boolean(deps.inline),
		entradas: Boolean(accounts?.tickets),
		// Mensajes enriquecidos (`telegram_enriquecido`): solo con el token, para poder volver a la
		// tarjeta de siempre si Telegram los rechaza (deliver.js).
		rich: Boolean(deps.inline?.rich && deps.media)
	};
}

/**
 * Lo que coincide con lo buscado en todo el sitio, en el orden del buscador del sitio: solo lo del
 * índice público de la búsqueda (inline.js). `null` sin el índice.
 *
 * @param {string} query ya recortada (`clipQuery`)
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 */
async function siteMatches(query, ctx, deps) {
	const source = deps.inline ? await deps.inline.source() : null;
	if (!source) return null;
	return {
		source,
		docs: selectInline(source, { types: null, text: query }, ctx.now ?? Date.now())
	};
}

/**
 * Los resultados de buscar en todo el sitio (eventos, material, Kinkipedia, series y amigues).
 *
 * @param {string} rawQuery
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @returns {Promise<Screen>}
 */
async function siteSearchScreen(rawQuery, page, ctx, deps) {
	const query = clipQuery(rawQuery);
	const found = query ? await siteMatches(query, ctx, deps) : null;
	if (!found) return noticeScreen(htmlOf('errores.algo_salio_mal'));
	if (found.docs.length === 0) {
		const help = noResultsHelp(found.source, query, ctx.now ?? Date.now(), await siteTags(deps));
		return noResultsScreen(query, help, ctx, { extras: found.source.extras });
	}
	return siteResultsScreen(query, found.docs, page, ctx, found.source.extras);
}

/**
 * El árbol de etiquetas del sitio, para las sugerencias y «Seguir» de una búsqueda sin
 * resultados. Si no está o falla, `null` (se sugiere igual, sin madres, hijas ni «Seguir»).
 *
 * @param {Deps} deps
 * @returns {Promise<TagManager | null>}
 */
async function siteTags(deps) {
	if (!deps.inline?.tags) return null;
	try {
		return await deps.inline.tags();
	} catch (error) {
		console.error(
			'[telegram] no se pudo leer el árbol de etiquetas:',
			/** @type {Error} */ (error)?.name
		);
		return null;
	}
}

/**
 * «⭐ Seguir» en una búsqueda sin resultados (noResults.js): sigue la etiqueta que es lo buscado,
 * por el mismo camino que «Seguir» en una tarjeta (`follows.follow`, seguir.js). Solo por chat
 * privado vinculado, con «Lo que sigo» prendido; la etiqueta se vuelve a sacar de lo buscado (un
 * botón armado a mano no puede seguir otra cosa). Después, la misma pantalla con «✓ Ya seguís».
 *
 * @param {{ tag: string, query: string }} state
 * @param {number | string} chatId
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {BotAccounts | null} accounts
 * @returns {Promise<{ screen: Screen, toast?: string } | { toast: string }>}
 */
async function searchFollowResult(state, chatId, ctx, deps, accounts) {
	const follows = accounts?.follows;
	if (!follows) return { toast: botText('vincular.apagado') };
	if (ctx.chat === 'group') {
		return {
			screen: privateOnlyScreen(startLink(ctx.botUsername, startParam({ screen: 'sigo' })))
		};
	}
	const found = await siteMatches(state.query, ctx, deps);
	if (!found || found.docs.length) return { toast: botText('errores.no_disponible') };
	const help = noResultsHelp(
		found.source,
		state.query,
		ctx.now ?? Date.now(),
		await siteTags(deps)
	);
	const tag = help.tag;
	if (!tag || tag.hash !== state.tag || !offersFollow(help, ctx)) {
		return { toast: botText('seguir.no_esta') };
	}
	const accountId = await follows.accountFor(chatId);
	if (!accountId) return { screen: unlinkedScreen(ctx) };
	const r = await follows.follow(accountId, tag.key);
	const toast = followToast(r, tag.title);
	if (r === 'created' || r === 'created_telegram') trackUso(deps.usage, 'seguir', 'busqueda');
	const following = r === 'created' || r === 'created_telegram' || r === 'already';
	return {
		screen: noResultsScreen(state.query, help, ctx, {
			extras: found.source.extras,
			following
		}),
		toast
	};
}

/**
 * La tarjeta de un resultado: se busca de nuevo lo mismo y se toma la cosa **de esos resultados**
 * (nunca algo afuera del índice público). Un evento próximo, con su tarjeta de siempre; lo demás
 * (y un evento que ya pasó), con la tarjeta compacta. Las dos con «‹ Volver» a la página.
 *
 * @param {{ hash: string, page: number, query: string }} state
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @returns {Promise<{ screen: Screen } | { toast: string }>}
 */
async function siteDocResult(state, ctx, deps) {
	const found = await siteMatches(state.query, ctx, deps);
	const doc = found?.docs.find((d) => docHash(d) === state.hash);
	if (!found || !doc) return { toast: botText('errores.no_disponible') };
	const back = backToResults(state.query, state.page);
	if (doc.c === 'calendario') {
		const events = await deps.listUpcoming();
		const event = events.find((e) => `/calendario/${e.slug}` === doc.h);
		if (event) {
			return {
				screen: await cardFor(event, 'n', events, ctx, deps, {
					follow: followButton(event, ctx),
					back
				})
			};
		}
	}
	// Estadísticas: la cosa abierta, solo si es pública (uso.js), sin quién.
	trackUso(deps.usage, 'objeto', objectKey(doc, found.source));
	return { screen: docScreen(doc, found.source.extras.get(doc.h), ctx, { back }) };
}

/**
 * Las secciones del sitio (sections.js): la lista, sus etiquetas y la tarjeta de una cosa. Todo
 * del índice público de la búsqueda; una etiqueta o una cosa que no está en esa sección (botón
 * viejo o armado a mano) no muestra nada.
 *
 * @param {{ screen: 'section', section: import('./nav.js').SectionId, page: number, tag?: string }
 *   | { screen: 'section_tags', section: import('./nav.js').SectionId, tag?: string }
 *   | { screen: 'section_doc', section: import('./nav.js').SectionId, hash: string, page: number,
 *     tag?: string }} state
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @returns {Promise<{ screen: Screen } | { toast: string }>}
 */
async function sectionResult(state, ctx, deps) {
	const source = deps.inline ? await deps.inline.source() : null;
	if (!source) return { toast: botText('errores.algo_salio_mal') };
	const view = sectionView(source, state.section, state.tag);
	if (!view) return { toast: botText('secciones.no_esta') };
	if (state.screen === 'section_tags') return { screen: sectionTagsScreen(state.section, view) };
	if (state.screen === 'section') {
		return { screen: sectionScreen(state.section, view, state.page, ctx, source.extras) };
	}
	const screen = sectionDocScreen(state.section, view, state, ctx, source.extras);
	if (screen && deps.usage) {
		const doc = view.all.find((d) => docHash(d) === state.hash);
		trackUso(deps.usage, 'objeto', objectKey(doc, source));
	}
	return screen ? { screen } : { toast: botText('secciones.no_esta') };
}

/**
 * El contexto del inicio: con `door` si quien escribe puede abrir la puerta (une admin vinculade,
 * los dos interruptores prendidos). Solo por chat privado (`web_app` no anda en grupos) y solo
 * para el inicio: una consulta por id de Telegram, nada más. Si falla, el inicio sale sin el
 * botón.
 *
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {any} chat
 * @param {unknown} userId
 * @returns {Promise<ScreenCtx>}
 */
async function homeCtx(ctx, deps, chat, userId) {
	if (chat?.type !== 'private' || typeof userId !== 'number') return ctx;
	/** @type {ScreenCtx} */
	let out = ctx;
	if (deps.door) {
		try {
			if (await deps.door(userId)) out = { ...out, door: true };
		} catch (error) {
			console.error('[telegram] no se pudo mirar la puerta:', /** @type {Error} */ (error)?.name);
		}
	}
	if (deps.admin && (await adminFor(deps, chat, userId))) out = { ...out, admin: true };
	return out;
}

/**
 * El aviso del botón después de seguir algo (en una tarjeta o en una búsqueda sin resultados).
 *
 * @param {Awaited<ReturnType<import('./seguir.js').BotFollows['follow']>>} r
 * @param {string} title
 */
function followToast(r, title) {
	if (r === 'created' || r === 'created_telegram') {
		return followedText(title, { telegram: r === 'created_telegram' });
	}
	return botText(
		r === 'already'
			? 'seguir.ya'
			: r === 'too_many'
				? 'seguir.muchos'
				: r === 'full'
					? 'seguir.lleno'
					: 'seguir.no_esta'
	);
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
			text: botText('seguir.boton'),
			callback_data: encodeNav({ screen: 'follow', id: navId(event.slug) })
		};
	}
	const link = startLink(ctx.botUsername, startParam({ screen: 'follow', slug: event.slug }));
	return link ? { text: `${botText('seguir.boton')} ↗`, url: link } : null;
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
	if (!follows) return { toast: botText('vincular.apagado') };
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
	if (!event) return { toast: botText('errores.no_disponible') };
	const targets = await follows.targets(event.slug);
	/** @type {string | undefined} */
	let toast;
	if (state.screen === 'follow_do') {
		const target = targets.find((t) => t.hash === state.tag);
		if (!target) return { toast: botText('seguir.no_esta') };
		const r = await follows.follow(accountId, target.key);
		if (r === 'created' || r === 'created_telegram') trackUso(deps.usage, 'seguir', 'tarjeta');
		toast = followToast(r, target.title);
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
 * «🎟 Mis entradas»: la lista y la tarjeta de una entrada. Solo por chat privado vinculado a una
 * cuenta, mirado en cada mensaje; en un grupo, el link al privado (sin mirar ninguna cuenta). Una
 * entrada se busca **solo entre las de la cuenta de este chat**: un botón armado a mano con el id
 * de otra entrada contesta lo mismo que uno viejo («Esa entrada ya no está acá.»).
 *
 * @param {{ screen: 'tickets', view: import('./nav.js').TicketsView, page: number }
 *   | { screen: 'ticket', id: string, view: import('./nav.js').TicketsView }} state
 * @param {number | string} chatId
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {BotAccounts | null} accounts
 * @returns {Promise<{ screen: Screen } | { toast: string }>}
 */
async function ticketsResult(state, chatId, ctx, deps, accounts) {
	const tickets = accounts?.tickets;
	if (!tickets) return { toast: botText('vincular.apagado') };
	if (ctx.chat === 'group') {
		return {
			screen: privateOnlyScreen(startLink(ctx.botUsername, startParam({ screen: 'tickets' })))
		};
	}
	const accountId = await tickets.accountFor(chatId);
	if (!accountId) return { screen: ticketsUnlinkedScreen(ctx) };
	const all = await tickets.list(accountId);
	if (state.screen === 'tickets') {
		return { screen: ticketsScreen(state.view, all, state.page, ctx) };
	}
	const ticket = all.find((t) => t.id === state.id);
	if (!ticket) return { toast: botText('entradas.no_esta') };
	const now = ctx.now ?? Date.now();
	// Un botón viejo puede ser de la otra lista (el evento ya pasó): vuelve a la suya.
	const view = isPastTicket(ticket, now) ? 'o' : 'u';
	const list = ticketsForView(view, all, now);
	return { screen: ticketScreen(ticket, view, list, ctx, { qr: Boolean(deps.media) }) };
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
		isSearchPrompt(prompt.text)
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
		return answerOnly(callbackId, botText('errores.no_disponible'));
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
	// Lo de admins, antes que todo: quién toca se mira en cada botón (decisión 0041).
	const adminState = decodeAdminNav(callback?.data);
	if (adminState) return planAdminCallback(adminState, callback, where, deps);
	const state = decodeNav(callback?.data);
	if (!state) return answerOnly(callbackId, botText('errores.no_entendi'));
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
		const base = screenCtx(deps, group, accounts);
		const ctx =
			state.screen === 'home' ? await homeCtx(base, deps, message.chat, callback?.from?.id) : base;
		const result =
			state.screen === 'site_results'
				? { screen: await siteSearchScreen(state.query, state.page, ctx, deps) }
				: state.screen === 'site_doc'
					? await siteDocResult(state, ctx, deps)
					: state.screen === 'search_follow'
						? await searchFollowResult(state, chatId, ctx, deps, accounts)
						: state.screen === 'section' ||
							  state.screen === 'section_tags' ||
							  state.screen === 'section_doc'
							? await sectionResult(state, ctx, deps)
							: state.screen === 'sigo' || state.screen === 'follow' || state.screen === 'follow_do'
								? await personalScreen(state, chatId, ctx, deps, accounts)
								: state.screen === 'tickets' || state.screen === 'ticket'
									? await ticketsResult(state, chatId, ctx, deps, accounts)
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
		return answerOnly(callbackId, botText('errores.algo_salio_mal'));
	}
}

/**
 * `/start <algo>` que vino de un deep link (`?start=semana`, `?start=ev-<id>`…). `null` si no
 * es uno de esos.
 *
 * @param {string} param
 * @param {ScreenCtx} ctx
 * @param {Deps} deps
 * @param {any} message
 * @param {BotAccounts | null} accounts
 * @returns {Promise<Screen | null>}
 */
async function startScreen(param, ctx, deps, message, accounts) {
	const chatId = message.chat.id;
	const target = parseStartParam(param);
	if (!target) return null;
	if (target.screen === 'sigo' || target.screen === 'follow') {
		const r = await personalScreen(target, chatId, ctx, deps, accounts);
		return 'screen' in r ? r.screen : noticeScreen(escapeHtml(r.toast));
	}
	if (target.screen === 'tickets') {
		const r = await ticketsResult(
			{ screen: 'tickets', view: 'u', page: 0 },
			chatId,
			ctx,
			deps,
			accounts
		);
		return 'screen' in r ? r.screen : noticeScreen(escapeHtml(r.toast));
	}
	if (target.screen === 'list') {
		const r = await navigate({ screen: 'list', view: target.view, page: 0 }, ctx, deps);
		return 'screen' in r ? r.screen : null;
	}
	if (target.screen === 'event') {
		const events = await deps.listUpcoming();
		const event = findByDeepId(events, target.deep);
		if (!event) return noticeScreen(htmlOf('errores.no_disponible'));
		return cardFor(event, 'n', events, ctx, deps, { follow: followButton(event, ctx) });
	}
	if (target.screen === 'home') {
		const r = await navigate(
			target,
			await homeCtx(ctx, deps, message.chat, message?.from?.id),
			deps
		);
		return 'screen' in r ? r.screen : null;
	}
	if (target.screen === 'fondo' || target.screen === 'search') {
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
	/** @param {NavState} state @param {ScreenCtx} [where] */
	const go = async (state, where = ctx) => {
		const r = await navigate(state, where, deps, {
			accounts: Boolean(accounts),
			follow: (event) => followButton(event, ctx)
		});
		return 'screen' in r ? r.screen : noticeScreen(escapeHtml(r.toast));
	};
	switch (command.name) {
		case 'start': {
			// El link de «Vincular Telegram» del panel llega como "/start adm_<código>".
			if (command.args.startsWith(ADMIN_START_PREFIX)) {
				return adminLinkCommand(command.args, message, deps);
			}
			// El link `t.me/<bot>?start=<código>` de Mi rincón llega como "/start <código>".
			if (START_CODE.test(command.args)) {
				const linkCommand = { name: 'vincular', args: command.args };
				return textScreen(await accountCommand(linkCommand, message.chat, deps));
			}
			if (command.args) {
				const screen = await startScreen(command.args, ctx, deps, message, accounts);
				if (screen) return screen;
			}
			return go({ screen: 'home' }, await homeCtx(ctx, deps, message.chat, message?.from?.id));
		}
		case 'inicio':
			// Lo mismo que `/start` sin nada, por el mismo camino (lo que venga después se ignora).
			return commandScreen({ name: 'start', args: '' }, message, ctx, deps, accounts);
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
			// Con texto («/buscar cuerdas», también en grupos): los resultados de todo el sitio.
			if (command.args && deps.inline) {
				trackUso(deps.usage, 'busqueda', normalizeSearch(command.args));
				return siteSearchScreen(command.args, 0, ctx, deps);
			}
			return go({ screen: 'search' });
		case 'fondo':
			return go({ screen: 'fondo' });
		case 'evento': {
			const events = await deps.listUpcoming();
			if (!command.args) {
				return listScreen(
					'p',
					events,
					0,
					ctx,
					events.length ? { intro: botText('eventos.elegir') } : {}
				);
			}
			trackUso(deps.usage, 'busqueda', normalizeSearch(command.args));
			const found = matchEvents(events, command.args);
			if (found.length === 0) return noticeScreen(botText('eventos.no_encontrado'));
			if (found.length === 1) {
				return cardFor(found[0], 'n', events, ctx, deps, { follow: followButton(found[0], ctx) });
			}
			return searchResultsScreen(command.args, found, ctx, {
				head: botText('eventos.varios')
			});
		}
		default:
			if (command.name === 'entradas') {
				const r = await ticketsResult(
					{ screen: 'tickets', view: 'u', page: 0 },
					message.chat.id,
					ctx,
					deps,
					accounts
				);
				return 'screen' in r ? r.screen : textScreen(escapeHtml(r.toast));
			}
			if (command.name === 'sigo') {
				const r = await personalScreen({ screen: 'sigo' }, message.chat.id, ctx, deps, accounts);
				return 'screen' in r ? r.screen : textScreen(escapeHtml(r.toast));
			}
			if (ACCOUNT_COMMAND_NAMES.has(command.name)) {
				return textScreen(await accountCommand(command, message.chat, deps));
			}
			return noticeScreen(htmlOf('errores.no_entendi'));
	}
}

/**
 * @param {any} update
 * @param {Deps} deps
 * @returns {Promise<BotPlan | null>}
 */
export async function planUpdate(update, deps) {
	if (update?.callback_query) return planCallback(update.callback_query, deps);
	if (update?.inline_query) return planInline(update.inline_query, deps);
	if (update?.chosen_inline_result) {
		// Solo para las estadísticas (no se contesta nada).
		await trackChosenInline(update.chosen_inline_result, deps);
		return null;
	}
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
			trackUso(deps.usage, 'busqueda', normalizeSearch(query));
			// Con el índice público: todo el sitio (con «Lo que sigo» para ofrecer «Seguir» si no
			// encuentra nada). Sin él, como antes, los próximos eventos.
			if (deps.inline) {
				const ctx = screenCtx(deps, group, await accountsOf(deps));
				return send(await siteSearchScreen(query, 0, ctx, deps));
			}
			const ctx = screenCtx(deps, group);
			const found = matchEvents(await deps.listUpcoming(), query);
			return send(searchResultsScreen(query, found, ctx));
		}
		const command = parseCommand(message?.text);
		if (!command || forOtherBot(message?.text, deps.botUsername)) return null;
		// `/estado` y `/avisos`: solo une admin vinculade, por privado (0041). Para cualquier otra
		// persona, lo mismo que un comando que no existe.
		if (ADMIN_COMMAND_NAMES.has(command.name)) {
			const who = await adminFor(deps, message.chat, message?.from?.id);
			if (!who || !deps.admin) return send(textScreen(htmlOf('errores.no_entendi')));
			const r = await adminResult(
				command.name === 'avisos'
					? { screen: 'admin_notices' }
					: { screen: 'admin_events', page: 0 },
				who,
				screenCtx(deps, false),
				deps.admin
			);
			return send('screen' in r ? r.screen : noticeScreen(escapeHtml(r.toast)));
		}
		// La lista de comandos vive en commands.js (también la que se registra en Telegram).
		if (!HANDLED_COMMANDS.has(command.name)) return send(textScreen(htmlOf('errores.no_entendi')));
		const accounts = await accountsOf(deps);
		const ctx = screenCtx(deps, group, accounts);
		return send(await commandScreen(command, message, ctx, deps, accounts));
	} catch (error) {
		console.error('[telegram] error al armar la respuesta:', error);
		return send(textScreen(htmlOf('errores.algo_salio_mal')));
	}
}

/**
 * El modo inline (`@<bot> <texto>` en cualquier chat): solo lo público del índice de la búsqueda
 * (inline.js). Un error no contesta nada (Telegram muestra la lista vacía).
 *
 * @param {any} inlineQuery
 * @param {Deps} deps
 * @returns {Promise<BotPlan | null>}
 */
async function planInline(inlineQuery, deps) {
	if (!deps.inline) return null;
	try {
		return await planInlineQuery(inlineQuery, {
			...deps.inline,
			// Enriquecidos solo con el token: sin él no hay vuelta atrás si Telegram los rechaza.
			rich: Boolean(deps.inline.rich && deps.media),
			origin: deps.origin,
			now: deps.now
		});
	} catch (error) {
		console.error('[telegram] error en el modo inline:', /** @type {Error} */ (error)?.name);
		return null;
	}
}

/**
 * Estadísticas: la cosa que alguien eligió y mandó desde el modo inline (`chosen_inline_result`,
 * llega solo con «inline feedback» prendido en @BotFather). El id del resultado es su lugar en la
 * lista (inline.js): se vuelve a armar la misma lista con lo mismo buscado, **del índice público**,
 * y se cuenta esa cosa solo si es pública (uso.js). Sin estadísticas, no lee nada. Nunca tira.
 *
 * @param {any} chosen
 * @param {Deps} deps
 */
async function trackChosenInline(chosen, deps) {
	if (!deps.usage || !deps.inline) return;
	try {
		const index = /^\d{1,4}$/.test(String(chosen?.result_id ?? '')) ? Number(chosen.result_id) : -1;
		if (index < 0) return;
		const source = await deps.inline.source();
		if (!source) return;
		const query = parseInlineQuery(chosen?.query);
		const now = deps.now ? deps.now() : Date.now();
		const found = selectInline(source, query, now);
		// Sin resultados, el modo inline mostró los de la búsqueda parecida (inline.js).
		const docs =
			found.length === 0 && query.text ? (similarInline(source, query, now)?.docs ?? []) : found;
		trackUso(deps.usage, 'inline_elegido', objectKey(docs[index], source));
	} catch (error) {
		console.error('[telegram] estadísticas inline:', /** @type {Error} */ (error)?.name);
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

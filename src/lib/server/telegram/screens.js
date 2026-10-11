/**
 * Las «pantallas» del bot (docs/telegram.md): qué texto y qué botones lleva cada una. Funciones
 * puras: reciben los datos ya filtrados (los próximos eventos públicos de events.js, lo público
 * de la tarjeta de un evento, los cinco números del Fondo) y devuelven una {@link Screen}. Cómo
 * se manda (mensaje nuevo, edición, efímero en un grupo) lo decide deliver.js.
 *
 * Reglas:
 * - nada personal fuera del chat privado (lo que necesita cuenta lo arma quien llama, solo ahí);
 * - un botón con link solo si el sitio es https (Telegram rechaza los otros);
 * - todo en español rioplatense con el lenguaje inclusivo del sitio.
 */
import { escapeHtml, eventUrl, formatWhen, WINDOW_TEXTS, formatHelp } from './format.js';
import { truncate } from './keyboards.js';
import { encodeNav, navId, startLink } from './nav.js';
import { formatARS } from '$lib/utils/money.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */
/** @typedef {import('./nav.js').ListView} ListView */
/** @typedef {import('./nav.js').BackView} BackView */
/**
 * Un botón de un teclado inline, tal como lo pide la API (`text` y uno de `callback_data`, `url`,
 * `web_app` o `disabled`; `style` opcional, Bot API 9.4).
 *
 * @typedef {{ text: string, callback_data?: string, url?: string, web_app?: { url: string },
 *   disabled?: {}, style?: 'primary' | 'success' | 'danger' }} Button
 */
/**
 * Una pantalla: texto HTML de Telegram, botones y, opcionalmente, una foto (tarjeta de evento) o
 * el link para la vista previa grande. `forceReply`: va en un mensaje nuevo que abre «responder»
 * (Buscar).
 *
 * @typedef {{ text: string, keyboard: Button[][], photo?: string, preview?: string,
 *   forceReply?: boolean }} Screen
 */
/**
 * Dónde se va a ver: chat privado o grupo (en un grupo, solo lo público y nada que necesite
 * cuenta), el origen del sitio y, si está, el usuario del bot (para los links al chat privado).
 *
 * @typedef {{ origin: string, chat: 'private' | 'group', now?: number,
 *   botUsername?: string | null, sigo?: boolean }} ScreenCtx
 */
/**
 * Lo público de la tarjeta de un evento: lo mismo que la página del evento le muestra a cualquiera.
 *
 * @typedef {{ image?: string | null, place?: string, mapUrl?: string,
 *   ticket?: import('$lib/utils/ticketCta.js').TicketCta | null }} CardInfo
 */

/** La Mini App del calendario (`/telegram/app`, sin login). @param {string} origin */
export const miniAppUrl = (origin) => `${origin}/telegram/app`;

/** Eventos por página en las listas. */
export const PAGE_SIZE = 5;

/** Telegram corta los pies de foto de más de 1024 caracteres. */
export const CAPTION_MAX = 1024;

/** Títulos de cada lista. */
export const LIST_TITLES = Object.freeze({
	d: WINDOW_TEXTS.hoy.title,
	w: WINDOW_TEXTS.semana.title,
	f: WINDOW_TEXTS.finde.title,
	p: 'Próximos eventos'
});

/** @param {string} origin */
export const isHttps = (origin) => origin.startsWith('https://');

/** @returns {Button} */
const homeButton = () => ({ text: '🏠 Inicio', callback_data: encodeNav({ screen: 'home' }) });

/** @param {ListView} view @param {number} page */
const backToList = (view, page) => ({
	text: '‹ Volver',
	callback_data: encodeNav({ screen: 'list', view, page })
});

/**
 * La fecha con la entidad `date_time` (Bot API 9.5): Telegram la muestra en el idioma y la zona
 * horaria de quien lee (`wdt`: día de la semana, fecha corta y hora); el texto de adentro, en
 * castellano y hora de Argentina, queda para los clientes viejos. Vacío si la fecha no se lee.
 *
 * @param {string} iso
 * @param {number} [now]
 */
export function tgTime(iso, now) {
	const ms = Date.parse(iso);
	const text = formatWhen(iso, now);
	if (!Number.isFinite(ms) || !text) return '';
	return `<tg-time unix="${Math.floor(ms / 1000)}" format="wdt">${escapeHtml(text)}</tg-time>`;
}

// ---------------------------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------------------------

export const HOME_TEXT =
	'<b>Hola, soy el bot de Kinky Vibe</b> 🖤\n\n' +
	'Podés pedirme lo que hay hoy, esta semana o el finde: tocá un botón o escribí un comando ' +
	'(/semana, /proximos, /evento &lt;nombre&gt;). Para todo lo demás, /ayuda.';

/**
 * «⭐ Lo que sigo» en el inicio, solo con «Lo que sigo» prendido: en privado abre la pantalla; en
 * un grupo, el chat privado con el bot (lo personal nunca se muestra en un grupo).
 *
 * @param {ScreenCtx} ctx
 * @returns {Button[]}
 */
function sigoButton(ctx) {
	if (!ctx.sigo) return [];
	if (ctx.chat === 'private') {
		return [{ text: '⭐ Lo que sigo', callback_data: encodeNav({ screen: 'sigo' }) }];
	}
	const link = startLink(ctx.botUsername, 'sigo');
	return link ? [{ text: '⭐ Lo que sigo ↗', url: link }] : [];
}

/**
 * `/start` y «🏠 Inicio».
 *
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function homeScreen(ctx) {
	/** @param {ListView} view @param {string} text */
	const list = (view, text) => ({
		text,
		callback_data: encodeNav({ screen: 'list', view, page: 0 }),
		style: /** @type {const} */ ('primary')
	});
	/** @type {Button[][]} */
	const rows = [
		[list('d', 'Hoy'), list('w', 'Semana'), list('f', 'Finde')],
		[{ text: '🔎 Buscar', callback_data: encodeNav({ screen: 'search' }) }, ...sigoButton(ctx)],
		[
			{ text: '💗 Fondo', callback_data: encodeNav({ screen: 'fondo' }) },
			{ text: '❓ Ayuda', callback_data: encodeNav({ screen: 'help' }) }
		]
	];
	if (isHttps(ctx.origin)) {
		/** @type {Button[]} */
		const last = [];
		// La Mini App del calendario (`web_app` solo anda en chats privados, Bot API).
		if (ctx.chat === 'private') {
			last.push({ text: '📅 Calendario', web_app: { url: miniAppUrl(ctx.origin) } });
		}
		last.push({ text: `Abrir ${new URL(ctx.origin).host} ↗`, url: ctx.origin });
		rows.push(last);
	}
	return { text: HOME_TEXT, keyboard: rows };
}

// ---------------------------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------------------------

/**
 * Cuántas páginas tiene una lista (al menos 1) y la página pedida, acotada.
 *
 * @param {number} count
 * @param {number} page
 */
export function paginate(count, page) {
	const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
	const current = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
	return { pages, page: current, from: current * PAGE_SIZE, to: current * PAGE_SIZE + PAGE_SIZE };
}

/**
 * La fila «‹ 2/3 ›»: el del medio es un botón deshabilitado (Bot API 10.3) y las flechas solo
 * aparecen si hay hacia dónde ir. Sin fila si hay una sola página.
 *
 * @param {number} page
 * @param {number} pages
 * @param {(page: number) => string} data
 * @returns {Button[] | null}
 */
export function pagerRow(page, pages, data) {
	if (pages <= 1) return null;
	/** @type {Button[]} */
	const row = [];
	if (page > 0) row.push({ text: '‹', callback_data: data(page - 1) });
	row.push({ text: `${page + 1}/${pages}`, disabled: {} });
	if (page < pages - 1) row.push({ text: '›', callback_data: data(page + 1) });
	return row;
}

/** @param {string} view @param {string} origin @returns {string} */
function emptyText(view, origin) {
	if (view === 'd') return WINDOW_TEXTS.hoy.empty;
	if (view === 'w') return WINDOW_TEXTS.semana.empty;
	if (view === 'f') return WINDOW_TEXTS.finde.empty;
	return `Por ahora no hay eventos próximos. Mirá el calendario en ${escapeHtml(origin)}/calendario`;
}

/**
 * Un renglón de un evento en una lista: la fecha (`date_time`) y el título con link al sitio.
 *
 * @param {BotEvent} event
 * @param {ScreenCtx} ctx
 */
function eventLine(event, ctx) {
	const when = tgTime(event.start, ctx.now);
	const link = `<a href="${escapeHtml(eventUrl(ctx.origin, event.slug))}">${escapeHtml(event.title)}</a>`;
	return when ? `${when}\n${link}` : link;
}

/**
 * Una lista (hoy, semana, finde o próximos), de a {@link PAGE_SIZE} eventos, con un botón «Ver»
 * por evento, «‹ 1/3 ›» y «🏠 Inicio».
 *
 * @param {ListView} view
 * @param {BotEvent[]} events ya filtrados por la lista
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @param {{ intro?: string }} [opts] un texto antes del título (HTML ya escapado)
 * @returns {Screen}
 */
export function listScreen(view, events, page, ctx, { intro } = {}) {
	if (events.length === 0) return { text: emptyText(view, ctx.origin), keyboard: [[homeButton()]] };
	const p = paginate(events.length, page);
	const shown = events.slice(p.from, p.to);
	const head = `<b>${escapeHtml(LIST_TITLES[view])}</b>${p.pages > 1 ? ` · ${p.page + 1}/${p.pages}` : ''}`;
	const text = `${intro ? `${intro}\n\n` : ''}${head}\n\n${shown.map((e) => eventLine(e, ctx)).join('\n\n')}`;
	/** @type {Button[][]} */
	const rows = shown.map((e) => [
		{
			text: `Ver: ${truncate(e.title, 32)}`,
			callback_data: encodeNav({ screen: 'event', id: navId(e.slug), back: view })
		}
	]);
	const pager = pagerRow(p.page, p.pages, (n) => encodeNav({ screen: 'list', view, page: n }));
	if (pager) rows.push(pager);
	rows.push([homeButton()]);
	return { text, keyboard: rows };
}

/**
 * Resultados de una búsqueda (mensaje nuevo): hasta {@link PAGE_SIZE} + 3 eventos, cada uno con
 * su botón; «Volver» desde el detalle va al inicio (la búsqueda no se puede repetir sola).
 *
 * @param {string} query
 * @param {BotEvent[]} found
 * @param {ScreenCtx} ctx
 * @param {{ head?: string }} [opts] otro encabezado (HTML ya escapado), para `/evento <texto>`
 * @returns {Screen}
 */
export function searchResultsScreen(query, found, ctx, { head } = {}) {
	const again = { text: '🔎 Buscar otra cosa', callback_data: encodeNav({ screen: 'search' }) };
	if (found.length === 0) {
		return {
			text: `No encontré nada para «${escapeHtml(truncate(query, 60))}» entre los próximos eventos.`,
			keyboard: [[again], [homeButton()]]
		};
	}
	const shown = found.slice(0, PAGE_SIZE + 3);
	const title =
		head ??
		`<b>Encontré ${found.length === 1 ? 'esto' : 'estos'} para «${escapeHtml(truncate(query, 60))}»</b>`;
	const text = `${title}\n\n${shown.map((e) => eventLine(e, ctx)).join('\n\n')}`;
	return {
		text,
		keyboard: [
			...shown.map((e) => [
				{
					text: `Ver: ${truncate(e.title, 32)}`,
					callback_data: encodeNav({ screen: 'event', id: navId(e.slug), back: 'n' })
				}
			]),
			[again],
			[homeButton()]
		]
	};
}

// ---------------------------------------------------------------------------------------------
// Tarjeta de un evento
// ---------------------------------------------------------------------------------------------

/** "20310214T020000Z" @param {number} ms */
const gcalDate = (ms) =>
	new Date(ms)
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');

/**
 * «Agregar al calendario»: el link de Google Calendar con lo público del evento (título, fecha,
 * link a la página y el lugar tal como lo muestra la página). Sin fin cargado, dura 2 horas.
 * `null` si la fecha no se lee.
 *
 * @param {BotEvent} event
 * @param {string} origin
 * @param {string} [place]
 */
export function calendarLink(event, origin, place) {
	const start = Date.parse(event.start);
	if (!Number.isFinite(start)) return null;
	const endParsed = event.end ? Date.parse(event.end) : NaN;
	const end = Number.isFinite(endParsed) && endParsed > start ? endParsed : start + 2 * 3600e3;
	const url = new URL('https://calendar.google.com/calendar/render');
	url.searchParams.set('action', 'TEMPLATE');
	url.searchParams.set('text', event.title);
	url.searchParams.set('dates', `${gcalDate(start)}/${gcalDate(end)}`);
	url.searchParams.set('details', eventUrl(origin, event.slug));
	if (place) url.searchParams.set('location', place);
	return url.href;
}

/**
 * Dónde está el evento en una lista, para «‹ 2/7 ›» y «‹ Volver» a la página que lo tiene.
 *
 * @typedef {{ back: BackView, list?: BotEvent[] }} CardNav
 */

/**
 * La tarjeta de un evento: foto (la imagen destacada, si hay) o vista previa grande del link,
 * título, fecha, lugar (solo lo que la página pública muestra) y los botones «Comprar en el
 * sitio» (verde), «Agregar al calendario», «Cómo llegar» (solo si la página muestra el mapa) y,
 * abajo, «‹ 2/7 ›» entre los eventos de la lista, «‹ Volver» y «🏠 Inicio».
 *
 * @param {BotEvent} event
 * @param {CardInfo} info
 * @param {CardNav} nav
 * @param {ScreenCtx} ctx
 * @param {{ follow?: Button | null }} [extra] el botón «Seguir» (lo arma quien sabe de cuentas)
 * @returns {Screen}
 */
export function eventScreen(event, info, nav, ctx, { follow = null } = {}) {
	const https = isHttps(ctx.origin);
	const url = eventUrl(ctx.origin, event.slug);
	const lines = [`<b>${escapeHtml(truncate(event.title, 200))}</b>`];
	const when = tgTime(event.start, ctx.now);
	if (when) lines.push(`📅 ${when}`);
	if (info.place) lines.push(`📍 ${escapeHtml(truncate(info.place, 200))}`);
	if (info.ticket?.kind === 'note') lines.push(`🎟 ${escapeHtml(info.ticket.text)}`);
	lines.push('', `<a href="${escapeHtml(url)}">Ver todo en el sitio</a>`);
	const text = lines.join('\n');

	/** @type {Button[][]} */
	const rows = [];
	if (https) {
		const ticket = info.ticket;
		if (ticket?.kind === 'buy') {
			rows.push([
				{ text: '🎟 Comprar en el sitio', url: `${ctx.origin}${ticket.href}`, style: 'success' }
			]);
		} else if (ticket?.kind === 'note') {
			rows.push([{ text: `🎟 ${ticket.text}`, disabled: {} }]);
		} else {
			rows.push([{ text: 'Abrir en el sitio', url }]);
		}
		/** @type {Button[]} */
		const second = [];
		const cal = calendarLink(event, ctx.origin, info.place);
		if (cal) second.push({ text: '📅 Agregar al calendario', url: cal });
		if (info.mapUrl && info.mapUrl.startsWith('https://')) {
			second.push({ text: '🗺 Cómo llegar', url: info.mapUrl });
		}
		if (second.length) rows.push(second);
	}
	if (follow) rows.push([follow]);

	const list = nav.back !== 'n' ? (nav.list ?? []) : [];
	const index = list.findIndex((e) => e.slug === event.slug);
	const back = nav.back;
	if (index >= 0 && back !== 'n') {
		const pager = pagerRow(index, list.length, (i) =>
			encodeNav({ screen: 'event', id: navId(list[i].slug), back })
		);
		if (pager) rows.push(pager);
		rows.push([backToList(back, Math.floor(index / PAGE_SIZE)), homeButton()]);
	} else {
		rows.push([homeButton()]);
	}
	const image = info.image && https && info.image.startsWith('https://') ? info.image : undefined;
	return {
		text,
		keyboard: rows,
		...(image && text.length <= CAPTION_MAX ? { photo: image } : {}),
		...(https ? { preview: url } : {})
	};
}

// ---------------------------------------------------------------------------------------------
// Buscar, Fondo, Ayuda
// ---------------------------------------------------------------------------------------------

/** El comienzo del mensaje de Buscar: así se reconoce la respuesta. */
export const SEARCH_PROMPT_HEAD = '🔎 Escribí qué buscás';

export const SEARCH_PROMPT_TEXT = `${SEARCH_PROMPT_HEAD}: un nombre, «sábado», «15/10», una dirección… Respondé a este mensaje.`;

/**
 * Buscar: un mensaje nuevo con `force_reply` (abre «responder») y «Cancelar». En un grupo no se
 * abre nada: se explica cómo buscar con /evento.
 *
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function searchScreen(ctx) {
	if (ctx.chat === 'group') {
		return {
			text: 'Para buscar acá, escribí /evento y lo que buscás, por ejemplo: /evento cuerdas',
			keyboard: [[homeButton()]]
		};
	}
	return {
		text: SEARCH_PROMPT_TEXT,
		keyboard: [[{ text: 'Cancelar', callback_data: encodeNav({ screen: 'search_cancel' }) }]],
		forceReply: true
	};
}

/**
 * Los cinco campos de `/api/porcentaje` (issue #265), ya leídos por fondoMonth.js; `null` si no
 * se pudo leer.
 *
 * @typedef {{ percent: number, collected: number, goal: number, step: number,
 *   updatedAt: number | null, stale?: boolean }} FondoNumbers
 */

export const FONDO_URL = 'https://fondo.kinkyvibe.ar';

/**
 * `/fondo`: cuánto juntó el Fondo este mes, la meta y el descuento de este mes en las entradas
 * de eventos de Kinky Vibe. Solo esos números públicos: nada de quiénes aportan ni de propinas.
 *
 * @param {FondoNumbers | null} fondo
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function fondoScreen(fondo, ctx) {
	const keyboard = [[{ text: 'Sumate al Fondo ↗', url: FONDO_URL }], [homeButton()]];
	if (!fondo) {
		return {
			text:
				'<b>💗 Fondo Kinky Vibe</b>\n\n' +
				`Ahora no pude leer los números del Fondo. Mirálos en ${FONDO_URL.replace('https://', '')}`,
			keyboard
		};
	}
	const pct = fondo.goal > 0 ? Math.floor((fondo.collected / fondo.goal) * 100) : 0;
	const lines = [
		'<b>💗 Fondo Kinky Vibe</b>',
		'',
		`Este mes juntamos <b>${escapeHtml(formatARS(fondo.collected))}</b> de ${escapeHtml(formatARS(fondo.goal))} (${pct} % de la meta).`,
		`Descuento del Fondo en las entradas de eventos de Kinky Vibe: <b>${fondo.percent} %</b>.`
	];
	if (fondo.stale) lines.push('', 'Todavía no hay números de este mes: son los del mes pasado.');
	if (fondo.updatedAt) {
		const iso = new Date(fondo.updatedAt).toISOString();
		lines.push('', `Actualizado: ${tgTime(iso, ctx.now)}`);
	}
	lines.push('', 'El Fondo baja el precio de las entradas para todes con aportes de la comunidad.');
	return { text: lines.join('\n'), keyboard };
}

/**
 * `/ayuda` y «❓ Ayuda».
 *
 * @param {ScreenCtx} ctx
 * @param {{ accounts?: boolean }} [opts]
 * @returns {Screen}
 */
export function helpScreen(ctx, { accounts = false } = {}) {
	return { text: formatHelp(ctx.origin, { accounts }), keyboard: [[homeButton()]] };
}

/** Un aviso con «🏠 Inicio» (evento que ya no está, error…). @param {string} text @returns {Screen} */
export function noticeScreen(text) {
	return { text, keyboard: [[homeButton()]] };
}

// ---------------------------------------------------------------------------------------------
// Seguir y Lo que sigo (decisión 0034): solo por chat privado vinculado a una cuenta
// ---------------------------------------------------------------------------------------------

/** @param {ScreenCtx} ctx */
const sigoLink = (ctx) =>
	isHttps(ctx.origin)
		? [[{ text: 'Abrir Mi rincón → Lo que sigo ↗', url: `${ctx.origin}/mi-rincon/sigo` }]]
		: [];

/**
 * En un grupo, lo personal no se muestra: se manda al chat privado con el bot.
 *
 * @param {string | null} privateLink `t.me/<bot>?start=…`
 * @returns {Screen}
 */
export function privateOnlyScreen(privateLink) {
	return {
		text: 'Esto se hace por chat privado con el bot, con tu cuenta conectada.',
		keyboard: [
			...(privateLink ? [[{ text: 'Abrir el bot por privado ↗', url: privateLink }]] : []),
			[homeButton()]
		]
	};
}

/**
 * Chat privado sin cuenta vinculada: cómo conectarla.
 *
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function unlinkedScreen(ctx) {
	return {
		text:
			'Para seguir etiquetas y series desde acá, conectá este chat con tu cuenta: en Mi rincón → ' +
			'Lo que sigo tocá «Conectar Telegram» y mandame el código con /vincular.',
		keyboard: [...sigoLink(ctx), [homeButton()]]
	};
}

/**
 * «Lo que sigo»: los nombres de lo que sigue la cuenta (solo lo que todavía existe).
 *
 * @param {string[]} titles
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function sigoScreen(titles, ctx) {
	const MAX = 15;
	const body = titles.length
		? titles
				.slice(0, MAX)
				.map((t) => `• ${escapeHtml(t)}`)
				.join('\n') + (titles.length > MAX ? `\n… y ${titles.length - MAX} más.` : '')
		: 'Todavía no seguís nada. En la tarjeta de un evento tocá «⭐ Seguir».';
	return {
		text:
			`<b>⭐ Lo que seguís</b>\n\n${body}\n\n` +
			'Qué te avisamos (por mail o por acá) y dejar de seguir: en Mi rincón → Lo que sigo.',
		keyboard: [...sigoLink(ctx), [homeButton()]]
	};
}

/**
 * «Seguir» de un evento: un botón por etiqueta o serie que se puede seguir (las que ya sigue,
 * deshabilitadas).
 *
 * @param {BotEvent} event
 * @param {{ key: string, title: string, hash: string, following: boolean }[]} targets
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function followScreen(event, targets, ctx) {
	const id = navId(event.slug);
	const head = `<b>⭐ Seguir</b>\n\nDe «${escapeHtml(truncate(event.title, 100))}»`;
	const text = targets.length
		? `${head} podés seguir:\n\n` +
			'Te avisamos cuando se anuncie algo nuevo, como en el sitio. Si querés esos avisos por acá, ' +
			'prendé la columna Telegram en Mi rincón → Lo que sigo.'
		: `${head} no hay etiquetas para seguir desde acá.`;
	return {
		text,
		keyboard: [
			...targets.map((t) => [
				t.following
					? { text: `✓ Ya seguís ${truncate(t.title, 40)}`, disabled: {} }
					: {
							text: `⭐ ${truncate(t.title, 40)}`,
							callback_data: encodeNav({ screen: 'follow_do', id, tag: t.hash })
						}
			]),
			...sigoLink(ctx),
			[
				{ text: '‹ Volver', callback_data: encodeNav({ screen: 'event', id, back: 'n' }) },
				homeButton()
			]
		]
	};
}

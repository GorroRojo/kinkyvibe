/**
 * Las «pantallas» del bot (docs/telegram.md): qué texto y qué botones lleva cada una. Funciones
 * puras: reciben los datos ya filtrados (los próximos eventos públicos de events.js, lo público
 * de la tarjeta de un evento, los cinco números del Fondo) y devuelven una {@link Screen}. Cómo
 * se manda (mensaje nuevo, edición, efímero en un grupo) lo decide deliver.js.
 *
 * Reglas:
 * - nada personal fuera del chat privado (lo que necesita cuenta lo arma quien llama, solo ahí);
 * - un botón con link solo si el sitio es https (Telegram rechaza los otros);
 * - todo en español rioplatense con el lenguaje inclusivo del sitio;
 * - las palabras salen de «Textos del bot» (`botText`, editables en el panel): acá solo se arman.
 */
import { escapeHtml, eventUrl, formatWhen, WINDOW_TEXTS, formatHelp } from './format.js';
import { truncate } from './keyboards.js';
import { encodeNav, navId, startLink, startParam } from './nav.js';
import { encodeAdminNav } from './adminNav.js';
import { botText, currentBotTexts } from './texts.js';
import { renderBotText, renderBotTextPlain } from '$lib/utils/botTexts.js';
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
 * @typedef {{ text: string, keyboard: Button[][], photo?: string,
 *   photoFile?: import('./send.js').BotUpload, preview?: string, forceReply?: boolean,
 *   rich?: import('./rich.js').RichMessage }} Screen
 *   `photoFile`: una foto armada acá y subida (el QR de una entrada, «Mis entradas»), en lugar de
 *   una URL. `rich`: la misma pantalla como mensaje enriquecido (rich.js); deliver.js la usa por
 *   chat privado y con el token, y si Telegram la rechaza manda la de texto.
 */
/**
 * Dónde se va a ver: chat privado o grupo (en un grupo, solo lo público y nada que necesite
 * cuenta), el origen del sitio y, si está, el usuario del bot (para los links al chat privado).
 * `door`: quien escribe es une admin con el Telegram vinculado y la puerta prendida (solo lo arma
 * el router, para el inicio por chat privado).
 *
 * @typedef {{ origin: string, chat: 'private' | 'group', now?: number,
 *   botUsername?: string | null, sigo?: boolean, site?: boolean, door?: boolean,
 *   entradas?: boolean, admin?: boolean, rich?: boolean }} ScreenCtx
 *   `site`: Buscar busca en todo el sitio (con el índice público de la búsqueda). `entradas`:
 *   «🎟 Mis entradas» en el inicio (con las cuentas prendidas, misEntradas.js). `admin`: une
 *   admin vinculade con «Telegram para admins» prendido (el router, solo por chat privado):
 *   «📊 Estado · 🔔 Mis avisos» en el inicio. `rich`: la tarjeta compacta va también como mensaje
 *   enriquecido (`telegram_enriquecido`, con el token; rich.js).
 */
/**
 * Lo público de la tarjeta de un evento: lo mismo que la página del evento le muestra a cualquiera.
 *
 * @typedef {{ image?: string | null, place?: string, mapUrl?: string,
 *   ticket?: import('$lib/utils/ticketCta.js').TicketCta | null }} CardInfo
 */

/** La Mini App del calendario (`/telegram/app`, sin login). @param {string} origin */
export const miniAppUrl = (origin) => `${origin}/telegram/app`;

/**
 * La Mini App de la puerta (`/telegram/puerta`, solo admins con el Telegram vinculado, 0037).
 *
 * @param {string} origin
 */
export const doorAppUrl = (origin) => `${origin}/telegram/puerta`;

/** Eventos por página en las listas. */
export const PAGE_SIZE = 5;

/** Telegram corta los pies de foto de más de 1024 caracteres. */
export const CAPTION_MAX = 1024;

/** La clave de «Textos del bot» de cada lista (`eventos.titulo_<…>` y `eventos.vacio_<…>`). */
const LIST_TEXT = Object.freeze({ d: 'hoy', w: 'semana', f: 'finde', p: 'proximos' });

/** Títulos de cada lista (los originales; las pantallas usan los de este pedido). */
export const LIST_TITLES = Object.freeze({
	d: WINDOW_TEXTS.hoy.title,
	w: WINDOW_TEXTS.semana.title,
	f: WINDOW_TEXTS.finde.title,
	p: renderBotText('eventos.titulo_proximos')
});

/** @param {string} origin */
export const isHttps = (origin) => origin.startsWith('https://');

/** @returns {Button} */
const homeButton = () => ({
	text: botText('inicio.boton_inicio'),
	callback_data: encodeNav({ screen: 'home' })
});

/** @param {ListView} view @param {number} page */
const backToList = (view, page) => ({
	text: botText('inicio.boton_volver'),
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

/** El mensaje de inicio original (la pantalla usa el de este pedido). */
export const HOME_TEXT = renderBotText('inicio.texto');

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
		return [{ text: botText('inicio.boton_sigo'), callback_data: encodeNav({ screen: 'sigo' }) }];
	}
	const link = startLink(ctx.botUsername, 'sigo');
	return link ? [{ text: `${botText('inicio.boton_sigo')} ↗`, url: link }] : [];
}

/**
 * «🎟 Mis entradas» en el inicio (misEntradas.js), con las cuentas prendidas: en privado abre la
 * lista; en un grupo, el chat privado con el bot (lo personal nunca se muestra en un grupo).
 *
 * @param {ScreenCtx} ctx
 * @returns {Button[][]}
 */
function ticketsRow(ctx) {
	if (!ctx.entradas) return [];
	const text = botText('entradas.boton_inicio');
	if (ctx.chat === 'private') {
		return [[{ text, callback_data: encodeNav({ screen: 'tickets', view: 'u', page: 0 }) }]];
	}
	const link = startLink(ctx.botUsername, startParam({ screen: 'tickets' }));
	return link ? [[{ text: `${text} ↗`, url: link }]] : [];
}

/**
 * Las secciones del sitio en el inicio (sections.js): «📚 Material · 📖 Kinkipedia» y «👥 Amigues ·
 * 🔁 Series». Solo con el índice público de la búsqueda (`ctx.site`), de donde salen sus listas.
 *
 * @param {ScreenCtx} ctx
 * @returns {Button[][]}
 */
function sectionRows(ctx) {
	if (!ctx.site) return [];
	/** @param {import('./nav.js').SectionId} section @param {string} text @returns {Button} */
	const button = (section, text) => ({
		text,
		callback_data: encodeNav({ screen: 'section', section, page: 0 })
	});
	return [
		[
			button('m', botText('secciones.boton_material')),
			button('w', botText('secciones.boton_kinkipedia'))
		],
		[
			button('a', botText('secciones.boton_amigues')),
			button('s', botText('secciones.boton_series'))
		]
	];
}

/**
 * «📊 Estado · 🔔 Mis avisos» (decisión 0041, adminBot.js): en el inicio de une admin vinculade y
 * en la confirmación del vínculo.
 *
 * @returns {Button[]}
 */
export function adminRow() {
	return [
		{
			text: botText('admin.boton_estado'),
			callback_data: encodeAdminNav({ screen: 'admin_events', page: 0 })
		},
		{
			text: botText('admin.boton_avisos'),
			callback_data: encodeAdminNav({ screen: 'admin_notices' })
		}
	];
}

/**
 * `/start`, `/inicio` y «🏠 Inicio». Con el índice público (`ctx.site`), las secciones del sitio.
 * Con las cuentas prendidas (`ctx.entradas`), «🎟 Mis entradas». Con `ctx.door` (une admin
 * vinculade, la puerta prendida, chat privado), suma «🚪 Puerta»: la misma Mini App que el botón
 * de la confirmación del vínculo. Con `ctx.admin` (lo mismo, con «Telegram para admins»),
 * «📊 Estado · 🔔 Mis avisos» (adminBot.js).
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
		[
			list('d', botText('inicio.boton_hoy')),
			list('w', botText('inicio.boton_semana')),
			list('f', botText('inicio.boton_finde'))
		],
		[
			{ text: botText('inicio.boton_buscar'), callback_data: encodeNav({ screen: 'search' }) },
			...sigoButton(ctx)
		],
		...ticketsRow(ctx),
		...sectionRows(ctx),
		[
			{ text: botText('inicio.boton_fondo'), callback_data: encodeNav({ screen: 'fondo' }) },
			{ text: botText('inicio.boton_ayuda'), callback_data: encodeNav({ screen: 'help' }) }
		]
	];
	// Estado y avisos para admins (0041): solo admins vinculades, por chat privado (`ctx.admin`).
	if (ctx.admin && ctx.chat === 'private') rows.push(adminRow());
	if (isHttps(ctx.origin)) {
		// La puerta (0037): `web_app` solo anda en chats privados, Bot API.
		if (ctx.door && ctx.chat === 'private') {
			rows.push([
				{ text: botText('puerta.boton_inicio'), web_app: { url: doorAppUrl(ctx.origin) } }
			]);
		}
		/** @type {Button[]} */
		const last = [];
		// La Mini App del calendario (`web_app` solo anda en chats privados, Bot API).
		if (ctx.chat === 'private') {
			last.push({
				text: botText('inicio.boton_calendario'),
				web_app: { url: miniAppUrl(ctx.origin) }
			});
		}
		last.push({
			text: botText('inicio.boton_sitio', { sitio: new URL(ctx.origin).host }),
			url: ctx.origin
		});
		rows.push(last);
	}
	return { text: botText('inicio.texto'), keyboard: rows };
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

/** @param {ListView} view @param {string} origin @returns {string} */
function emptyText(view, origin) {
	return botText(`eventos.vacio_${LIST_TEXT[view]}`, { sitio: origin });
}

/** @param {BotEvent} event */
const seeButtonText = (event) =>
	botText('eventos.boton_ver', { evento: truncate(event.title, 32) });

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
	const title = botText(`eventos.titulo_${LIST_TEXT[view]}`);
	const head = `<b>${escapeHtml(title)}</b>${p.pages > 1 ? ` · ${p.page + 1}/${p.pages}` : ''}`;
	const text = `${intro ? `${intro}\n\n` : ''}${head}\n\n${shown.map((e) => eventLine(e, ctx)).join('\n\n')}`;
	/** @type {Button[][]} */
	const rows = shown.map((e) => [
		{
			text: seeButtonText(e),
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
	const again = {
		text: botText('eventos.boton_buscar_otra'),
		callback_data: encodeNav({ screen: 'search' })
	};
	const busqueda = truncate(query, 60);
	if (found.length === 0) {
		return {
			text: botText('eventos.sin_resultados', { busqueda }),
			keyboard: [[again], [homeButton()]]
		};
	}
	const shown = found.slice(0, PAGE_SIZE + 3);
	const title =
		head ??
		botText(found.length === 1 ? 'eventos.resultado_uno' : 'eventos.resultados', { busqueda });
	const text = `${title}\n\n${shown.map((e) => eventLine(e, ctx)).join('\n\n')}`;
	return {
		text,
		keyboard: [
			...shown.map((e) => [
				{
					text: seeButtonText(e),
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
 * @param {{ follow?: Button | null, back?: Button | null }} [extra] el botón «Seguir» (lo arma
 *   quien sabe de cuentas) y, sin lista, un «‹ Volver» (a los resultados de una búsqueda)
 * @returns {Screen}
 */
export function eventScreen(
	event,
	info,
	nav,
	ctx,
	{ follow = null, back: backButton = null } = {}
) {
	const https = isHttps(ctx.origin);
	const url = eventUrl(ctx.origin, event.slug);
	const lines = [`<b>${escapeHtml(truncate(event.title, 200))}</b>`];
	const when = tgTime(event.start, ctx.now);
	if (when) lines.push(`📅 ${when}`);
	if (info.place) lines.push(`📍 ${escapeHtml(truncate(info.place, 200))}`);
	if (info.ticket?.kind === 'note') lines.push(`🎟 ${escapeHtml(info.ticket.text)}`);
	lines.push('', `<a href="${escapeHtml(url)}">${escapeHtml(botText('eventos.ver_todo'))}</a>`);
	const text = lines.join('\n');

	/** @type {Button[][]} */
	const rows = [];
	if (https) {
		const ticket = info.ticket;
		if (ticket?.kind === 'buy') {
			rows.push([
				{
					text: botText('eventos.boton_comprar'),
					url: `${ctx.origin}${ticket.href}`,
					style: 'success'
				}
			]);
		} else if (ticket?.kind === 'note') {
			rows.push([{ text: `🎟 ${ticket.text}`, disabled: {} }]);
		} else {
			rows.push([{ text: botText('eventos.boton_abrir'), url }]);
		}
		/** @type {Button[]} */
		const second = [];
		const cal = calendarLink(event, ctx.origin, info.place);
		if (cal) second.push({ text: botText('eventos.boton_calendario'), url: cal });
		if (info.mapUrl && info.mapUrl.startsWith('https://')) {
			second.push({ text: botText('eventos.boton_mapa'), url: info.mapUrl });
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
		rows.push(backButton ? [backButton, homeButton()] : [homeButton()]);
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

/**
 * El comienzo del mensaje de Buscar original: así se reconoce la respuesta (también a los
 * mensajes que se mandaron antes de cambiarlo en el panel; ver {@link isSearchPrompt}).
 */
export const SEARCH_PROMPT_HEAD = '🔎 Escribí qué buscás';

/** El mensaje de Buscar original (la pantalla usa el de este pedido). */
export const SEARCH_PROMPT_TEXT = renderBotText('eventos.buscar');

/**
 * ¿Este texto (como lo devuelve Telegram, sin formato) es el mensaje de Buscar? El original o el
 * de ahora (cambiado en el panel).
 *
 * @param {string} text
 */
export function isSearchPrompt(text) {
	if (text.startsWith(SEARCH_PROMPT_HEAD)) return true;
	// El de los eventos y el de todo el sitio (#298), como están ahora.
	return ['eventos.buscar', 'sitio.buscar'].some((key) => {
		const current = renderBotTextPlain(key, {}, currentBotTexts()).trim();
		return Boolean(current) && text.trim() === current;
	});
}

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
			text: botText(ctx.site ? 'sitio.buscar_grupo' : 'eventos.buscar_grupo'),
			keyboard: [[homeButton()]]
		};
	}
	return {
		text: botText(ctx.site ? 'sitio.buscar' : 'eventos.buscar'),
		keyboard: [
			[
				{
					text: botText('eventos.boton_cancelar'),
					callback_data: encodeNav({ screen: 'search_cancel' })
				}
			]
		],
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
	const keyboard = [[{ text: botText('inicio.fondo_boton'), url: FONDO_URL }], [homeButton()]];
	if (!fondo) {
		return {
			text: botText('inicio.fondo_sin_numeros', { fondo: FONDO_URL.replace('https://', '') }),
			keyboard
		};
	}
	const pct = fondo.goal > 0 ? Math.floor((fondo.collected / fondo.goal) * 100) : 0;
	const lines = [
		botText('inicio.fondo_titulo'),
		'',
		botText('inicio.fondo_juntado', {
			juntado: formatARS(fondo.collected),
			meta: formatARS(fondo.goal),
			porcentaje: pct
		}),
		botText('inicio.fondo_descuento', { descuento: fondo.percent })
	];
	if (fondo.stale) lines.push('', botText('inicio.fondo_viejo'));
	if (fondo.updatedAt) {
		const iso = new Date(fondo.updatedAt).toISOString();
		lines.push('', botText('inicio.fondo_actualizado', { fecha: tgTime(iso, ctx.now) }));
	}
	lines.push('', botText('inicio.fondo_pie'));
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
		? [[{ text: botText('seguir.boton_rincon'), url: `${ctx.origin}/mi-rincon/sigo` }]]
		: [];

/**
 * En un grupo, lo personal no se muestra: se manda al chat privado con el bot.
 *
 * @param {string | null} privateLink `t.me/<bot>?start=…`
 * @returns {Screen}
 */
export function privateOnlyScreen(privateLink) {
	return {
		text: botText('seguir.solo_privado'),
		keyboard: [
			...(privateLink ? [[{ text: botText('seguir.boton_privado'), url: privateLink }]] : []),
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
		text: botText('seguir.sin_vincular'),
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
				.join('\n') +
			(titles.length > MAX ? `\n${botText('seguir.mas', { cantidad: titles.length - MAX })}` : '')
		: botText('seguir.nada');
	return {
		text: botText('seguir.lo_que_sigo', { lista: body }),
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
	const evento = truncate(event.title, 100);
	const text = botText(targets.length ? 'seguir.opciones' : 'seguir.sin_opciones', { evento });
	return {
		text,
		keyboard: [
			...targets.map((t) => [
				t.following
					? { text: botText('seguir.boton_ya', { nombre: truncate(t.title, 40) }), disabled: {} }
					: {
							text: botText('seguir.boton_etiqueta', { nombre: truncate(t.title, 40) }),
							callback_data: encodeNav({ screen: 'follow_do', id, tag: t.hash })
						}
			]),
			...sigoLink(ctx),
			[
				{
					text: botText('inicio.boton_volver'),
					callback_data: encodeNav({ screen: 'event', id, back: 'n' })
				},
				homeButton()
			]
		]
	};
}

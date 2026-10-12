/**
 * «🎟 Mis entradas» en el bot (docs/telegram.md): las entradas de la cuenta vinculada al chat, de
 * los próximos eventos (o las pasadas), y una tarjeta por entrada con **el mismo QR** que su
 * página (`/entradas/t/<token>`) y el mail: el que escanea la puerta. Funciones puras: reciben las
 * entradas ya leídas (tickets.js) y devuelven una {@link Screen}; cómo se manda lo decide
 * deliver.js.
 *
 * - La lista va de a 5 entradas, agrupadas por evento (la fecha, el título y cuántas hay), un botón
 *   por entrada, «‹ 2/3 ›», «🕘 Pasadas» (o «🎟 Próximas») e «🏠 Inicio».
 * - La tarjeta: el QR como foto (armado acá, `qrPng`, y subido: solo con el token del bot), el
 *   evento, la fecha, el nombre, el tipo, el código corto y si ya se usó; «🔗 Ver la entrada» (su
 *   página), «‹ 2/3 ›» entre las entradas de esa lista, «‹ Volver» e «🏠 Inicio». Sin foto (sin
 *   token), la página de la entrada tiene el QR.
 * - Un evento online no lleva QR (como en su página y en el mail): el link de la transmisión está
 *   en la página de la entrada.
 *
 * Una entrada queda en «próximas» hasta 12 horas después de que termina su evento (o de que
 * empieza, si no tiene fin): así se puede mostrar en la puerta aunque el evento ya haya empezado.
 * La de un taller en varias partes con una sola entrada (docs/talleres-partes.md) vale para todas:
 * queda en «próximas» hasta 12 horas después de su última parte (sin las canceladas), y la lista
 * y la tarjeta muestran la fecha de la parte que toca, con «Parte 2 de 3».
 */
import { eventEnd } from '$lib/utils/dates.js';
import { partLabel } from '$lib/utils/partes.js';
import { qrPng } from '$lib/server/tickets/qr.js';
import { escapeHtml } from './format.js';
import { truncate } from './keyboards.js';
import { encodeNav } from './nav.js';
import { CAPTION_MAX, PAGE_SIZE, isHttps, pagerRow, paginate, tgTime } from './screens.js';
import { botText } from './texts.js';

/** @typedef {import('./tickets.js').BotTicket} BotTicket */
/** @typedef {import('./nav.js').TicketsView} TicketsView */
/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/** @typedef {import('./screens.js').Button} Button */

/** Cuánto después del fin del evento una entrada sigue en «próximas». */
export const TICKET_GRACE_MS = 12 * 60 * 60 * 1000;

/** Cuántas entradas pasadas se muestran, como mucho (las más nuevas). */
export const PAST_TICKETS_MAX = 30;

/** @returns {Button} */
const homeButton = () => ({
	text: botText('inicio.boton_inicio'),
	callback_data: encodeNav({ screen: 'home' })
});

/**
 * El QR de una entrada: el mismo texto que el de su página y el del mail (la puerta lo lee con
 * `extractToken`).
 *
 * @param {string} origin
 * @param {string} token
 */
export const ticketQrText = (origin, token) => `${origin}/entradas/t/${token}`;

/**
 * Una fecha de la entrada: la del evento o la de una parte del taller (`n`, de `total`).
 *
 * @typedef {{ start: string | null, end: string | null, n?: number, total?: number }} TicketDate
 */

/** @param {{ start: string | null }} d */
const startMs = (d) => (d.start ? Date.parse(d.start) : NaN);

/**
 * ¿Esa fecha ya pasó (más las 12 horas)? Sin fecha (un evento que ya no está), sí.
 *
 * @param {TicketDate} d
 * @param {number} now
 */
function isPastDate(d, now) {
	if (!d.start || !Number.isFinite(startMs(d))) return true;
	const end = eventEnd(d.start, d.end ?? undefined).getTime();
	return (Number.isFinite(end) ? end : startMs(d)) + TICKET_GRACE_MS < now;
}

/**
 * Las fechas que cubre la entrada, de la primera a la última: las de las partes del taller (sin
 * las canceladas) o, si no es un taller (o están todas canceladas), la del evento.
 *
 * @param {BotTicket} t
 * @returns {TicketDate[]}
 */
function ticketDates(t) {
	const total = t.parts?.length ?? 0;
	const parts = (t.parts ?? [])
		.filter((p) => !p.cancelled && Number.isFinite(startMs(p)))
		.map((p) => ({ start: p.start, end: p.end, n: p.n, total }))
		.sort((a, b) => startMs(a) - startMs(b));
	return parts.length ? parts : [{ start: t.start, end: t.end }];
}

/**
 * La fecha que toca mostrar: la primera parte que todavía no pasó o, si pasaron todas, la última.
 *
 * @param {BotTicket} t
 * @param {number} now
 * @returns {TicketDate}
 */
export function ticketDate(t, now) {
	const dates = ticketDates(t);
	return dates.find((d) => !isPastDate(d, now)) ?? dates[dates.length - 1];
}

/**
 * ¿La entrada es de un evento que ya pasó? La de un taller, cuando pasó su última parte. Sin
 * fecha (un evento que ya no está), sí.
 *
 * @param {BotTicket} t
 * @param {number} now
 */
export function isPastTicket(t, now) {
	return ticketDates(t).every((d) => isPastDate(d, now));
}

/**
 * La fecha de la entrada como `tg-time`, con «· Parte 2 de 3» si es de un taller; `''` sin fecha.
 *
 * @param {BotTicket} t
 * @param {ScreenCtx} ctx
 */
function ticketWhen(t, ctx) {
	const d = ticketDate(t, ctx.now ?? Date.now());
	const when = d.start ? tgTime(d.start, ctx.now) : '';
	return when && d.n && d.total ? `${when} · ${partLabel(d.n, d.total)}` : when;
}

/**
 * Las entradas de una lista, en orden: las próximas, del evento más cercano; las pasadas, del más
 * reciente (hasta {@link PAST_TICKETS_MAX}). Las de un mismo evento quedan juntas, en el orden en
 * que se compraron.
 *
 * @param {TicketsView} view
 * @param {BotTicket[]} tickets
 * @param {number} now
 */
export function ticketsForView(view, tickets, now) {
	const past = view === 'o';
	const chosen = tickets
		.map((t, i) => ({ t, i, at: startMs(ticketDate(t, now)) }))
		.filter(({ t }) => isPastTicket(t, now) === past);
	chosen.sort((a, b) => {
		const sa = a.at;
		const sb = b.at;
		const byDate = (Number.isFinite(sa) ? sa : 0) - (Number.isFinite(sb) ? sb : 0);
		if (byDate) return past ? -byDate : byDate;
		if (a.t.slug !== b.t.slug) return a.t.slug < b.t.slug ? -1 : 1;
		return a.i - b.i;
	});
	const out = chosen.map(({ t }) => t);
	return past ? out.slice(0, PAST_TICKETS_MAX) : out;
}

/**
 * «🕘 Pasadas» o «🎟 Próximas»: la otra lista.
 *
 * @param {TicketsView} view
 * @returns {Button}
 */
const otherViewButton = (view) =>
	view === 'u'
		? {
				text: botText('entradas.boton_pasadas'),
				callback_data: encodeNav({ screen: 'tickets', view: 'o', page: 0 })
			}
		: {
				text: botText('entradas.boton_proximas'),
				callback_data: encodeNav({ screen: 'tickets', view: 'u', page: 0 })
			};

/**
 * Un evento en la lista: la fecha (`date_time`; en un taller, la de la parte que toca), el título y
 * cuántas entradas tiene ahí.
 *
 * @param {BotTicket} first
 * @param {number} count
 * @param {ScreenCtx} ctx
 */
function eventBlock(first, count, ctx) {
	const when = ticketWhen(first, ctx);
	const howMany =
		count === 1 ? botText('entradas.una') : botText('entradas.varias', { cantidad: count });
	const head = `<b>${escapeHtml(truncate(first.title, 120))}</b> · ${howMany}`;
	return when ? `${when}\n${head}` : head;
}

/**
 * La lista de Mis entradas (las de los próximos eventos o las pasadas), de a {@link PAGE_SIZE}.
 *
 * @param {TicketsView} view
 * @param {BotTicket[]} tickets todas las de la cuenta
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function ticketsScreen(view, tickets, page, ctx) {
	const list = ticketsForView(view, tickets, ctx.now ?? Date.now());
	const upcoming = view === 'u';
	const footer = [otherViewButton(view), homeButton()];
	if (list.length === 0) {
		return {
			text: botText(upcoming ? 'entradas.vacio' : 'entradas.vacio_pasadas'),
			keyboard: [footer]
		};
	}
	const p = paginate(list.length, page);
	const shown = list.slice(p.from, p.to);
	const title = botText(upcoming ? 'entradas.titulo' : 'entradas.titulo_pasadas');
	/** @type {Map<string, number>} */
	const perEvent = new Map();
	for (const t of list) perEvent.set(t.slug, (perEvent.get(t.slug) ?? 0) + 1);
	/** @type {string[]} */
	const blocks = [];
	let last = '';
	for (const t of shown) {
		if (t.slug === last) continue;
		last = t.slug;
		blocks.push(eventBlock(t, perEvent.get(t.slug) ?? 1, ctx));
	}
	const head = `${title}${p.pages > 1 ? ` · ${p.page + 1}/${p.pages}` : ''}`;
	/** @type {Button[][]} */
	const rows = shown.map((t) => [
		{
			text: botText('entradas.boton_entrada', {
				titular: truncate(t.holder || '—', 20),
				evento: truncate(t.title, 24)
			}),
			callback_data: encodeNav({ screen: 'ticket', id: t.id, view })
		}
	]);
	const pager = pagerRow(p.page, p.pages, (n) => encodeNav({ screen: 'tickets', view, page: n }));
	if (pager) rows.push(pager);
	rows.push(footer);
	return { text: `${head}\n\n${blocks.join('\n\n')}`, keyboard: rows };
}

/** «ABC234» → «ABC 234», como en la página de la entrada. @param {string} code */
const spacedCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * La tarjeta de una entrada: el QR (foto subida, con `qr`), el evento, la fecha, el nombre, el
 * tipo, el código corto y el estado.
 *
 * @param {BotTicket} ticket
 * @param {TicketsView} view la lista a la que vuelve
 * @param {BotTicket[]} list las entradas de esa lista, en orden (para «‹ 2/3 ›»)
 * @param {ScreenCtx} ctx
 * @param {{ qr?: boolean }} [opts] `qr`: armar la foto del QR (solo con el token del bot: sin él no
 *   se puede subir)
 * @returns {Screen}
 */
export function ticketScreen(ticket, view, list, ctx, { qr = false } = {}) {
	const https = isHttps(ctx.origin);
	const photo = qr && !ticket.online;
	const lines = [`🎟 <b>${escapeHtml(truncate(ticket.title, 200))}</b>`];
	const when = ticketWhen(ticket, ctx);
	if (when) lines.push(`📅 ${when}`);
	const holder = ticket.pronouns ? `${ticket.holder} (${ticket.pronouns})` : ticket.holder;
	if (holder) lines.push(botText('entradas.titular', { titular: truncate(holder, 120) }));
	const tipo = truncate(ticket.type, 60);
	lines.push(
		ticket.code
			? botText('entradas.tipo_codigo', { tipo, codigo: spacedCode(ticket.code) })
			: botText('entradas.tipo', { tipo })
	);
	lines.push('');
	if (ticket.online) lines.push(botText('entradas.online'));
	else if (ticket.checkedInAt) {
		const fecha = tgTime(new Date(ticket.checkedInAt).toISOString(), ctx.now);
		lines.push(botText('entradas.usada', { fecha }));
	} else {
		lines.push(botText('entradas.valida'));
		if (!photo && https) lines.push(botText('entradas.ver_qr'));
	}
	const text = lines.join('\n');

	/** @type {Button[][]} */
	const rows = [];
	if (https) {
		rows.push([
			{ text: botText('entradas.boton_ver'), url: ticketQrText(ctx.origin, ticket.token) }
		]);
	}
	const index = list.findIndex((t) => t.id === ticket.id);
	if (index >= 0) {
		const pager = pagerRow(index, list.length, (i) =>
			encodeNav({ screen: 'ticket', id: list[i].id, view })
		);
		if (pager) rows.push(pager);
	}
	rows.push([
		{
			text: botText('inicio.boton_volver'),
			callback_data: encodeNav({
				screen: 'tickets',
				view,
				page: index >= 0 ? Math.floor(index / PAGE_SIZE) : 0
			})
		},
		homeButton()
	]);
	return {
		text,
		keyboard: rows,
		...(photo && text.length <= CAPTION_MAX
			? {
					photoFile: {
						upload: qrPng(ticketQrText(ctx.origin, ticket.token)),
						filename: 'entrada.png',
						type: 'image/png'
					}
				}
			: {})
	};
}

/**
 * Mis entradas por chat privado sin cuenta vinculada: cómo conectarla (como «Lo que sigo»).
 *
 * @param {ScreenCtx} ctx
 * @returns {Screen}
 */
export function ticketsUnlinkedScreen(ctx) {
	return {
		text: botText('entradas.sin_vincular'),
		keyboard: [
			...(isHttps(ctx.origin)
				? [[{ text: botText('seguir.boton_rincon'), url: `${ctx.origin}/mi-rincon/sigo` }]]
				: []),
			[homeButton()]
		]
	};
}

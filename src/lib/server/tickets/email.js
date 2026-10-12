/**
 * Email con las entradas, enviado con la API REST de Resend (POST https://api.resend.com/emails).
 */
import {
	argDateTimeLong,
	argDeadline,
	argTime,
	eventEnd,
	parseSiteDate
} from '$lib/utils/dates.js';
import { ARGENTINA_TIME_NOTE } from '$lib/utils/expiry.js';
import { TRANSFER_HOLD_AFTER, transferHoldText } from '$lib/utils/transferDeadline.js';
import { formatARS } from '$lib/utils/money.js';
import { fondoOptionLabel, holdHours, orderReference, refundPolicy } from '$lib/utils/tickets.js';
import { salePlaceText } from '$lib/utils/eventPlace.js';
import {
	WHY_BOUGHT,
	WHY_RESERVED,
	renderBlockHtml,
	renderInlineHtml,
	renderPlain,
	templateDef
} from '$lib/utils/emailTemplates.js';
import { MAIL_COLORS, MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import {
	eventReservationScript,
	googleCalendarUrl,
	resendAttachment,
	ticketCalendarFile
} from './calendarFile.js';

/** Texto del link a Google Calendar del mail con las entradas. */
const GOOGLE_LABEL = 'Agregar a Google Calendar';

/**
 * «Agregalo a tu calendario» para los mails que salen con el pago ya acreditado (entradas y
 * recordatorios): el `.ics` adjunto, la línea con el link a Google Calendar y, si se pide, el
 * marcado `EventReservation` para Gmail (calendarFile.js). Sin `event.slug` (vistas previas,
 * golden) o con el evento cancelado, nada: el mail sale como siempre.
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   event: { title: string, start?: string, end?: string | null, status?: string,
 *     slug?: string, location?: string, location_name?: string, streamLink?: string | null,
 *     stamp?: number },
 *   online: boolean,
 *   origin: string,
 *   markup?: boolean
 * }} input
 */
function calendarExtras({ order, event, online, origin, markup = false }) {
	const calEvent =
		event.slug && event.status !== 'cancelado'
			? { ...event, slug: event.slug, online, origin }
			: null;
	const calendar = calEvent ? ticketCalendarFile(calEvent) : null;
	if (!calendar || !calEvent) {
		return {
			html: '',
			text: /** @type {string[]} */ ([]),
			/** @param {{ subject: string, html: string, text: string }} m */
			finish: (m) => m
		};
	}
	const googleUrl = googleCalendarUrl(calEvent);
	const reservation = markup
		? eventReservationScript({ orderId: order.id, buyerName: order.buyer_name, event: calEvent })
		: null;
	const line = `Agregalo a tu calendario: abrí el archivo ${calendar.filename} que va adjunto.`;
	return {
		html: `
		<p style="${SMALL};margin-top:0" data-kv-mail="calendario">${escapeHtml(line)}${googleUrl ? `<br><a href="${escapeHtml(googleUrl)}" style="${MAIL_STYLES.link}">${GOOGLE_LABEL}</a>` : ''}</p>`,
		text: ['', line, ...(googleUrl ? [`${GOOGLE_LABEL}: ${googleUrl}`] : [])],
		/** @param {{ subject: string, html: string, text: string }} m */
		finish: (m) => ({
			...m,
			// El marcado para Gmail va en el <head> (función: un `$` del JSON no es un patrón).
			html: reservation ? m.html.replace('</head>', () => `${reservation}</head>`) : m.html,
			attachments: [resendAttachment(calendar)]
		})
	};
}

/** Línea chica del final de la tarjeta (número de orden, ayuda). */
const SMALL = `margin:16px 0 0;font-size:13px;line-height:1.5;color:${MAIL_COLORS.muted}`;

/**
 * Plantilla guardada en el panel (ver emailTemplates.js): la general y, encima, la del evento,
 * ya juntas (`mergeTemplates`). Cada parte que falta o está vacía sale como siempre; con `null`,
 * el mail sale exactamente como siempre.
 * @typedef {import('$lib/utils/emailTemplates.js').TemplateParts | null | undefined} Template
 */

/**
 * Las partes de un taller con una sola entrada (workshopParts.js): título y una línea por parte.
 * @typedef {import('./workshopParts.js').PartsList} PartsList
 */

/**
 * Las partes editables ya armadas con las variables. Cada una es `null` si la plantilla no la
 * cambia (entonces el builder pone su texto de siempre).
 *
 * @param {Template} template
 * @param {Record<string, string | number>} vars
 */
export function applyTemplate(template, vars) {
	/** @param {'subject' | 'heading' | 'body' | 'label' | 'button' | 'help' | 'why'} k */
	const get = (k) => {
		const v = template?.[k];
		return typeof v === 'string' && v.trim() ? v : null;
	};
	/** @param {string | null} t @param {boolean} [links] */
	const plainLine = (t, links = true) =>
		t === null ? null : renderPlain(t, vars, { links }).replace(/\s+/g, ' ').trim();
	/** @param {string} t */
	const plain = (t) => renderPlain(t, vars, { links: true });
	const heading = get('heading');
	const body = get('body');
	const help = get('help');
	const why = get('why');
	return {
		// En el asunto, un link se ve tal cual (no se interpreta).
		subject: plainLine(get('subject'), false),
		headingHtml: heading === null ? null : renderInlineHtml(heading, vars),
		headingText: heading === null ? null : plain(heading),
		bodyHtml: body === null ? null : renderBlockHtml(body, vars),
		bodyText: body === null ? null : plain(body),
		// Texto solo: el layout lo escapa.
		label: plainLine(get('label')),
		button: plainLine(get('button')),
		helpHtml: help === null ? null : renderInlineHtml(help, vars),
		helpText: help === null ? null : plain(help),
		whyHtml: why === null ? null : renderInlineHtml(why, vars)
	};
}

/**
 * El botón con el texto de la plantilla (a dónde lleva lo decide siempre el código).
 * @param {{ href: string, label: string }} button
 * @param {string | null} label
 */
const withLabel = (button, label) => (label ? { ...button, label } : button);

/**
 * Variables comunes de las plantillas.
 *
 * @param {import('./orders.js').Order} order
 * @param {{ title: string, start?: string, location?: string, location_name?: string, online?: boolean }} event
 * @param {string} typeName
 */
export function templateVars(order, event, typeName) {
	return {
		nombre: order.buyer_name,
		evento: event.title,
		fecha: formatEventDate(event.start),
		lugar: salePlaceText(Boolean(event.online), event),
		tipo: typeName,
		cantidad: order.quantity,
		entradas: order.quantity === 1 ? 'una entrada' : `${order.quantity} entradas`,
		total: formatARS(order.total),
		referencia: orderReference(order.id)
	};
}

/**
 * Política de devoluciones al pie de los mails.
 *
 * @param {string} contactEmail
 */
function policyBlocks(contactEmail) {
	const p = refundPolicy(contactEmail);
	return {
		html: `<div style="font-size:13px;line-height:1.5;color:${MAIL_COLORS.muted};border-top:1px solid #e6dfe9;margin-top:20px;padding-top:12px">
			<p style="margin:0 0 8px;font-weight:bold">${escapeHtml(p.title)}</p>
			${p.paragraphs.map((t) => `<p style="margin:0 0 8px">${escapeHtml(t)}</p>`).join('')}
		</div>`,
		text: ['', p.title, ...p.paragraphs].join('\n\n')
	};
}

/**
 * Líneas del desglose de precio de una orden (fondo, descuento, recargo, total).
 *
 * @param {import('./orders.js').Order} order
 * @param {string} typeName
 */
export function priceLines(order, typeName) {
	const lines = [
		order.fondo_option === 'gorra'
			? `${order.quantity} × ${typeName} (a la gorra, ${formatARS(order.unit_price)} c/u): ${formatARS(order.unit_price * order.quantity)}`
			: `${order.quantity} × ${typeName}: ${formatARS(order.unit_price * order.quantity)}`
	];
	if (order.fondo_amount) lines.push(`Fondo Kinky Vibe: −${formatARS(order.fondo_amount)}`);
	if (order.fondo_contribution) {
		lines.push(
			`${fondoOptionLabel(order.fondo_option)}, aporte al Fondo Kinky Vibe: +${formatARS(order.fondo_contribution)}`
		);
	}
	if (order.discount_amount) {
		lines.push(`Código ${order.discount_code}: −${formatARS(order.discount_amount)}`);
	}
	if (order.surcharge_amount) {
		lines.push(`Recargo Mercado Pago: +${formatARS(order.surcharge_amount)}`);
	}
	lines.push(`Total: ${formatARS(order.total)}`);
	return lines;
}

/** @param {string} s */
export function escapeHtml(s) {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Fecha y hora del evento en horario de Argentina.
 *
 * @param {string | undefined} start
 */
export function formatEventDate(start) {
	if (!start) return '';
	const d = parseSiteDate(start);
	if (Number.isNaN(d.getTime())) return String(start);
	return argDateTimeLong(d);
}

/** @param {string} email */
export function maskEmail(email) {
	const [user, domain] = email.split('@');
	if (!domain) return '***';
	return `${user.slice(0, 1)}***@${domain}`;
}

/**
 * Código corto para mostrar grande (con un espacio en el medio para leerlo mejor: "7HQ 4XM").
 *
 * @param {string | null | undefined} code
 */
export function displayCode(code) {
	return code ? `${code.slice(0, 3)} ${code.slice(3)}` : '';
}

/**
 * Bloque con el link de la transmisión (eventos online).
 *
 * @param {string} link
 */
function streamLinkBlock(link) {
	return `<div style="${MAIL_STYLES.box};text-align:center">
		<p style="margin:0 0 8px;font-weight:bold">Link de la transmisión</p>
		<p style="margin:0;font-size:18px;word-break:break-all"><a href="${escapeHtml(link)}" style="${MAIL_STYLES.link}">${escapeHtml(link)}</a></p>
	</div>`;
}

/**
 * La lista «Las N partes del taller» de un taller con una sola entrada para todas sus partes
 * (docs/talleres-partes.md), dentro de la tarjeta, después de los datos del evento. Sin lista,
 * nada: el mail sale igual que siempre, byte a byte.
 *
 * @param {PartsList | null | undefined} parts
 * @returns {{ html: string, text: string[] }}
 */
function partsBlocks(parts) {
	if (!parts?.lines.length) return { html: '', text: [] };
	return {
		html: `
		<div style="${MAIL_STYLES.box}" data-kv-mail="partes"><p style="margin:0 0 6px;font-weight:bold">${escapeHtml(parts.title)}</p><p style="margin:0">${parts.lines.map(escapeHtml).join('<br>')}</p></div>`,
		text: ['', parts.title, ...parts.lines]
	};
}

/**
 * Bloque «Un descuento para otro evento» con los códigos combo de la compra (combos.js), al
 * final de las entradas. Sin códigos, nada: el mail sale igual que siempre, byte a byte.
 *
 * @param {string} title el evento de esta compra (A)
 * @param {import('./combos.js').ComboMailItem[] | null | undefined} combos
 * @returns {{ html: string, text: string[] }}
 */
export function comboBlocks(title, combos) {
	if (!combos?.length) return { html: '', text: [] };
	const until = (/** @type {import('./combos.js').ComboMailItem} */ c) =>
		c.until ? `, hasta el ${c.until}` : '';
	const html = combos
		.map(
			(c) => `
		<div style="${MAIL_STYLES.box}" data-kv-mail="combo"><p style="margin:0 0 6px;font-weight:bold">Un descuento para otro evento</p><p style="margin:0">Con tu entrada a <strong>${escapeHtml(title)}</strong> tenés ${escapeHtml(c.discount)} en <a href="${escapeHtml(c.targetUrl)}" style="${MAIL_STYLES.link}">${escapeHtml(c.targetTitle)}</a>: usá el código</p><p style="margin:8px 0;font-family:'Courier New',monospace;font-size:22px;font-weight:bold;letter-spacing:2px">${escapeHtml(c.code)}</p><p style="margin:0;font-size:13px;color:${MAIL_COLORS.muted}">Es personal: vale para una compra con este mismo email${escapeHtml(until(c))}. Completá tus datos con este email antes de aplicarlo.</p></div>`
		)
		.join('');
	const text = combos.flatMap((c) => [
		'',
		`Un descuento para otro evento: con tu entrada a ${title} tenés ${c.discount} en ${c.targetTitle}. Usá el código ${c.code} (${c.targetUrl}).`,
		`Es personal: vale para una compra con este mismo email${until(c)}. Completá tus datos con este email antes de aplicarlo.`
	]);
	return { html, text };
}

/**
 * Mail con las entradas. En los eventos presenciales, un QR por entrada con su código corto en
 * grande (para tipearlo en la puerta si el QR no se puede escanear). En los online, el link de
 * la transmisión (si ya está cargado; si no, avisa que llega antes del evento).
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   tickets: import('./orders.js').Ticket[],
 *   event: { title: string, start?: string, location?: string, location_name?: string,
 *     online?: boolean, streamLink?: string | null, parts?: PartsList | null,
 *     slug?: string, end?: string | null, status?: string, stamp?: number },
 *   typeName: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template,
 *   combos?: import('./combos.js').ComboMailItem[] | null
 * }} input
 * `event.parts`: la lista de partes si es un taller con una sola entrada.
 * `combos`: los códigos combo de la compra (combos.js), en un bloque después de las entradas.
 * `event.slug`: con él, el mail lleva adjunto `<slug>.ics` (calendarFile.js), una línea
 * «Agregalo a tu calendario» con el link a Google Calendar y el marcado `EventReservation` para
 * Gmail; sin él (vistas previas, golden), sale como siempre. Un evento
 * cancelado no lleva el adjunto.
 * @returns {{ subject: string, html: string, text: string, attachments?: MailAttachment[] }}
 */
export function buildTicketEmail({
	order,
	tickets,
	event,
	typeName,
	origin,
	contactEmail,
	template,
	combos
}) {
	const title = event.title;
	const when = formatEventDate(event.start);
	const online = Boolean(event.online);
	const where = salePlaceText(online, event);
	const custom = applyTemplate(template, templateVars(order, event, typeName));
	const subject = custom.subject ?? `Tus entradas para ${title}`;
	const combo = comboBlocks(title, combos);
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);

	// Nombre y pronombres de cada entrada (nunca el DNI: los mails se reenvían y quedan guardados).
	/** @param {import('./orders.js').Ticket} t */
	const holder = (t) =>
		t.holder_pronouns ? `${t.holder_name} (${t.holder_pronouns})` : t.holder_name;
	const prices = priceLines(order, typeName);
	const policy = policyBlocks(contactEmail);
	const parts = partsBlocks(event.parts);
	const cal = calendarExtras({ order, event, online, origin, markup: true });

	const ticketBlocks = tickets
		.map((t, i) => {
			const head = `<p style="margin:0 0 8px;font-weight:bold">Entrada ${i + 1} de ${tickets.length} · ${escapeHtml(typeName)}<br>${escapeHtml(holder(t))}</p>`;
			if (online) {
				return `<div style="border:2px dashed ${MAIL_COLORS.pink};border-radius:12px;padding:16px;margin:16px 0;text-align:center">
				${head}
				<p style="margin:8px 0 0"><a href="${links[i]}" style="${MAIL_STYLES.link}">Ver la entrada</a></p>
			</div>`;
			}
			// El QR y el código van en dos bloques inline-block (no en una fila de tabla): si no
			// entran uno al lado del otro (un celu de 390 px), el código baja abajo del QR en lugar
			// de desbordar el recuadro. Sin media queries, que muchos clientes de mail ignoran.
			const code = t.code
				? `<div style="display:inline-block;vertical-align:middle;padding:8px 12px;text-align:center">
					<div style="font-size:12px;color:#555">Código</div>
					<div style="font-family:'Courier New',monospace;font-size:30px;font-weight:bold;letter-spacing:3px;white-space:nowrap">${escapeHtml(displayCode(t.code))}</div>
				</div>`
				: '';
			return `
			<div style="border:2px dashed ${MAIL_COLORS.pink};border-radius:12px;padding:16px;margin:16px 0;text-align:center">
				${head}
				<div style="text-align:center;font-size:0">
					<div style="display:inline-block;vertical-align:middle;font-size:16px"><img src="${origin}/entradas/t/${t.token}/qr.gif" width="200" height="200" alt="Código QR de la entrada ${i + 1}" style="display:block;max-width:100%;height:auto"></div>${code}
				</div>
				<p style="margin:8px 0 0"><a href="${links[i]}" style="${MAIL_STYLES.link}">Ver la entrada en el navegador</a></p>
			</div>`;
		})
		.join('');

	const intro = online
		? event.streamLink
			? '' // el recuadro «Link de la transmisión» y el botón ya lo dicen
			: 'Es un evento online: <strong>te mandamos el link de la transmisión por mail antes del evento</strong>. También va a aparecer en la página de cada entrada.'
		: 'Mostrá el QR de cada entrada en la puerta (desde el celu o impreso). Si el QR no se puede escanear, dictá el código que está junto al QR. Cada entrada sirve para una sola persona y una sola vez: no la compartas en redes.';

	const html = mailLayout({
		origin,
		label: custom.label ?? 'Tus entradas',
		titleHtml: custom.headingHtml ?? '¡Ya tenés tus entradas!',
		contentHtml: `${custom.bodyHtml ?? `<p>Hola ${escapeHtml(order.buyer_name)}, gracias por tu compra.</p>`}
		<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>${parts.html}${cal.html}
		<p>${prices.map(escapeHtml).join('<br>')}</p>
		${online && event.streamLink ? streamLinkBlock(event.streamLink) : ''}`,
		button: withLabel(
			online && event.streamLink
				? { href: event.streamLink, label: 'Entrar a la transmisión' }
				: { href: `${origin}/entradas/${order.id}/estado`, label: 'Ver mis entradas' },
			custom.button
		),
		helpHtml: custom.helpHtml ?? intro,
		afterHtml: `${ticketBlocks}${combo.html}
		<p style="${SMALL}">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}`,
		whyHtml: custom.whyHtml ?? WHY_BOUGHT,
		contactEmail
	});

	const text = [
		custom.headingText ?? '¡Ya tenés tus entradas!',
		...(custom.bodyText !== null ? ['', custom.bodyText] : []),
		'',
		`${title}`,
		when,
		where,
		...parts.text,
		...cal.text,
		'',
		...prices,
		'',
		online && event.streamLink
			? `Link de la transmisión: ${event.streamLink}`
			: (custom.helpText ??
				(online
					? 'Es un evento online: te mandamos el link de la transmisión por mail antes del evento.'
					: 'Mostrá el QR de cada entrada en la puerta; si no se puede escanear, dictá su código. Cada entrada sirve una sola vez.')),
		...(online && event.streamLink && custom.helpText !== null ? [custom.helpText] : []),
		...links.map(
			(l, i) =>
				`Entrada ${i + 1} (${holder(tickets[i])})${!online && tickets[i].code ? ` · código ${displayCode(tickets[i].code)}` : ''}: ${l}`
		),
		...combo.text,
		'',
		`Número de orden: ${order.id}`,
		policy.text
	]
		.filter((l) => l !== undefined)
		.join('\n');

	return cal.finish({ subject, html, text });
}

/**
 * Mail con el link de la transmisión de un evento online ("Enviar el link a todes").
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   tickets: import('./orders.js').Ticket[],
 *   event: { title: string, start?: string, slug?: string, end?: string | null,
 *     status?: string, stamp?: number },
 *   link: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
 * `event.slug`: con él, el mail lleva el `.ics` actualizado (con el link como lugar) y el link a
 * Google Calendar, como el de las entradas.
 * @returns {{ subject: string, html: string, text: string, attachments?: MailAttachment[] }}
 */
export function buildStreamLinkEmail({
	order,
	tickets,
	event,
	link,
	origin,
	contactEmail,
	template
}) {
	const when = formatEventDate(event.start);
	const custom = applyTemplate(template, {
		nombre: order.buyer_name,
		evento: event.title,
		fecha: when
	});
	const subject = custom.subject ?? `Link de la transmisión: ${event.title}`;
	const policy = policyBlocks(contactEmail);
	const cal = calendarExtras({
		order,
		event: { ...event, streamLink: link },
		online: true,
		origin
	});
	const ticketLinks = tickets.map((t) => `${origin}/entradas/t/${t.token}`);
	const ticketLinksHtml = ticketLinks.length
		? `También está en la página de ${ticketLinks.length === 1 ? 'tu entrada' : 'cada entrada'}: ${ticketLinks.map((l, i) => `<a href="${l}" style="${MAIL_STYLES.link}">entrada ${i + 1}</a>`).join(', ')}.`
		: '';
	const html = mailLayout({
		origin,
		label: custom.label ?? 'Transmisión',
		titleHtml: custom.headingHtml ?? 'Ya está el link de la transmisión',
		contentHtml: `${custom.bodyHtml ?? `<p>Hola ${escapeHtml(order.buyer_name)}, este es el link para <strong>${escapeHtml(event.title)}</strong>${when ? ` (${escapeHtml(when)})` : ''}.</p>`}
		${streamLinkBlock(link)}${cal.html}`,
		button: withLabel({ href: link, label: 'Entrar a la transmisión' }, custom.button),
		// Con una línea de ayuda propia, los links a cada entrada pasan al final de la tarjeta.
		helpHtml: custom.helpHtml ?? ticketLinksHtml,
		afterHtml: `${custom.helpHtml !== null && ticketLinksHtml ? `<p style="${SMALL}">${ticketLinksHtml}</p>` : ''}<p style="${SMALL}">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}`,
		whyHtml: custom.whyHtml ?? WHY_BOUGHT,
		contactEmail
	});
	const text = [
		custom.headingText ?? 'Ya está el link de la transmisión',
		'',
		custom.bodyText ?? `${event.title}${when ? ` (${when})` : ''}`,
		'',
		`Link de la transmisión: ${link}`,
		...cal.text,
		...(custom.helpText !== null ? ['', custom.helpText] : []),
		'',
		...ticketLinks.map((l, i) => `Entrada ${i + 1}: ${l}`),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return cal.finish({ subject, html, text });
}

/**
 * Recordatorio antes del evento: cuándo y dónde, y el link a cada entrada (con su código) o, en
 * los eventos online, el link de la transmisión si ya está.
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   tickets: import('./orders.js').Ticket[],
 *   reminder: import('./reminders.js').Reminder,
 *   event: { title: string, start?: string, location?: string, location_name?: string,
 *     online?: boolean, streamLink?: string | null, parts?: PartsList | null,
 *     slug?: string, end?: string | null, status?: string, stamp?: number },
 *   typeName: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
 * `event.slug`: con él, el recordatorio lleva el `.ics` adjunto y el link a Google Calendar (como
 * el mail de las entradas, sin el marcado para Gmail).
 * @returns {{ subject: string, html: string, text: string, attachments?: MailAttachment[] }}
 */
export function buildReminderEmail({
	order,
	tickets,
	reminder,
	event,
	typeName,
	origin,
	contactEmail,
	template
}) {
	const when = formatEventDate(event.start);
	const online = Boolean(event.online);
	const where = salePlaceText(online, event);
	const soon =
		reminder.kind === 'day_at' && reminder.days === 0
			? 'es hoy'
			: reminder.kind === 'hours_before' && reminder.hours < 24
				? 'es en unas horas'
				: 'se acerca';
	const custom = applyTemplate(template, {
		...templateVars({ ...order, quantity: tickets.length }, event, typeName),
		cuando: soon
	});
	const subject = custom.subject ?? `Recordatorio: ${event.title} ${soon}`;
	const policy = policyBlocks(contactEmail);
	const parts = partsBlocks(event.parts);
	// Con `event.slug`: el .ics adjunto y el link a Google Calendar, como en el mail de las entradas.
	const cal = calendarExtras({ order, event, online, origin });
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);
	/** @param {import('./orders.js').Ticket} t */
	const holder = (t) =>
		t.holder_pronouns ? `${t.holder_name} (${t.holder_pronouns})` : t.holder_name;
	const list = tickets
		.map(
			(t, i) =>
				`<li><a href="${links[i]}" style="${MAIL_STYLES.link}">Entrada ${i + 1} · ${escapeHtml(holder(t))}</a>${!online && t.code ? ` · código <strong style="font-family:'Courier New',monospace">${escapeHtml(displayCode(t.code))}</strong>` : ''}</li>`
		)
		.join('');
	const intro = online
		? event.streamLink
			? streamLinkBlock(event.streamLink)
			: '<p>Es un evento online: te vamos a mandar el link de la transmisión por mail antes de que empiece.</p>'
		: '<p>Llevá el QR de cada entrada (en el celu o impreso). Si no se puede escanear, alcanza con el código.</p>';
	const html = mailLayout({
		origin,
		label: custom.label ?? 'Recordatorio',
		titleHtml: custom.headingHtml ?? `¡${escapeHtml(event.title)} ${soon}!`,
		contentHtml: `${custom.bodyHtml ?? `<p>Hola ${escapeHtml(order.buyer_name)}, te recordamos que tenés ${tickets.length === 1 ? 'una entrada' : `${tickets.length} entradas`} (${escapeHtml(typeName)}).</p>`}
		<p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>${parts.html}${cal.html}
		${intro}
		<ul style="margin:0 0 16px;padding-left:20px">${list}</ul>`,
		button: withLabel(
			online && event.streamLink
				? { href: event.streamLink, label: 'Entrar a la transmisión' }
				: { href: `${origin}/entradas/${order.id}/estado`, label: 'Ver mis entradas' },
			custom.button
		),
		helpHtml: custom.helpHtml ?? '',
		afterHtml: `<p style="${SMALL}">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}`,
		whyHtml: custom.whyHtml ?? WHY_BOUGHT,
		contactEmail
	});
	const text = [
		custom.headingText ?? `${event.title} ${soon}`,
		...(custom.bodyText !== null ? ['', custom.bodyText] : []),
		'',
		`${event.title}`,
		when,
		where,
		...parts.text,
		...cal.text,
		'',
		online
			? event.streamLink
				? `Link de la transmisión: ${event.streamLink}`
				: 'Te vamos a mandar el link de la transmisión antes de que empiece.'
			: 'Llevá el QR de cada entrada; si no se puede escanear, alcanza con el código.',
		...links.map(
			(l, i) =>
				`Entrada ${i + 1} (${holder(tickets[i])})${!online && tickets[i].code ? ` · código ${displayCode(tickets[i].code)}` : ''}: ${l}`
		),
		...(custom.helpText !== null ? ['', custom.helpText] : []),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return cal.finish({ subject, html, text });
}

/**
 * Fecha y hora de un evento con su fin, en hora argentina: «sábado 14 de noviembre de 2026, 22:00
 * a 03:00» (el fin dentro de las 24 h) o «… al domingo 15 de noviembre de 2026, 18:00». Sin fin,
 * como {@link formatEventDate}.
 *
 * @param {string | undefined | null} start
 * @param {string | undefined | null} [end]
 */
export function formatEventSchedule(start, end) {
	const when = formatEventDate(start ?? undefined);
	if (!start || !end) return when;
	const s = parseSiteDate(start);
	const e = eventEnd(start, end);
	if (Number.isNaN(s.getTime()) || e.getTime() <= s.getTime()) return when;
	return e.getTime() - s.getTime() < 24 * 60 * 60 * 1000
		? `${when} a ${argTime(e)}`
		: `${when} al ${argDateTimeLong(e)}`;
}

/**
 * Aviso de cambio de fecha («Avisar a les compradores», dateChange.js): la fecha nueva en un
 * recuadro, la de antes si se sabe, el calendario actualizado y, en un evento online con el link
 * ya cargado, el link de la transmisión (como los demás mails).
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   tickets: import('./orders.js').Ticket[],
 *   event: { title: string, start?: string, end?: string | null, location?: string,
 *     location_name?: string, online?: boolean, streamLink?: string | null, slug?: string,
 *     status?: string, stamp?: number },
 *   previous?: { start?: string | null, end?: string | null } | null,
 *   typeName: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
 * `event.stamp`: la versión del cambio (más nueva que la de los mails anteriores), así el `.ics`
 * adjunto tiene el mismo UID y un SEQUENCE más alto y reemplaza la entrada del calendario.
 * `previous`: la fecha de antes («Antes era…»); sin ella, no se muestra.
 * @returns {{ subject: string, html: string, text: string, attachments?: MailAttachment[] }}
 */
export function buildDateChangeEmail({
	order,
	tickets,
	event,
	previous,
	typeName,
	origin,
	contactEmail,
	template
}) {
	const online = Boolean(event.online);
	const where = salePlaceText(online, event);
	const when = formatEventSchedule(event.start, event.end);
	const before = previous?.start ? formatEventSchedule(previous.start, previous.end) : '';
	const custom = applyTemplate(template, {
		...templateVars({ ...order, quantity: tickets.length || order.quantity }, event, typeName),
		fecha_anterior: previous?.start ? formatEventDate(previous.start) : ''
	});
	const def = templateDef('date_change');
	const subject = custom.subject ?? `Cambió la fecha: ${event.title}`;
	const policy = policyBlocks(contactEmail);
	const cal = calendarExtras({ order, event, online, origin });
	const stream = online && event.streamLink ? event.streamLink : null;
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);
	const help = def?.extras.help?.default ?? '';
	const html = mailLayout({
		origin,
		label: custom.label ?? 'Cambio de fecha',
		titleHtml: custom.headingHtml ?? 'Cambió la fecha',
		contentHtml: `${custom.bodyHtml ?? `<p>Hola ${escapeHtml(order.buyer_name)}, cambió la fecha de <strong>${escapeHtml(event.title)}</strong>. Lo que compraste sigue valiendo para la fecha nueva: no tenés que hacer nada.</p>`}
		<div style="${MAIL_STYLES.box}" data-kv-mail="fecha-nueva"><p style="margin:0 0 6px;font-weight:bold">Fecha nueva</p><p style="margin:0;font-size:18px">${escapeHtml(when)}</p>${where ? `<p style="margin:6px 0 0">${escapeHtml(where)}</p>` : ''}</div>${
			before
				? `
		<p style="${SMALL};margin-top:0" data-kv-mail="fecha-anterior">Antes era: ${escapeHtml(before)}</p>`
				: ''
		}${cal.html}
		${stream ? streamLinkBlock(stream) : ''}`,
		button: withLabel(
			stream
				? { href: stream, label: 'Entrar a la transmisión' }
				: { href: `${origin}/entradas/${order.id}/estado`, label: 'Ver mis entradas' },
			custom.button
		),
		helpHtml: custom.helpHtml ?? escapeHtml(help),
		afterHtml: `<p style="${SMALL}">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}`,
		whyHtml: custom.whyHtml ?? WHY_BOUGHT,
		contactEmail
	});
	const text = [
		custom.headingText ?? 'Cambió la fecha',
		'',
		custom.bodyText ??
			`Hola ${order.buyer_name}, cambió la fecha de ${event.title}. Lo que compraste sigue valiendo para la fecha nueva: no tenés que hacer nada.`,
		'',
		`Fecha nueva: ${when}`,
		...(where ? [where] : []),
		...(before ? [`Antes era: ${before}`] : []),
		...cal.text,
		...(stream ? ['', `Link de la transmisión: ${stream}`] : []),
		'',
		custom.helpText ?? help,
		...(links.length ? ['', ...links.map((l, i) => `Entrada ${i + 1}: ${l}`)] : []),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return cal.finish({ subject, html, text });
}

/**
 * Aviso de reembolso: la compra se reembolsó y las entradas ya no valen.
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   event: { title: string, start?: string },
 *   typeName: string,
 *   contactEmail: string,
 *   origin?: string,
 *   template?: Template
 * }} input
 * `origin`: del sitio, para el logo (sin él, SITE_URL o el de producción).
 */
export function buildRefundEmail({ order, event, typeName, contactEmail, origin, template }) {
	const custom = applyTemplate(template, templateVars(order, event, typeName));
	const subject = custom.subject ?? `Reembolso de tu compra · ${event.title}`;
	const how =
		order.payment_method === 'mercadopago'
			? 'Mercado Pago te devuelve el dinero al mismo medio con el que pagaste (con tarjeta, puede tardar en verse en el resumen).'
			: order.payment_method === 'transferencia'
				? 'Te devolvimos el dinero por transferencia.'
				: order.payment_method === 'efectivo'
					? 'Te devolvimos el dinero en efectivo.'
					: 'Era una compra sin cargo: no hay dinero para devolver.';
	const amount = order.total ? ` de ${formatARS(order.total)}` : '';
	const html = mailLayout({
		origin,
		label: custom.label ?? 'Reembolso',
		titleHtml: custom.headingHtml ?? 'Reembolsamos tu compra',
		contentHtml: `${custom.bodyHtml ?? `<p>Hola ${escapeHtml(order.buyer_name)}, hicimos el reembolso${escapeHtml(amount)} de tu compra de ${order.quantity} × ${escapeHtml(typeName)} para <strong>${escapeHtml(event.title)}</strong>${event.start ? ` (${escapeHtml(formatEventDate(event.start))})` : ''}.</p>`}
		<p>${escapeHtml(how)}</p>
		<p>${order.quantity === 1 ? 'La entrada ya no es válida' : 'Las entradas ya no son válidas'} para ingresar.</p>`,
		afterHtml: `<p style="${SMALL}">Número de orden: ${order.id}<br>Si tenés alguna duda, respondé este mail o escribinos a ${escapeHtml(contactEmail)}.</p>`,
		whyHtml: custom.whyHtml ?? WHY_BOUGHT,
		contactEmail
	});
	const text = [
		custom.headingText ?? 'Reembolsamos tu compra',
		'',
		custom.bodyText ??
			`Hicimos el reembolso${amount} de tu compra de ${order.quantity} × ${typeName} para ${event.title}.`,
		how,
		order.quantity === 1 ? 'La entrada ya no es válida.' : 'Las entradas ya no son válidas.',
		'',
		`Número de orden: ${order.id}`,
		`Dudas: respondé este mail o escribinos a ${contactEmail}.`
	].join('\n');
	return { subject, html, text };
}

/**
 * Email con los datos para transferir (orden `awaiting_transfer`). Sin DNI ni datos de otras
 * entradas: solo lo necesario para pagar.
 *
 * Hasta cuándo se guarda el lugar (`expires_at`, la regla de los días hábiles de la decisión 0031)
 * va siempre en un recuadro fijo, con la fecha y la hora exactas: aunque el texto del mail sea
 * propio, ese dato no se pierde.
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   event: { title: string, start?: string, parts?: PartsList | null },
 *   typeName: string,
 *   transferInfo: string,
 *   replyTo?: string,
 *   contactEmail: string,
 *   origin: string,
 *   template?: Template
 * }} input
 */
export function buildTransferEmail({
	order,
	event,
	typeName,
	transferInfo,
	replyTo,
	contactEmail,
	origin,
	template
}) {
	const policy = policyBlocks(contactEmail);
	const prices = priceLines(order, typeName);
	const parts = partsBlocks(event.parts);
	const ref = orderReference(order.id);
	const deadline = argDeadline(order.expires_at);
	const statusUrl = `${origin}/entradas/${order.id}/estado`;
	const custom = applyTemplate(template, {
		...templateVars(order, event, typeName),
		// {{horas}} queda por los textos propios viejos; el dato claro es {{vence}}.
		horas: holdHours(order),
		vence: deadline,
		link_estado: statusUrl
	});
	const subject = custom.subject ?? `Datos para transferir · ${event.title} (${ref})`;
	const where = replyTo ? `respondé este mail o escribinos a ${replyTo}` : 'respondé este mail';
	const holdText = transferHoldText(order.expires_at, { note: ARGENTINA_TIME_NOTE });
	const holdHtml = `<p style="background:#fff3c4;border-radius:12px;padding:12px 16px;margin:0 0 16px">Te guardamos el lugar hasta el <strong>${escapeHtml(deadline)}</strong> (${ARGENTINA_TIME_NOTE}). ${escapeHtml(TRANSFER_HOLD_AFTER)}</p>`;
	const intro =
		custom.bodyHtml ??
		`<p>Hola ${escapeHtml(order.buyer_name)}, para confirmar tus entradas transferí <strong>${formatARS(order.total)}</strong>.</p>`;
	const details = `<p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(formatEventDate(event.start))}</p>${parts.html}
		<p>${prices.map(escapeHtml).join('<br>')}</p>
		<div style="${MAIL_STYLES.box};white-space:pre-line">${escapeHtml(transferInfo)}</div>
		<p>En el concepto o la descripción de la transferencia poné: <strong style="font-size:18px">${ref}</strong></p>
		<p>Después, <strong>mandanos el comprobante</strong>: ${escapeHtml(where)}, con la referencia ${ref}. Cuando lo confirmemos te llegan las entradas con su QR por mail.</p>`;
	const html = mailLayout({
		origin,
		label: custom.label ?? 'Tu reserva',
		titleHtml: custom.headingHtml ?? 'Reservamos tus entradas',
		contentHtml: `${intro}
		${holdHtml}
		${details}`,
		button: withLabel({ href: statusUrl, label: 'Ver el estado de tu compra' }, custom.button),
		helpHtml: custom.helpHtml ?? '',
		afterHtml: `<p style="${SMALL}">Número de orden: ${order.id}</p>
		${policy.html}`,
		whyHtml: custom.whyHtml ?? WHY_RESERVED,
		contactEmail
	});
	const text = [
		custom.headingText ?? 'Reservamos tus entradas',
		'',
		custom.bodyText ?? `Para confirmar tus entradas transferí ${formatARS(order.total)}.`,
		'',
		holdText,
		...(custom.helpText !== null ? ['', custom.helpText] : []),
		'',
		`${event.title}`,
		formatEventDate(event.start),
		...parts.text,
		...(parts.text.length ? [''] : []),
		...prices,
		'',
		transferInfo,
		'',
		`En el concepto de la transferencia poné: ${ref}`,
		`Después mandanos el comprobante: ${where}, con la referencia ${ref}.`,
		'',
		`Estado de tu compra: ${statusUrl}`,
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return { subject, html, text };
}

/**
 * Un adjunto para Resend (`content` en base64), como el .ics de las entradas (calendarFile.js).
 * @typedef {{ filename: string, content: string, content_type: string }} MailAttachment
 */

/**
 * Encabezados de todos los mails: están en castellano. Gmail a veces los toma por inglés (mails
 * cortos, con «Kinky Vibe» varias veces) y ofrece traducirlos; el `lang="es"` del HTML ya está.
 */
export const MAIL_HEADERS = Object.freeze({ 'Content-Language': 'es' });

/** Cuánto se espera la respuesta de Resend (un envío colgado no puede trabar la request). */
export const RESEND_TIMEOUT_MS = 10_000;

/**
 * @param {{
 *   fetch: typeof fetch,
 *   apiKey: string,
 *   from: string,
 *   to: string,
 *   replyTo?: string,
 *   message: { subject: string, html: string, text: string, attachments?: MailAttachment[] },
 *   idempotencyKey?: string,
 *   timeoutMs?: number
 * }} input
 */
export async function sendWithResend({
	fetch,
	apiKey,
	from,
	to,
	replyTo,
	message,
	idempotencyKey,
	timeoutMs = RESEND_TIMEOUT_MS
}) {
	/** @type {Record<string, string>} */
	const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
	if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		signal: AbortSignal.timeout(timeoutMs),
		headers,
		body: JSON.stringify({
			from,
			to: [to],
			subject: message.subject,
			html: message.html,
			text: message.text,
			...(message.attachments?.length ? { attachments: message.attachments } : {}),
			...(replyTo ? { reply_to: replyTo } : {}),
			headers: MAIL_HEADERS
		})
	});
	if (!res.ok) {
		const body = (await res.text().catch(() => '')).slice(0, 300);
		throw new Error(`Resend → ${res.status}: ${body}`);
	}
	return /** @type {{ id?: string }} */ (await res.json().catch(() => ({})));
}

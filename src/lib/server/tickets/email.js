/**
 * Email con las entradas, enviado con la API REST de Resend (POST https://api.resend.com/emails).
 */
import { formatARS } from '$lib/utils/money.js';
import { fondoOptionLabel, holdHours, orderReference, refundPolicy } from '$lib/utils/tickets.js';
import { renderBlockHtml, renderInlineHtml, renderPlain } from '$lib/utils/emailTemplates.js';

/**
 * Plantilla guardada en el panel (asunto, título y texto de arriba; ver emailTemplates.js), o
 * `null`: entonces el mail sale exactamente como siempre.
 * @typedef {import('$lib/utils/emailTemplates.js').TemplateText | null | undefined} Template
 */

/**
 * Las partes editables ya armadas con las variables, o `null` sin plantilla.
 *
 * @param {Template} template
 * @param {Record<string, string | number>} vars
 */
function applyTemplate(template, vars) {
	if (!template) return null;
	return {
		subject: renderPlain(template.subject, vars).replace(/\s+/g, ' ').trim(),
		headingHtml: renderInlineHtml(template.heading, vars),
		headingText: renderPlain(template.heading, vars),
		bodyHtml: renderBlockHtml(template.body, vars),
		bodyText: renderPlain(template.body, vars)
	};
}

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
		lugar: event.online
			? 'Online'
			: [event.location_name, event.location].filter(Boolean).join(' · '),
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
		html: `<div style="font-size:13px;color:#444;border-top:1px solid #ddd;margin-top:24px;padding-top:12px">
			<p style="font-weight:bold">${escapeHtml(p.title)}</p>
			${p.paragraphs.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}
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
	if (order.fondo_amount) lines.push(`Fondo KinkyVibe: −${formatARS(order.fondo_amount)}`);
	if (order.fondo_contribution) {
		lines.push(
			`${fondoOptionLabel(order.fondo_option)}, aporte al Fondo KinkyVibe: +${formatARS(order.fondo_contribution)}`
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
	const d = new Date(start);
	if (Number.isNaN(d.getTime())) return String(start);
	return (
		d.toLocaleString('es-AR', {
			dateStyle: 'full',
			timeStyle: 'short',
			hourCycle: 'h23',
			timeZone: 'America/Argentina/Buenos_Aires'
		}) + ' hs'
	);
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
	return `<div style="background:#f6eef3;border-radius:12px;padding:12px 16px;margin:16px 0;text-align:center">
		<p style="margin:0 0 8px;font-weight:bold">Link de la transmisión</p>
		<p style="margin:0;font-size:18px"><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
		<p style="margin:8px 0 0;font-size:13px;color:#555">Es personal: no lo compartas.</p>
	</div>`;
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
 *     online?: boolean, streamLink?: string | null },
 *   typeName: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
 */
export function buildTicketEmail({
	order,
	tickets,
	event,
	typeName,
	origin,
	contactEmail,
	template
}) {
	const title = event.title;
	const when = formatEventDate(event.start);
	const online = Boolean(event.online);
	const where = online
		? 'Online'
		: [event.location_name, event.location].filter(Boolean).join(' · ');
	const custom = applyTemplate(template, templateVars(order, event, typeName));
	const subject = custom ? custom.subject : `Tus entradas para ${title}`;
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);

	// Nombre y pronombres de cada entrada (nunca el DNI: los mails se reenvían y quedan guardados).
	/** @param {import('./orders.js').Ticket} t */
	const holder = (t) =>
		t.holder_pronouns ? `${t.holder_name} (${t.holder_pronouns})` : t.holder_name;
	const prices = priceLines(order, typeName);
	const policy = policyBlocks(contactEmail);

	const ticketBlocks = tickets
		.map((t, i) => {
			const head = `<p style="margin:0 0 8px;font-weight:bold">Entrada ${i + 1} de ${tickets.length} · ${escapeHtml(typeName)}<br>${escapeHtml(holder(t))}</p>`;
			if (online) {
				return `<div style="border:2px dashed #b3127a;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
				${head}
				<p style="margin:8px 0 0"><a href="${links[i]}">Ver la entrada</a></p>
			</div>`;
			}
			const code = t.code
				? `<td style="vertical-align:middle;padding:0 0 0 12px;text-align:center">
					<div style="font-size:12px;color:#555">Código</div>
					<div style="font-family:'Courier New',monospace;font-size:30px;font-weight:bold;letter-spacing:3px;white-space:nowrap">${escapeHtml(displayCode(t.code))}</div>
				</td>`
				: '';
			return `
			<div style="border:2px dashed #b3127a;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
				${head}
				<table role="presentation" style="margin:0 auto;border-collapse:collapse"><tr>
					<td style="vertical-align:middle"><img src="${origin}/entradas/t/${t.token}/qr.gif" width="200" height="200" alt="Código QR de la entrada ${i + 1}" style="display:block"></td>
					${code}
				</tr></table>
				<p style="margin:8px 0 0"><a href="${links[i]}">Ver la entrada en el navegador</a></p>
			</div>`;
		})
		.join('');

	const intro = online
		? event.streamLink
			? '<p>Este es el link para entrar a la transmisión. Es personal: no lo compartas en redes.</p>'
			: '<p>Es un evento online: <strong>te mandamos el link de la transmisión por mail antes del evento</strong>. También va a aparecer en la página de cada entrada.</p>'
		: '<p>Mostrá el QR de cada entrada en la puerta (desde el celu o impreso). Si el QR no se puede escanear, dictá el código que está al lado. Cada entrada sirve para una sola persona y una sola vez: no la compartas en redes.</p>';

	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">${custom ? custom.headingHtml : '¡Ya tenés tus entradas!'}</h1>
		${custom ? custom.bodyHtml : `<p>Hola ${escapeHtml(order.buyer_name)}, gracias por tu compra.</p>`}
		<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>
		<p>${prices.map(escapeHtml).join('<br>')}</p>
		${intro}
		${online && event.streamLink ? streamLinkBlock(event.streamLink) : ''}
		${ticketBlocks}
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}
		</body></html>`;

	const text = [
		...(custom ? [custom.headingText, '', custom.bodyText] : ['¡Ya tenés tus entradas!']),
		'',
		`${title}`,
		when,
		where,
		'',
		...prices,
		'',
		online
			? event.streamLink
				? `Link de la transmisión (personal, no lo compartas): ${event.streamLink}`
				: 'Es un evento online: te mandamos el link de la transmisión por mail antes del evento.'
			: 'Mostrá el QR de cada entrada en la puerta; si no se puede escanear, dictá su código. Cada entrada sirve una sola vez.',
		...links.map(
			(l, i) =>
				`Entrada ${i + 1} (${holder(tickets[i])})${!online && tickets[i].code ? ` · código ${displayCode(tickets[i].code)}` : ''}: ${l}`
		),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	]
		.filter((l) => l !== undefined)
		.join('\n');

	return { subject, html, text };
}

/**
 * Mail con el link de la transmisión de un evento online ("Enviar el link a todes").
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   tickets: import('./orders.js').Ticket[],
 *   event: { title: string, start?: string },
 *   link: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
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
	const subject = custom ? custom.subject : `Link de la transmisión: ${event.title}`;
	const policy = policyBlocks(contactEmail);
	const ticketLinks = tickets.map((t) => `${origin}/entradas/t/${t.token}`);
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">${custom ? custom.headingHtml : 'Ya está el link de la transmisión'}</h1>
		${custom ? custom.bodyHtml : `<p>Hola ${escapeHtml(order.buyer_name)}, este es el link para <strong>${escapeHtml(event.title)}</strong>${when ? ` (${escapeHtml(when)})` : ''}.</p>`}
		${streamLinkBlock(link)}
		${ticketLinks.length ? `<p>También está en la página de ${ticketLinks.length === 1 ? 'tu entrada' : 'cada entrada'}: ${ticketLinks.map((l, i) => `<a href="${l}">entrada ${i + 1}</a>`).join(', ')}.</p>` : ''}
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}
		</body></html>`;
	const text = [
		...(custom
			? [custom.headingText, '', custom.bodyText]
			: ['Ya está el link de la transmisión', '', `${event.title}${when ? ` (${when})` : ''}`]),
		'',
		`Link (personal, no lo compartas): ${link}`,
		'',
		...ticketLinks.map((l, i) => `Entrada ${i + 1}: ${l}`),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return { subject, html, text };
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
 *     online?: boolean, streamLink?: string | null },
 *   typeName: string,
 *   origin: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
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
	const where = online
		? 'Online'
		: [event.location_name, event.location].filter(Boolean).join(' · ');
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
	const subject = custom ? custom.subject : `Recordatorio: ${event.title} ${soon}`;
	const policy = policyBlocks(contactEmail);
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);
	/** @param {import('./orders.js').Ticket} t */
	const holder = (t) =>
		t.holder_pronouns ? `${t.holder_name} (${t.holder_pronouns})` : t.holder_name;
	const list = tickets
		.map(
			(t, i) =>
				`<li><a href="${links[i]}">Entrada ${i + 1} · ${escapeHtml(holder(t))}</a>${!online && t.code ? ` · código <strong style="font-family:'Courier New',monospace">${escapeHtml(displayCode(t.code))}</strong>` : ''}</li>`
		)
		.join('');
	const intro = online
		? event.streamLink
			? streamLinkBlock(event.streamLink)
			: '<p>Es un evento online: te vamos a mandar el link de la transmisión por mail antes de que empiece.</p>'
		: '<p>Llevá el QR de cada entrada (en el celu o impreso). Si no se puede escanear, alcanza con el código.</p>';
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">${custom ? custom.headingHtml : `¡${escapeHtml(event.title)} ${soon}!`}</h1>
		${custom ? custom.bodyHtml : `<p>Hola ${escapeHtml(order.buyer_name)}, te recordamos que tenés ${tickets.length === 1 ? 'una entrada' : `${tickets.length} entradas`} (${escapeHtml(typeName)}).</p>`}
		<p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>
		${intro}
		<ul>${list}</ul>
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}
		</body></html>`;
	const text = [
		...(custom ? [custom.headingText, '', custom.bodyText] : [`${event.title} ${soon}`]),
		'',
		`${event.title}`,
		when,
		where,
		'',
		online
			? event.streamLink
				? `Link de la transmisión (personal): ${event.streamLink}`
				: 'Te vamos a mandar el link de la transmisión antes de que empiece.'
			: 'Llevá el QR de cada entrada; si no se puede escanear, alcanza con el código.',
		...links.map(
			(l, i) =>
				`Entrada ${i + 1} (${holder(tickets[i])})${!online && tickets[i].code ? ` · código ${displayCode(tickets[i].code)}` : ''}: ${l}`
		),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return { subject, html, text };
}

/**
 * Aviso de reembolso: la compra se reembolsó y las entradas ya no valen.
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   event: { title: string, start?: string },
 *   typeName: string,
 *   contactEmail: string,
 *   template?: Template
 * }} input
 */
export function buildRefundEmail({ order, event, typeName, contactEmail, template }) {
	const custom = applyTemplate(template, templateVars(order, event, typeName));
	const subject = custom ? custom.subject : `Reembolso de tu compra · ${event.title}`;
	const how =
		order.payment_method === 'mercadopago'
			? 'Mercado Pago te devuelve el dinero al mismo medio con el que pagaste (con tarjeta, puede tardar en verse en el resumen).'
			: order.payment_method === 'transferencia'
				? 'Te devolvimos el dinero por transferencia.'
				: 'Era una compra sin cargo: no hay dinero para devolver.';
	const amount = order.total ? ` de ${formatARS(order.total)}` : '';
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">${custom ? custom.headingHtml : 'Reembolsamos tu compra'}</h1>
		${custom ? custom.bodyHtml : `<p>Hola ${escapeHtml(order.buyer_name)}, hicimos el reembolso${escapeHtml(amount)} de tu compra de ${order.quantity} × ${escapeHtml(typeName)} para <strong>${escapeHtml(event.title)}</strong>${event.start ? ` (${escapeHtml(formatEventDate(event.start))})` : ''}.</p>`}
		<p>${escapeHtml(how)}</p>
		<p>${order.quantity === 1 ? 'La entrada ya no es válida' : 'Las entradas ya no son válidas'} para ingresar.</p>
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés alguna duda, respondé este mail o escribinos a ${escapeHtml(contactEmail)}.</p>
		</body></html>`;
	const text = [
		...(custom
			? [custom.headingText, '', custom.bodyText]
			: [
					'Reembolsamos tu compra',
					'',
					`Hicimos el reembolso${amount} de tu compra de ${order.quantity} × ${typeName} para ${event.title}.`
				]),
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
 * @param {{
 *   order: import('./orders.js').Order,
 *   event: { title: string, start?: string },
 *   typeName: string,
 *   transferInfo: string,
 *   replyTo?: string,
 *   contactEmail: string,
 *   origin: string,
 *   confirmUrl?: string,
 *   fullHoldHours?: number,
 *   template?: Template
 * }} input
 * `confirmUrl`: link para confirmar la reserva, que la extiende a `fullHoldHours` horas desde
 * que se hizo (sin él, el mail no pide confirmar).
 */
export function buildTransferEmail({
	order,
	event,
	typeName,
	transferInfo,
	replyTo,
	contactEmail,
	origin,
	confirmUrl,
	fullHoldHours,
	template
}) {
	const policy = policyBlocks(contactEmail);
	const prices = priceLines(order, typeName);
	const ref = orderReference(order.id);
	const deadline = formatEventDate(new Date(order.expires_at).toISOString());
	const hours = holdHours(order);
	const statusUrl = `${origin}/entradas/${order.id}/estado`;
	const custom = applyTemplate(template, {
		...templateVars(order, event, typeName),
		horas: hours,
		vence: deadline,
		link_estado: statusUrl
	});
	const subject = custom ? custom.subject : `Datos para transferir · ${event.title} (${ref})`;
	const where = replyTo ? `respondé este mail o escribinos a ${replyTo}` : 'respondé este mail';
	const confirm =
		confirmUrl && fullHoldHours && fullHoldHours > hours
			? {
					html: `<p style="background:#fff3c4;border-radius:12px;padding:12px 16px"><strong>Confirmá tu reserva</strong> para que te guardemos el lugar ${fullHoldHours} horas: <a href="${escapeHtml(confirmUrl)}">confirmar mi reserva</a>. Si no la confirmás, se libera a las ${hours} ${hours === 1 ? 'hora' : 'horas'}.</p>`,
					text: `Confirmá tu reserva para que te guardemos el lugar ${fullHoldHours} horas: ${confirmUrl}\nSi no la confirmás, se libera a las ${hours} ${hours === 1 ? 'hora' : 'horas'}.`
				}
			: null;
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">${custom ? custom.headingHtml : 'Reservamos tus entradas'}</h1>
		${custom ? custom.bodyHtml : `<p>Hola ${escapeHtml(order.buyer_name)}, para confirmarlas transferí <strong>${formatARS(order.total)}</strong>. Te reservamos el lugar ${hours} horas (hasta el <strong>${escapeHtml(deadline)}</strong>) mientras mandás el comprobante por mail.</p>`}
		${confirm?.html ?? ''}
		<p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(formatEventDate(event.start))}</p>
		<p>${prices.map(escapeHtml).join('<br>')}</p>
		<div style="background:#f6eef3;border-radius:12px;padding:12px 16px;white-space:pre-line">${escapeHtml(transferInfo)}</div>
		<p>En el concepto o la descripción de la transferencia poné: <strong style="font-size:18px">${ref}</strong></p>
		<p>Después, <strong>mandanos el comprobante</strong>: ${escapeHtml(where)}, con la referencia ${ref}. Cuando lo confirmemos te llegan las entradas con su QR por mail.</p>
		<p>Si no llega el pago antes de esa fecha, la reserva se libera.</p>
		<p><a href="${statusUrl}">Ver el estado de tu compra</a></p>
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}</p>
		${policy.html}
		</body></html>`;
	const text = [
		...(custom
			? [custom.headingText, '', custom.bodyText]
			: [
					'Reservamos tus entradas',
					'',
					`Para confirmarlas transferí ${formatARS(order.total)}. Te reservamos el lugar ${hours} horas (hasta el ${deadline}) mientras mandás el comprobante por mail.`
				]),
		...(confirm ? ['', confirm.text] : []),
		'',
		`${event.title}`,
		formatEventDate(event.start),
		...prices,
		'',
		transferInfo,
		'',
		`En el concepto de la transferencia poné: ${ref}`,
		`Después mandanos el comprobante: ${where}, con la referencia ${ref}.`,
		'Si no llega el pago antes de esa fecha, la reserva se libera.',
		'',
		`Estado de tu compra: ${statusUrl}`,
		`Número de orden: ${order.id}`,
		policy.text
	].join('\n');
	return { subject, html, text };
}

/**
 * @param {{
 *   fetch: typeof fetch,
 *   apiKey: string,
 *   from: string,
 *   to: string,
 *   replyTo?: string,
 *   message: { subject: string, html: string, text: string },
 *   idempotencyKey?: string
 * }} input
 */
export async function sendWithResend({
	fetch,
	apiKey,
	from,
	to,
	replyTo,
	message,
	idempotencyKey
}) {
	/** @type {Record<string, string>} */
	const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
	if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers,
		body: JSON.stringify({
			from,
			to: [to],
			subject: message.subject,
			html: message.html,
			text: message.text,
			...(replyTo ? { reply_to: replyTo } : {})
		})
	});
	if (!res.ok) {
		const body = (await res.text().catch(() => '')).slice(0, 300);
		throw new Error(`Resend → ${res.status}: ${body}`);
	}
	return /** @type {{ id?: string }} */ (await res.json().catch(() => ({})));
}

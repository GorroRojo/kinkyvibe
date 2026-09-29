/**
 * Email con las entradas, enviado con la API REST de Resend (POST https://api.resend.com/emails).
 */
import { formatARS } from '$lib/utils/money.js';
import { fondoOptionLabel, holdHours, orderReference, refundPolicy } from '$lib/utils/tickets.js';

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
 *   contactEmail: string
 * }} input
 */
export function buildTicketEmail({ order, tickets, event, typeName, origin, contactEmail }) {
	const title = event.title;
	const when = formatEventDate(event.start);
	const online = Boolean(event.online);
	const where = online
		? 'Online'
		: [event.location_name, event.location].filter(Boolean).join(' · ');
	const subject = `Tus entradas para ${title}`;
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
		<h1 style="color:#b3127a;font-size:22px">¡Ya tenés tus entradas!</h1>
		<p>Hola ${escapeHtml(order.buyer_name)}, gracias por tu compra.</p>
		<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>
		<p>${prices.map(escapeHtml).join('<br>')}</p>
		${intro}
		${online && event.streamLink ? streamLinkBlock(event.streamLink) : ''}
		${ticketBlocks}
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}
		</body></html>`;

	const text = [
		'¡Ya tenés tus entradas!',
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
 *   contactEmail: string
 * }} input
 */
export function buildStreamLinkEmail({ order, tickets, event, link, origin, contactEmail }) {
	const when = formatEventDate(event.start);
	const subject = `Link de la transmisión: ${event.title}`;
	const policy = policyBlocks(contactEmail);
	const ticketLinks = tickets.map((t) => `${origin}/entradas/t/${t.token}`);
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">Ya está el link de la transmisión</h1>
		<p>Hola ${escapeHtml(order.buyer_name)}, este es el link para <strong>${escapeHtml(event.title)}</strong>${when ? ` (${escapeHtml(when)})` : ''}.</p>
		${streamLinkBlock(link)}
		${ticketLinks.length ? `<p>También está en la página de ${ticketLinks.length === 1 ? 'tu entrada' : 'cada entrada'}: ${ticketLinks.map((l, i) => `<a href="${l}">entrada ${i + 1}</a>`).join(', ')}.</p>` : ''}
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		${policy.html}
		</body></html>`;
	const text = [
		'Ya está el link de la transmisión',
		'',
		`${event.title}${when ? ` (${when})` : ''}`,
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
 *   origin: string
 * }} input
 */
export function buildTransferEmail({
	order,
	event,
	typeName,
	transferInfo,
	replyTo,
	contactEmail,
	origin
}) {
	const policy = policyBlocks(contactEmail);
	const prices = priceLines(order, typeName);
	const ref = orderReference(order.id);
	const deadline = formatEventDate(new Date(order.expires_at).toISOString());
	const hours = holdHours(order);
	const statusUrl = `${origin}/entradas/${order.id}/estado`;
	const subject = `Datos para transferir · ${event.title} (${ref})`;
	const where = replyTo ? `respondé este mail o escribinos a ${replyTo}` : 'respondé este mail';
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">Reservamos tus entradas</h1>
		<p>Hola ${escapeHtml(order.buyer_name)}, para confirmarlas transferí <strong>${formatARS(order.total)}</strong>. Te reservamos el lugar ${hours} horas (hasta el <strong>${escapeHtml(deadline)}</strong>) mientras mandás el comprobante por mail.</p>
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
		'Reservamos tus entradas',
		'',
		`Para confirmarlas transferí ${formatARS(order.total)}. Te reservamos el lugar ${hours} horas (hasta el ${deadline}) mientras mandás el comprobante por mail.`,
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

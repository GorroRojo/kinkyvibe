/**
 * Email con las entradas, enviado con la API REST de Resend (POST https://api.resend.com/emails).
 */
import { formatARS } from '$lib/utils/money.js';
import { orderReference, refundPolicy } from '$lib/utils/tickets.js';

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
		`${order.quantity} × ${typeName}: ${formatARS(order.unit_price * order.quantity)}`
	];
	if (order.fondo_amount) lines.push(`Fondo KinkyVibe: −${formatARS(order.fondo_amount)}`);
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
 * @param {{
 *   order: import('./orders.js').Order,
 *   tickets: import('./orders.js').Ticket[],
 *   event: { title: string, start?: string, location?: string, location_name?: string },
 *   typeName: string,
 *   origin: string,
 *   contactEmail: string
 * }} input
 */
export function buildTicketEmail({ order, tickets, event, typeName, origin, contactEmail }) {
	const title = event.title;
	const when = formatEventDate(event.start);
	const where = [event.location_name, event.location].filter(Boolean).join(' · ');
	const subject = `Tus entradas para ${title}`;
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);

	// Nombre y pronombres de cada entrada (nunca el DNI: los mails se reenvían y quedan guardados).
	/** @param {import('./orders.js').Ticket} t */
	const holder = (t) =>
		t.holder_pronouns ? `${t.holder_name} (${t.holder_pronouns})` : t.holder_name;
	const prices = priceLines(order, typeName);
	const policy = policyBlocks(contactEmail);

	const ticketBlocks = tickets
		.map(
			(t, i) => `
		<div style="border:2px dashed #b3127a;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
			<p style="margin:0 0 8px;font-weight:bold">Entrada ${i + 1} de ${tickets.length} · ${escapeHtml(typeName)}<br>${escapeHtml(holder(t))}</p>
			<img src="${origin}/entradas/t/${t.token}/qr.gif" width="240" height="240" alt="Código QR de la entrada ${i + 1}" style="display:block;margin:0 auto">
			<p style="margin:8px 0 0"><a href="${links[i]}">Ver la entrada en el navegador</a></p>
		</div>`
		)
		.join('');

	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">¡Ya tenés tus entradas!</h1>
		<p>Hola ${escapeHtml(order.buyer_name)}, gracias por tu compra.</p>
		<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>
		<p>${prices.map(escapeHtml).join('<br>')}</p>
		<p>Mostrá el QR de cada entrada en la puerta (desde el celu o impreso). Cada QR sirve para una sola persona y una sola vez: no lo compartas en redes.</p>
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
		'Mostrá el QR de cada entrada en la puerta. Cada QR sirve una sola vez.',
		...links.map((l, i) => `Entrada ${i + 1} (${holder(tickets[i])}): ${l}`),
		'',
		`Número de orden: ${order.id}`,
		policy.text
	]
		.filter((l) => l !== undefined)
		.join('\n');

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
	const statusUrl = `${origin}/entradas/${order.id}/estado`;
	const subject = `Datos para transferir · ${event.title} (${ref})`;
	const where = replyTo ? `respondé este mail o escribinos a ${replyTo}` : 'respondé este mail';
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">Reservamos tus entradas</h1>
		<p>Hola ${escapeHtml(order.buyer_name)}, para confirmarlas transferí <strong>${formatARS(order.total)}</strong> antes del <strong>${escapeHtml(deadline)}</strong>.</p>
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
		`Para confirmarlas transferí ${formatARS(order.total)} antes del ${deadline}.`,
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

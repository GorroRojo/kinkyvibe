/**
 * Email con las entradas, enviado con la API REST de Resend (POST https://api.resend.com/emails).
 */
import { formatARS } from '$lib/utils/money.js';

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
 *   origin: string
 * }} input
 */
export function buildTicketEmail({ order, tickets, event, typeName, origin }) {
	const title = event.title;
	const when = formatEventDate(event.start);
	const where = [event.location_name, event.location].filter(Boolean).join(' · ');
	const subject = `Tus entradas para ${title}`;
	const links = tickets.map((t) => `${origin}/entradas/t/${t.token}`);

	const ticketBlocks = tickets
		.map(
			(t, i) => `
		<div style="border:2px dashed #b3127a;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
			<p style="margin:0 0 8px;font-weight:bold">Entrada ${i + 1} de ${tickets.length} · ${escapeHtml(typeName)}</p>
			<img src="${origin}/entradas/t/${t.token}/qr.gif" width="240" height="240" alt="Código QR de la entrada ${i + 1}" style="display:block;margin:0 auto">
			<p style="margin:8px 0 0"><a href="${links[i]}">Ver la entrada en el navegador</a></p>
		</div>`
		)
		.join('');

	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<h1 style="color:#b3127a;font-size:22px">¡Ya tenés tus entradas!</h1>
		<p>Hola ${escapeHtml(order.buyer_name)}, gracias por tu compra.</p>
		<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(when)}${where ? `<br>${escapeHtml(where)}` : ''}</p>
		<p>${order.quantity} × ${escapeHtml(typeName)} · Total ${formatARS(order.total)}</p>
		<p>Mostrá el QR de cada entrada en la puerta (desde el celu o impreso). Cada QR sirve para una sola persona y una sola vez: no lo compartas en redes.</p>
		${ticketBlocks}
		<p style="font-size:13px;color:#666">Número de orden: ${order.id}<br>Si tenés algún problema, respondé este mail.</p>
		</body></html>`;

	const text = [
		'¡Ya tenés tus entradas!',
		'',
		`${title}`,
		when,
		where,
		'',
		`${order.quantity} × ${typeName} · Total ${formatARS(order.total)}`,
		'',
		'Mostrá el QR de cada entrada en la puerta. Cada QR sirve una sola vez.',
		...links.map((l, i) => `Entrada ${i + 1}: ${l}`),
		'',
		`Número de orden: ${order.id}`
	]
		.filter((l) => l !== undefined)
		.join('\n');

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

/**
 * Vista previa de un mail con datos de ejemplo (inventados), para el editor de plantillas y
 * "Mandarme una prueba". Usa los mismos builders que los mails de verdad.
 */
import {
	buildRefundEmail,
	buildReminderEmail,
	buildStreamLinkEmail,
	buildTicketEmail,
	buildTransferEmail
} from './email.js';

/** @typedef {import('$lib/utils/emailTemplates.js').TemplateId} TemplateId */
/** @typedef {import('$lib/utils/emailTemplates.js').TemplateParts} TemplateParts */

const SAMPLE_ORDER_ID = '3f2b8c1e-0000-4000-8000-000000000000';

/** Dibujo de un QR "de ejemplo" (las entradas de ejemplo no existen: su QR daría 404). */
const QR_PLACEHOLDER =
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><path d="M0 0h3v3H0zM7 0h3v3H7zM0 7h3v3H0zM4 1h1v2H4zM5 4h2v1H5zM4 6h1v1H4zM7 5h1v2H7zM5 8h3v1H5zM1 4h2v1H1z" fill="#222"/><text x="5" y="5.6" font-size="1.4" text-anchor="middle" fill="#b3127a" font-family="sans-serif">EJEMPLO</text></svg>'
	);

/** @param {{ subject: string, html: string, text: string }} m */
function withPlaceholderQr(m) {
	return {
		...m,
		html: m.html.replace(
			/src="[^"]*\/entradas\/t\/EJEMPLO[^"]*\/qr\.gif"/g,
			`src="${QR_PLACEHOLDER}"`
		)
	};
}

/** @param {number} now */
function sampleOrder(now) {
	return /** @type {import('./orders.js').Order} */ ({
		id: SAMPLE_ORDER_ID,
		event_slug: 'fiesta-de-ejemplo',
		ticket_type: 'general',
		quantity: 2,
		unit_price: 10000,
		fondo_option: 'fondo',
		fondo_percent: 20,
		fondo_amount: 4000,
		fondo_contribution: 0,
		subtotal: 16000,
		discount_code: null,
		discount_amount: 0,
		surcharge_amount: 327,
		total: 16327,
		payment_method: 'mercadopago',
		buyer_name: 'Persona de Ejemplo',
		buyer_pronouns: 'elle',
		buyer_email: 'persona@example.com',
		buyer_dni: null,
		holders: null,
		status: 'approved',
		mp_preference_id: null,
		mp_payment_id: null,
		confirmed_by: null,
		email_sent_at: null,
		created_at: now,
		updated_at: now,
		expires_at: now + 2 * 3600000
	});
}

/** @returns {import('./orders.js').Ticket[]} */
function sampleTickets() {
	return ['Persona de Ejemplo', 'Otra Persona'].map((name, i) => ({
		id: `ejemplo-${i}`,
		order_id: SAMPLE_ORDER_ID,
		event_slug: 'fiesta-de-ejemplo',
		ticket_type: 'general',
		holder_name: name,
		holder_pronouns: i ? null : 'elle',
		token: `EJEMPLO${i}`.padEnd(43, '0'),
		code: i ? 'K9P2ZT' : '7HQ4XM',
		checked_in_at: null,
		checked_in_by: null
	}));
}

/**
 * El mail de ejemplo de una plantilla (con `template` = null, el texto del código). Con
 * `event`, el título, la fecha y el lugar son los de ese evento (la vista previa de la ficha de
 * un evento); la compra y quien compró siguen siendo de ejemplo.
 *
 * @param {TemplateId} id
 * @param {TemplateParts | null} template ya junta (lo del evento sobre la general)
 * @param {{ origin: string, contactEmail: string, replyTo?: string, now?: number,
 *   event?: { title?: string, start?: string, location?: string, location_name?: string } }} ctx
 * @returns {{ subject: string, html: string, text: string }}
 */
export function previewEmail(
	id,
	template,
	{ origin, contactEmail, replyTo, now = Date.now(), event: real }
) {
	const order = sampleOrder(now);
	const tickets = sampleTickets();
	const event = {
		title: real?.title || 'Fiesta de ejemplo',
		// Dentro de 10 días a las 22 h de Argentina.
		start:
			real?.start ||
			`${new Date(now + 10 * 86400000 - 3 * 3600000).toISOString().slice(0, 10)}T22:00:00-03:00`,
		location: real ? (real.location ?? '') : 'Calle Falsa 123',
		location_name: real ? (real.location_name ?? '') : 'Lugar de ejemplo'
	};
	const common = { order, typeName: 'General', contactEmail, template };
	switch (id) {
		case 'transfer':
			return buildTransferEmail({
				...common,
				order: { ...order, payment_method: 'transferencia', surcharge_amount: 0, total: 16000 },
				event,
				transferInfo: 'Alias: EJEMPLO.ALIAS (datos de ejemplo)\nTitular: Nombre de ejemplo',
				replyTo,
				origin,
				confirmUrl: `${origin}/entradas/${SAMPLE_ORDER_ID}/confirmar?k=ejemplo`,
				fullHoldHours: 48
			});
		case 'stream':
			return buildStreamLinkEmail({
				...common,
				tickets,
				event,
				link: 'https://meet.example/ejemplo',
				origin
			});
		case 'reminder':
			return buildReminderEmail({
				...common,
				tickets,
				reminder: { kind: 'hours_before', hours: 48, enabled: true },
				event,
				origin
			});
		case 'refund':
			return buildRefundEmail({ ...common, event });
		default:
			return withPlaceholderQr(buildTicketEmail({ ...common, tickets, event, origin }));
	}
}

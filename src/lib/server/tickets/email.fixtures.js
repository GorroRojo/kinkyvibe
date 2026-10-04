/**
 * Entradas de prueba (datos inventados) para los tests de los mails: `email.golden.json` guarda
 * lo que devuelven los builders sin plantilla editable guardada, y `templates.test.js` comprueba
 * que salen byte a byte iguales. El HTML se regeneró a propósito con la plantilla común
 * (src/lib/server/email/layout.js); el asunto y el texto plano son los de antes.
 * Solo tests: la app no importa este archivo.
 */

const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {Partial<import('./orders.js').Order>} [o] @returns {import('./orders.js').Order} */
export function fixtureOrder(o = {}) {
	return /** @type {any} */ ({
		id: '3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b',
		event_slug: 'fiesta-de-prueba',
		ticket_type: 'general',
		quantity: 2,
		unit_price: 10000,
		fondo_option: 'fondo',
		fondo_percent: 20,
		fondo_amount: 4000,
		fondo_contribution: 0,
		subtotal: 16000,
		discount_code: 'AMIGUES',
		discount_amount: 1000,
		surcharge_amount: 307,
		total: 15307,
		payment_method: 'mercadopago',
		buyer_name: 'Persona <de> "Ejemplo" & Cía',
		buyer_pronouns: 'elle',
		buyer_email: 'persona@example.com',
		buyer_dni: '30111222',
		holders: null,
		status: 'approved',
		mp_preference_id: null,
		mp_payment_id: null,
		confirmed_by: null,
		email_sent_at: null,
		created_at: NOW,
		updated_at: NOW,
		expires_at: NOW + 48 * 3600000,
		...o
	});
}

/** @returns {import('./orders.js').Ticket[]} */
export function fixtureTickets() {
	return [
		{
			id: 't1',
			order_id: 'o',
			event_slug: 'fiesta-de-prueba',
			ticket_type: 'general',
			holder_name: 'Persona <de> "Ejemplo" & Cía',
			holder_pronouns: 'elle',
			token: 'TOKENDEPRUEBA1111111111111111111111111111111',
			code: '7HQ4XM',
			checked_in_at: null,
			checked_in_by: null
		},
		{
			id: 't2',
			order_id: 'o',
			event_slug: 'fiesta-de-prueba',
			ticket_type: 'general',
			holder_name: 'Otra Persona',
			holder_pronouns: null,
			token: 'TOKENDEPRUEBA2222222222222222222222222222222',
			code: 'K9P2ZT',
			checked_in_at: null,
			checked_in_by: null
		}
	];
}

const EVENT = {
	title: 'Fiesta <b>de</b> prueba',
	start: '2026-10-10T22:00:00-03:00',
	location: 'Calle Falsa 123',
	location_name: 'Lugar de ejemplo'
};
const ORIGIN = 'https://kinkyvibe.example';
const CONTACT = 'contacto@example.com';

/**
 * Casos: [nombre del builder, entrada]. Cubre presencial/online, con y sin link, recordatorios
 * de cada tipo, reembolso por cada medio y transferencia con y sin confirmación.
 * @returns {[string, string, any][]}
 */
export function emailCases() {
	const order = fixtureOrder();
	const tickets = fixtureTickets();
	return [
		[
			'tickets-presencial',
			'buildTicketEmail',
			{ order, tickets, event: EVENT, typeName: 'General', origin: ORIGIN, contactEmail: CONTACT }
		],
		[
			'tickets-online-sin-link',
			'buildTicketEmail',
			{
				order,
				tickets,
				event: { ...EVENT, online: true, streamLink: null },
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'tickets-online-con-link',
			'buildTicketEmail',
			{
				order: fixtureOrder({
					fondo_option: 'gorra',
					fondo_amount: 0,
					discount_code: null,
					discount_amount: 0,
					unit_price: 3000,
					subtotal: 6000,
					total: 6123
				}),
				tickets,
				event: { ...EVENT, online: true, streamLink: 'https://meet.example/abc?x=1&y=2' },
				typeName: 'A la gorra',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'stream',
			'buildStreamLinkEmail',
			{
				order,
				tickets,
				event: EVENT,
				link: 'https://meet.example/abc',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'stream-sin-entradas',
			'buildStreamLinkEmail',
			{
				order,
				tickets: [],
				event: { title: 'Sin fecha' },
				link: 'https://meet.example/abc',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'reminder-48h',
			'buildReminderEmail',
			{
				order,
				tickets,
				reminder: { kind: 'hours_before', hours: 48, enabled: true },
				event: EVENT,
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'reminder-hoy',
			'buildReminderEmail',
			{
				order,
				tickets: tickets.slice(0, 1),
				reminder: { kind: 'day_at', days: 0, time: '09:00', enabled: true },
				event: EVENT,
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'reminder-horas-online',
			'buildReminderEmail',
			{
				order,
				tickets,
				reminder: { kind: 'hours_before', hours: 3, enabled: true },
				event: { ...EVENT, online: true, streamLink: 'https://meet.example/abc' },
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'refund-mp',
			'buildRefundEmail',
			{ order, event: EVENT, typeName: 'General', contactEmail: CONTACT }
		],
		[
			'refund-transferencia',
			'buildRefundEmail',
			{
				order: fixtureOrder({ payment_method: 'transferencia', quantity: 1 }),
				event: { title: 'Sin fecha' },
				typeName: 'General',
				contactEmail: CONTACT
			}
		],
		[
			'refund-gratis',
			'buildRefundEmail',
			{
				order: fixtureOrder({ payment_method: 'gratis', total: 0 }),
				event: EVENT,
				typeName: 'General',
				contactEmail: CONTACT
			}
		],
		[
			'transfer-con-confirmar',
			'buildTransferEmail',
			{
				order: fixtureOrder({
					payment_method: 'transferencia',
					surcharge_amount: 0,
					total: 15000,
					expires_at: NOW + 2 * 3600000
				}),
				event: EVENT,
				typeName: 'General',
				transferInfo: 'Alias: EJEMPLO.PRUEBA\nTitular: <Nombre>',
				replyTo: 'entradas@example.com',
				contactEmail: CONTACT,
				origin: ORIGIN,
				confirmUrl: 'https://kinkyvibe.example/entradas/x/confirmar?k=abc&z=1',
				fullHoldHours: 48
			}
		],
		[
			'transfer-sin-confirmar',
			'buildTransferEmail',
			{
				order: fixtureOrder({
					payment_method: 'transferencia',
					surcharge_amount: 0,
					total: 15000,
					expires_at: NOW + 3600000
				}),
				event: EVENT,
				typeName: 'General',
				transferInfo: 'Alias: EJEMPLO.PRUEBA',
				contactEmail: CONTACT,
				origin: ORIGIN
			}
		]
	];
}

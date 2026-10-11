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
 * de cada tipo, reembolso por cada medio, transferencia con y sin confirmación y el aviso de
 * cambio de fecha (con y sin la fecha de antes).
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
			'transfer',
			'buildTransferEmail',
			{
				// Jueves 1/10 → vence el sábado 3/10 a las 20:00 (decisión 0031).
				order: fixtureOrder({
					payment_method: 'transferencia',
					surcharge_amount: 0,
					total: 15000,
					expires_at: Date.parse('2026-10-03T20:00:00-03:00')
				}),
				event: EVENT,
				typeName: 'General',
				transferInfo: 'Alias: EJEMPLO.PRUEBA\nTitular: <Nombre>',
				replyTo: 'entradas@example.com',
				contactEmail: CONTACT,
				origin: ORIGIN
			}
		],
		[
			'transfer-hasta-el-evento',
			'buildTransferEmail',
			{
				// El evento empieza antes del vencimiento por días hábiles: la reserva dura hasta ahí.
				order: fixtureOrder({
					payment_method: 'transferencia',
					surcharge_amount: 0,
					total: 15000,
					expires_at: Date.parse('2026-10-02T21:00:00-03:00')
				}),
				event: { ...EVENT, start: '2026-10-02T21:00:00-03:00' },
				typeName: 'General',
				transferInfo: 'Alias: EJEMPLO.PRUEBA',
				contactEmail: CONTACT,
				origin: ORIGIN
			}
		],
		[
			'date-change-presencial',
			'buildDateChangeEmail',
			{
				order,
				tickets,
				event: { ...EVENT, end: '2026-10-11T03:00:00-03:00' },
				previous: { start: '2026-10-03T21:00:00-03:00', end: '2026-10-04T02:00:00-03:00' },
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		],
		[
			'date-change-online-con-link',
			'buildDateChangeEmail',
			{
				order,
				tickets: tickets.slice(0, 1),
				event: { ...EVENT, online: true, streamLink: 'https://meet.example/abc?x=1&y=2' },
				previous: null,
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			}
		]
	];
}

/** El lugar guardado de los mails de la lista: viernes 2/10 a las 21:00. */
const HOLD_UNTIL = Date.parse('2026-10-02T21:00:00-03:00');
const LEAVE = `${ORIGIN}/lista-de-espera/salir/def?x=1&y=2`;
const OFFER = `${ORIGIN}/calendario/fiesta-de-prueba/entradas?lista=abc&x=1`;

/**
 * Casos de los mails de la lista de espera (waitlistEmail.js): [nombre, builder, entrada]. Van
 * aparte de {@link emailCases} porque no tienen compra ni nombre; sus golden también están en
 * `email.golden.json`. Por evento y por tipo, con lugar guardado y con aviso a toda la lista, y el
 * cierre por horario y por evento cancelado.
 * @returns {[string, string, any][]}
 */
export function waitlistEmailCases() {
	const common = { event: EVENT, unsubscribeUrl: LEAVE, origin: ORIGIN, contactEmail: CONTACT };
	return [
		[
			'waitlist-confirm',
			'buildWaitlistConfirmEmail',
			{
				...common,
				confirmUrl: `${ORIGIN}/lista-de-espera/confirmar/ghi?x=1&y=2`,
				expiresAt: NOW + 48 * 3600000,
				now: NOW
			}
		],
		[
			'waitlist-confirm-tipo',
			'buildWaitlistConfirmEmail',
			{
				...common,
				typeName: 'General <con> cena',
				confirmUrl: `${ORIGIN}/lista-de-espera/confirmar/ghi`,
				expiresAt: NOW + 48 * 3600000,
				now: NOW
			}
		],
		[
			'waitlist-offer',
			'buildWaitlistOfferEmail',
			{ ...common, offerUrl: OFFER, holdUntil: HOLD_UNTIL }
		],
		[
			'waitlist-offer-todes',
			'buildWaitlistOfferEmail',
			{ ...common, typeName: 'General', offerUrl: OFFER, holdUntil: null }
		],
		[
			'waitlist-reminder',
			'buildWaitlistReminderEmail',
			{ ...common, offerUrl: OFFER, holdUntil: HOLD_UNTIL }
		],
		[
			'waitlist-expired',
			'buildWaitlistExpiredEmail',
			{ ...common, rejoinUrl: `${ORIGIN}/lista-de-espera/volver/jkl?x=1&y=2` }
		],
		[
			'waitlist-closed',
			'buildWaitlistClosedEmail',
			{ ...common, reason: 'closed', eventUrl: `${ORIGIN}/calendario/fiesta-de-prueba` }
		],
		[
			'waitlist-closed-cancelado',
			'buildWaitlistClosedEmail',
			{
				...common,
				event: { title: 'Sin fecha' },
				reason: 'event_cancelled',
				eventUrl: `${ORIGIN}/calendario/fiesta-de-prueba`
			}
		]
	];
}

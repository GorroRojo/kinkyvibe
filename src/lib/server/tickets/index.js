/**
 * Pegamento entre las piezas de la venta de entradas y el entorno (variables, mocks de dev).
 *
 * Variables (ver docs/tickets.md): MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, RESEND_API_KEY,
 * TICKETS_FROM_EMAIL, TICKETS_REPLY_TO, TICKETS_CONTACT_EMAIL, SITE_URL, TICKETS_TRANSFER_INFO,
 * TICKETS_TRANSFER_HOLD_HOURS, TICKETS_MP_FEE_PERCENT. Solo en dev: MP_MOCK, TICKETS_DEV_FIXTURE.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { DEFAULT_CONTACT_EMAIL, parseFeePercent } from '$lib/utils/tickets.js';
import { buildTicketEmail, buildTransferEmail, maskEmail, sendWithResend } from './email.js';
import { getEventTickets } from './events.js';
import { createPreference, findPaymentByOrder, getPayment } from './mercadopago.js';
import { TRANSFER_HOLD_MS, applyPayment, getOrderTickets, markEmailSent } from './orders.js';

/** Secreto fijo del webhook para el checkout simulado en dev (no sirve para nada en producción). */
const DEV_MOCK_WEBHOOK_SECRET = 'dev-mock-webhook-secret';

/**
 * @typedef {{
 *   mock: boolean,
 *   createPreference: (preference: ReturnType<typeof import('./mercadopago.js').buildPreference>, idempotencyKey: string) => Promise<{ id: string, init_point: string }>,
 *   getPayment: (id: string) => Promise<import('./orders.js').MPPayment>,
 *   findPaymentByOrder: (orderId: string) => Promise<import('./orders.js').MPPayment | null>
 * }} Gateway
 */

/**
 * `true` solo en `vite dev` con MP_MOCK=1 o sin MP_ACCESS_TOKEN. `dev` es la constante `false`
 * en el build, así que en producción esto es siempre `false` y el mock no se incluye.
 */
export function isMpMock() {
	return dev && (env.MP_MOCK === '1' || !env.MP_ACCESS_TOKEN);
}

/**
 * Cliente de pagos: Mercado Pago real, el simulado (solo dev) o `null` si no está configurado.
 *
 * @param {typeof fetch} fetchFn
 * @returns {Promise<Gateway | null>}
 */
export async function getGateway(fetchFn) {
	if (dev && isMpMock()) {
		const { mockGateway } = await import('./mock.js');
		return mockGateway;
	}
	const accessToken = env.MP_ACCESS_TOKEN;
	if (!accessToken) return null;
	const client = { fetch: fetchFn, accessToken };
	return {
		mock: false,
		createPreference: (pref, key) => createPreference(client, pref, key),
		getPayment: (id) => getPayment(client, id),
		findPaymentByOrder: (orderId) => findPaymentByOrder(client, orderId)
	};
}

/**
 * Datos de la cuenta para transferencias (alias, CBU/CVU, titular…), de TICKETS_TRANSFER_INFO.
 * Se aceptan saltos de línea reales o escritos como `\n`. `null` si no está configurado: en ese
 * caso la opción "Transferencia" no se ofrece aunque el evento la habilite.
 */
export function transferInfo() {
	const raw = env.TICKETS_TRANSFER_INFO?.replaceAll('\\n', '\n').trim();
	return raw ? raw : null;
}

/** Cuánto se reserva el cupo esperando una transferencia (TICKETS_TRANSFER_HOLD_HOURS, 1–240 h). */
export function transferHoldMs() {
	const hours = Number(env.TICKETS_TRANSFER_HOLD_HOURS);
	if (!Number.isFinite(hours) || hours < 1 || hours > 240) return TRANSFER_HOLD_MS;
	return Math.round(hours * 60 * 60 * 1000);
}

/** Contacto público de la organización (política de devoluciones, cambios de titular…). */
export function contactEmail() {
	return env.TICKETS_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;
}

/** Dirección para responder los mails (y mandar comprobantes): TICKETS_REPLY_TO o el contacto. */
export function replyToAddress() {
	return env.TICKETS_REPLY_TO?.trim() || contactEmail();
}

let warnedFee = false;

/**
 * Comisión de Mercado Pago que se suma como recargo, en centésimos de punto (773 = 7,73 %):
 * la del evento (`mp_fee_percent`) o TICKETS_MP_FEE_PERCENT. 0 si no hay ninguna (sin recargo).
 *
 * @param {{ mpFeeBasisPoints: number | null } | null | undefined} config
 */
export function mpFeeBasisPoints(config) {
	if (config?.mpFeeBasisPoints !== null && config?.mpFeeBasisPoints !== undefined) {
		return config.mpFeeBasisPoints;
	}
	const raw = env.TICKETS_MP_FEE_PERCENT;
	const parsed = parseFeePercent(raw);
	if (parsed === null && raw && !warnedFee) {
		warnedFee = true;
		console.error(`[tickets] TICKETS_MP_FEE_PERCENT inválido ("${raw}"): no se cobra recargo`);
	}
	return parsed ?? 0;
}

/** Secreto para verificar webhooks, o `null` si no está configurado. */
export function webhookSecret() {
	if (env.MP_WEBHOOK_SECRET) return env.MP_WEBHOOK_SECRET;
	if (dev && isMpMock()) return DEV_MOCK_WEBHOOK_SECRET;
	return null;
}

/**
 * Origen público del sitio para links en emails y URLs de MP.
 *
 * @param {URL} url
 */
export function siteOrigin(url) {
	const configured = env.SITE_URL?.trim().replace(/\/+$/, '');
	return configured || url.origin;
}

/**
 * Aplica un pago y, si recién se aprobó, manda el email con las entradas (en segundo plano si la
 * plataforma lo permite, para contestarle rápido a MP).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   payment: import('./orders.js').MPPayment,
 *   origin: string,
 *   fetch: typeof fetch,
 *   platform?: App.Platform
 * }} input
 */
export async function processPayment({ db, payment, origin, fetch: fetchFn, platform }) {
	const result = await applyPayment(db, payment);
	if (result.outcome === 'unknown-order') {
		console.warn(`[tickets] pago ${payment.id} sin orden conocida`);
	}
	if (result.newlyApproved && result.order) {
		const order = result.order;
		const sending = sendOrderEmail({ db, order, tickets: result.tickets, origin, fetch: fetchFn });
		const ctx = platform?.ctx;
		if (ctx?.waitUntil) ctx.waitUntil(sending);
		else await sending;
	}
	return result;
}

/**
 * Manda (o, sin RESEND_API_KEY, loguea) el email con las entradas de una orden aprobada.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   order: import('./orders.js').Order,
 *   tickets?: import('./orders.js').Ticket[],
 *   origin: string,
 *   fetch: typeof fetch,
 *   idempotent?: boolean
 * }} input
 * @returns {Promise<boolean>} si se envió
 */
export async function sendOrderEmail({
	db,
	order,
	tickets,
	origin,
	fetch: fetchFn,
	idempotent = true
}) {
	try {
		const list = tickets?.length ? tickets : await getOrderTickets(db, order.id);
		const config = await getEventTickets(order.event_slug);
		const typeName =
			config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type;
		const message = buildTicketEmail({
			order,
			tickets: list,
			event: {
				title: config?.title || order.event_slug,
				start: config?.start,
				location: config?.location,
				location_name: config?.location_name
			},
			typeName,
			origin,
			contactEmail: contactEmail()
		});
		const apiKey = env.RESEND_API_KEY;
		if (!apiKey) {
			if (dev) {
				// Nunca logueamos el token completo: con él se entra al evento.
				console.log(
					`[tickets:email simulado] para ${maskEmail(order.buyer_email)} · "${message.subject}"\n` +
						list.map((t) => `  ${origin}/entradas/t/${t.token.slice(0, 6)}…`).join('\n')
				);
			} else {
				console.error(
					`[tickets] falta RESEND_API_KEY: no se mandó el email de la orden ${order.id}`
				);
			}
			return false;
		}
		await sendWithResend({
			fetch: fetchFn,
			apiKey,
			from: env.TICKETS_FROM_EMAIL || 'KinkyVibe <entradas@kinkyvibe.ar>',
			to: order.buyer_email,
			replyTo: replyToAddress(),
			message,
			idempotencyKey: idempotent ? `tickets-${order.id}` : undefined
		});
		await markEmailSent(db, order.id);
		return true;
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el email de la orden ${order.id}:`, error);
		return false;
	}
}

/**
 * Manda (o, sin RESEND_API_KEY, loguea) el email con los datos para transferir.
 *
 * @param {{
 *   order: import('./orders.js').Order,
 *   origin: string,
 *   fetch: typeof fetch
 * }} input
 * @returns {Promise<boolean>} si se envió
 */
export async function sendTransferEmail({ order, origin, fetch: fetchFn }) {
	try {
		const info = transferInfo();
		if (!info) throw new Error('falta TICKETS_TRANSFER_INFO');
		const config = await getEventTickets(order.event_slug);
		const message = buildTransferEmail({
			order,
			event: { title: config?.title || order.event_slug, start: config?.start },
			typeName: config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
			transferInfo: info,
			replyTo: replyToAddress(),
			contactEmail: contactEmail(),
			origin
		});
		const apiKey = env.RESEND_API_KEY;
		if (!apiKey) {
			if (dev) {
				console.log(
					`[tickets:email simulado] para ${maskEmail(order.buyer_email)} · "${message.subject}"`
				);
			} else {
				console.error(
					`[tickets] falta RESEND_API_KEY: no se mandó el email de la orden ${order.id}`
				);
			}
			return false;
		}
		await sendWithResend({
			fetch: fetchFn,
			apiKey,
			from: env.TICKETS_FROM_EMAIL || 'KinkyVibe <entradas@kinkyvibe.ar>',
			to: order.buyer_email,
			replyTo: replyToAddress(),
			message,
			idempotencyKey: `transfer-${order.id}`
		});
		return true;
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el email de transferencia ${order.id}:`, error);
		return false;
	}
}

/**
 * Manda el email de las entradas en segundo plano si la plataforma lo permite.
 *
 * @param {Promise<unknown>} task
 * @param {App.Platform | undefined} platform
 */
export async function inBackground(task, platform) {
	const ctx = platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	else await task;
}

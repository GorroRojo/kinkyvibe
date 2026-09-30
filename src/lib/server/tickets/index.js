/**
 * Pegamento entre las piezas de la venta de entradas y el entorno (variables, mocks de dev).
 *
 * Variables (ver docs/tickets.md): MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, RESEND_API_KEY,
 * TICKETS_FROM_EMAIL, TICKETS_REPLY_TO, TICKETS_CONTACT_EMAIL, SITE_URL, TICKETS_TRANSFER_INFO,
 * TICKETS_TRANSFER_HOLD_HOURS, TICKETS_MP_FEE_PERCENT, EMAIL_ALLOWLIST (obligatoria para mandar
 * mails desde un preview; ver emailGuard.js). Solo en dev: MP_MOCK, TICKETS_DEV_FIXTURE.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	DEFAULT_CONTACT_EMAIL,
	DEFAULT_MP_FEE_PERCENT,
	parseFeePercent
} from '$lib/utils/tickets.js';
import {
	buildRefundEmail,
	buildReminderEmail,
	buildStreamLinkEmail,
	buildTicketEmail,
	buildTransferEmail,
	maskEmail,
	sendWithResend
} from './email.js';
import { parseAllowlist, routeEmail } from './emailGuard.js';
import { getEventTickets, listTicketedEvents } from './events.js';
import { isPreviewDeploy } from '../deploy.js';
import { sha256Hex } from '../hash.js';
import { createPreference, findPaymentByOrder, getPayment, refundPayment } from './mercadopago.js';
import { TRANSFER_HOLD_MS, applyPayment, getOrderTickets, markEmailSent } from './orders.js';
import {
	DEFAULT_FROM_EMAIL,
	DEFAULT_REPLY_TO,
	getSalesSettings,
	transferInfoFromSettings
} from './settings.js';
import { parseReminders, reminderId, sendDueReminders } from './reminders.js';
import { confirmUrl } from './safeguards.js';
import {
	claimStreamLinkSend,
	getStreamLink,
	releaseStreamLinkSend,
	sendStreamLinkToAll
} from './stream.js';

/** Secreto fijo del webhook para el checkout simulado en dev (no sirve para nada en producción). */
const DEV_MOCK_WEBHOOK_SECRET = 'dev-mock-webhook-secret';

/**
 * @typedef {{
 *   mock: boolean,
 *   createPreference: (preference: ReturnType<typeof import('./mercadopago.js').buildPreference>, idempotencyKey: string) => Promise<{ id: string, init_point: string }>,
 *   getPayment: (id: string) => Promise<import('./orders.js').MPPayment>,
 *   findPaymentByOrder: (orderId: string) => Promise<import('./orders.js').MPPayment | null>,
 *   refundPayment: (paymentId: string, idempotencyKey: string) => Promise<{ id: number | string, status?: string }>
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
		findPaymentByOrder: (orderId) => findPaymentByOrder(client, orderId),
		refundPayment: (id, key) => refundPayment(client, id, key)
	};
}

/**
 * Datos de la cuenta para transferencias de TICKETS_TRANSFER_INFO (la variable de entorno, que
 * se usa si no hay nada cargado en /admin/entradas/ajustes). Se aceptan saltos de línea reales
 * o escritos como `\n`. `null` si no está configurada.
 */
export function envTransferInfo() {
	const raw = env.TICKETS_TRANSFER_INFO?.replaceAll('\\n', '\n').trim();
	return raw ? raw : null;
}

/**
 * Datos para transferir (alias, CBU/CVU, titular, banco): los de /admin/entradas/ajustes o, si
 * no hay ninguno cargado, TICKETS_TRANSFER_INFO. `null` si no hay ninguno: en ese caso la opción
 * "Transferencia" no se ofrece aunque el evento la habilite.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function transferInfo(db) {
	try {
		const fromSettings = transferInfoFromSettings(await getSalesSettings(db));
		if (fromSettings) return fromSettings;
	} catch (error) {
		console.error('[tickets] no se pudieron leer los ajustes de venta:', error);
	}
	return envTransferInfo();
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

/**
 * Remitente y dirección de respuesta de los mails (y adonde se mandan los comprobantes): los de
 * /admin/entradas/ajustes o, vacíos, TICKETS_FROM_EMAIL / TICKETS_REPLY_TO, o los de por defecto
 * ("KinkyVibe <entradas@kinkyvibe.ar>" y entradas@kinkyvibe.ar).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function emailSettings(db) {
	/** @type {{ from_email?: string, reply_to_email?: string }} */
	let s = {};
	try {
		s = await getSalesSettings(db);
	} catch (error) {
		console.error('[tickets] no se pudieron leer los ajustes de venta:', error);
	}
	return {
		from: s.from_email || env.TICKETS_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
		replyTo: s.reply_to_email || env.TICKETS_REPLY_TO?.trim() || DEFAULT_REPLY_TO
	};
}

/**
 * Dirección para responder los mails y mandar comprobantes (ver `emailSettings`).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function replyToAddress(db) {
	return (await emailSettings(db)).replyTo;
}

let warnedFee = false;

/**
 * Comisión de Mercado Pago que se suma como recargo, en centésimos de punto (773 = 7,73 %). En
 * orden: la del evento (`mp_fee_percent`), la de /admin/entradas/ajustes, TICKETS_MP_FEE_PERCENT
 * o, si no hay ninguna, DEFAULT_MP_FEE_PERCENT (2 %). Con `0` en cualquiera, sin recargo.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {{ mpFeeBasisPoints: number | null } | null | undefined} config
 */
export async function mpFeeBasisPoints(db, config) {
	if (config?.mpFeeBasisPoints !== null && config?.mpFeeBasisPoints !== undefined) {
		return config.mpFeeBasisPoints;
	}
	try {
		const fromSettings = parseFeePercent((await getSalesSettings(db)).mp_fee_percent);
		if (fromSettings !== null) return fromSettings;
	} catch (error) {
		console.error('[tickets] no se pudieron leer los ajustes de venta:', error);
	}
	return envMpFeeBasisPoints();
}

/**
 * TICKETS_MP_FEE_PERCENT en centésimos de punto; si no está (o es inválida), la comisión por
 * defecto (DEFAULT_MP_FEE_PERCENT).
 */
export function envMpFeeBasisPoints() {
	const raw = env.TICKETS_MP_FEE_PERCENT;
	const parsed = parseFeePercent(raw);
	if (parsed === null && raw && !warnedFee) {
		warnedFee = true;
		console.error(
			`[tickets] TICKETS_MP_FEE_PERCENT inválido ("${raw}"): se usa ${DEFAULT_MP_FEE_PERCENT} %`
		);
	}
	return parsed ?? Math.round(DEFAULT_MP_FEE_PERCENT * 100);
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
	const result = await applyPayment(db, payment, {
		// Para marcar una aprobación tardía que pasa el cupo (ver applyPayment). Tipo sin cupo:
		// Infinity (nunca se pasa); tipo que ya no existe: null (se revisa).
		capacityOf: async (order) => {
			const type = (await getEventTickets(order.event_slug))?.types.find(
				(t) => t.id === order.ticket_type
			);
			if (!type) return null;
			return type.capacity ?? Number.POSITIVE_INFINITY;
		}
	});
	if (result.outcome === 'unknown-order') {
		console.warn(`[tickets] pago ${payment.id} sin orden conocida`);
	}
	if (result.outcome === 'updated' && result.order?.status === 'refunded') {
		// Reembolso hecho desde el panel de MP (o contracargo): avisar una vez (solo quien cambió
		// el estado llega acá; un reembolso hecho desde nuestro admin ya lo avisó).
		await inBackground(sendRefundEmail({ db, order: result.order, fetch: fetchFn }), platform);
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
 * Manda un mail con Resend. Sin RESEND_API_KEY: en dev lo resume en la consola (`simulated`),
 * en producción loguea un error (`failed`). En un preview, solo a EMAIL_ALLOWLIST (emailGuard.js).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database | null | undefined,
 *   fetch: typeof fetch,
 *   to: string,
 *   message: { subject: string, html: string, text: string },
 *   idempotencyKey?: string,
 *   log?: string
 * }} input
 * @returns {Promise<'sent' | 'simulated' | 'failed'>}
 */
async function deliver({ db, fetch: fetchFn, to, message, idempotencyKey, log = '' }) {
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) {
		if (dev) {
			console.log(
				`[tickets:email simulado] para ${maskEmail(to)} · "${message.subject}"${log ? `\n${log}` : ''}`
			);
			return 'simulated';
		}
		console.error(`[tickets] falta RESEND_API_KEY: no se mandó "${message.subject}"`);
		return 'failed';
	}
	const route = routeEmail({
		to,
		subject: message.subject,
		preview: isPreviewDeploy(),
		allowlist: parseAllowlist(env.EMAIL_ALLOWLIST)
	});
	if (!route) {
		console.warn(`[tickets] preview sin EMAIL_ALLOWLIST: no se mandó "${message.subject}"`);
		return 'simulated';
	}
	const { from, replyTo } = await emailSettings(db);
	await sendWithResend({
		fetch: fetchFn,
		apiKey,
		from,
		to: route.to,
		replyTo,
		message: { ...message, subject: route.subject },
		idempotencyKey
	});
	return 'sent';
}

/**
 * Link de la transmisión de un evento online (o `null`), sin romper si falta la tabla.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
export async function streamLinkFor(db, slug) {
	try {
		return (await getStreamLink(db, slug))?.link ?? null;
	} catch (error) {
		console.error(`[tickets] no se pudo leer el link de ${slug}:`, error);
		return null;
	}
}

/**
 * Manda (o, sin RESEND_API_KEY, loguea) el email con las entradas de una orden aprobada. En los
 * eventos online, si ya hay link de la transmisión, va en el mail y queda registrado (así
 * "Enviar el link a todes" no se lo vuelve a mandar).
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
	/** @type {string | null} */
	let claimedLink = null;
	try {
		const list = tickets?.length ? tickets : await getOrderTickets(db, order.id);
		const config = await getEventTickets(order.event_slug);
		const typeName =
			config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type;
		const online = Boolean(config?.online);
		const streamLink = online ? await streamLinkFor(db, order.event_slug) : null;
		if (streamLink && (await claimStreamLinkSend(db, { orderId: order.id, link: streamLink }))) {
			claimedLink = streamLink;
		}
		const message = buildTicketEmail({
			order,
			tickets: list,
			event: {
				title: config?.title || order.event_slug,
				start: config?.start,
				location: config?.location,
				location_name: config?.location_name,
				online,
				streamLink
			},
			typeName,
			origin,
			contactEmail: contactEmail()
		});
		const result = await deliver({
			db,
			fetch: fetchFn,
			to: order.buyer_email,
			message,
			idempotencyKey: idempotent ? `tickets-${order.id}` : undefined,
			// Nunca logueamos el token completo: con él se entra al evento.
			log: list
				.map((t) => `  ${origin}/entradas/t/${t.token.slice(0, 6)}… (${t.code ?? 'sin código'})`)
				.join('\n')
		});
		if (result === 'failed' && claimedLink) {
			await releaseStreamLinkSend(db, { orderId: order.id, link: claimedLink });
		}
		if (result !== 'sent') return false;
		await markEmailSent(db, order.id);
		return true;
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el email de la orden ${order.id}:`, error);
		if (claimedLink) {
			await releaseStreamLinkSend(db, { orderId: order.id, link: claimedLink }).catch(() => {});
		}
		return false;
	}
}

/**
 * "Enviar el link a todes": manda el link de la transmisión a cada orden aprobada del evento
 * que todavía no lo recibió (idempotente por valor del link; ver stream.js).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   eventSlug: string,
 *   link: string,
 *   origin: string,
 *   fetch: typeof fetch
 * }} input
 */
export async function sendStreamLinkEmails({ db, eventSlug, link, origin, fetch: fetchFn }) {
	const config = await getEventTickets(eventSlug);
	const event = { title: config?.title || eventSlug, start: config?.start };
	// Los primeros 8 bytes del hash del link (cambia si cambia el link).
	const key = (await sha256Hex(link)).slice(0, 16);
	return sendStreamLinkToAll(db, {
		eventSlug,
		link,
		send: async (order) => {
			const tickets = await getOrderTickets(db, order.id);
			const message = buildStreamLinkEmail({
				order,
				tickets,
				event,
				link,
				origin,
				contactEmail: contactEmail()
			});
			const result = await deliver({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message,
				idempotencyKey: `stream-${order.id}-${key}`
			});
			return result !== 'failed';
		}
	});
}

/**
 * Manda (o, sin RESEND_API_KEY, loguea) el email con los datos para transferir.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   order: import('./orders.js').Order,
 *   origin: string,
 *   fetch: typeof fetch
 * }} input
 * @returns {Promise<boolean>} si se envió
 */
export async function sendTransferEmail({ db, order, origin, fetch: fetchFn }) {
	try {
		const info = await transferInfo(db);
		if (!info) throw new Error('no hay datos para transferir configurados');
		const config = await getEventTickets(order.event_slug);
		const message = buildTransferEmail({
			order,
			event: { title: config?.title || order.event_slug, start: config?.start },
			typeName: config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
			transferInfo: info,
			replyTo: await replyToAddress(db),
			contactEmail: contactEmail(),
			origin,
			confirmUrl: await confirmUrl(db, origin, order.id),
			fullHoldHours: Math.round(transferHoldMs() / 3600000)
		});
		const result = await deliver({
			db,
			fetch: fetchFn,
			to: order.buyer_email,
			message,
			idempotencyKey: `transfer-${order.id}`
		});
		return result === 'sent';
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el email de transferencia ${order.id}:`, error);
		return false;
	}
}

/**
 * Avisa por mail que la compra se reembolsó (idempotente del lado de Resend por orden).
 *
 * @param {{ db: import('@cloudflare/workers-types').D1Database, order: import('./orders.js').Order, fetch: typeof fetch }} input
 */
export async function sendRefundEmail({ db, order, fetch: fetchFn }) {
	// Una venta en la puerta puede no tener email.
	if (!order.buyer_email) return false;
	try {
		const config = await getEventTickets(order.event_slug);
		const message = buildRefundEmail({
			order,
			event: { title: config?.title || order.event_slug, start: config?.start },
			typeName: config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
			contactEmail: contactEmail()
		});
		const result = await deliver({
			db,
			fetch: fetchFn,
			to: order.buyer_email,
			message,
			idempotencyKey: `refund-${order.id}`
		});
		return result !== 'failed';
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el aviso de reembolso de ${order.id}:`, error);
		return false;
	}
}

/**
 * Manda los recordatorios que tocan ahora (lo llama POST /api/cron/recordatorios). Ver
 * reminders.js: idempotente, solo órdenes aprobadas de eventos que no empezaron.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   origin: string,
 *   fetch: typeof fetch,
 *   now?: number
 * }} input
 */
export async function sendReminderEmails({ db, origin, fetch: fetchFn, now = Date.now() }) {
	const settings = await getSalesSettings(db);
	const reminders = parseReminders(settings.reminders);
	const ticketed = await listTicketedEvents();
	const events = ticketed
		.map(({ slug, config }) => ({
			slug,
			config,
			start: config.start ? Date.parse(config.start) : NaN,
			reminders: config.reminders,
			cancelled: config.status === 'cancelado'
		}))
		.filter((e) => Number.isFinite(e.start));
	const bySlug = new Map(events.map((e) => [e.slug, e]));
	/** @type {Map<string, string | null>} */
	const links = new Map();
	return sendDueReminders(db, {
		events,
		reminders,
		now,
		send: async (order, reminder) => {
			const e = bySlug.get(order.event_slug);
			if (!e) return false;
			const config = e.config;
			if (config.online && !links.has(e.slug)) links.set(e.slug, await streamLinkFor(db, e.slug));
			const tickets = await getOrderTickets(db, order.id);
			const message = buildReminderEmail({
				order,
				tickets,
				reminder,
				event: {
					title: config.title || e.slug,
					start: config.start,
					location: config.location,
					location_name: config.location_name,
					online: config.online,
					streamLink: config.online ? (links.get(e.slug) ?? null) : null
				},
				typeName: config.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
				origin,
				contactEmail: contactEmail()
			});
			const result = await deliver({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message,
				idempotencyKey: `reminder-${order.id}-${reminderId(reminder)}`
			});
			return result !== 'failed';
		}
	});
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

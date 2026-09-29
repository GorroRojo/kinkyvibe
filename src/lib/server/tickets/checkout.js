/**
 * Compra de entradas desde la página del evento: datos para el bloque "Comprar entradas" y la
 * form action que reserva cupo, crea la preferencia de Mercado Pago y redirige al checkout.
 */
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { MAX_PER_ORDER, salesState, validatePurchase } from './config.js';
import { getEventTickets } from './events.js';
import { getGateway, isMpMock, siteOrigin } from './index.js';
import { buildPreference } from './mercadopago.js';
import {
	cancelPendingOrder,
	getCounts,
	isValidOrderId,
	reserveOrder,
	setPreference
} from './orders.js';

/** Cookie httpOnly con las últimas órdenes de este navegador (para ver sus entradas al volver). */
export const ORDERS_COOKIE = 'kv_orders';
const MAX_REMEMBERED_ORDERS = 5;

/** Límites anti-abuso para crear órdenes (cada una reserva cupo 20 minutos). */
export const CHECKOUT_RATE_LIMITS = {
	event: { limit: 30, windowSeconds: 60 },
	email: { limit: 5, windowSeconds: 10 * 60 }
};

/**
 * @typedef {{
 *   open: boolean,
 *   reason: 'cancelled' | 'soldout' | 'closed' | 'unavailable' | null,
 *   closesAt: number | null,
 *   maxPerOrder: number,
 *   mock: boolean,
 *   types: { id: string, name: string, price: number, available: number }[]
 * }} TicketsView
 */

/**
 * Datos públicos del bloque de compra (sin datos de otras personas).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @returns {Promise<TicketsView | null>} `null` si el evento no vende entradas
 */
export async function getTicketsView(db, slug) {
	const config = await getEventTickets(slug);
	if (!config) return null;
	const state = salesState(config);
	const configured = Boolean(env.MP_ACCESS_TOKEN) || isMpMock();
	/** @type {TicketsView} */
	const view = {
		open: false,
		reason: state.open ? null : state.reason,
		closesAt: config.closesAt,
		maxPerOrder: MAX_PER_ORDER,
		mock: isMpMock(),
		types: config.types.map((t) => ({ id: t.id, name: t.name, price: t.price, available: 0 }))
	};
	if (!db || !configured) return { ...view, reason: view.reason ?? 'unavailable' };
	try {
		const counts = await getCounts(db, slug);
		for (const t of view.types) {
			const c = counts.get(t.id);
			const capacity = config.types.find((ct) => ct.id === t.id)?.capacity ?? 0;
			t.available = Math.max(0, capacity - (c ? c.sold + c.held : 0));
		}
	} catch (error) {
		logDBError('tickets view', error);
		return { ...view, reason: view.reason ?? 'unavailable' };
	}
	if (!state.open) return view;
	const anyLeft = view.types.some((t) => t.available > 0);
	return { ...view, open: anyLeft, reason: anyLeft ? null : 'soldout' };
}

/** @param {string} text */
async function sha256Hex(text) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Órdenes recordadas por este navegador.
 *
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @returns {string[]}
 */
export function rememberedOrders(cookies) {
	return (cookies.get(ORDERS_COOKIE) ?? '').split('.').filter(isValidOrderId);
}

/**
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {URL} url
 * @param {string} orderId
 */
function rememberOrder(cookies, url, orderId) {
	const ids = [orderId, ...rememberedOrders(cookies).filter((id) => id !== orderId)];
	cookies.set(ORDERS_COOKIE, ids.slice(0, MAX_REMEMBERED_ORDERS).join('.'), {
		path: '/entradas',
		httpOnly: true,
		sameSite: 'lax',
		secure: !(url.hostname === 'localhost' && url.protocol === 'http:'),
		maxAge: 60 * 60 * 24 * 7
	});
}

/**
 * Form action `?/buy`.
 *
 * @param {import('@sveltejs/kit').RequestEvent & { params: { event: string } }} event
 */
export async function buyAction({ params, platform, request, url, fetch, cookies }) {
	const db = getDB(platform);
	const form = await request.formData();
	const values = {
		type: String(form.get('type') ?? ''),
		quantity: String(form.get('quantity') ?? '1'),
		name: String(form.get('name') ?? '').slice(0, 200),
		email: String(form.get('email') ?? '').slice(0, 300)
	};
	/** @param {number} status @param {string} error @param {Record<string, string>} [errors] */
	const failWith = (status, error, errors = {}) => fail(status, { buy: { error, errors, values } });

	if (!db) return failWith(503, 'La venta de entradas no está disponible ahora.');
	const config = await getEventTickets(params.event);
	if (!config) return failWith(404, 'Este evento no vende entradas por acá.');
	const state = salesState(config);
	if (!state.open) {
		return failWith(
			409,
			state.reason === 'closed' ? 'La venta online ya cerró.' : 'No hay entradas a la venta.'
		);
	}
	const gateway = await getGateway(fetch);
	if (!gateway) return failWith(503, 'La venta online no está disponible ahora.');

	const valid = validatePurchase(config, {
		type: values.type,
		quantity: values.quantity,
		name: values.name,
		email: values.email,
		accept: form.get('accept')
	});
	if (!valid.ok) return failWith(400, 'Revisá los datos marcados.', valid.errors);

	/** @type {Awaited<ReturnType<typeof reserveOrder>>} */
	let reserved;
	try {
		const perEvent = await hitRateLimit(
			db,
			`tickets:e:${params.event}`,
			CHECKOUT_RATE_LIMITS.event
		);
		const perEmail = perEvent.allowed
			? await hitRateLimit(
					db,
					`tickets:m:${await sha256Hex(valid.email)}`,
					CHECKOUT_RATE_LIMITS.email
				)
			: perEvent;
		if (!perEvent.allowed || !perEmail.allowed) {
			return failWith(429, 'Demasiados intentos seguidos. Probá de nuevo en unos minutos.');
		}
		reserved = await reserveOrder(db, {
			eventSlug: params.event,
			type: valid.type,
			quantity: valid.quantity,
			name: valid.name,
			email: valid.email
		});
	} catch (error) {
		logDBError('reserve order', error);
		return failWith(500, 'No pudimos reservar tus entradas. Probá de nuevo más tarde.');
	}
	if (!reserved.ok) {
		return failWith(
			409,
			reserved.available > 0
				? `Solo quedan ${reserved.available} entradas ${valid.type.name}.`
				: `Se agotaron las entradas ${valid.type.name} (puede liberarse alguna reserva en unos minutos).`
		);
	}

	const order = reserved.order;
	/** @type {string} */
	let checkoutUrl;
	try {
		const preference = buildPreference({
			order,
			eventTitle: config.title,
			typeName: valid.type.name,
			origin: siteOrigin(url)
		});
		const created = await gateway.createPreference(preference, order.id);
		await setPreference(db, order.id, created.id);
		checkoutUrl = created.init_point;
	} catch (error) {
		console.error(`[tickets] no se pudo crear la preferencia de la orden ${order.id}:`, error);
		await cancelPendingOrder(db, order.id).catch((e) => logDBError('cancel order', e));
		return failWith(502, 'No pudimos conectar con Mercado Pago. Probá de nuevo en un ratito.');
	}
	rememberOrder(cookies, url, order.id);
	redirect(303, checkoutUrl);
}

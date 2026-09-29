/**
 * Compra de entradas desde la página del evento: datos para el bloque "Comprar entradas", la
 * form action `?/discount` (botón "Aplicar" del código) y la form action `?/buy`, que reserva
 * cupo y, según el medio de pago, redirige al checkout de Mercado Pago, a los datos para
 * transferir o (total 0) emite las entradas directamente.
 */
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { MAX_TICKETS_PER_FORM, computePrice } from '$lib/utils/tickets.js';
import { salesState, validatePurchase } from './config.js';
import { checkDiscountCode } from './discounts.js';
import { getEventTickets } from './events.js';
import {
	contactEmail,
	getGateway,
	inBackground,
	isMpMock,
	mpFeeBasisPoints,
	sendOrderEmail,
	sendTransferEmail,
	siteOrigin,
	transferHoldMs,
	transferInfo
} from './index.js';
import { buildPreference } from './mercadopago.js';
import {
	approveFreeOrder,
	cancelPendingOrder,
	getCounts,
	isValidOrderId,
	reserveOrder,
	setPreference
} from './orders.js';

/** Cookie httpOnly con las últimas órdenes de este navegador (para ver sus entradas al volver). */
export const ORDERS_COOKIE = 'kv_orders';
const MAX_REMEMBERED_ORDERS = 5;

/** Límites anti-abuso para crear órdenes (cada una reserva cupo) y probar códigos. */
export const CHECKOUT_RATE_LIMITS = {
	event: { limit: 30, windowSeconds: 60 },
	email: { limit: 5, windowSeconds: 10 * 60 },
	code: { limit: 20, windowSeconds: 10 * 60 }
};

/**
 * @typedef {{
 *   open: boolean,
 *   reason: 'cancelled' | 'soldout' | 'closed' | 'unavailable' | null,
 *   closesAt: number | null,
 *   maxQuantity: number,
 *   mock: boolean,
 *   methods: import('./config.js').PaymentMethod[],
 *   transferHoldHours: number,
 *   feeBasisPoints: number,
 *   contactEmail: string,
 *   types: { id: string, name: string, price: number, fondo: number, available: number }[]
 * }} TicketsView
 */

/**
 * Medios de pago del evento que además están configurados en este entorno.
 *
 * @param {import('./config.js').EventTickets} config
 */
function availableMethods(config) {
	return config.paymentMethods.filter((m) =>
		m === 'mercadopago' ? Boolean(env.MP_ACCESS_TOKEN) || isMpMock() : Boolean(transferInfo())
	);
}

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
	const methods = availableMethods(config);
	/** @type {TicketsView} */
	const view = {
		open: false,
		reason: state.open ? null : state.reason,
		closesAt: config.closesAt,
		maxQuantity: MAX_TICKETS_PER_FORM,
		mock: isMpMock() && methods.includes('mercadopago'),
		methods,
		transferHoldHours: Math.round(transferHoldMs() / 3600000),
		feeBasisPoints: mpFeeBasisPoints(config),
		contactEmail: contactEmail(),
		types: config.types.map((t) => ({
			id: t.id,
			name: t.name,
			price: t.price,
			fondo: t.fondo,
			available: 0
		}))
	};
	if (!db || !methods.length) return { ...view, reason: view.reason ?? 'unavailable' };
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
 * Lee el formulario de compra. Quien compra: `name`, `email`, `dni`. Los datos por entrada
 * vienen como `holder_<campo>_<n>`.
 *
 * @param {FormData} form
 */
function readForm(form) {
	const quantity = String(form.get('quantity') ?? '1').slice(0, 5);
	const n = Math.max(1, Math.min(MAX_TICKETS_PER_FORM, Math.trunc(Number(quantity)) || 1));
	/** @param {string} key @param {number} max */
	const str = (key, max) => String(form.get(key) ?? '').slice(0, max);
	return {
		type: str('type', 60),
		quantity,
		name: str('name', 200),
		email: str('email', 300),
		dni: str('dni', 40),
		code: str('code', 60).trim(),
		method: str('method', 30),
		option: str('option', 30),
		holders: Array.from({ length: n }, (_, i) => ({
			name: str(`holder_name_${i}`, 200),
			pronouns: str(`holder_pronouns_${i}`, 100)
		}))
	};
}

/**
 * @typedef {{ code: string, kind: 'percent' | 'fixed', value: number, message: string }} AppliedDiscount
 */

/**
 * @param {import('./discounts.js').DiscountCode} d
 * @returns {AppliedDiscount}
 */
function describeDiscount(d) {
	const what =
		d.kind === 'percent'
			? `${d.value}% de descuento`
			: `$ ${d.value.toLocaleString('es-AR')} de descuento`;
	return { code: d.code, kind: d.kind, value: d.value, message: `Código ${d.code}: ${what}.` };
}

/**
 * Form action `?/discount` (botón "Aplicar"): dice si el código sirve para este evento y
 * cuánto descuenta. Es solo informativo; `?/buy` vuelve a validar todo.
 *
 * @param {import('@sveltejs/kit').RequestEvent & { params: { event: string } }} event
 */
export async function discountAction({ params, platform, request, getClientAddress }) {
	const db = getDB(platform);
	const values = readForm(await request.formData());
	/** @param {number} status @param {string} message */
	const failWith = (status, message) =>
		fail(status, { buy: { error: null, errors: { code: message }, values, discount: null } });
	if (!db) return failWith(503, 'No se pueden validar códigos ahora.');
	if (!values.code) return failWith(400, 'Escribí el código.');
	const config = await getEventTickets(params.event);
	if (!config) return failWith(404, 'Este evento no vende entradas por acá.');
	try {
		const limit = await hitRateLimit(
			db,
			`tickets:c:${await sha256Hex(`${params.event}:${getClientAddress()}`)}`,
			CHECKOUT_RATE_LIMITS.code
		);
		if (!limit.allowed) return failWith(429, 'Demasiados intentos. Probá en unos minutos.');
		const check = await checkDiscountCode(db, { code: values.code, eventSlug: params.event });
		if (!check.ok) return failWith(400, check.message);
		return { buy: { error: null, errors: {}, values, discount: describeDiscount(check.discount) } };
	} catch (error) {
		logDBError('check discount code', error);
		return failWith(500, 'No pudimos validar el código. Probá de nuevo.');
	}
}

/**
 * Form action `?/buy`.
 *
 * @param {import('@sveltejs/kit').RequestEvent & { params: { event: string } }} event
 */
export async function buyAction({ params, platform, request, url, fetch, cookies }) {
	const db = getDB(platform);
	const form = await request.formData();
	const values = readForm(form);
	/** @type {AppliedDiscount | null} */
	let applied = null;
	/** @param {number} status @param {string} error @param {Record<string, string>} [errors] */
	const failWith = (status, error, errors = {}) =>
		fail(status, { buy: { error, errors, values, discount: applied } });

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
	const methods = availableMethods(config);
	const valid = validatePurchase(
		{ ...config, paymentMethods: methods.length ? methods : config.paymentMethods },
		{
			type: values.type,
			quantity: values.quantity,
			method: values.method,
			option: values.option,
			buyer: { name: values.name, email: values.email, dni: values.dni },
			holders: values.holders,
			accept: form.get('accept')
		}
	);

	/** @type {import('./discounts.js').DiscountCode | null} */
	let discount = null;
	if (values.code) {
		try {
			const check = await checkDiscountCode(db, { code: values.code, eventSlug: params.event });
			if (check.ok) {
				discount = check.discount;
				applied = describeDiscount(discount);
			} else if (valid.ok) {
				return failWith(400, 'Revisá el código de descuento.', { code: check.message });
			} else {
				valid.errors.code = check.message;
			}
		} catch (error) {
			logDBError('check discount code', error);
			return failWith(500, 'No pudimos validar el código. Probá de nuevo.');
		}
	}
	if (!valid.ok) return failWith(400, 'Revisá los datos marcados.', valid.errors);

	// Total 0 (sin contar el recargo de MP, que sobre 0 es 0): se emite sin pasar por un pago.
	const base = computePrice({
		price: valid.type.price,
		fondo: valid.type.fondo,
		option: valid.option,
		quantity: valid.quantity,
		discount
	});
	/** @type {import('./orders.js').OrderPaymentMethod} */
	const method = base.total === 0 ? 'gratis' : valid.method;
	/** @type {import('./index.js').Gateway | null} */
	let gateway = null;
	if (method === 'mercadopago') {
		gateway = await getGateway(fetch);
		if (!gateway) return failWith(503, 'El pago con Mercado Pago no está disponible ahora.');
	} else if (method === 'transferencia' && !transferInfo()) {
		return failWith(503, 'El pago por transferencia no está disponible ahora.');
	}

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
					`tickets:m:${await sha256Hex(valid.buyer.email)}`,
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
			buyer: valid.buyer,
			holders: valid.holders,
			option: valid.option,
			method,
			feeBasisPoints: mpFeeBasisPoints(config),
			discount: discount && { code: discount.code, kind: discount.kind, value: discount.value },
			holdMs: method === 'transferencia' ? transferHoldMs() : undefined
		});
	} catch (error) {
		logDBError('reserve order', error);
		return failWith(500, 'No pudimos reservar tus entradas. Probá de nuevo más tarde.');
	}
	if (!reserved.ok) {
		if (reserved.reason === 'code') {
			applied = null;
			return failWith(409, 'Revisá el código de descuento.', { code: reserved.message });
		}
		if (reserved.reason === 'method') return failWith(400, 'Elegí un medio de pago.');
		return failWith(
			409,
			reserved.available > 0
				? `Solo quedan ${reserved.available} entradas ${valid.type.name}.`
				: `Se agotaron las entradas ${valid.type.name} (puede liberarse alguna reserva más tarde).`
		);
	}

	const order = reserved.order;
	const origin = siteOrigin(url);
	const statusUrl = `/entradas/${order.id}/estado`;

	if (method === 'gratis') {
		try {
			const approved = await approveFreeOrder(db, order);
			if (approved.newlyApproved && approved.order) {
				const approvedOrder = approved.order;
				await inBackground(
					sendOrderEmail({ db, order: approvedOrder, tickets: approved.tickets, origin, fetch }),
					platform
				);
			}
		} catch (error) {
			logDBError('approve free order', error);
			return failWith(500, 'No pudimos emitir tus entradas. Probá de nuevo más tarde.');
		}
		rememberOrder(cookies, url, order.id);
		redirect(303, statusUrl);
	}

	if (method === 'transferencia') {
		await inBackground(sendTransferEmail({ order, origin, fetch }), platform);
		rememberOrder(cookies, url, order.id);
		redirect(303, statusUrl);
	}

	/** @type {string} */
	let checkoutUrl;
	try {
		const preference = buildPreference({
			order,
			eventTitle: config.title,
			typeName: valid.type.name,
			origin
		});
		const created = await /** @type {import('./index.js').Gateway} */ (gateway).createPreference(
			preference,
			order.id
		);
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

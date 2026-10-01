/**
 * Compra de entradas en /calendario/<slug>/entradas: datos para el formulario, la form action
 * `?/discount` (botón "Aplicar" del código) y la form action `?/buy`, que reserva
 * cupo y, según el medio de pago, redirige al checkout de Mercado Pago, a los datos para
 * transferir o (total 0) emite las entradas directamente.
 */
import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { sha256Hex } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import {
	LOW_STOCK,
	MAX_TICKETS_PER_FORM,
	computePrice,
	formatSaleTime,
	publicLeft,
	remainingOf
} from '$lib/utils/tickets.js';
import { salesState, typeClosesAt, typeOpen, validatePurchase } from './config.js';
import { checkDiscountCode } from './discounts.js';
import { getEventTickets } from './events.js';
import { resolveFondoPercent } from './fondo.js';
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
	TRANSFER_INITIAL_HOLD_MS,
	getCounts,
	isValidOrderId,
	reserveOrder,
	setPreference
} from './orders.js';
import { clientAddress, clientHash } from './safeguards.js';

/** Cookie httpOnly con las últimas órdenes de este navegador (para ver sus entradas al volver). */
export const ORDERS_COOKIE = 'kv_orders';
const MAX_REMEMBERED_ORDERS = 5;

/**
 * Límites anti-abuso. Primero por cliente (hash de la conexión, ver safeguards.js), así nadie
 * agota el límite de los demás; el del evento es un techo general holgado. Además de estos, las
 * reservas abiertas tienen topes por email y por cliente (`HOLD_LIMITS` en orders.js).
 */
export const CHECKOUT_RATE_LIMITS = {
	/** Intentos de compra (`?/buy`) por cliente, válidos o no. */
	client: { limit: 30, windowSeconds: 10 * 60 },
	/** Techo general por evento (entre todes). */
	event: { limit: 300, windowSeconds: 60 },
	/** Órdenes por email de quien compra. */
	email: { limit: 5, windowSeconds: 10 * 60 },
	/** Códigos de descuento probados por cliente y evento (en `?/discount` y en `?/buy`). */
	code: { limit: 20, windowSeconds: 10 * 60 },
	/** Mails de reserva o de entradas gratis a una misma dirección. */
	mail: { limit: 3, windowSeconds: 60 * 60 }
};

/**
 * @typedef {{
 *   open: boolean,
 *   reason: 'cancelled' | 'soldout' | 'closed' | 'notyet' | 'unavailable' | null,
 *   opensAt: number | null,
 *   closesAt: number | null,
 *   maxQuantity: number,
 *   mock: boolean,
 *   methods: import('./config.js').PaymentMethod[],
 *   transferHoldHours: number,
 *   feeBasisPoints: number,
 *   contactEmail: string,
 *   online: boolean,
 *   fondoEnabled: boolean,
 *   fondoPercent: number | null,
 *   door: { on: boolean, explicit: boolean, price: string } | null,
 *   types: { id: string, name: string, price: number, fondo: number, available: number,
 *     left: number | null, gorra: { min: number, recommended?: number | null, suggested: number } | null,
 *     closesAt: number | null, closed: boolean }[]
 * }} TicketsView
 *
 * Por tipo, `available` es cuántas se pueden comprar ahora en UNA compra (acotado a
 * `maxQuantity`, así la página no muestra ni manda el cupo real) y `left` es lo que se muestra
 * en público: cuántas quedan solo si el tipo tiene cupo y quedan menos de `LOW_STOCK` (ver
 * `publicLeft`). Un tipo sin cupo nunca se agota.
 */

/**
 * Medios de pago del evento que además están configurados en este entorno (transferencia, solo
 * si hay datos para transferir: en /admin/ajustes/cobros o en TICKETS_TRANSFER_INFO).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {import('./config.js').EventTickets} config
 */
async function availableMethods(db, config) {
	const transfer = config.paymentMethods.includes('transferencia')
		? Boolean(await transferInfo(db))
		: false;
	return config.paymentMethods.filter((m) =>
		m === 'mercadopago' ? Boolean(env.MP_ACCESS_TOKEN) || isMpMock() : transfer
	);
}

/**
 * Configuración de entradas del evento con el porcentaje del Fondo vigente. El porcentaje (una
 * lectura de D1 y, cada tanto, un pedido a fondo.kinkyvibe.ar con hasta 3 s de espera) se busca
 * solo si el evento vende entradas y usa el Fondo: la página de cualquier evento pasa por acá.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {typeof fetch} [fetchFn]
 */
export async function eventTicketsWithFondo(db, slug, fetchFn) {
	const base = await getEventTickets(slug);
	if (!base?.fondoEnabled) return base;
	const fondo = await resolveFondoPercent({ db, fetch: fetchFn });
	return getEventTickets(slug, { fondoPercent: fondo.percent });
}

/**
 * Datos públicos del bloque de compra (sin datos de otras personas).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {typeof fetch} [fetchFn] para leer el porcentaje automático del Fondo
 * @returns {Promise<TicketsView | null>} `null` si el evento no vende entradas
 */
export async function getTicketsView(db, slug, fetchFn) {
	const config = await eventTicketsWithFondo(db, slug, fetchFn);
	if (!config) return null;
	const state = salesState(config);
	const methods = await availableMethods(db, config);
	/** @type {TicketsView} */
	const view = {
		open: false,
		reason: state.open ? null : state.reason,
		opensAt: config.opensAt,
		closesAt: config.closesAt,
		maxQuantity: MAX_TICKETS_PER_FORM,
		mock: isMpMock() && methods.includes('mercadopago'),
		methods,
		transferHoldHours: Math.round(transferHoldMs() / 3600000),
		feeBasisPoints: await mpFeeBasisPoints(db, config),
		contactEmail: contactEmail(),
		online: config.online,
		fondoEnabled: config.fondoEnabled,
		fondoPercent: config.fondoPercent,
		door: config.door,
		types: config.types.map((t) => ({
			id: t.id,
			name: t.name,
			price: t.price,
			fondo: t.fondo,
			gorra: t.gorra,
			available: 0,
			left: null,
			// Cierre propio del tipo (si cierra antes que el evento) y si ya cerró.
			closesAt: t.closesAt != null ? typeClosesAt(config, t) : null,
			closed: !typeOpen(config, t)
		}))
	};
	if (!db || !methods.length) return { ...view, reason: view.reason ?? 'unavailable' };
	try {
		const counts = await getCounts(db, slug);
		for (const t of view.types) {
			const type = config.types.find((ct) => ct.id === t.id);
			const remaining = type ? remainingOf(type, counts.get(t.id)) : 0;
			t.available = Math.min(remaining ?? MAX_TICKETS_PER_FORM, MAX_TICKETS_PER_FORM);
			t.left = publicLeft(remaining);
		}
	} catch (error) {
		logDBError('tickets view', error);
		return { ...view, reason: view.reason ?? 'unavailable' };
	}
	if (!state.open) return view;
	const anyLeft = view.types.some((t) => t.available > 0 && !t.closed);
	return { ...view, open: anyLeft, reason: anyLeft ? null : 'soldout' };
}

/** Por debajo de cuántas entradas disponibles la página del evento dice "Quedan N". */
export { LOW_STOCK };

/**
 * Resumen para el botón "Comprar entradas" de la página del evento: si se puede comprar, el
 * precio "desde" (con el fondo ya aplicado) y cuántas quedan si son pocas: solo si todos los
 * tipos que se pueden comprar tienen cupo y entre todos quedan menos de `LOW_STOCK` (con un tipo
 * sin cupo o con muchas, no se muestra ningún número). También si hay entradas en la puerta.
 *
 * @param {TicketsView} view
 * @returns {{ open: boolean, reason: TicketsView['reason'], priceFrom: number | null,
 *   gorraSuggested: number | null, left: number | null, opensAt: number | null,
 *   closesAt: number | null, door: TicketsView['door'] }}
 */
export function summarizeTickets(view) {
	const candidates = view.open
		? view.types.filter((t) => t.available > 0 && !t.closed)
		: view.types;
	const priced = candidates.filter((t) => !t.gorra).map((t) => t.price - t.fondo);
	const gorra = candidates.filter((t) => t.gorra).map((t) => t.gorra?.suggested ?? 0);
	const open = view.types.filter((t) => t.available > 0 && !t.closed);
	const left =
		open.length && open.every((t) => t.left !== null)
			? open.reduce((sum, t) => sum + /** @type {number} */ (t.left), 0)
			: null;
	return {
		open: view.open,
		reason: view.reason,
		priceFrom: priced.length ? Math.min(...priced) : null,
		gorraSuggested: gorra.length ? Math.min(...gorra) : null,
		left: view.open && left !== null && left < LOW_STOCK ? left : null,
		opensAt: view.opensAt,
		closesAt: view.closesAt,
		door: view.door
	};
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
 * Lee el formulario de compra. Quien compra: `name`, `pronouns`, `email`, `dni`. Los datos por
 * entrada vienen como `holder_<campo>_<n>`. `amount`: monto por entrada "a la gorra".
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
		pronouns: str('pronouns', 100),
		email: str('email', 300),
		dni: str('dni', 40),
		code: str('code', 60).trim(),
		method: str('method', 30),
		option: str('option', 30),
		amount: str('amount', 30),
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
export async function discountAction(event) {
	const { params, platform, request } = event;
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
		const client = await clientHash(clientAddress(event));
		if (!(await codeAttemptAllowed(db, params.event, client)))
			return failWith(429, 'Demasiados intentos. Probá en unos minutos.');
		const check = await checkDiscountCode(db, { code: values.code, eventSlug: params.event });
		if (!check.ok) return failWith(400, check.message);
		return { buy: { error: null, errors: {}, values, discount: describeDiscount(check.discount) } };
	} catch (error) {
		logDBError('check discount code', error);
		return failWith(500, 'No pudimos validar el código. Probá de nuevo.');
	}
}

/**
 * Un intento más de código de descuento de este cliente en este evento: ¿está dentro del límite?
 * Lo usan `?/discount` y `?/buy` (el mismo contador), antes de mirar el código.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {string} client hash de la conexión
 */
async function codeAttemptAllowed(db, slug, client) {
	const limit = await hitRateLimit(
		db,
		`tickets:c:${await sha256Hex(`${slug}:${client}`)}`,
		CHECKOUT_RATE_LIMITS.code
	);
	return limit.allowed;
}

/**
 * ¿Se le puede mandar otro mail (reserva o entradas gratis) a esta dirección ahora?
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} email
 */
async function mailAllowed(db, email) {
	try {
		const limit = await hitRateLimit(
			db,
			`tickets:mail:${await sha256Hex(email)}`,
			CHECKOUT_RATE_LIMITS.mail
		);
		if (!limit.allowed) console.warn('[tickets] límite de mails a una dirección: no se manda');
		return limit.allowed;
	} catch (error) {
		logDBError('mail rate limit', error);
		return true;
	}
}

/**
 * Form action `?/buy`.
 *
 * @param {import('@sveltejs/kit').RequestEvent & { params: { event: string } }} event
 */
export async function buyAction(event) {
	const { params, platform, request, url, fetch, cookies } = event;
	const db = getDB(platform);
	const form = await request.formData();
	const values = readForm(form);
	/** @type {AppliedDiscount | null} */
	let applied = null;
	/** @param {number} status @param {string} error @param {Record<string, string>} [errors] */
	const failWith = (status, error, errors = {}) =>
		fail(status, { buy: { error, errors, values, discount: applied } });

	if (!db) return failWith(503, 'La venta de entradas no está disponible ahora.');
	// DEV ONLY: las pruebas E2E compran todo desde la misma conexión (localhost).
	const relaxed = dev && env.TICKETS_DEV_RELAX_LIMITS === '1';
	const client = relaxed ? `dev-${crypto.randomUUID()}` : await clientHash(clientAddress(event));
	try {
		const perClient = await hitRateLimit(db, `tickets:b:${client}`, CHECKOUT_RATE_LIMITS.client);
		if (!perClient.allowed)
			return failWith(429, 'Demasiados intentos seguidos. Probá de nuevo en unos minutos.');
	} catch (error) {
		logDBError('buy rate limit', error);
		return failWith(500, 'No pudimos reservar tus entradas. Probá de nuevo más tarde.');
	}
	// El precio se calcula acá, al crear la orden, con el porcentaje del Fondo de este momento.
	const config = await eventTicketsWithFondo(db, params.event, fetch);
	if (!config) return failWith(404, 'Este evento no vende entradas por acá.');
	const state = salesState(config);
	if (!state.open) {
		return failWith(
			409,
			state.reason === 'closed'
				? 'La venta ya cerró.'
				: state.reason === 'notyet' && config.opensAt
					? `La venta todavía no abrió: abre el ${formatSaleTime(config.opensAt)}.`
					: 'No hay entradas a la venta.'
		);
	}
	const methods = await availableMethods(db, config);
	const valid = validatePurchase(
		{ ...config, paymentMethods: methods.length ? methods : config.paymentMethods },
		{
			type: values.type,
			quantity: values.quantity,
			method: values.method,
			option: values.option,
			amount: values.amount,
			buyer: {
				name: values.name,
				pronouns: values.pronouns,
				email: values.email,
				dni: values.dni
			},
			holders: values.holders,
			accept: form.get('accept')
		}
	);

	/** @type {import('./discounts.js').DiscountCode | null} */
	let discount = null;
	// Los códigos no aplican a los tipos "a la gorra" (el formulario ni muestra el campo).
	const gorra = Boolean(config.types.find((t) => t.id === values.type)?.gorra);
	if (values.code && !gorra) {
		try {
			if (!(await codeAttemptAllowed(db, params.event, client))) {
				return failWith(429, 'Demasiados intentos con códigos. Probá en unos minutos.', {
					code: 'Demasiados intentos. Probá en unos minutos.'
				});
			}
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
		price: valid.unitPrice,
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
	} else if (method === 'transferencia' && !(await transferInfo(db))) {
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
			unitPrice: valid.unitPrice,
			// Porcentaje del Fondo vigente al comprar (NULL si el evento no es de KinkyVibe).
			fondoPercent: config.fondoPercent,
			method,
			feeBasisPoints: await mpFeeBasisPoints(db, config),
			discount: discount && { code: discount.code, kind: discount.kind, value: discount.value },
			// Transferencia: reserva inicial corta; se extiende al confirmar desde el mail.
			holdMs:
				method === 'transferencia'
					? Math.min(TRANSFER_INITIAL_HOLD_MS, transferHoldMs())
					: undefined,
			clientHash: client
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
		if (reserved.reason === 'limit') return failWith(429, reserved.message);
		return failWith(
			409,
			reserved.available === null
				? 'No pudimos reservar tus entradas. Probá de nuevo.'
				: reserved.available > 0
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
			if (approved.newlyApproved && approved.order && (await mailAllowed(db, order.buyer_email))) {
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
		if (await mailAllowed(db, order.buyer_email))
			await inBackground(sendTransferEmail({ db, order, origin, fetch }), platform);
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

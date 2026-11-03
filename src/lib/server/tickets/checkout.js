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
import { signLink, verifyLink } from '$lib/server/signedLinks.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import {
	LOW_STOCK,
	MAX_TICKETS_PER_FORM,
	computePrice,
	doorPricesText,
	formatSaleTime,
	publicLeft
} from '$lib/utils/tickets.js';
import { formatARS } from '$lib/utils/money.js';
import { transferDeadline } from '$lib/utils/transferDeadline.js';
import { emptyTaken, stockOf } from '$lib/utils/ticketTiers.js';
import {
	salesState,
	typeAvailability,
	typeClosesAt,
	typeOpen,
	validatePurchase,
	withTier
} from './config.js';
import { checkDiscountCode } from './discounts.js';
import { getEventMeta, getEventTickets } from './events.js';
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
	transferInfo
} from './index.js';
import { buildPreference } from './mercadopago.js';
import {
	approveFreeOrder,
	cancelPendingOrder,
	getTaken,
	isValidOrderId,
	reserveOrder,
	setPreference
} from './orders.js';
import { clientAddress, clientHash } from './safeguards.js';
import {
	WAITLIST_BUY_MESSAGES,
	findOffer,
	offerTypeMessage,
	queueHolders,
	sharesAfterQueue,
	waitlistGuard,
	waitlistShareMessage
} from './waitlistPurchase.js';
import { listaEsperaEnabled } from '$lib/server/flags.js';
import { queueWaitlistAdvance } from './waitlistEngine.js';
import { eventSignupFields, readAnswers } from './signupFields.js';
import { getSalesSettings } from './settings.js';
import { eventsWithVenue } from '$lib/server/amigues/venues.js';
import { saveAfterPurchase } from '$lib/server/cuentas/savedBuyer.js';
import { markFreeOrderMine } from '$lib/server/cuentas/orders.js';
import { trackFunnel } from '$lib/server/analytics/track.js';
import { queueOrderNotice } from '$lib/server/telegram/adminNotify.js';
import { unconfirmedMailAllowed } from '$lib/server/email/suppressions.js';
import { ticketsPausedMessage } from '$lib/server/emergencia.js';

/**
 * Cookie httpOnly con las últimas órdenes de este navegador (para ver sus entradas al volver).
 * Cada entrada es `<orden>.<firma>` (firma de `signLink` con `ORDERS_COOKIE_KEY`) y van separadas
 * por `~`: el servidor solo cuenta las que firmó él.
 */
export const ORDERS_COOKIE = 'kv_orders';
/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
const ORDERS_COOKIE_KEY = 'orders_cookie_key';
const ORDERS_COOKIE_SIG_LENGTH = 16;
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
	/**
	 * Mails de reserva o de entradas gratis a una misma dirección. Si la dirección no es la de la
	 * cuenta con sesión, además cuenta para el tope entre formularios (`UNCONFIRMED_MAIL_CAP`,
	 * email/suppressions.js).
	 */
	mail: { limit: 3, windowSeconds: 60 * 60 }
};

/**
 * @typedef {{
 *   open: boolean,
 *   reason: 'cancelled' | 'soldout' | 'closed' | 'notyet' | 'unavailable' | 'paused' | null,
 *   pausedMessage?: string | null,
 *   opensAt: number | null,
 *   closesAt: number | null,
 *   maxQuantity: number,
 *   mock: boolean,
 *   methods: import('./config.js').PaymentMethod[],
 *   transferUntil: number,
 *   feeBasisPoints: number,
 *   contactEmail: string,
 *   online: boolean,
 *   fondoEnabled: boolean,
 *   fondoPercent: number | null,
 *   door: { on: boolean, explicit: boolean, price: string, typesPrice?: string } | null,
 *   types: { id: string, name: string, price: number, fondo: number, available: number,
 *     left: number | null, gorra: { min: number, suggested: number } | null,
 *     closesAt: number | null, closed: boolean,
 *     tier?: { id: string, name: string, until: number | null } | null,
 *     tierLeft?: boolean, waitingFor?: string | null }[],
 *   fields?: import('$lib/utils/signupFields.js').SignupField[]
 * }} TicketsView
 *
 * Preventas: en un tipo con tramos, `price` y `fondo` son los del tramo vigente, `tier` dice cuál
 * es (la página muestra "Preventa 1" y manda su id, para avisar si cambió antes de cobrar) y
 * `tierLeft` dice si el "Quedan N" es de ese tramo ("a este precio"). Un tipo encadenado que
 * todavía no se habilitó tiene `waitingFor` (el nombre del tipo que se tiene que agotar o
 * cerrar) y `available: 0`.
 *
 * Por tipo, `available` es cuántas se pueden comprar ahora en UNA compra (acotado a
 * `maxQuantity`, así la página no muestra ni manda el cupo real) y `left` es lo que se muestra
 * en público: cuántas quedan solo si el tipo tiene cupo y quedan menos de `LOW_STOCK` (ver
 * `publicLeft`). Un tipo sin cupo nunca se agota.
 *
 * Pausa de emergencia (`TICKETS_PAUSED`, $lib/server/emergencia.js): `open: false`,
 * `reason: 'paused'` y `pausedMessage` con el texto para les compradores (salvo un evento
 * cancelado, que sigue diciendo eso).
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
	return methodsFor(config, transfer);
}

/**
 * Lo mismo que `availableMethods` con los datos para transferir ya leídos (las listas de eventos
 * los leen una sola vez para todos: listStates.js).
 *
 * @param {import('./config.js').EventTickets} config
 * @param {boolean} transferReady ¿hay datos para transferir?
 * @returns {import('./config.js').PaymentMethod[]}
 */
export function methodsFor(config, transferReady) {
	return config.paymentMethods.filter((m) =>
		m === 'mercadopago' ? Boolean(env.MP_ACCESS_TOKEN) || isMpMock() : transferReady
	);
}

/**
 * ¿Está prendida la pausa de emergencia de la venta (`TICKETS_PAUSED`)? Para las tarjetas de las
 * listas (listStates.js), que tienen que decir lo mismo que la página del evento.
 */
export function salesPaused() {
	return ticketsPausedMessage() !== null;
}

/**
 * ¿Se puede comprar este tipo ahora? Abierto por horario, no esperando a otro tipo (encadenado)
 * y con lugar. Es la misma regla que usa `getTicketsView` (`available > 0 && !closed`).
 *
 * @param {import('./config.js').EventTickets} config
 * @param {import('./config.js').TicketType} type
 * @param {import('$lib/utils/ticketTiers.js').TakenCounts} taken
 * @param {number} now
 */
export function typeBuyableNow(config, type, taken, now) {
	if (!typeOpen(config, type, now)) return false;
	const a = typeAvailability(config, type, taken, now);
	if (a.state === 'waiting' || a.state === 'closed') return false;
	return a.remaining === null || a.remaining > 0;
}

/**
 * Configuración de entradas del evento con el porcentaje del Fondo vigente. El porcentaje (una
 * lectura de D1 y, cada tanto, un pedido a fondo.kinkyvibe.ar con hasta 3 s de espera) se busca
 * solo si el evento vende entradas y usa el Fondo: la página de cualquier evento pasa por acá.
 * El evento se lee una sola vez y el porcentaje se busca a la par de su lugar
 * (`options.fondo` de `getEventTickets`).
 *
 * Con `onSale`, se le avisa apenas se sabe que el evento vende entradas (con la configuración sin
 * el lugar ni el porcentaje), para que lo que no depende de eso salga a la par.
 *
 * `fondo.staleOk` (solo para mostrar, nunca en `?/buy`): el último porcentaje conocido sin esperar
 * a fondo.kinkyvibe.ar, que se consulta en segundo plano con `fondo.waitUntil` (fondo.js).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {typeof fetch} [fetchFn]
 * @param {(draft: import('./config.js').EventTickets) => void} [onSale]
 * @param {{ staleOk?: boolean, waitUntil?: (task: Promise<unknown>) => void }} [fondo]
 */
export async function eventTicketsWithFondo(db, slug, fetchFn, onSale, fondo = {}) {
	return getEventTickets(slug, {
		fondo: async (base) => {
			onSale?.(base);
			return base.fondoEnabled
				? (await resolveFondoPercent({ db, fetch: fetchFn, ...fondo })).percent
				: undefined;
		}
	});
}

/**
 * El tramo vigente tal como lo ve la página (sin la cantidad: en público solo "quedan N" cerca
 * del final).
 *
 * @param {import('./config.js').TicketType} eff tipo efectivo (`withTier`)
 */
const tierView = (eff) =>
	eff.tier ? { id: eff.tier.id, name: eff.tier.name, until: eff.tier.until } : null;

/**
 * El tramo vigente de un tipo para la respuesta de `?/buy` con error (`withCurrentTier`).
 *
 * @param {import('./config.js').TicketType} type
 * @param {import('$lib/utils/ticketTiers.js').Tier} tier
 * @returns {import('$lib/utils/tickets.js').CurrentTier}
 */
const tierInfo = (type, tier) => ({
	type: type.id,
	id: tier.id,
	name: tier.name,
	until: tier.until,
	price: tier.price,
	fondo: tier.fondo
});

/**
 * Lo que `getTicketsView` lee además de la configuración, todo a la par: los medios de pago, la
 * comisión (los ajustes de venta se leen una sola vez por pedido, `getSalesSettings`), las
 * preguntas de inscripción y, con la base, lo vendido y la fila de la lista de espera. Solo
 * necesita lo que ya dice la configuración sin el lugar ni el Fondo. Un error al leer lo vendido
 * vuelve como `{ error }` (lo maneja `getTicketsView`), nunca como promesa rechazada.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {import('./config.js').EventTickets} config
 * @param {number} now
 * @param {{ waitlist?: boolean, offerId?: string | null }} opts
 */
async function salesReads(db, slug, config, now, opts) {
	const withQueue = Boolean(opts.waitlist && config.waitlist);
	const sold = db
		? Promise.all([
				getTaken(db, slug, now),
				withQueue ? queueHolders(db, slug, now, opts.offerId ?? null) : null
			]).then(
				([taken, holders]) => ({ value: { taken, holders } }),
				(/** @type {unknown} */ error) => ({ error })
			)
		: { error: null };
	const [methods, feeBasisPoints, fields] = await Promise.all([
		availableMethods(db, config),
		mpFeeBasisPoints(db, config),
		eventSignupFields(db, slug)
	]);
	return { methods, feeBasisPoints, fields, sold: await sold };
}

/**
 * Adelanta lo que {@link getTicketsView} va a leer de la base para `slug` sin esperar a su
 * configuración (con las tandas automáticas, va en la misma ida que la lectura del evento;
 * src/lib/server/db/autoBatch.js): lo vendido, la fila de la lista de espera (con `waitlist`), los
 * ajustes de venta, las preguntas de inscripción, el evento (su configuración) y si tiene lugar. Las mismas consultas, con el
 * mismo `now`: después, `getTicketsView` recibe lo ya leído. No devuelve nada ni decide nada; si
 * el evento no vende entradas, se leyó de más. Para la página del evento, cuando las listas dicen
 * que vende.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {number} now
 * @param {{ waitlist?: Promise<boolean> }} [opts]
 */
export function prefetchTicketsView(db, slug, now, { waitlist } = {}) {
	if (!db) return;
	const quiet = (/** @type {Promise<unknown>} */ p) => p.catch(() => {});
	quiet(getEventMeta(slug));
	quiet(getTaken(db, slug, now));
	quiet(getSalesSettings(db));
	quiet(eventSignupFields(db, slug));
	quiet(eventsWithVenue(db, slug));
	if (waitlist) quiet(waitlist.then((on) => (on ? queueHolders(db, slug, now, null) : null)));
}

/**
 * Datos públicos del bloque de compra (sin datos de otras personas).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {typeof fetch} [fetchFn] para leer el porcentaje automático del Fondo
 * @param {{ waitlist?: boolean, offerId?: string | null, now?: number,
 *   fondo?: { staleOk?: boolean, waitUntil?: (task: Promise<unknown>) => void } }} [opts]
 *   Lista de espera (docs/tickets.md): con `waitlist` (el interruptor `lista_espera` prendido),
 *   lo que se puede comprar es lo que sobra después de la fila (waitlistPurchase.js); con
 *   `offerId` (la anotación de una oferta vigente, de `findOffer`), lo que sobra después de los
 *   lugares guardados de otras personas. Sin `waitlist`, la fila no cambia nada.
 *   `fondo`: solo para las páginas que muestran el precio sin vender (la del evento): el
 *   porcentaje del Fondo conocido, sin esperar a la API (`eventTicketsWithFondo`). La página de
 *   compra y `?/buy` no lo pasan.
 *   `now`: el momento de la venta (por defecto, ahora); con el mismo de
 *   {@link prefetchTicketsView}, lo adelantado es lo que se lee.
 * @returns {Promise<TicketsView | null>} `null` si el evento no vende entradas
 */
export async function getTicketsView(db, slug, fetchFn, opts = {}) {
	const now = opts.now ?? Date.now();
	/** @type {ReturnType<typeof salesReads> | undefined} */
	let reads;
	// Apenas se sabe que vende entradas, lo que no depende del lugar ni del Fondo sale a la par
	// de ellos: la base está lejos y cada consulta que espera a otra es una ida y vuelta más.
	const config = await eventTicketsWithFondo(
		db,
		slug,
		fetchFn,
		(draft) => {
			reads = salesReads(db, slug, draft, now, opts);
			// Si la configuración falla después, nadie la espera: que no quede un rechazo suelto.
			reads.catch(() => {});
		},
		opts.fondo
	);
	if (!config) return null;
	const view = await salesView(db, slug, config, now, reads, opts);
	// Pausa de emergencia: el texto en lugar de los botones (nada se puede comprar). Un evento
	// cancelado sigue diciendo que se canceló.
	const paused = ticketsPausedMessage();
	if (paused && view.reason !== 'cancelled')
		return { ...view, open: false, reason: 'paused', pausedMessage: paused };
	return view;
}

/**
 * {@link getTicketsView} sin la pausa de emergencia.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {import('./config.js').EventTickets} config
 * @param {number} now
 * @param {ReturnType<typeof salesReads> | undefined} reads lo que ya salió a leerse, si salió
 * @param {{ waitlist?: boolean, offerId?: string | null }} opts
 * @returns {Promise<TicketsView>}
 */
async function salesView(db, slug, config, now, reads, opts) {
	const state = salesState(config, now);
	const { methods, feeBasisPoints, fields, sold } = await (reads ??
		salesReads(db, slug, config, now, opts));
	// Sin la base todavía: el tramo vigente solo por fecha (para mostrar un precio).
	const noSales = emptyTaken();
	/** @type {TicketsView} */
	const view = {
		open: false,
		reason: state.open ? null : state.reason,
		opensAt: config.opensAt,
		closesAt: config.closesAt,
		maxQuantity: MAX_TICKETS_PER_FORM,
		mock: isMpMock() && methods.includes('mercadopago'),
		methods,
		// Hasta cuándo se guardaría el lugar comprando ahora por transferencia (decisión 0031).
		transferUntil: transferDeadline(now, config.start ?? null),
		feeBasisPoints,
		contactEmail: contactEmail(),
		online: config.online,
		fondoEnabled: config.fondoEnabled,
		fondoPercent: config.fondoPercent,
		// La puerta, con el precio que sale del «Precio en puerta» de los tipos (lo que cobra la
		// puerta) para la línea pública; la nota `puerta_precio`, si la hay, manda (doorText). Sin
		// puerta, como siempre.
		door: config.door?.on
			? { ...config.door, typesPrice: doorPricesText(config.types) }
			: config.door,
		types: config.types.map((t) => {
			const a = typeAvailability(config, t, noSales, now);
			const eff = withTier(t, a.tier?.tier);
			return {
				id: t.id,
				name: t.name,
				price: eff.price,
				fondo: eff.fondo,
				gorra: t.gorra,
				available: 0,
				left: null,
				// Cierre propio del tipo (si cierra antes que el evento) y si ya cerró.
				closesAt: t.closesAt != null ? typeClosesAt(config, t) : null,
				closed: !typeOpen(config, t, now),
				tier: tierView(eff),
				tierLeft: false,
				waitingFor: null
			};
		}),
		// Preguntas de inscripción (sin base, ninguna).
		fields
	};
	if (!db || !methods.length) return { ...view, reason: view.reason ?? 'unavailable' };
	try {
		if ('error' in sold) throw sold.error;
		const { taken, holders } = sold.value;
		// Lista de espera: lo que sobra de cada tipo después de la fila (vacío sin lista).
		const shares = holders
			? sharesAfterQueue(config, (type) => typeAvailability(config, type, taken, now), holders)
			: new Map();
		for (const t of view.types) {
			const type = config.types.find((ct) => ct.id === t.id);
			if (!type) continue;
			const a = typeAvailability(config, type, taken, now);
			const eff = withTier(type, a.tier?.tier);
			t.price = eff.price;
			t.fondo = eff.fondo;
			t.tier = tierView(eff);
			t.waitingFor = a.waitingFor?.name ?? null;
			// Lo que queda (cupo y tramo vigente); un encadenado que espera, 0. Un tipo cerrado por
			// horario igual dice lo que quedaba (la página muestra "Venta cerrada").
			const remaining =
				a.state === 'waiting'
					? 0
					: a.state === 'closed'
						? stockOf(type, taken, now)
						: (shares.get(type.id) ?? a.remaining);
			t.available = Math.min(remaining ?? MAX_TICKETS_PER_FORM, MAX_TICKETS_PER_FORM);
			t.left = publicLeft(remaining);
			t.tierLeft = t.left !== null && a.tier?.remaining === remaining;
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
 * @returns {{ open: boolean, reason: TicketsView['reason'], pausedMessage: string | null,
 *   priceFrom: number | null,
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
		pausedMessage: view.pausedMessage ?? null,
		priceFrom: priced.length ? Math.min(...priced) : null,
		gorraSuggested: gorra.length ? Math.min(...gorra) : null,
		left: view.open && left !== null && left < LOW_STOCK ? left : null,
		opensAt: view.opensAt,
		closesAt: view.closesAt,
		door: view.door
	};
}

/**
 * La entrada de la cookie de órdenes para `orderId`: `<orden>.<firma>`.
 *
 * @param {D1Database} db
 * @param {string} orderId
 */
export async function signedOrderEntry(db, orderId) {
	return `${orderId}.${await signLink(db, ORDERS_COOKIE_KEY, orderId, ORDERS_COOKIE_SIG_LENGTH)}`;
}

/**
 * Órdenes recordadas por este navegador: solo las entradas con la firma que puso el servidor
 * (las que no la tienen, como las de la cookie vieja sin firmar, se ignoran).
 *
 * @param {D1Database} db
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @returns {Promise<string[]>}
 */
export async function rememberedOrders(db, cookies) {
	const entries = (cookies.get(ORDERS_COOKIE) ?? '').split('~').slice(0, MAX_REMEMBERED_ORDERS);
	/** @type {string[]} */
	const ids = [];
	for (const entry of entries) {
		const [id, sig, ...rest] = entry.split('.');
		if (rest.length || !isValidOrderId(id) || ids.includes(id)) continue;
		if (await verifyLink(db, ORDERS_COOKIE_KEY, id, sig, ORDERS_COOKIE_SIG_LENGTH)) ids.push(id);
	}
	return ids;
}

/**
 * @param {D1Database} db
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {URL} url
 * @param {string} orderId
 */
async function rememberOrder(db, cookies, url, orderId) {
	/** @type {string[]} */
	let entries;
	try {
		const ids = [orderId, ...(await rememberedOrders(db, cookies)).filter((id) => id !== orderId)];
		entries = await Promise.all(
			ids.slice(0, MAX_REMEMBERED_ORDERS).map((id) => signedOrderEntry(db, id))
		);
	} catch (error) {
		// Sin la cookie la compra sigue igual: solo no se ven las entradas al volver.
		logDBError('remember order', error);
		return;
	}
	cookies.set(ORDERS_COOKIE, entries.join('~'), {
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
		// Tramo de preventa que vio la persona (solo para avisar si cambió: el precio lo elige el
		// servidor, nunca este valor).
		tier: str('tier', 60),
		// Porcentaje del Fondo que vio la persona (lo mismo: solo para avisar si cambió). Vacío si
		// no eligió el descuento del fondo o el formulario es de antes de este campo.
		fondoPercent: str('fondo_percent', 5).trim(),
		// Link de una oferta de la lista de espera (`?lista=<token>`, campo oculto).
		lista: str('lista', 60).trim(),
		method: str('method', 30),
		option: str('option', 30),
		amount: str('amount', 30),
		holders: Array.from({ length: n }, (_, i) => ({
			name: str(`holder_name_${i}`, 200),
			pronouns: str(`holder_pronouns_${i}`, 100)
		})),
		// Respuestas a las preguntas de inscripción: las lee buyAction, que sabe cuáles hay.
		answers: /** @type {Record<string, string>} */ ({}),
		// Datos guardados de la cuenta (docs/cuentas.md): las casillas de «Tus datos». `accountForm`
		// dice que el formulario las mostró; sin eso, no se guarda ni se saca nada (por ejemplo, un
		// formulario abierto antes de ingresar no borra lo guardado).
		accountForm: form.get('datos_cuenta') === '1',
		remember: form.get('guardar_datos') === '1',
		rememberDni: form.get('recordar_dni') === '1'
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
	// Código combo (combos.js): nunca decimos para qué mail es (lo vería cualquiera con el código).
	const personal = d.buyer_email ? ' Es personal: vale con el mismo email al que te llegó.' : '';
	return {
		code: d.code,
		kind: d.kind,
		value: d.value,
		message: `Código ${d.code}: ${what}.${personal}`
	};
}

/**
 * El email del formulario como lo guarda la orden (minúsculas, sin espacios), o `undefined` si
 * todavía no lo escribió (para los códigos combo, que valen solo con un mail).
 *
 * @param {string} raw
 */
function buyerEmail(raw) {
	return raw.trim().toLowerCase() || undefined;
}

/**
 * Cantidad de entradas del formulario, si es un entero positivo (si no, `undefined`: el código no
 * mira su tope de entradas y la cantidad la valida la compra).
 *
 * @param {string} raw
 */
function formQuantity(raw) {
	const n = Number(raw);
	return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
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
		const check = await checkDiscountCode(db, {
			code: values.code,
			eventSlug: params.event,
			email: buyerEmail(values.email),
			quantity: formQuantity(values.quantity)
		});
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
 * ¿Se le puede mandar otro mail (reserva o entradas gratis) a esta dirección ahora? Una dirección
 * que no es la de la cuenta con sesión (`confirmed: false`: la escribió quien llenó el formulario)
 * además cuenta para el tope entre formularios, y si la base falla no se manda (la orden queda
 * igual y el mail se puede reenviar desde el panel).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} email
 * @param {boolean} confirmed
 * @param {string} [orderId] para el log (el id de la orden no es un dato personal)
 */
async function mailAllowed(db, email, confirmed, orderId) {
	try {
		const limit = await hitRateLimit(
			db,
			`tickets:mail:${await sha256Hex(email)}`,
			CHECKOUT_RATE_LIMITS.mail
		);
		if (!limit.allowed) {
			console.warn(
				`[tickets] límite de mails a una dirección: no se manda${orderId ? ` (orden ${orderId})` : ''}`
			);
			return false;
		}
	} catch (error) {
		logDBError('mail rate limit', error);
		return confirmed;
	}
	return confirmed || (await unconfirmedMailAllowed(db, email));
}

/** Entradas gratis: una orden por mail y evento, salvo con la cuenta de ese mail. */
export const FREE_ONCE_MESSAGE =
	'Con este mail ya se pidieron entradas gratis para este evento. Si es tu mail, entrá a tu cuenta con ese mail para pedir más.';

/**
 * "El precio cambió" (preventas): el tramo vigente no es el que vio la persona.
 *
 * @param {import('./config.js').TicketType} type
 * @param {import('$lib/utils/ticketTiers.js').Tier} tier
 */
function priceChangedMessage(type, tier) {
	const price = tier.fondo
		? `${formatARS(tier.price - tier.fondo)} con el descuento del Fondo`
		: formatARS(tier.price);
	return `El precio cambió: «${type.name}» ahora está en «${tier.name}» (${price}). Revisá y confirmá de nuevo.`;
}

/**
 * "El descuento del Fondo cambió": el porcentaje vigente no es el que vio la persona.
 *
 * @param {number} percent el porcentaje de ahora
 */
export function fondoChangedMessage(percent) {
	return `El descuento del Fondo cambió: ahora es ${percent} %. Revisá el total y volvé a confirmar.`;
}

/**
 * Pidió más de lo que queda en el tramo vigente.
 *
 * @param {string} tierName
 * @param {number} n
 */
export function tierLeftMessage(tierName, n) {
	const what = n === 1 ? 'queda 1 entrada' : `quedan ${n} entradas`;
	return `En «${tierName}» ${what} a este precio: comprá ${n === 1 ? 'esa' : 'esas'} ahora y, si querés más, hacé otra compra.`;
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
	/**
	 * Porcentaje del Fondo con el que se cobraría ahora (en los eventos con Fondo, una vez leída la
	 * configuración): va en cada respuesta con error para que el formulario muestre esos precios
	 * (`withFondoPercent`) y no vuelva a mandar uno viejo.
	 * @type {number | undefined}
	 */
	let fondoPercent;
	/**
	 * Tramo vigente del tipo elegido (en los tipos con preventas, una vez elegido): va en cada
	 * respuesta con error, igual que el Fondo, para que el formulario muestre ese precio y mande
	 * ese tramo (`withCurrentTier`) en vez del que se vio al cargar la página.
	 * @type {import('$lib/utils/tickets.js').CurrentTier | undefined}
	 */
	let currentTier;
	/** @param {number} status @param {string} error @param {Record<string, string>} [errors] */
	const failWith = (status, error, errors = {}) =>
		fail(status, {
			buy: {
				error,
				errors,
				values,
				discount: applied,
				...(fondoPercent !== undefined && { fondoPercent }),
				...(currentTier !== undefined && { tier: currentTier })
			}
		});

	if (!db) return failWith(503, 'La venta de entradas no está disponible ahora.');
	// Pausa de emergencia (TICKETS_PAUSED): no se crea ninguna orden (Mercado Pago, transferencia
	// ni gratis), antes de tocar la base. Lo que ya está en curso (pagos, puerta, carga a mano)
	// no pasa por acá.
	const paused = ticketsPausedMessage();
	if (paused) return failWith(503, paused);
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
	if (config.fondoEnabled && config.fondoPercent !== null) fondoPercent = config.fondoPercent;
	// Un solo "ahora" para el horario, el tramo vigente y la reserva (los bordes de fecha de un
	// tramo no pueden caer entre una cosa y la otra).
	const now = Date.now();
	const state = salesState(config, now);
	if (!state.open) {
		return failWith(
			409,
			state.reason === 'closed'
				? 'Venta cerrada.'
				: state.reason === 'notyet' && config.opensAt
					? `La venta todavía no abrió: abre el ${formatSaleTime(config.opensAt)}.`
					: 'No hay entradas a la venta.'
		);
	}
	const methods = await availableMethods(db, config);

	// Lista de espera (interruptor `lista_espera` y evento con lista; waitlistPurchase.js): el
	// público compra lo que sobra después de la fila, y quien tiene un lugar guardado compra con el
	// link de su oferta. Apagado, nada de esto (ni el campo `lista`) cambia la compra.
	/** @type {import('./waitlistPurchase.js').OfferLookup | null} */
	let offer = null;
	let waitlistOn = false;
	try {
		waitlistOn = Boolean(config.waitlist) && (await listaEsperaEnabled(platform));
		if (waitlistOn && values.lista)
			offer = await findOffer(db, { token: values.lista, eventSlug: params.event, now });
	} catch (error) {
		logDBError('waitlist offer', error);
		return failWith(500, 'No pudimos reservar tus entradas. Probá de nuevo más tarde.');
	}
	if (offer && offer.state !== 'valid') {
		// El formulario vuelve sin el link: la próxima vez compra como el resto.
		values.lista = '';
		return failWith(409, WAITLIST_BUY_MESSAGES.offerGone);
	}
	const offerId = offer?.state === 'valid' ? offer.id : null;
	const offerType = offer?.state === 'valid' ? offer.ticketType : null;
	if (offerType && offerType !== values.type) {
		const message = offerTypeMessage(
			config.types.find((t) => t.id === offerType)?.name ?? offerType
		);
		return failWith(409, message, { type: message });
	}
	/** @type {import('./waitlistPurchase.js').WaitlistGuard | null} */
	let waitlist = null;

	// Preventas y tipos encadenados: el servidor elige el tramo vigente con lo vendido y reservado
	// de ahora (el formulario solo dice qué tramo vio, para avisar si cambió el precio).
	const chosen = config.types.find((t) => t.id === values.type) ?? null;
	/** @type {import('./config.js').TicketType | null} */
	let effective = chosen;
	/** @type {number | null} */
	let tierRemaining = null;
	if (chosen) {
		/** @type {import('$lib/utils/ticketTiers.js').TakenCounts} */
		let taken;
		try {
			taken = await getTaken(db, params.event, now);
		} catch (error) {
			logDBError('tickets taken', error);
			return failWith(500, 'No pudimos reservar tus entradas. Probá de nuevo más tarde.');
		}
		const a = typeAvailability(config, chosen, taken, now);
		if (waitlistOn) waitlist = waitlistGuard(config, chosen, taken, now, offerId);
		if (a.state === 'waiting' && a.waitingFor) {
			const message = `«${chosen.name}» todavía no está a la venta: se habilita cuando se agote «${a.waitingFor.name}».`;
			return failWith(409, message, { type: message });
		}
		if (chosen.tiers?.length) {
			if (!a.tier) {
				const message = `Se agotaron las entradas ${chosen.name}.`;
				return failWith(409, message, { type: message });
			}
			effective = withTier(chosen, a.tier.tier);
			tierRemaining = a.tier.remaining;
			currentTier = tierInfo(chosen, a.tier.tier);
			if (values.tier !== a.tier.tier.id) {
				const message = priceChangedMessage(chosen, a.tier.tier);
				return failWith(409, message, { type: message });
			}
		}
		// El Fondo, igual: el porcentaje puede cambiar entre que se cargó la página y la compra (sale
		// de fondo.kinkyvibe.ar). Si el formulario dice que vio otro, no se cobra sin avisar; la
		// respuesta lleva el de ahora, así confirmar de nuevo pasa sin recargar. Sin el campo
		// (formularios viejos, sin el descuento del fondo elegido) no se frena nada.
		if (fondoPercent !== undefined && !chosen.gorra && values.fondoPercent !== '') {
			if (Number(values.fondoPercent) !== fondoPercent) {
				const message = fondoChangedMessage(fondoPercent);
				return failWith(409, message, { option: message });
			}
		}
	}
	const purchaseConfig =
		effective && effective !== chosen
			? { ...config, types: config.types.map((t) => (t.id === effective?.id ? effective : t)) }
			: config;

	// Preguntas de inscripción (sin base, ninguna).
	const fields = await eventSignupFields(db, params.event);
	values.answers = readAnswers(form, fields, values.quantity);
	const valid = validatePurchase(
		{
			...purchaseConfig,
			paymentMethods: methods.length ? methods : config.paymentMethods,
			fields
		},
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
			answers: values.answers,
			accept: form.get('accept'),
			now
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
			const check = await checkDiscountCode(db, {
				code: values.code,
				eventSlug: params.event,
				email: buyerEmail(values.email),
				quantity: valid.ok ? valid.quantity : formQuantity(values.quantity)
			});
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
	// Una compra entra entera en un tramo (un solo precio por orden): si pide más de lo que queda
	// a este precio, compra lo que queda y el resto en otra compra (al precio del tramo siguiente).
	if (tierRemaining !== null && valid.quantity > tierRemaining && valid.type.tier) {
		const message = tierLeftMessage(valid.type.tier.name, tierRemaining);
		return failWith(409, message, { quantity: message });
	}

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

	// ¿El mail es el de la cuenta con sesión? Si no, lo escribió quien llenó el formulario y nadie
	// lo confirmó: entradas gratis, una orden por mail y evento, y los mails cuentan para el tope
	// entre formularios (email/suppressions.js).
	const member = event.locals?.member;
	const confirmedEmail = Boolean(
		member && member.email.trim().toLowerCase() === valid.buyer.email.trim().toLowerCase()
	);

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
			// Transferencia: 2 días hábiles después del día de la compra, o hasta que empiece el
			// evento si es antes (decisión 0031).
			holdMs:
				method === 'transferencia' ? transferDeadline(now, config.start ?? null) - now : undefined,
			clientHash: client,
			answers: valid.answers,
			waitlist,
			freeOnce: method === 'gratis' && !confirmedEmail,
			now
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
		if (reserved.reason === 'free') return failWith(409, FREE_ONCE_MESSAGE);
		if (reserved.reason === 'offer') {
			values.lista = '';
			return failWith(409, WAITLIST_BUY_MESSAGES.offerGone);
		}
		if (reserved.reason === 'waitlist') {
			if (reserved.available <= 0) return failWith(409, WAITLIST_BUY_MESSAGES.blocked);
			const message = waitlistShareMessage(reserved.available);
			return failWith(409, message, { quantity: message });
		}
		if (reserved.reason === 'tier') {
			// Otra compra llenó el tramo (o pasó su fecha) en el medio: no se cobra otro precio sin
			// avisar. Se vuelve a elegir el tramo con lo de ahora y se pide confirmar de nuevo.
			const later = Date.now();
			/** @type {ReturnType<typeof typeAvailability> | null} */
			let again = null;
			try {
				if (chosen)
					again = typeAvailability(config, chosen, await getTaken(db, params.event, later), later);
			} catch (error) {
				logDBError('tickets taken', error);
			}
			if (again?.tier && chosen) currentTier = tierInfo(chosen, again.tier.tier);
			const message =
				again?.tier && chosen
					? `Se terminó «${valid.type.tier?.name ?? ''}» mientras comprabas. ${priceChangedMessage(chosen, again.tier.tier)}`
					: `Se agotaron las entradas ${valid.type.name}.`;
			return failWith(409, message, { type: message });
		}
		// Con su lugar guardado, pero justo se vendió (la puerta no mira la lista).
		if (offerId && reserved.available === 0) return failWith(409, WAITLIST_BUY_MESSAGES.soldAtDoor);
		return failWith(
			409,
			reserved.available === null
				? 'No pudimos reservar tus entradas. Probá de nuevo.'
				: reserved.available > 0
					? reserved.available === 1
						? `Solo queda 1 entrada ${valid.type.name}.`
						: `Solo quedan ${reserved.available} entradas ${valid.type.name}.`
					: `Se agotaron las entradas ${valid.type.name} (puede liberarse alguna reserva más tarde).`
		);
	}

	const order = reserved.order;
	// Embudo anónimo (docs/analiticas.md): solo el evento y el medio, nada de la orden.
	trackFunnel(platform?.env, { slug: params.event, step: 'orden', method });
	// Compra con cuenta: guarda o saca los datos según las casillas (nunca frena la compra).
	if (member && values.accountForm) {
		await saveAfterPurchase(db, member.id, valid.buyer, {
			remember: values.remember,
			rememberDni: values.rememberDni
		});
	}
	const origin = siteOrigin(url);
	const statusUrl = `/entradas/${order.id}/estado`;

	if (method === 'gratis') {
		// Pedida con la sesión de la cuenta de ese mail: es suya, va directo a la lista de Mi rincón
		// (si no, queda en «¿Son tuyas?»; «No fui yo», parte 2, en cuentas/orders.js).
		if (member && confirmedEmail)
			await markFreeOrderMine(db, { accountId: member.id, orderId: order.id, now });
		try {
			const approved = await approveFreeOrder(db, order);
			if (approved.newlyApproved) {
				trackFunnel(platform?.env, { slug: params.event, step: 'aprobada', method });
				// «Cada venta» por Telegram a les admins que lo prendieron (decisión 0041; nunca tira).
				await queueOrderNotice({
					db,
					platform,
					kind: 'cada_venta',
					order: approved.order,
					origin,
					fetch
				});
			}
			if (
				approved.newlyApproved &&
				approved.order &&
				(await mailAllowed(db, order.buyer_email, confirmedEmail))
			) {
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
		await rememberOrder(db, cookies, url, order.id);
		redirect(303, statusUrl);
	}

	if (method === 'transferencia') {
		if (await mailAllowed(db, order.buyer_email, confirmedEmail, order.id))
			await inBackground(sendTransferEmail({ db, order, origin, fetch }), platform);
		// «Cada transferencia» por Telegram a les admins que lo prendieron (decisión 0041).
		await queueOrderNotice({ db, platform, kind: 'transferencia', order, origin, fetch });
		await rememberOrder(db, cookies, url, order.id);
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
		// Si era la compra de alguien con su lugar guardado, vuelve a tenerlo (y si no, el lugar
		// liberado pasa a la lista de espera).
		queueWaitlistAdvance({ platform, db, eventSlug: params.event, fetch, origin });
		return failWith(502, 'No pudimos conectar con Mercado Pago. Probá de nuevo en un ratito.');
	}
	await rememberOrder(db, cookies, url, order.id);
	redirect(303, checkoutUrl);
}

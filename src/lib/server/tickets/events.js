/**
 * Lee la configuración de entradas de los eventos: la metadata de cada evento de la base (con la
 * forma del frontmatter de un .md, ver $lib/server/contenido/repo.js).
 */
import { dev } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { isKinkyVibeEvent, parseTicketConfig } from './config.js';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,199}$/i;

/**
 * ¿Tiene forma de slug de evento? (el nombre del archivo en src/lib/posts/calendario).
 *
 * @param {unknown} slug
 */
export function isValidEventSlug(slug) {
	return typeof slug === 'string' && SLUG_RE.test(slug);
}

/** @param {Record<string, any>} meta */
const tagsOf = (meta) => (Array.isArray(meta.tags) ? meta.tags : []);

/**
 * DEV ONLY: agrega entradas de prueba a eventos reales sin tocar sus archivos (para probar la
 * compra en local y en Playwright). `dev` es `false` en el build, así que en producción esto no
 * existe.
 *
 * - `TICKETS_DEV_FIXTURE=slug1,slug2`: evento presencial de KinkyVibe (se le agrega la etiqueta)
 *   con el descuento automático del Fondo en todos los tipos (General $ 10.000 sin cupo y
 *   Anticipada $ 8.000 con cupo 3), Mercado Pago y transferencia, y entradas en la puerta
 *   ($ 12.000). Con la cookie `kv-dev-hoy=<slug>` en el pedido, ese evento empieza hoy a las 23
 *   (hora de Argentina): para probar la Puerta que entra directo al único evento de hoy sin
 *   cambiar las demás pruebas (tests/tickets/menu.spec.js).
 * - `TICKETS_DEV_FIXTURE_GORRA=slug`: evento online SIN la etiqueta KinkyVibe (se le saca si la
 *   tiene: sin Fondo), "a la gorra" (mínimo $ 1.000, sugerido $ 5.000; y "Libre" con mínimo $ 0,
 *   sugerido $ 3.000) y "Precio fijo" ($ 6.000), Mercado Pago y transferencia.
 *
 * @param {string} slug
 * @param {Record<string, any>} meta frontmatter real del evento
 * @returns {Record<string, any> | null}
 */
function devFixture(slug, meta) {
	if (!dev) return null;
	/** @param {string | undefined} v */
	const list = (v) => (v ?? '').split(',').map((s) => s.trim());
	const common = {
		status: 'abierto',
		payment_methods: ['mercadopago', 'transferencia'],
		tickets_close: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
	};
	if (list(env.TICKETS_DEV_FIXTURE_GORRA).includes(slug)) {
		return {
			...common,
			modalidad: 'online',
			tags: tagsOf(meta).filter((t) => !isKinkyVibeEvent({ tags: [t] })),
			tickets: [
				{
					id: 'gorra',
					name: 'A la gorra',
					a_la_gorra: { minimo: 1000, sugerido: 5000 },
					capacity: 500
				},
				{ id: 'libre', name: 'Libre', a_la_gorra: { minimo: 0, sugerido: 3000 }, capacity: 500 },
				{ id: 'fijo', name: 'Precio fijo', price: 6000, capacity: 500 }
			]
		};
	}
	if (!list(env.TICKETS_DEV_FIXTURE).includes(slug)) return null;
	return {
		...common,
		modalidad: 'presencial',
		// Evento de KinkyVibe: el descuento del Fondo es el automático (en dev,
		// FONDO_PERCENT_OVERRIDE=20 de .env.tickets).
		tags: isKinkyVibeEvent(meta) ? tagsOf(meta) : [...tagsOf(meta), 'KinkyVibe'],
		...(devTodayCookie() === slug ? { start: `${todayInArgentina()}T23:00:00-03:00` } : {}),
		puerta: true,
		puerta_precio: 12000,
		tickets: [
			{ id: 'general', name: 'General', price: 10000 },
			{ id: 'anticipada', name: 'Anticipada', price: 8000, capacity: 3 }
		]
	};
}

/** DEV ONLY: el slug de la cookie `kv-dev-hoy` del pedido en curso (ver {@link devFixture}). */
function devTodayCookie() {
	try {
		return getRequestEvent().cookies.get('kv-dev-hoy') ?? '';
	} catch {
		return '';
	}
}

/** La fecha de hoy en Argentina, `AAAA-MM-DD`. */
const todayInArgentina = () =>
	new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

/** @typedef {Map<string, Record<string, any> | null>} DbMetas */

/**
 * @param {string} slug
 * @param {DbMetas | null} [content] los eventos de la base ya leídos (para no releerlos por cada
 *   evento); sin pasar, se busca este evento
 * @returns {Promise<Record<string, any> | null>} frontmatter de un evento publicado
 */
async function loadMeta(slug, content) {
	if (!isValidEventSlug(slug) || slug.startsWith('_')) return null;
	// Solo la base: `null` si no lo tiene, o si está oculto o borrado.
	const meta =
		content === undefined
			? await (await import('../contenido/repo.js')).dbEventMeta(slug)
			: content?.get(slug);
	if (!meta || meta.force_unpublished) return null;
	// Los eventos de prueba del repo solo venden en `vite dev` (nunca en el sitio publicado).
	if (!dev && isTestEventSlug(slug)) return null;
	const fixture = devFixture(slug, meta);
	return fixture ? { ...meta, ...fixture } : meta;
}

/**
 * Frontmatter de un evento publicado (o `null`), para quien necesita más que la configuración de
 * entradas (por ejemplo, la serie del evento en el modo puerta).
 *
 * @param {string} slug
 * @returns {Promise<Record<string, any> | null>}
 */
export function getEventMeta(slug) {
	return loadMeta(slug);
}

/**
 * Eventos de prueba de la venta de entradas (`prueba-entradas-*`, importados de sus .md): sirven
 * para probar en local y no venden en producción.
 * @param {string} slug
 */
export function isTestEventSlug(slug) {
	return slug.startsWith('prueba-entradas');
}

/**
 * Título y fecha de un evento publicado, venda entradas hoy o no (para mostrar órdenes viejas:
 * personas, estadísticas). `null` si no existe o no está publicado.
 *
 * @param {string} slug
 * @returns {Promise<{ title: string, start: string | null, tags: string[] } | null>}
 */
export async function getEventInfo(slug) {
	const meta = await loadMeta(slug);
	if (!meta) return null;
	const start = meta.start instanceof Date ? meta.start.toISOString() : meta.start;
	return {
		title: typeof meta.title === 'string' && meta.title ? meta.title : slug,
		start: start ? String(start) : null,
		tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === 'string') : []
	};
}

/**
 * Configuración de entradas de un evento publicado, o `null` si no vende entradas (o si la
 * configuración es inválida, en cuyo caso se loguea el motivo).
 *
 * `options.fondoPercent`: el porcentaje del Fondo (`resolveFondoPercent`), que usan los eventos
 * con la etiqueta KinkyVibe. Hace falta donde se muestran o cobran precios.
 *
 * `options.fondo`: en vez del porcentaje, quién lo busca si hace falta (`eventTicketsWithFondo`
 * en ./checkout.js). Se llama solo si el evento vende entradas y su configuración es válida, con
 * esa configuración sin el lugar (solo cambia `online`) y sin porcentaje, y corre a la par de la
 * lectura del lugar: el evento se lee una sola vez. Lo que devuelve es el `fondoPercent`.
 *
 * @param {string} slug
 * @param {{ fondoPercent?: number | null,
 *   fondo?: (config: import('./config.js').EventTickets) => Promise<number | null | undefined> }} [options]
 * @returns {Promise<import('./config.js').EventTickets | null>}
 */
export async function getEventTickets(slug, { fondo, ...options } = {}) {
	// Si tiene lugar, a la par del evento (con las tandas automáticas, en la misma ida): solo se usa
	// si vende entradas (si no, ni su error cuenta).
	const venue = speculative(eventsWithVenue(slug));
	const meta = await loadMeta(slug);
	if (!sellsTickets(meta)) return ticketsOf(slug, meta, { ...options, hasVenue: false });
	if (!fondo) {
		const withVenue = await venue;
		return ticketsOf(slug, meta, { ...options, hasVenue: withVenue.has(slug) });
	}
	// `parseTicketConfig` es pura: sin el lugar alcanza para saber si es válida y si usa el Fondo.
	const draft = ticketsOf(slug, meta, options);
	if (!draft) return null;
	const [withVenue, fondoPercent] = await Promise.all([venue, fondo(draft)]);
	return ticketsOf(slug, meta, {
		...options,
		...(fondoPercent === undefined ? {} : { fondoPercent }),
		hasVenue: withVenue.has(slug)
	});
}

/**
 * {@link getEventTickets} de varios eventos a la vez (las tarjetas de una lista,
 * ./listStates.js): por evento, lo mismo que `getEventTickets`, pero con dos consultas para todos
 * (los eventos y cuáles tienen lugar, a la par) en vez de dos por evento.
 *
 * @param {readonly string[]} slugs
 * @param {{ fondoPercent?: number | null }} [options] ver `getEventTickets`
 * @returns {Promise<Map<string, import('./config.js').EventTickets | null>>}
 */
export async function getEventTicketsMany(slugs, options = {}) {
	const unique = [...new Set(slugs)];
	// Los mismos que `loadMeta` buscaría en la base (los demás dan `null` sin consultar).
	const wanted = unique.filter((slug) => isValidEventSlug(slug) && !slug.startsWith('_'));
	// Los eventos y cuáles tienen lugar, a la par (con las tandas automáticas, en una ida): el lugar
	// se pregunta de todos, aunque después solo importe en los que venden.
	const [content, withVenue] = wanted.length
		? await Promise.all([
				import('../contenido/repo.js').then((repo) => repo.dbEventMetasFor(wanted)),
				eventsWithVenueAmong(wanted)
			])
		: [new Map(), new Set()];
	/** @type {Map<string, Record<string, any> | null>} */
	const metas = new Map();
	for (const slug of unique) metas.set(slug, await loadMeta(slug, content));
	/** @type {Map<string, import('./config.js').EventTickets | null>} */
	const out = new Map();
	for (const slug of unique) {
		out.set(
			slug,
			ticketsOf(slug, metas.get(slug) ?? null, { ...options, hasVenue: withVenue.has(slug) })
		);
	}
	return out;
}

/**
 * Cuáles de `slugs` tienen lugar vinculado (`eventsWithVenueAmong` de ../amigues/venues.js), en
 * una consulta. Vacío sin base.
 *
 * @param {readonly string[]} slugs
 * @returns {Promise<Set<string>>}
 */
async function eventsWithVenueAmong(slugs) {
	const db = (await import('../contenido/repo.js')).activeContentDB();
	if (!db) return new Set();
	return (await import('../amigues/venues.js')).eventsWithVenueAmong(db, slugs);
}

/**
 * Una lectura que sale antes de saber si hace falta: si falla y nadie la espera, no queda como
 * rechazo sin atender; quien la espera recibe el mismo error que antes.
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
function speculative(promise) {
	promise.catch(() => {});
	return promise;
}

/** @param {Record<string, any> | null} meta */
const sellsTickets = (meta) => meta?.tickets !== undefined && meta?.tickets !== null;

/**
 * Los eventos con lugar vinculado (`eventsWithVenue` de ../amigues/venues.js; con `slug`, solo
 * ese): la venta trata a un evento con lugar como presencial, como la página. Vacío sin base.
 *
 * @param {string} [slug]
 * @returns {Promise<Set<string>>}
 */
async function eventsWithVenue(slug) {
	const db = (await import('../contenido/repo.js')).activeContentDB();
	if (!db) return new Set();
	return (await import('../amigues/venues.js')).eventsWithVenue(db, slug);
}

/**
 * @param {string} slug
 * @param {Record<string, any> | null} meta
 * @param {{ fondoPercent?: number | null, hasVenue?: boolean }} options
 */
function ticketsOf(slug, meta, options) {
	if (!meta) return null;
	try {
		return parseTicketConfig(meta, options);
	} catch (error) {
		console.error(
			`[tickets] configuración inválida en ${slug}:`,
			/** @type {Error} */ (error).message
		);
		return null;
	}
}

/**
 * Todos los eventos publicados que venden entradas.
 *
 * @param {{ fondoPercent?: number | null }} [options] ver `getEventTickets`
 * @returns {Promise<{ slug: string, config: import('./config.js').EventTickets }[]>}
 */
export async function listTicketedEvents(options = {}) {
	const out = [];
	// Los eventos con lugar, a la par de la lista (ver {@link getEventTickets}): solo se usan si
	// alguno vende entradas.
	const venues = speculative(eventsWithVenue());
	const metas = await listEventMetas();
	const withVenue = metas.some((e) => sellsTickets(e.meta)) ? await venues : new Set();
	for (const { slug, meta } of metas) {
		const config = ticketsOf(slug, meta, { ...options, hasVenue: withVenue.has(slug) });
		if (config) out.push({ slug, config });
	}
	out.sort((a, b) => String(b.config.start ?? '').localeCompare(String(a.config.start ?? '')));
	return out;
}

/**
 * El frontmatter de todos los eventos publicados de la base (vendan entradas o no).
 *
 * @returns {Promise<{ slug: string, meta: Record<string, any> }[]>}
 */
export async function listEventMetas() {
	const out = [];
	const content = await (await import('../contenido/repo.js')).dbEventMetas();
	for (const slug of content?.keys() ?? []) {
		const meta = await loadMeta(slug, content);
		if (meta) out.push({ slug, meta });
	}
	return out;
}

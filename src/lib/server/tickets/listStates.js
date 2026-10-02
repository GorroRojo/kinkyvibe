/**
 * Estado de la venta de entradas para las listas de eventos (tarjetas de PostListItem: inicio,
 * /calendario, /todo, páginas de etiquetas, "Más cosas de…"). Todos los eventos de la lista se
 * resuelven juntos: una lectura de los datos para transferir y UNA consulta a `orders`, nunca una
 * por tarjeta. Usa las mismas reglas que `getTicketsView` (checkout.js), así la tarjeta y la
 * página del evento dicen lo mismo.
 */
import { building } from '$app/environment';
import { getDB } from '$lib/server/db';
import { hasOwnTickets } from '$lib/utils/ticketCta.js';
import { methodsFor, typeBuyableNow } from './checkout.js';
import { salesState } from './config.js';
import { getEventTickets } from './events.js';
import { transferInfo } from './index.js';
import { getTakenMany } from './orders.js';

/** @typedef {import('$lib/utils/ticketCta.js').ListTicketState} ListTicketState */
/** @typedef {import('$lib/utils/ticketCta.js').TicketStates} TicketStates */

/**
 * Cuánto se reusa un resultado en esta instancia del worker. Corto: la tarjeta puede decir
 * «Comprar entradas» unos segundos después de agotarse, pero /entradas siempre lo vuelve a mirar.
 */
export const LIST_CACHE_MS = 30 * 1000;

/** @type {Map<string, { at: number, value: Promise<TicketStates> }>} */
const cache = new Map();
const CACHE_MAX_KEYS = 50;

/**
 * Estado de la venta de varios eventos a la vez. Los eventos que no venden entradas (o con una
 * configuración inválida) no aparecen en el resultado.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} slugs
 * @param {{ now?: number, cacheMs?: number }} [options]
 * @returns {Promise<TicketStates>}
 */
export function getListTicketStates(db, slugs, { now = Date.now(), cacheMs = LIST_CACHE_MS } = {}) {
	const unique = [...new Set(slugs)].sort();
	if (!cacheMs) return computeStates(db, unique, now);
	const key = unique.join('\n');
	const hit = cache.get(key);
	if (hit && now - hit.at < cacheMs) return hit.value;
	const value = computeStates(db, unique, now);
	if (cache.size >= CACHE_MAX_KEYS) cache.clear();
	cache.set(key, { at: now, value });
	// Un error no se guarda.
	value.catch(() => cache.delete(key));
	return value;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} slugs
 * @param {number} now
 * @returns {Promise<TicketStates>}
 */
async function computeStates(db, slugs, now) {
	const configs = (
		await Promise.all(slugs.map(async (slug) => ({ slug, config: await getEventTickets(slug) })))
	).filter(
		/** @returns {e is { slug: string, config: import('./config.js').EventTickets }} */
		(e) => e.config !== null
	);
	/** @type {TicketStates} */
	const out = {};
	/** @type {typeof configs} */
	const selling = [];
	for (const { slug, config } of configs) {
		const state = salesState(config, now);
		if (state.open) selling.push({ slug, config });
		else out[slug] = { open: false, reason: state.reason, opensAt: config.opensAt ?? null };
	}
	if (!selling.length) return out;

	/** @param {string} slug @param {import('./config.js').EventTickets} config */
	const unavailable = (slug, config) =>
		(out[slug] = { open: false, reason: 'unavailable', opensAt: config.opensAt ?? null });

	// Los datos para transferir son de toda la venta: se leen una vez.
	const transfer = selling.some((e) => e.config.paymentMethods.includes('transferencia'))
		? Boolean(await transferInfo(db))
		: false;
	const withMethods = selling.filter((e) => {
		if (methodsFor(e.config, transfer).length) return true;
		unavailable(e.slug, e.config);
		return false;
	});
	if (!withMethods.length) return out;

	let takenBySlug;
	try {
		takenBySlug = await getTakenMany(
			db,
			withMethods.map((e) => e.slug),
			now
		);
	} catch (error) {
		console.error('[tickets] no se pudo leer la venta para las listas:', error);
		for (const e of withMethods) unavailable(e.slug, e.config);
		return out;
	}
	for (const { slug, config } of withMethods) {
		const taken = takenBySlug.get(slug) ?? { types: new Map(), tiers: new Map() };
		const anyLeft = config.types.some((t) => typeBuyableNow(config, t, taken, now));
		out[slug] = {
			open: anyLeft,
			reason: anyLeft ? null : 'soldout',
			opensAt: config.opensAt ?? null
		};
	}
	return out;
}

/**
 * Para los loads de las páginas con listas: el estado de la venta de los eventos que vienen y
 * venden entradas, por slug. `null` si no se puede saber (prerenderizado, sin base, error): la
 * tarjeta muestra el link a /entradas igual.
 *
 * @param {App.Platform | undefined} platform
 * @param {{ meta: Record<string, any> }[]} posts
 * @returns {Promise<TicketStates | null>}
 */
export async function ticketStatesFor(platform, posts) {
	if (building) return null;
	const db = getDB(platform);
	if (!db) return null;
	const now = Date.now();
	const slugs = posts
		.filter((p) => hasOwnTickets(p.meta) && new Date(p.meta.start).getTime() > now)
		.map((p) => String(p.meta.postID));
	if (!slugs.length) return {};
	try {
		return await getListTicketStates(db, slugs, { now });
	} catch (error) {
		console.error('[tickets] no se pudo calcular la venta para las listas:', error);
		return null;
	}
}

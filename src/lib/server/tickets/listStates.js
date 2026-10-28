/**
 * Estado de la venta de entradas para las listas de eventos (tarjetas de PostListItem: inicio,
 * /calendario, /todo, páginas de etiquetas, "Más cosas de…"). Todos los eventos de la lista se
 * resuelven juntos: la configuración de todos en una tanda (los eventos y sus lugares,
 * `getEventTicketsMany`), una lectura de los datos para transferir y UNA consulta a `orders`, nunca
 * una por tarjeta. Usa las mismas reglas que `getTicketsView` (checkout.js), así la tarjeta y la
 * página del evento dicen lo mismo.
 *
 * Con la lista de espera prendida (interruptor `lista_espera`), un evento con lista resta la fila
 * de lo que se puede comprar, como `getTicketsView`: si lo libre es de la fila, la tarjeta dice
 * agotadas (una consulta más, para todos los eventos con lista juntos).
 */
import { building } from '$app/environment';
import { getDB } from '$lib/server/db';
import { readAndKeep } from '$lib/server/db/perRequest.js';
import { batchesReads } from '$lib/server/db/autoBatch.js';
import { peekListedPosts } from '$lib/server/contenido/posts.js';
import { hasOwnTickets } from '$lib/utils/ticketCta.js';
import { startsAfter } from '$lib/utils/dates.js';
import { methodsFor, salesPaused, typeBuyableNow } from './checkout.js';
import { salesState, typeAvailability } from './config.js';
import { getEventTicketsMany } from './events.js';
import { transferInfo } from './index.js';
import { getTakenMany } from './orders.js';
import { isFlagOn } from '$lib/server/flags.js';
import { queueHoldersMany, sharesAfterQueue } from './waitlistPurchase.js';

/** @typedef {import('$lib/utils/ticketCta.js').ListTicketState} ListTicketState */
/** @typedef {import('$lib/utils/ticketCta.js').TicketStates} TicketStates */

/**
 * Cuánto se reusa un resultado en esta instancia del worker. Corto: la tarjeta puede decir
 * «Comprar entradas» unos segundos después de agotarse, pero /entradas siempre lo vuelve a mirar.
 */
export const LIST_CACHE_MS = 30 * 1000;

/**
 * Solo resultados ya calculados: lo que está en camino se comparte solo dentro del pedido
 * (`readAndKeep`, src/lib/server/db/perRequest.js).
 * @type {Map<string, { at: number, value: TicketStates }>}
 */
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
	if (hit && now - hit.at < cacheMs) {
		// Por vencer: lo de ahora sirve (todavía vale) y se renueva a la par de las primeras consultas
		// del pedido (con las tandas automáticas, en la misma ida), así el próximo pedido no espera.
		// Lo que se muestra nunca es más viejo que `cacheMs`, como antes.
		if (now - hit.at >= cacheMs - REFRESH_AHEAD_MS && batchesReads(db) && !refreshing.has(key)) {
			// Una renovación por lista a la vez: los pedidos que llegan mientras tanto no lanzan otra.
			refreshing.add(key);
			computeAndKeep(db, key, unique, now)
				.catch(() => {})
				.finally(() => refreshing.delete(key));
		}
		return Promise.resolve(hit.value);
	}
	return computeAndKeep(db, key, unique, now);
}

/** Las listas que se están renovando antes de vencer (ver arriba). */
const refreshing = new Set();

/** Lo recordado se renueva cuando le queda menos que esto (ms). */
const REFRESH_AHEAD_MS = 10 * 1000;

/**
 * Calcula el estado (compartido dentro del pedido) y lo recuerda. Un error no se guarda.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} key
 * @param {string[]} unique
 * @param {number} now
 */
function computeAndKeep(db, key, unique, now) {
	return readAndKeep(
		db,
		`list-ticket-states\n${key}`,
		() => computeStates(db, unique, now),
		(value) => {
			if (cache.size >= CACHE_MAX_KEYS) cache.clear();
			cache.set(key, { at: now, value });
		}
	);
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} slugs
 * @param {number} now
 * @returns {Promise<TicketStates>}
 */
async function computeStates(db, slugs, now) {
	// Todo lo que se lee, a la par y por dirección (con las tandas automáticas, en una sola ida,
	// src/lib/server/db/autoBatch.js): la configuración, los datos para transferir, lo vendido y la
	// fila. Lo vendido y la fila se preguntan de todos los eventos, aunque después solo importen los
	// que venden (y la fila, los que tienen lista): antes cada paso esperaba al anterior (cinco idas
	// en fila).
	const reads = {
		transfer: transferInfo(db),
		taken: getTakenMany(db, slugs, now),
		holders: queueFor(db, slugs, now)
	};
	for (const p of Object.values(reads)) p.catch(() => {});
	// La configuración de todos juntos: dos consultas para toda la lista (los eventos y cuáles tienen
	// lugar), no dos por tarjeta.
	const bySlug = await getEventTicketsMany(slugs);
	const configs = slugs
		.map((slug) => ({ slug, config: bySlug.get(slug) ?? null }))
		.filter(
			/** @returns {e is { slug: string, config: import('./config.js').EventTickets }} */
			(e) => e.config !== null
		);
	/** @type {TicketStates} */
	const out = {};
	/** @type {typeof configs} */
	const selling = [];
	// Pausa de emergencia: como `getTicketsView`, nada se puede comprar (un evento cancelado sigue
	// diciendo eso).
	const paused = salesPaused();
	for (const { slug, config } of configs) {
		const state = salesState(config, now);
		if (paused && !(!state.open && state.reason === 'cancelled'))
			out[slug] = { open: false, reason: 'paused', opensAt: config.opensAt ?? null };
		else if (state.open) selling.push({ slug, config });
		else out[slug] = { open: false, reason: state.reason, opensAt: config.opensAt ?? null };
	}
	if (!selling.length) return out;

	/** @param {string} slug @param {import('./config.js').EventTickets} config */
	const unavailable = (slug, config) =>
		(out[slug] = { open: false, reason: 'unavailable', opensAt: config.opensAt ?? null });

	// Los datos para transferir son de toda la venta: se leen una vez.
	const transfer = selling.some((e) => e.config.paymentMethods.includes('transferencia'))
		? Boolean(await reads.transfer)
		: false;
	const withMethods = selling.filter((e) => {
		if (methodsFor(e.config, transfer).length) return true;
		unavailable(e.slug, e.config);
		return false;
	});
	if (!withMethods.length) return out;

	let takenBySlug;
	try {
		takenBySlug = await reads.taken;
	} catch (error) {
		console.error('[tickets] no se pudo leer la venta para las listas:', error);
		for (const e of withMethods) unavailable(e.slug, e.config);
		return out;
	}
	const queue = await reads.holders;
	// La fila solo cuenta en los eventos con lista.
	const holdersBySlug = new Map(
		withMethods.filter((e) => e.config.waitlist).map((e) => [e.slug, queue.get(e.slug)])
	);
	for (const { slug, config } of withMethods) {
		const taken = takenBySlug.get(slug) ?? { types: new Map(), tiers: new Map() };
		const holders = holdersBySlug.get(slug);
		// Lo que sobra de cada tipo después de la fila (vacío sin lista o sin nadie en la fila).
		const shares = holders
			? sharesAfterQueue(config, (t) => typeAvailability(config, t, taken, now), holders)
			: new Map();
		const anyLeft = config.types.some(
			(t) => typeBuyableNow(config, t, taken, now) && (shares.get(t.id) ?? 1) > 0
		);
		out[slug] = {
			open: anyLeft,
			reason: anyLeft ? null : 'soldout',
			opensAt: config.opensAt ?? null
		};
	}
	return out;
}

/**
 * La fila de la lista de espera de `slugs` (por slug), solo con el interruptor prendido: el
 * interruptor y la fila a la par. Si falla (sin la migración 0053), ninguna: la tarjeta nunca se
 * rompe por la lista.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} slugs
 * @param {number} now
 * @returns {Promise<Map<string, Map<string, number>>>}
 */
async function queueFor(db, slugs, now) {
	try {
		const [on, holders] = await Promise.all([
			isFlagOn(db, 'lista_espera'),
			queueHoldersMany(db, slugs, now)
		]);
		return on ? holders : new Map();
	} catch (error) {
		console.error('[tickets] no se pudo leer la lista de espera para las listas:', error);
		return new Map();
	}
}

/**
 * Para las páginas con listas: adelanta el estado de la venta con la lista que ya armó este isolate
 * (`peekListedPosts`; `pick` elige de ella los posts de la página, por defecto todos: el inicio,
 * /calendario, /todo), así sale a la par de la marca del contenido en vez de esperarla. La página lo
 * vuelve a pedir con la lista de verdad ({@link ticketStatesFor}): si son los mismos eventos,
 * recibe lo ya pedido (compartido dentro del pedido); si no, pregunta aparte, como siempre. Nunca
 * decide qué se muestra. Solo con las tandas automáticas (sin ellas, adelantar es consultar de más).
 *
 * @param {App.Platform | undefined} platform
 * @param {(posts: ProcessedPost[]) => { meta: Record<string, any> }[]} [pick]
 */
export function askTicketStatesEarly(platform, pick = (posts) => posts) {
	if (building) return;
	const db = getDB(platform);
	const posts = db && batchesReads(db) ? peekListedPosts() : null;
	if (posts) ticketStatesFor(platform, pick(posts)).catch(() => {});
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
		.filter((p) => hasOwnTickets(p.meta) && startsAfter(p.meta.start, now))
		.map((p) => String(p.meta.postID));
	if (!slugs.length) return {};
	try {
		return await getListTicketStates(db, slugs, { now });
	} catch (error) {
		console.error('[tickets] no se pudo calcular la venta para las listas:', error);
		return null;
	}
}

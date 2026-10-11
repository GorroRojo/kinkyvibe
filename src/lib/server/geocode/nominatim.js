/**
 * «Buscar en el mapa» del editor de lugares (el del panel y el de Mi rincón): pasa una dirección a
 * coordenadas con Nominatim (el buscador de OpenStreetMap). Solo corre en el servidor y solo
 * cuando une admin o quien gestiona el lugar aprieta el botón (docs/amigues.md): nunca solo, nunca
 * para visitantes, nunca para la dirección libre de un evento. Los endpoints están en
 * src/lib/server/geocode/web.js (Mi rincón suma un límite por cuenta).
 *
 * Cumple la política de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
 * - un User-Agent que dice quién es, con la URL del sitio (sin mails de nadie);
 * - como mucho un pedido por segundo para todo el sitio (`rate_limits`, bucket `nominatim`);
 * - guarda los resultados un rato (en la memoria del Worker) para no repetir la misma búsqueda.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ lat: number, lng: number, label: string }} GeocodeResult */
/**
 * @typedef {{ ok: true, results: GeocodeResult[], cached: boolean }
 *   | { ok: false, reason: 'empty-query' | 'rate-limited' | 'unavailable', retryAfter?: number }} GeocodeOutcome
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const SITE_URL = 'https://kinkyvibe.ar';
export const USER_AGENT = `kinkyvibe/1.0 (+${SITE_URL}; buscador de lugares)`;
/** Un pedido por segundo para todo el sitio (la política de Nominatim). */
export const NOMINATIM_RATE_LIMIT = { limit: 1, windowSeconds: 1 };
export const MAX_RESULTS = 5;
const MAX_PART = 300;
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;

/** @type {Map<string, { at: number, results: GeocodeResult[] }>} */
const cache = new Map();

/** Vacía la memoria de búsquedas (para tests). */
export function clearGeocodeCache() {
	cache.clear();
}

/**
 * El texto que se busca: dirección, barrio y ciudad del lugar, con «Argentina» al final como
 * contexto. Sin dirección no hay búsqueda (con solo el barrio, el punto no sirve).
 *
 * @param {{ address?: unknown, area?: unknown, city?: unknown }} input
 * @returns {string} '' si no hay dirección
 */
export function buildGeocodeQuery({ address, area, city }) {
	/** @param {unknown} v */
	const clean = (v) =>
		typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_PART) : '';
	const parts = [clean(address), clean(area), clean(city)];
	if (!parts[0]) return '';
	const seen = new Set();
	const unique = parts.filter((p) => {
		const key = p.toLocaleLowerCase('es');
		if (!p || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	if (!unique.some((p) => /argentina/i.test(p))) unique.push('Argentina');
	return unique.join(', ');
}

/**
 * La URL del pedido a Nominatim (formato jsonv2, solo Argentina, en castellano).
 *
 * @param {string} query
 */
export function nominatimUrl(query) {
	const url = new URL(NOMINATIM_URL);
	url.searchParams.set('q', query);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', String(MAX_RESULTS));
	url.searchParams.set('countrycodes', 'ar');
	url.searchParams.set('accept-language', 'es');
	return url.toString();
}

/**
 * Lee la respuesta de Nominatim: `[{ lat: "-34.6", lon: "-58.4", display_name }]`. Descarta lo
 * que no tiene números válidos y redondea a 6 decimales (unos 10 cm, de sobra).
 *
 * @param {unknown} data
 * @returns {GeocodeResult[]}
 */
export function parseNominatimResults(data) {
	if (!Array.isArray(data)) return [];
	/** @type {GeocodeResult[]} */
	const out = [];
	for (const item of data) {
		if (!item || typeof item !== 'object') continue;
		const lat = Number(item.lat);
		const lng = Number(item.lon);
		const label = item.display_name;
		if (item.lat === '' || item.lon === '' || item.lat == null || item.lon == null) continue;
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
		out.push({
			lat: Math.round(lat * 1e6) / 1e6,
			lng: Math.round(lng * 1e6) / 1e6,
			label: typeof label === 'string' ? label.slice(0, 300) : ''
		});
		if (out.length >= MAX_RESULTS) break;
	}
	return out;
}

/**
 * Busca una dirección. Primero mira la memoria; si no está, pide lugar en el límite de un pedido
 * por segundo y recién ahí llama a Nominatim. Sin base no se pide nada: sin el límite no se puede
 * cumplir la política.
 *
 * @param {{ address?: unknown, area?: unknown, city?: unknown }} input
 * @param {{ db: D1Database | null | undefined, fetch?: typeof fetch, now?: number }} deps
 * @returns {Promise<GeocodeOutcome>}
 */
export async function geocodeVenue(input, { db, fetch: fetchFn = fetch, now = Date.now() }) {
	const query = buildGeocodeQuery(input);
	if (!query) return { ok: false, reason: 'empty-query' };
	const key = query.toLocaleLowerCase('es');

	const hit = cache.get(key);
	if (hit && now - hit.at < CACHE_TTL_MS) {
		return { ok: true, results: hit.results, cached: true };
	}
	if (hit) cache.delete(key);

	if (!db) return { ok: false, reason: 'unavailable' };
	const rl = await hitRateLimit(db, 'nominatim', NOMINATIM_RATE_LIMIT, now);
	if (!rl.allowed) return { ok: false, reason: 'rate-limited', retryAfter: rl.retryAfter };

	let data;
	try {
		const res = await fetchFn(nominatimUrl(query), {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: `${SITE_URL}/` },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!res.ok) return { ok: false, reason: 'unavailable' };
		data = await res.json();
	} catch {
		return { ok: false, reason: 'unavailable' };
	}

	const results = parseNominatimResults(data);
	if (cache.size >= CACHE_MAX) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, { at: now, results });
	return { ok: true, results, cached: false };
}

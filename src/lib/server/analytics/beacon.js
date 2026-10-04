/**
 * `POST /api/visto`: el navegador avisa que la compra de un evento llegó a «Tus datos» o a
 * «Pagar» (los pasos 2 y 3 del embudo pasan sin ir al servidor). Acepta solo `{ step, slug }`
 * con un paso de la lista fija; cualquier otra cosa se rechaza. No guarda nada de quien manda.
 */
import { isEventSlug } from './classify.js';

/** Los únicos pasos que puede mandar el navegador. */
export const BEACON_STEPS = Object.freeze(['datos', 'pagar']);
/** Tamaño máximo del cuerpo (bytes). */
export const MAX_BEACON_BYTES = 300;

/**
 * Valida el cuerpo del aviso. Solo `{ step, slug }`: claves de más, tipos raros o pasos fuera
 * de la lista se rechazan.
 *
 * @param {string} text
 * @returns {{ ok: true, step: string, slug: string } | { ok: false }}
 */
export function parseBeacon(text) {
	if (typeof text !== 'string' || !text || text.length > MAX_BEACON_BYTES) return { ok: false };
	/** @type {unknown} */
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		return { ok: false };
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
	const keys = Object.keys(body);
	if (keys.length !== 2 || !keys.includes('step') || !keys.includes('slug')) return { ok: false };
	const { step, slug } = /** @type {{ step: unknown, slug: unknown }} */ (body);
	if (typeof step !== 'string' || !BEACON_STEPS.includes(step)) return { ok: false };
	if (typeof slug !== 'string') return { ok: false };
	const lower = slug.toLowerCase();
	if (!isEventSlug(lower)) return { ok: false };
	return { ok: true, step, slug: lower };
}

/**
 * Límite por isolate (en memoria, sin saber quién manda: no hay IP ni cookie): como mucho
 * `limit` avisos por ventana de `windowMs`. Alcanza para frenar un abuso tonto sin guardar nada.
 *
 * @param {{ limit: number, windowMs: number }} options
 */
export function createWindowLimiter({ limit, windowMs }) {
	let windowStart = 0;
	let count = 0;
	return {
		/** @param {number} [now] @returns {boolean} si se permite */
		hit(now = Date.now()) {
			if (now - windowStart >= windowMs) {
				windowStart = now;
				count = 0;
			}
			if (count >= limit) return false;
			count++;
			return true;
		}
	};
}

/** El límite que usa el endpoint: 300 avisos por minuto por isolate. */
export const BEACON_LIMIT = Object.freeze({ limit: 300, windowMs: 60_000 });

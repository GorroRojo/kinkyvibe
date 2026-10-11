/**
 * `POST /api/fondo/mi-link`: fondo.kinkyvibe.ar le pide a kinkyvibe que mande el mail «tu link»
 * (email.js), así hay una sola clave de Resend (issue #265, docs/mails.md).
 *
 * En orden, y sin leer el body antes de chequear el secreto:
 * 1. `x-fondo-secret` = FONDO_MAIL_SECRET, en tiempo constante sobre los SHA-256 (no se filtra el
 *    largo). Sin secreto configurado (o con menos de 16 caracteres): 401 siempre.
 * 2. Body JSON de 4 KB como mucho, `{ to, links: [{ tier, url }] }`, validado entero; cualquier
 *    otra clave, tipo o valor: 400.
 * 3. Tope grueso de mails por hora para todo el sitio (`rate_limits` de D1): 429.
 * 4. Se manda con `deliverEmail` (Resend y, en un preview, solo a EMAIL_ALLOWLIST): 204 si salió
 *    o se simuló/desvió, 502 si falló.
 *
 * Nunca se loguean la dirección ni los links: como mucho, cuántos links y el resultado.
 */
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { normalizeEmail } from '$lib/server/cuentas/accounts.js';
import { FONDO_MAIL_FROM, buildFondoLinkEmail } from './email.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./email.js').FondoLink} FondoLink */

/** Largo mínimo de FONDO_MAIL_SECRET (más corto se considera no configurado). */
export const MIN_FONDO_SECRET_LENGTH = 16;
/** Tamaño máximo del body, en bytes. */
export const MAX_BODY_BYTES = 4096;
export const MAX_LINKS = 5;
export const MAX_URL_LENGTH = 200;
/** Los planes «Mecenas …» de Mercado Pago, tal cual los nombra el Fondo. */
export const FONDO_TIERS = Object.freeze([
	'Visitante',
	'Casual',
	'Regular',
	'Sugar',
	'Estrella',
	'Leyenda',
	'Super'
]);
/** Solo la página de gracias del Fondo con el id de la suscripción (hex). */
export const FONDO_LINK_RE =
	/^https:\/\/fondo\.kinkyvibe\.ar\/gracias\?preapproval_id=[0-9a-fA-F]+$/;
/** Tope de mails «tu link» por hora, sumando todos (el Fondo además limita por mail y por IP). */
export const FONDO_MAIL_CAP = Object.freeze({ limit: 30, windowSeconds: 60 * 60 });
/** La clave fija del tope (no lleva datos de nadie). */
const BUCKET = 'fondo:mi-link:global';

/**
 * ¿El header coincide con FONDO_MAIL_SECRET? Sin secreto configurado (o muy corto), siempre `false`.
 *
 * @param {string | null | undefined} given
 * @param {string | null | undefined} expected
 */
export async function isValidFondoSecret(given, expected) {
	if (!expected || expected.length < MIN_FONDO_SECRET_LENGTH || !given) return false;
	return timingSafeEqual(await sha256Hex(given), await sha256Hex(expected));
}

/**
 * El body como texto, o `null` si pasa de `max` bytes (corta la lectura apenas se pasa).
 *
 * @param {Request} request
 * @param {number} [max]
 */
export async function readBodyCapped(request, max = MAX_BODY_BYTES) {
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > max) return null;
	if (!request.body) return '';
	const reader = request.body.getReader();
	/** @type {Uint8Array[]} */
	const chunks = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainObject = (value) =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	Object.getPrototypeOf(value) === Object.prototype;

/**
 * ¿Tiene exactamente estas claves (ni más ni menos)?
 * @param {Record<string, unknown>} obj @param {string[]} keys
 */
const hasExactKeys = (obj, keys) => {
	const own = Object.keys(obj);
	return own.length === keys.length && keys.every((k) => Object.hasOwn(obj, k));
};

/**
 * Un link válido del Fondo (o `null`).
 * @param {unknown} raw
 * @returns {FondoLink | null}
 */
function parseLink(raw) {
	if (!isPlainObject(raw) || !hasExactKeys(raw, ['tier', 'url'])) return null;
	const { tier, url } = raw;
	if (typeof tier !== 'string' || !FONDO_TIERS.includes(tier)) return null;
	if (typeof url !== 'string' || url.length > MAX_URL_LENGTH || !FONDO_LINK_RE.test(url)) {
		return null;
	}
	return { tier, url };
}

/**
 * Valida el body ya leído. Devuelve un objeto nuevo armado solo con lo validado, o `null`.
 *
 * @param {string} text
 * @returns {{ to: string, links: FondoLink[] } | null}
 */
export function parseMiLinkBody(text) {
	/** @type {unknown} */
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isPlainObject(body) || !hasExactKeys(body, ['to', 'links'])) return null;
	const to = normalizeEmail(body.to);
	if (!to) return null;
	const raw = body.links;
	if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LINKS) return null;
	/** @type {FondoLink[]} */
	const links = [];
	for (const item of raw) {
		const link = parseLink(item);
		if (!link) return null;
		links.push(link);
	}
	return { to, links };
}

/** ¿El pedido dice que manda JSON? @param {Request} request */
function isJson(request) {
	const type = request.headers.get('content-type') ?? '';
	return type.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * @typedef {(input: {
 *   to: string,
 *   message: { subject: string, html: string, text: string },
 *   from: string
 * }) => Promise<'sent' | 'simulated' | 'failed'>} FondoSend
 */

/**
 * Respuesta corta, sin detalles.
 * @param {number} status @param {string} [code] @param {Record<string, string>} [extra]
 */
function reply(status, code, extra = {}) {
	/** @type {Record<string, string>} */
	const headers = { 'cache-control': 'no-store', ...extra };
	if (!code) return new Response(null, { status, headers });
	headers['content-type'] = 'text/plain; charset=utf-8';
	return new Response(code, { status, headers });
}

/**
 * Atiende el pedido entero (la ruta solo junta el entorno).
 *
 * @param {{
 *   request: Request,
 *   secret: string | undefined,
 *   db: D1Database | null | undefined,
 *   send: FondoSend,
 *   origin?: string,
 *   now?: number
 * }} input
 * @returns {Promise<Response>}
 */
export async function handleMiLink({ request, secret, db, send, origin, now = Date.now() }) {
	if (!(await isValidFondoSecret(request.headers.get('x-fondo-secret'), secret))) {
		return reply(401, 'unauthorized');
	}
	if (!isJson(request)) return reply(400, 'bad_request');
	const text = await readBodyCapped(request);
	if (text === null) return reply(400, 'bad_request');
	const input = parseMiLinkBody(text);
	if (!input) return reply(400, 'bad_request');

	// Sin base no hay tope: no se manda (nunca queda sin límite).
	if (!db) return reply(503, 'unavailable');
	try {
		const limit = await hitRateLimit(db, BUCKET, FONDO_MAIL_CAP, now);
		if (!limit.allowed) {
			console.warn('[fondo] mi-link: tope por hora alcanzado');
			return reply(429, 'rate_limited', { 'retry-after': String(limit.retryAfter) });
		}
	} catch {
		console.error('[fondo] mi-link: no se pudo leer el tope');
		return reply(503, 'unavailable');
	}

	const message = buildFondoLinkEmail({ links: input.links, origin });
	/** @type {'sent' | 'simulated' | 'failed'} */
	let result;
	try {
		result = await send({ to: input.to, message, from: FONDO_MAIL_FROM });
	} catch {
		// El error de Resend puede repetir la dirección: no se loguea.
		result = 'failed';
	}
	console.log(`[fondo] mi-link: ${result} (${input.links.length} link(s))`);
	if (result === 'failed') return reply(502, 'send_failed');
	return reply(204);
}

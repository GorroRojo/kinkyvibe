/**
 * Contador anónimo de "Me interesa" por evento.
 *
 * Privacidad: cada navegador tiene una cookie httpOnly con un UUID aleatorio. En la base solo
 * se guarda SHA-256(sal : evento : uuid), así que:
 * - no hay nombres, mails, IPs ni nada que identifique a la persona;
 * - no se puede saber a qué otros eventos marcó interés el mismo navegador;
 * - sin la cookie no se puede reconstruir el hash.
 */
import { hitRateLimit } from './rateLimit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ count: number, interested: boolean }} Interest */

export const VISITOR_COOKIE = 'kv_visitor';
const DEFAULT_SALT = 'kinkyvibe-interest-v1';
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,199}$/i;
const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Límites para marcar/desmarcar. Por navegador y evento, y total por evento (anti-bots). */
export const INTEREST_RATE_LIMITS = {
	visitor: { limit: 10, windowSeconds: 60 },
	event: { limit: 120, windowSeconds: 60 }
};

/** @param {unknown} slug */
export function isValidEventSlug(slug) {
	return typeof slug === 'string' && SLUG_RE.test(slug);
}

/** @param {unknown} id */
export function isValidVisitorId(id) {
	return typeof id === 'string' && VISITOR_ID_RE.test(id);
}

/** @param {string} slug */
function assertSlug(slug) {
	if (!isValidEventSlug(slug)) throw new TypeError(`Slug de evento inválido: ${slug}`);
}

/**
 * @param {string} eventSlug
 * @param {string} visitorId UUID aleatorio de la cookie
 * @param {string | undefined} [salt]
 * @returns {Promise<string>} hash hexadecimal
 */
export async function hashVisitor(eventSlug, visitorId, salt) {
	assertSlug(eventSlug);
	if (!isValidVisitorId(visitorId)) throw new TypeError('Id de visitante inválido');
	const data = new TextEncoder().encode(`${salt || DEFAULT_SALT}:${eventSlug}:${visitorId}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {D1Database} db
 * @param {string} eventSlug
 */
function countStatement(db, eventSlug) {
	return db
		.prepare('SELECT COUNT(*) AS count FROM event_interest WHERE event_slug = ?1')
		.bind(eventSlug);
}

/**
 * @param {{ results: unknown[] }} result
 */
function readCount(result) {
	const row = /** @type {{ count?: number } | undefined} */ (result.results[0]);
	return Number(row?.count ?? 0);
}

/**
 * Cantidad de interesades y si este navegador ya marcó interés.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string | null} [visitorHash]
 * @returns {Promise<Interest>}
 */
export async function getInterest(db, eventSlug, visitorHash = null) {
	assertSlug(eventSlug);
	if (!visitorHash) {
		const result = await countStatement(db, eventSlug).all();
		return { count: readCount(result), interested: false };
	}
	const [count, mine] = await db.batch([
		countStatement(db, eventSlug),
		db
			.prepare('SELECT 1 AS found FROM event_interest WHERE event_slug = ?1 AND visitor_hash = ?2')
			.bind(eventSlug, visitorHash)
	]);
	return { count: readCount(count), interested: mine.results.length > 0 };
}

/**
 * Marca o desmarca interés. Es idempotente: repetir la misma operación no cambia nada.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} visitorHash
 * @param {boolean} interested
 * @returns {Promise<Interest>}
 */
export async function setInterest(db, eventSlug, visitorHash, interested) {
	assertSlug(eventSlug);
	if (typeof visitorHash !== 'string' || !/^[0-9a-f]{64}$/.test(visitorHash)) {
		throw new TypeError('Hash de visitante inválido');
	}
	const write = interested
		? db
				.prepare('INSERT OR IGNORE INTO event_interest (event_slug, visitor_hash) VALUES (?1, ?2)')
				.bind(eventSlug, visitorHash)
		: db
				.prepare('DELETE FROM event_interest WHERE event_slug = ?1 AND visitor_hash = ?2')
				.bind(eventSlug, visitorHash);
	const [, count] = await db.batch([write, countStatement(db, eventSlug)]);
	return { count: readCount(count), interested };
}

/**
 * Aplica los límites de INTEREST_RATE_LIMITS.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} visitorHash
 * @param {number} [now]
 * @returns {Promise<{ allowed: boolean, retryAfter: number }>}
 */
export async function checkInterestRateLimit(db, eventSlug, visitorHash, now = Date.now()) {
	assertSlug(eventSlug);
	const perVisitor = await hitRateLimit(
		db,
		`interest:v:${visitorHash}`,
		INTEREST_RATE_LIMITS.visitor,
		now
	);
	if (!perVisitor.allowed) return perVisitor;
	return hitRateLimit(db, `interest:e:${eventSlug}`, INTEREST_RATE_LIMITS.event, now);
}

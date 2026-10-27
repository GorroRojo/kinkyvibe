/**
 * Rebotes y quejas que avisa Resend (docs/mails.md, «Rebotes y quejas»). Resend firma cada aviso
 * como Svix: cabeceras `svix-id`, `svix-timestamp` (segundos) y `svix-signature` («v1,<base64>»,
 * varias separadas por espacios cuando se rota el secreto). La firma es HMAC-SHA256 de
 * `<svix-id>.<svix-timestamp>.<cuerpo>` con el secreto `whsec_<base64>` del panel de Resend
 * (`RESEND_WEBHOOK_SECRET`). Sin ese secreto, la ruta no hace nada (503).
 *
 * Lo que hace con un aviso válido:
 * - `email.bounced` permanente y `email.complained`: la dirección pasa a `email_suppressions` (la
 *   misma tabla de «No fui yo», por hash: no le sale más ningún mail que no sea de una compra
 *   pagada) y, si es el mail de las entradas de una orden (`orders.email_id`), la orden queda con
 *   `email_problem` (el panel muestra «el mail rebotó» o «lo marcó como spam»).
 * - `email.suppressed` (Resend no lo mandó porque la dirección ya estaba bloqueada allá): solo
 *   marca la orden.
 * - Los demás (entregado, abierto, rebote temporal…): nada.
 *
 * Nunca se loguea ni se guarda una dirección: solo el tipo de aviso y si encontró una orden.
 */
import { timingSafeEqual } from '$lib/server/hash.js';
import { fromBase64, toBase64 } from '$lib/utils/base64.js';
import { suppressAddress } from './suppressions.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cuánto puede diferir `svix-timestamp` del reloj (para los dos lados), en segundos. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** Tamaño máximo del cuerpo de un aviso (los de Resend pesan pocos KB). */
export const WEBHOOK_MAX_BYTES = 64 * 1024;

/** Cuánto se guardan los `svix-id` ya procesados (Resend reintenta durante horas, no días). */
export const WEBHOOK_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SVIX_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const TIMESTAMP_RE = /^\d{1,12}$/;
const SIGNATURE_RE = /^[A-Za-z0-9+/]{43}=$/;

/**
 * La clave HMAC de un secreto `whsec_<base64>` (o `null` si no tiene esa forma).
 *
 * @param {string} secret
 */
function secretKeyBytes(secret) {
	const m = /^whsec_([A-Za-z0-9+/=]+)$/.exec(secret.trim());
	if (!m) return null;
	try {
		const bytes = fromBase64(m[1]);
		return bytes.length >= 16 ? bytes : null;
	} catch {
		return null;
	}
}

/**
 * Firma Svix (`v1`) de un cuerpo, en base64. Exportada para los tests.
 *
 * @param {{ secret: string, id: string, timestamp: string, body: string }} input
 */
export async function signWebhook({ secret, id, timestamp, body }) {
	const keyBytes = secretKeyBytes(secret);
	if (!keyBytes) throw new Error('secreto de Resend con otra forma (se espera whsec_…)');
	const key = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`${id}.${timestamp}.${body}`)
	);
	return toBase64(new Uint8Array(sig));
}

/**
 * ¿El aviso viene de Resend? Revisa la forma de las cabeceras, que la marca de tiempo esté a menos
 * de {@link WEBHOOK_TOLERANCE_SECONDS} del reloj y que alguna firma `v1` coincida (en tiempo
 * constante).
 *
 * @param {{
 *   secret: string,
 *   id: string | null,
 *   timestamp: string | null,
 *   signature: string | null,
 *   body: string,
 *   now?: number
 * }} input
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function verifyWebhook({ secret, id, timestamp, signature, body, now = Date.now() }) {
	if (!id || !SVIX_ID_RE.test(id)) return { ok: false, reason: 'svix-id' };
	if (!timestamp || !TIMESTAMP_RE.test(timestamp)) return { ok: false, reason: 'timestamp' };
	if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS)
		return { ok: false, reason: 'old-timestamp' };
	if (!signature || signature.length > 2000) return { ok: false, reason: 'signature' };
	if (!secretKeyBytes(secret)) return { ok: false, reason: 'secret' };
	const expected = await signWebhook({ secret, id, timestamp, body });
	let match = false;
	for (const part of signature.split(' ')) {
		const [version, value] = part.split(',', 2);
		if (version !== 'v1' || !value || !SIGNATURE_RE.test(value)) continue;
		// Sin cortar al primer acierto: cada candidata se compara entera.
		if (timingSafeEqual(expected, value)) match = true;
	}
	return match ? { ok: true } : { ok: false, reason: 'signature' };
}

/**
 * Qué problema anota un aviso, o `null` si no es de los que importan.
 *
 * @param {any} event
 * @returns {{ problem: 'bounced' | 'complained' | 'suppressed', suppress: boolean } | null}
 */
export function problemOf(event) {
	const type = event?.type;
	if (type === 'email.bounced')
		return event?.data?.bounce?.type === 'Permanent'
			? { problem: 'bounced', suppress: true }
			: null;
	if (type === 'email.complained') return { problem: 'complained', suppress: true };
	if (type === 'email.suppressed') return { problem: 'suppressed', suppress: false };
	return null;
}

/**
 * Las direcciones de `data.to` («Nombre <dir>» o «dir»), como mucho 50.
 *
 * @param {unknown} to
 * @returns {string[]}
 */
function recipients(to) {
	const list = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
	return list
		.filter((x) => typeof x === 'string')
		.slice(0, 50)
		.map((x) => /<([^<>]+)>\s*$/.exec(x)?.[1] ?? x)
		.map((x) => x.trim())
		.filter((x) => x.includes('@') && x.length <= 320);
}

/**
 * Procesa un aviso ya verificado. Dos veces el mismo `svix-id` es lo mismo que una (`duplicate`).
 * Si la base falla, tira (la ruta contesta 500 y Resend reintenta; todo es idempotente).
 *
 * @param {D1Database} db
 * @param {{ svixId: string, event: any, now?: number }} input
 * @returns {Promise<{ outcome: 'duplicate' | 'ignored' | 'marked' | 'unmatched' }>}
 */
export async function handleResendEvent(db, { svixId, event, now = Date.now() }) {
	const seen = await db
		.prepare('SELECT 1 AS x FROM resend_webhook_events WHERE svix_id = ?1')
		.bind(svixId)
		.first();
	if (seen) return { outcome: 'duplicate' };

	/** @type {'ignored' | 'marked' | 'unmatched'} */
	let outcome = 'ignored';
	const what = problemOf(event);
	if (what) {
		if (what.suppress) {
			for (const address of recipients(event?.data?.to)) await suppressAddress(db, address, now);
		}
		const emailId = event?.data?.email_id;
		const result =
			typeof emailId === 'string' && emailId && emailId.length <= 100
				? await db
						.prepare(
							`UPDATE orders SET email_problem = ?2, email_problem_at = ?3
							WHERE email_id = ?1`
						)
						.bind(emailId, what.problem, now)
						.run()
				: null;
		outcome = (result?.meta?.changes ?? 0) > 0 ? 'marked' : 'unmatched';
		console.log(
			`[mails] Resend avisó ${event.type}: ${outcome === 'marked' ? 'orden marcada' : 'sin orden'}`
		);
	}

	await db.batch([
		db
			.prepare('INSERT OR IGNORE INTO resend_webhook_events (svix_id, received_at) VALUES (?1, ?2)')
			.bind(svixId, now),
		db
			.prepare('DELETE FROM resend_webhook_events WHERE received_at < ?1')
			.bind(now - WEBHOOK_EVENT_TTL_MS)
	]);
	return { outcome };
}

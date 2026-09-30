/**
 * Resguardos de la venta de entradas contra el abuso de reservas y mails:
 *
 * - `clientHash`: identifica una conexión (la IP que da Cloudflare) con un hash con sal que rota
 *   cada día. Sirve para los límites por cliente; la IP nunca se guarda ni se loguea.
 * - Confirmación de las reservas por transferencia: el mail lleva un link firmado
 *   (`confirmUrl`) que extiende la reserva inicial corta a la completa.
 */
import { env } from '$env/dynamic/private';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const CONFIRM_KEY = 'hold_confirm_key';

/** @param {string} text */
async function sha256Hex(text) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash anónimo de la conexión para los límites por cliente. La sal cambia cada día (UTC), así
 * que no sirve para seguir a nadie en el tiempo; `TICKETS_CLIENT_SALT` (opcional) la hace secreta.
 *
 * @param {string} address la IP (en Cloudflare, CF-Connecting-IP vía `getClientAddress()`)
 * @param {number} [now]
 */
export async function clientHash(address, now = Date.now()) {
	const day = new Date(now).toISOString().slice(0, 10);
	const salt = env.TICKETS_CLIENT_SALT || 'kinkyvibe-tickets';
	return (await sha256Hex(`${salt}|${day}|${address}`)).slice(0, 32);
}

/**
 * La IP de la request, sin romper donde no se puede saber (tests, prerender).
 * @param {{ getClientAddress?: () => string }} event
 */
export function clientAddress(event) {
	try {
		return event.getClientAddress?.() || 'unknown';
	} catch {
		return 'unknown';
	}
}

/** @param {Uint8Array} bytes */
function base64url(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Clave para firmar los links de confirmación: al azar, se crea sola la primera vez y queda en
 * D1 (`ticket_settings`), nunca en el repo.
 *
 * @param {D1Database} db
 */
async function confirmKey(db) {
	const read = async () =>
		/** @type {{ value: string } | null} */ (
			await db.prepare('SELECT value FROM ticket_settings WHERE key = ?1').bind(CONFIRM_KEY).first()
		)?.value ?? null;
	let key = await read();
	if (!key) {
		const random = base64url(crypto.getRandomValues(new Uint8Array(32)));
		await db
			.prepare(
				`INSERT OR IGNORE INTO ticket_settings (key, value, updated_at, updated_by)
				VALUES (?1, ?2, ?3, 'sistema')`
			)
			.bind(CONFIRM_KEY, random, Date.now())
			.run();
		key = await read();
	}
	if (!key) throw new Error('no se pudo crear la clave de confirmación');
	return key;
}

/**
 * Firma (HMAC-SHA256) de la confirmación de una orden.
 *
 * @param {D1Database} db
 * @param {string} orderId
 */
export async function confirmToken(db, orderId) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await confirmKey(db)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`confirm:${orderId}`));
	return base64url(new Uint8Array(sig)).slice(0, 32);
}

/**
 * ¿`token` es la firma de la confirmación de esta orden? (comparación en tiempo constante)
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {unknown} token
 */
export async function verifyConfirmToken(db, orderId, token) {
	if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(token)) return false;
	const expected = await confirmToken(db, orderId);
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	return diff === 0;
}

/**
 * Link del mail para confirmar una reserva por transferencia.
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} orderId
 */
export async function confirmUrl(db, origin, orderId) {
	return `${origin}/entradas/${orderId}/confirmar?k=${await confirmToken(db, orderId)}`;
}

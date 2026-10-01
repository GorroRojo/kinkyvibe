/**
 * Resguardos de la venta de entradas contra el abuso de reservas y mails:
 *
 * - `clientHash`: identifica una conexión (la IP que da Cloudflare) con un hash con sal que rota
 *   cada día. Sirve para los límites por cliente; la IP nunca se guarda ni se loguea.
 * - Confirmación de las reservas por transferencia: el mail lleva un link firmado
 *   (`confirmUrl`) que extiende la reserva inicial corta a la completa.
 */
import { env } from '$env/dynamic/private';
import { sha256Hex } from '$lib/server/hash.js';
import { toBase64url } from '$lib/utils/base64.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const CONFIRM_KEY = 'hold_confirm_key';

/**
 * Los 8 grupos de una IPv6 (sin ceros a la izquierda), o `null` si no es una IPv6 válida.
 *
 * @param {string} address
 * @returns {string[] | null}
 */
function ipv6Groups(address) {
	let s = address.toLowerCase().replace(/%.*$/, '');
	// IPv4 al final ("::ffff:192.0.2.1", "64:ff9b::192.0.2.1"): dos grupos más.
	const v4 = s.match(/(?:^|:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const [a, b, c, d] = v4.slice(1).map(Number);
		if ([a, b, c, d].some((n) => n > 255)) return null;
		const tail = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
		s = s.slice(0, s.length - v4[0].length) + (v4[0].startsWith(':') ? ':' : '') + tail;
	}
	const halves = s.split('::');
	if (halves.length > 2) return null;
	const head = halves[0] ? halves[0].split(':') : [];
	const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
	const missing = 8 - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
	const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
	if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
	return groups.map((g) => parseInt(g, 16).toString(16));
}

/**
 * Qué se cuenta como "una conexión": una IPv4 tal cual, y una IPv6 por su red /64 (a cada casa
 * o servidor le toca por lo menos una /64 entera, así que contar cada dirección por separado
 * dejaría saltar los límites con solo cambiar los últimos números). Una IPv4 escrita como IPv6
 * ("::ffff:192.0.2.1") vale como IPv4. Lo que no se entiende queda como vino.
 *
 * @param {string} address
 */
export function clientNetwork(address) {
	const a = String(address ?? '').trim();
	if (!a.includes(':')) return a;
	const groups = ipv6Groups(a);
	if (!groups) return a;
	if (groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') {
		const n = (/** @type {string} */ g) => parseInt(g, 16);
		return [n(groups[6]) >> 8, n(groups[6]) & 255, n(groups[7]) >> 8, n(groups[7]) & 255].join('.');
	}
	return `${groups.slice(0, 4).join(':')}::/64`;
}

/**
 * Hash anónimo de la conexión para los límites por cliente. La sal cambia cada día (UTC), así
 * que no sirve para seguir a nadie en el tiempo; `TICKETS_CLIENT_SALT` (opcional) la hace secreta.
 * Las IPv6 se agrupan por /64 (`clientNetwork`); las IPv4 dan el mismo hash que antes.
 *
 * @param {string} address la IP (en Cloudflare, CF-Connecting-IP vía `getClientAddress()`)
 * @param {number} [now]
 */
export async function clientHash(address, now = Date.now()) {
	const day = new Date(now).toISOString().slice(0, 10);
	const salt = env.TICKETS_CLIENT_SALT || 'kinkyvibe-tickets';
	return (await sha256Hex(`${salt}|${day}|${clientNetwork(address)}`)).slice(0, 32);
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
		const random = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
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
	return toBase64url(new Uint8Array(sig)).slice(0, 32);
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

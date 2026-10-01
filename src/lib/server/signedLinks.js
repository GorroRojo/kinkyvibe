/**
 * Links firmados (HMAC-SHA256) con una clave al azar que se crea sola la primera vez y queda en
 * D1 (`ticket_settings`), nunca en el repo. Para links que hay que poder volver a armar sin
 * guardar el token: la confirmación de una reserva por transferencia (tickets/safeguards.js) y
 * la baja de "Avisame si se repite" (series/subscriptions.js). Cada uso tiene su propia clave.
 */
import { toBase64url } from '$lib/server/cuentas/crypto.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * La clave `name` de `ticket_settings`; si no existe, la crea (32 bytes al azar). Si dos pedidos
 * la crean a la vez, gana el primero (INSERT OR IGNORE) y los dos leen la misma.
 *
 * @param {D1Database} db
 * @param {string} name
 */
export async function storedSecret(db, name) {
	const read = async () =>
		/** @type {{ value: string } | null} */ (
			await db.prepare('SELECT value FROM ticket_settings WHERE key = ?1').bind(name).first()
		)?.value ?? null;
	let key = await read();
	if (!key) {
		const random = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
		await db
			.prepare(
				`INSERT OR IGNORE INTO ticket_settings (key, value, updated_at, updated_by)
				VALUES (?1, ?2, ?3, 'sistema')`
			)
			.bind(name, random, Date.now())
			.run();
		key = await read();
	}
	if (!key) throw new Error(`no se pudo crear la clave ${name}`);
	return key;
}

/**
 * Firma de `message` con la clave `keyName`, en base64url, cortada a `length` caracteres.
 *
 * @param {D1Database} db
 * @param {string} keyName
 * @param {string} message
 * @param {number} [length]
 */
export async function signLink(db, keyName, message, length = 32) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await storedSecret(db, keyName)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return toBase64url(new Uint8Array(sig)).slice(0, length);
}

/**
 * ¿`token` es la firma de `message`? En tiempo constante.
 *
 * @param {D1Database} db
 * @param {string} keyName
 * @param {string} message
 * @param {unknown} token
 * @param {number} [length]
 */
export async function verifyLink(db, keyName, message, token, length = 32) {
	if (typeof token !== 'string' || token.length !== length || !/^[A-Za-z0-9_-]+$/.test(token))
		return false;
	const expected = await signLink(db, keyName, message, length);
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	return diff === 0;
}

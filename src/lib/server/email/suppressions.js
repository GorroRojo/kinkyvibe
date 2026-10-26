/**
 * «No fui yo» (docs/mails.md): varios formularios públicos le mandan un mail a la dirección que
 * escribe quien los llena, sin confirmarla antes (entradas gratis, reservas por transferencia, el
 * mail de confirmar de la lista de espera y el de «Avisame si se repite»). Esos mails llevan en el
 * pie un link firmado para que quien los recibe diga «no fui yo»: la dirección queda en
 * `email_suppressions` (migración 0060) y no le sale ningún mail más que no sea de una compra
 * pagada (`deliver()` con `optOut`, tickets/index.js). La orden o la anotación se crean igual.
 *
 * Además, un tope por dirección entre todos esos formularios juntos ({@link UNCONFIRMED_MAIL_CAP}),
 * aparte de los límites de cada uno.
 *
 * Nunca se guarda el mail: la clave es `emailHash` de las cuentas (el mismo hash de los límites).
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { emailHash } from '$lib/server/cuentas/accounts.js';
import { signLink, verifyLink } from '$lib/server/signedLinks.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Clave de `ticket_settings` que firma los links «No fui yo» (se crea sola). */
const OPT_OUT_KEY = 'mail_opt_out_key';

/** Ruta de la página del link (GET muestra el botón; el POST corta los mails). */
export const OPT_OUT_PATH = '/mails/no-fui-yo/';

/**
 * Mails a una misma dirección sin confirmar, sumando entradas gratis, reservas por transferencia,
 * confirmar la lista de espera y confirmar «Avisame si se repite».
 */
export const UNCONFIRMED_MAIL_CAP = Object.freeze({ limit: 5, windowSeconds: 24 * 60 * 60 });

const TOKEN_RE = /^([0-9a-f]{64})\.([A-Za-z0-9_-]{32})$/;

/**
 * El hash de una dirección (en minúsculas y sin espacios, como `normalizeEmail`), o `null` si no
 * hay dirección.
 *
 * @param {unknown} email
 */
export async function suppressionHash(email) {
	if (typeof email !== 'string') return null;
	const normalized = email.trim().toLowerCase();
	return normalized ? emailHash(normalized) : null;
}

/**
 * Link «No fui yo» de una dirección: `<origin>/mails/no-fui-yo/<hash>.<firma>`, o `null` si no hay
 * dirección.
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} email
 */
export async function optOutUrl(db, origin, email) {
	const hash = await suppressionHash(email);
	if (!hash) return null;
	return `${origin}${OPT_OUT_PATH}${hash}.${await signLink(db, OPT_OUT_KEY, `optout:${hash}`)}`;
}

/**
 * ¿El token del link es válido? Devuelve el hash de la dirección, o `null`.
 *
 * @param {D1Database} db
 * @param {unknown} token `<hash>.<firma>`
 */
export async function checkOptOutToken(db, token) {
	if (typeof token !== 'string') return null;
	const m = token.match(TOKEN_RE);
	if (!m) return null;
	return (await verifyLink(db, OPT_OUT_KEY, `optout:${m[1]}`, m[2])) ? m[1] : null;
}

/**
 * Corta los mails a la dirección del link. `false` si el link no es válido; dos veces es lo mismo
 * que una.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 */
export async function suppressByToken(db, token, now = Date.now()) {
	const hash = await checkOptOutToken(db, token);
	if (!hash) return false;
	await db
		.prepare('INSERT OR IGNORE INTO email_suppressions (email_hash, created_at) VALUES (?1, ?2)')
		.bind(hash, now)
		.run();
	return true;
}

/**
 * Anota una dirección en la misma tabla sin pasar por el link: la usa el webhook de Resend cuando
 * un mail rebota para siempre o lo marcan como spam (email/resendWebhook.js). Dos veces es lo mismo
 * que una.
 *
 * @param {D1Database} db
 * @param {string} email
 * @param {number} [now]
 */
export async function suppressAddress(db, email, now = Date.now()) {
	const hash = await suppressionHash(email);
	if (!hash) return;
	await db
		.prepare('INSERT OR IGNORE INTO email_suppressions (email_hash, created_at) VALUES (?1, ?2)')
		.bind(hash, now)
		.run();
}

/**
 * ¿Esta dirección dijo «no fui yo»? Si la base falla, tira (quien llama no manda: ver `deliver()`).
 *
 * @param {D1Database} db
 * @param {string} email
 */
export async function isSuppressed(db, email) {
	const hash = await suppressionHash(email);
	if (!hash) return false;
	const row = await db
		.prepare('SELECT 1 AS x FROM email_suppressions WHERE email_hash = ?1')
		.bind(hash)
		.first();
	return Boolean(row);
}

/**
 * ¿Es una orden gratis? Los mails de sus entradas (entradas, recordatorios, link de la
 * transmisión, cambio de fecha) respetan «No fui yo»; los de una orden paga salen siempre. El de
 * los datos para transferir (todavía sin pagar) lo respeta siempre (`sendTransferEmail`). Se mira
 * solo el medio, no el estado: estos mails salen de órdenes aprobadas, y un objeto con el estado
 * de antes no puede cortar el mail de una compra pagada.
 *
 * @param {{ payment_method: string }} order
 */
export function isFreeOrder(order) {
	return order.payment_method === 'gratis';
}

/**
 * Cuenta un mail más a una dirección sin confirmar y dice si entra en {@link UNCONFIRMED_MAIL_CAP}.
 * Si la base falla, `false` (no se manda).
 *
 * @param {D1Database} db
 * @param {string} email
 * @param {number} [now]
 */
export async function unconfirmedMailAllowed(db, email, now = Date.now()) {
	try {
		const hash = await suppressionHash(email);
		if (!hash) return false;
		const r = await hitRateLimit(db, `mail:sin-confirmar:${hash}`, UNCONFIRMED_MAIL_CAP, now);
		if (!r.allowed)
			console.warn('[mails] tope de mails a una dirección sin confirmar: no se manda');
		return r.allowed;
	} catch (error) {
		console.error('[mails] no se pudo contar el tope de mails sin confirmar:', error);
		return false;
	}
}

/**
 * Cuentas del público: los pasos de "Ingresar" con sus límites de intentos. Las páginas
 * (src/routes/(content)/ingresar y /mi-rincon) llaman a esto; las piezas están en:
 * accounts.js (cuentas y contraseñas), codes.js (códigos por mail), session.js (sesiones),
 * orders.js (compras de la cuenta), password.js (PBKDF2). Ver docs/cuentas.md.
 *
 * Límites (tabla rate_limits, ver db/rateLimit.js): por hash del mail y por hash de la conexión
 * (`clientHash` de las entradas: IP con sal que rota cada día; la IP nunca se guarda). Los
 * mensajes nunca dicen si un mail tiene cuenta o contraseña.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { checkPassword, emailHash, normalizeEmail, upsertVerifiedAccount } from './accounts.js';
import { createLoginCode, normalizeCode, verifyLoginCode } from './codes.js';
import { buildLoginCodeEmail } from './email.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {(to: string, message: { subject: string, html: string, text: string }, log: string) => Promise<'sent' | 'simulated' | 'failed'>} SendMail */

export const RATE_LIMITS = Object.freeze({
	/** Códigos pedidos para un mismo mail: pocos seguidos y un tope por día (no llenar casillas). */
	codeRequestEmail: { limit: 3, windowSeconds: 15 * 60 },
	codeRequestEmailDay: { limit: 10, windowSeconds: 24 * 60 * 60 },
	/** Códigos pedidos desde una misma conexión (para cualquier mail). */
	codeRequestClient: { limit: 10, windowSeconds: 15 * 60 },
	/** Intentos de código desde una misma conexión (además de los 5 por código). */
	codeVerifyClient: { limit: 20, windowSeconds: 15 * 60 },
	/** Intentos de contraseña por mail y por conexión. */
	passwordEmail: { limit: 10, windowSeconds: 15 * 60 },
	passwordClient: { limit: 20, windowSeconds: 15 * 60 }
});

export const MESSAGES = Object.freeze({
	badEmail: 'Revisá el mail: no parece una dirección válida.',
	badCode: 'El código tiene 6 números. Revisalo y probá de nuevo.',
	wrongCode: 'Ese código no es. Revisalo y probá de nuevo.',
	expiredCode: 'El código venció o ya se usó. Pedí uno nuevo.',
	tooManyCodes: 'Pediste varios códigos seguidos. Esperá unos minutos y probá de nuevo.',
	tooManyAttempts: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
	mailFailed: 'No pudimos mandar el mail. Probá de nuevo en un rato.',
	badLogin: 'El mail o la contraseña no coinciden.'
});

/**
 * @param {D1Database} db
 * @param {string} bucket
 * @param {import('$lib/server/db/rateLimit.js').RateLimitRule} rule
 * @param {number} now
 */
async function allowed(db, bucket, rule, now) {
	return (await hitRateLimit(db, bucket, rule, now)).allowed;
}

/**
 * Hash corto de la conexión para las claves de límite (ya viene con sal diaria).
 * @param {string} client
 */
const clientKey = (client) => sha256Hex(`cuentas:client:${client}`);

/**
 * Paso 1 del ingreso con código: manda un código al mail. La respuesta es la misma haya o no
 * una cuenta con ese mail (la cuenta se crea recién cuando se verifica el código).
 *
 * @param {{ db: D1Database, email: unknown, client: string, send: SendMail, now?: number }} input
 * @returns {Promise<{ ok: true, email: string } | { ok: false, status: number, message: string }>}
 */
export async function requestCode({ db, email: rawEmail, client, send, now = Date.now() }) {
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: MESSAGES.badEmail };
	const hash = await emailHash(email);
	const ck = await clientKey(client);
	// Primero la conexión (así nadie gasta el cupo de un mail ajeno desde una sola conexión).
	if (!(await allowed(db, `cuentas:code:c:${ck}`, RATE_LIMITS.codeRequestClient, now)))
		return { ok: false, status: 429, message: MESSAGES.tooManyCodes };
	const perEmail = await allowed(db, `cuentas:code:e:${hash}`, RATE_LIMITS.codeRequestEmail, now);
	const perDay = await allowed(db, `cuentas:code:ed:${hash}`, RATE_LIMITS.codeRequestEmailDay, now);
	if (!perEmail || !perDay) return { ok: false, status: 429, message: MESSAGES.tooManyCodes };
	const { code } = await createLoginCode(db, hash, { now });
	// `log` solo se muestra en `vite dev` sin RESEND_API_KEY (tickets/index.js): así se puede
	// probar en local. Nunca se loguea en producción.
	const result = await send(email, buildLoginCodeEmail({ code }), `Código: ${code}`);
	if (result === 'failed') return { ok: false, status: 502, message: MESSAGES.mailFailed };
	return { ok: true, email };
}

/**
 * Paso 2: verifica el código y devuelve la cuenta (creada si es el primer ingreso).
 *
 * @param {{ db: D1Database, email: unknown, code: unknown, client: string, now?: number }} input
 * @returns {Promise<{ ok: true, account: import('./accounts.js').Account }
 *   | { ok: false, status: number, message: string }>}
 */
export async function verifyCode({ db, email: rawEmail, code: rawCode, client, now = Date.now() }) {
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: MESSAGES.badEmail };
	const code = normalizeCode(rawCode);
	if (!code) return { ok: false, status: 400, message: MESSAGES.badCode };
	const ck = await clientKey(client);
	if (!(await allowed(db, `cuentas:verify:c:${ck}`, RATE_LIMITS.codeVerifyClient, now)))
		return { ok: false, status: 429, message: MESSAGES.tooManyAttempts };
	const result = await verifyLoginCode(db, await emailHash(email), code, { now });
	if (result === 'wrong') return { ok: false, status: 400, message: MESSAGES.wrongCode };
	if (result === 'expired') return { ok: false, status: 400, message: MESSAGES.expiredCode };
	return { ok: true, account: await upsertVerifiedAccount(db, email, { now }) };
}

/**
 * Ingreso con mail y contraseña. El mismo mensaje si el mail no tiene cuenta, si no tiene
 * contraseña o si la contraseña no coincide.
 *
 * @param {{ db: D1Database, email: unknown, password: unknown, client: string, now?: number }} input
 * @returns {Promise<{ ok: true, account: import('./accounts.js').Account }
 *   | { ok: false, status: number, message: string }>}
 */
export async function passwordLogin({ db, email: rawEmail, password, client, now = Date.now() }) {
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: MESSAGES.badEmail };
	const ck = await clientKey(client);
	const hash = await emailHash(email);
	const perClient = await allowed(db, `cuentas:pw:c:${ck}`, RATE_LIMITS.passwordClient, now);
	const perEmail = await allowed(db, `cuentas:pw:e:${hash}`, RATE_LIMITS.passwordEmail, now);
	if (!perClient || !perEmail) return { ok: false, status: 429, message: MESSAGES.tooManyAttempts };
	const account = await checkPassword(db, email, typeof password === 'string' ? password : '', {
		now
	});
	if (!account) return { ok: false, status: 400, message: MESSAGES.badLogin };
	return { ok: true, account };
}

/**
 * Hook para más adelante (decisión P7.1): un evento puede pedir cuenta para comprar, con
 * `requiere_cuenta: true` en su frontmatter. Todavía no cambia la compra: solo lo lee.
 *
 * @param {Record<string, unknown> | null | undefined} meta frontmatter del evento
 */
export function eventRequiresAccount(meta) {
	return meta?.requiere_cuenta === true;
}

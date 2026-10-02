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
import {
	checkPassword,
	deleteAccount,
	emailHash,
	normalizeEmail,
	upsertVerifiedAccount
} from './accounts.js';
import { createLoginCode, normalizeCode, verifyLoginCode } from './codes.js';
import { releaseAccountProfiles } from './perfiles.js';
import { buildConfirmCodeEmail, buildLoginCodeEmail } from './email.js';
import { accountMailAllowed } from './mailCap.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {(to: string, message: { subject: string, html: string, text: string }, log: string) => Promise<'sent' | 'simulated' | 'failed'>} SendMail */

export const RATE_LIMITS = Object.freeze({
	/**
	 * Códigos pedidos para un mismo mail: pocos seguidos y un tope por día (no llenar casillas).
	 * Solo cuentan los pedidos que pasaron los límites anteriores (ver `sendCode`).
	 */
	codeRequestEmail: { limit: 3, windowSeconds: 15 * 60 },
	codeRequestEmailDay: { limit: 10, windowSeconds: 24 * 60 * 60 },
	/**
	 * Códigos pedidos para un mismo mail desde una misma conexión, por día: menos que el tope
	 * diario del mail, así una sola conexión nunca gasta todo el cupo de otra persona.
	 */
	codeRequestEmailClientDay: { limit: 4, windowSeconds: 24 * 60 * 60 },
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
	/** Tope global de mails (mailCap.js): el mismo texto para cualquier mail. */
	mailBusy: 'Estamos mandando muchos mails en este momento. Probá en un rato.',
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

/** @returns {{ ok: false, status: number, message: string }} */
const tooManyCodes = () => ({ ok: false, status: 429, message: MESSAGES.tooManyCodes });

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
 * @returns {Promise<{ ok: true, email: string, expiresAt: number } | { ok: false, status: number, message: string }>}
 */
export function requestCode({ db, email, client, send, now = Date.now() }) {
	return sendCode({ db, email, client, send, now, purpose: 'login' });
}

/**
 * Manda un código de este `purpose`, con los mismos límites para todos (los contadores son
 * compartidos: confirmar una acción gasta del mismo cupo de mails que ingresar).
 *
 * @param {{ db: D1Database, email: unknown, client: string, send: SendMail, now: number,
 *   purpose: import('./codes.js').CodePurpose }} input
 * @returns {Promise<{ ok: true, email: string, expiresAt: number } | { ok: false, status: number, message: string }>}
 */
async function sendCode({ db, email: rawEmail, client, send, now, purpose }) {
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: MESSAGES.badEmail };
	const hash = await emailHash(email);
	const ck = await clientKey(client);
	// En orden, y cada límite cuenta solo si pasó el anterior: un pedido rechazado no gasta el
	// cupo del mail. Primero los de la conexión (para cualquier mail, y para este mail): así una
	// sola conexión no puede gastar el cupo diario de otra persona.
	if (!(await allowed(db, `cuentas:code:c:${ck}`, RATE_LIMITS.codeRequestClient, now)))
		return tooManyCodes();
	const pairKey = await sha256Hex(`cuentas:pair:${hash}:${ck}`);
	if (
		!(await allowed(db, `cuentas:code:ec:${pairKey}`, RATE_LIMITS.codeRequestEmailClientDay, now))
	)
		return tooManyCodes();
	if (!(await allowed(db, `cuentas:code:e:${hash}`, RATE_LIMITS.codeRequestEmail, now)))
		return tooManyCodes();
	if (!(await allowed(db, `cuentas:code:ed:${hash}`, RATE_LIMITS.codeRequestEmailDay, now)))
		return tooManyCodes();
	// Al final, el tope global (para cualquier mail igual: no dice nada de la dirección).
	if (!(await accountMailAllowed(db, now)))
		return { ok: false, status: 429, message: MESSAGES.mailBusy };
	const { code, expiresAt } = await createLoginCode(db, hash, { now, purpose });
	const message =
		purpose === 'login'
			? buildLoginCodeEmail({ code, now, expiresAt })
			: buildConfirmCodeEmail({ code, purpose, now, expiresAt });
	// `log` solo se muestra en `vite dev` sin RESEND_API_KEY (tickets/index.js): así se puede
	// probar en local. Nunca se loguea en producción.
	const result = await send(email, message, `Código (${purpose}): ${code}`);
	if (result === 'failed') return { ok: false, status: 502, message: MESSAGES.mailFailed };
	return { ok: true, email, expiresAt };
}

/**
 * Paso 2: verifica el código y devuelve la cuenta (creada si es el primer ingreso).
 *
 * @param {{ db: D1Database, email: unknown, code: unknown, client: string, now?: number }} input
 * @returns {Promise<{ ok: true, account: import('./accounts.js').Account }
 *   | { ok: false, status: number, message: string }>}
 */
export async function verifyCode({ db, email: rawEmail, code, client, now = Date.now() }) {
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: MESSAGES.badEmail };
	const checked = await checkCode({ db, email, code, client, now, purpose: 'login' });
	if (!checked.ok) return checked;
	return { ok: true, account: await upsertVerifiedAccount(db, email, { now }) };
}

/**
 * Verifica un código de este `purpose` (con el límite de intentos por conexión, compartido).
 *
 * @param {{ db: D1Database, email: string, code: unknown, client: string, now: number,
 *   purpose: import('./codes.js').CodePurpose }} input
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
async function checkCode({ db, email, code: rawCode, client, now, purpose }) {
	const code = normalizeCode(rawCode);
	if (!code) return { ok: false, status: 400, message: MESSAGES.badCode };
	const ck = await clientKey(client);
	if (!(await allowed(db, `cuentas:verify:c:${ck}`, RATE_LIMITS.codeVerifyClient, now)))
		return { ok: false, status: 429, message: MESSAGES.tooManyAttempts };
	const result = await verifyLoginCode(db, await emailHash(email), code, { now, purpose });
	if (result === 'wrong') return { ok: false, status: 400, message: MESSAGES.wrongCode };
	if (result === 'expired') return { ok: false, status: 400, message: MESSAGES.expiredCode };
	return { ok: true };
}

/**
 * Acciones delicadas de Mi rincón que piden un código fresco por mail, además de la sesión
 * (la sesión dura para siempre: quien encuentre un navegador abierto no puede cambiar la
 * contraseña ni borrar la cuenta sin acceso al mail).
 * - 'password': poner, cambiar o sacar la contraseña.
 * - 'delete': borrar la cuenta.
 * - 'grupo': hacer dueñe a alguien, sacarle la propiedad o sacar a otre dueñe de un proyecto, y
 *   borrar un proyecto (Mi rincón → Perfiles; las reglas están en perfiles.js).
 * @typedef {'password' | 'delete' | 'grupo'} ConfirmPurpose
 */

/** @param {unknown} v @returns {v is ConfirmPurpose} */
export function isConfirmPurpose(v) {
	return v === 'password' || v === 'delete' || v === 'grupo';
}

/**
 * Manda un código para confirmar una acción delicada al mail de la cuenta.
 *
 * @param {{ db: D1Database, email: string, purpose: ConfirmPurpose, client: string,
 *   send: SendMail, now?: number }} input
 */
export function requestConfirmCode({ db, email, purpose, client, send, now = Date.now() }) {
	return sendCode({ db, email, client, send, now, purpose });
}

/**
 * Verifica (y gasta) un código de confirmación. Uno de ingreso o de otra acción no sirve.
 *
 * @param {{ db: D1Database, email: string, purpose: ConfirmPurpose, code: unknown,
 *   client: string, now?: number }} input
 */
export function checkConfirmCode({ db, email, purpose, code, client, now = Date.now() }) {
	return checkCode({ db, email, code, client, now, purpose });
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

/**
 * Borra una cuenta desde "Mi rincón" (con el código ya verificado): primero suelta sus perfiles
 * (las personas se vacían y se borran, los proyectos pasan a quien sigue gestionándolos o se borran
 * si no queda nadie) y después borra la cuenta, en una tanda (docs/cuentas.md). Si algo falla a
 * la mitad, la cuenta sigue viva y se puede volver a correr. Va acá y no en accounts.js porque
 * perfiles.js ya importa accounts.js.
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<boolean>} false si la cuenta no existe
 */
export async function closeAccount(db, accountId, { now = Date.now() } = {}) {
	await releaseAccountProfiles(db, accountId, { now });
	return deleteAccount(db, accountId, { now });
}

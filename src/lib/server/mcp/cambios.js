/**
 * Lo común a los cambios del conector de Claude (docs/conector-claude.md, «Cambios»): cada cambio
 * va en dos pasos, `vista_previa` y `aplicar`, y lo que se guarda es exactamente lo que se vio.
 *
 * - **La huella** ({@link changeHash}): HMAC-SHA256, con una clave del servidor (fila
 *   `mcp_cambios_clave` de `ticket_settings`, 32 bytes al azar que se crean solos, como los links
 *   firmados), de la operación, el objetivo, las entradas ya normalizadas (con los nombres resueltos
 *   en el servidor) y la versión de lo que había. `aplicar` vuelve a normalizar las entradas, mira
 *   que la versión siga siendo la misma y recalcula la huella: si algo no coincide, no guarda nada.
 *   Sin la clave no se puede armar una huella que `aplicar` acepte.
 * - **El tope por día** ({@link takeDailySlot}): los cambios aplicados en las últimas 24 horas,
 *   entre todes (`rate_limits`, ventana móvil). Un cambio que al final no se guarda devuelve su
 *   lugar.
 * - **Los interruptores**: leer necesita `conector_claude`; cambiar, además
 *   `conector_claude_edicion` ({@link editingOn}).
 * - **«Confirmado por» y el pedido** ({@link cleanConfirmedBy}, {@link cleanRequest}): texto libre y
 *   corto, sin caracteres de control. El pedido no va a Actividad (puede tener datos de alguien):
 *   solo su largo.
 */
import { env } from '$env/dynamic/private';
import { isFlagOn } from '$lib/server/flags.js';
import { hitRateLimit, releaseRateLimitHit } from '$lib/server/db/rateLimit.js';
import { storedSecret } from '$lib/server/signedLinks.js';
import { timingSafeEqual } from '$lib/server/hash.js';
import { toBase64url } from '$lib/utils/base64.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Fila de `ticket_settings` con la clave de las huellas. */
export const HASH_KEY_SETTING = 'mcp_cambios_clave';

/** El tope de cambios aplicados por día si no se configura otro. */
export const DEFAULT_DAILY_LIMIT = 50;

/** El bucket de `rate_limits` del tope por día (sin datos de nadie). */
export const DAILY_BUCKET = 'mcp-cambios';

/** La ventana del tope: las últimas 24 horas. */
export const DAILY_WINDOW = 24 * 60 * 60;

/** Largo máximo de «confirmado por» y del pedido. */
export const CONFIRMED_BY_MAX = 40;
export const REQUEST_MAX = 500;

/**
 * El tope por día: la variable `CONECTOR_CLAUDE_CAMBIOS_POR_DIA` (un entero de 1 a 1000) o
 * {@link DEFAULT_DAILY_LIMIT}.
 * @param {string | undefined} [raw] para tests
 */
export function dailyLimit(raw = env.CONECTOR_CLAUDE_CAMBIOS_POR_DIA) {
	const n = Number(String(raw ?? '').trim());
	return Number.isSafeInteger(n) && n >= 1 && n <= 1000 ? n : DEFAULT_DAILY_LIMIT;
}

/**
 * ¿Se puede cambiar? Hace falta el conector prendido y el interruptor de cambios.
 * @param {D1Database} db
 * @param {{ read?: string, edit?: string }} [envValues] para tests
 */
export async function editingOn(db, envValues = {}) {
	const [read, edit] = await Promise.all([
		isFlagOn(db, 'conector_claude', { envValue: envValues.read }),
		isFlagOn(db, 'conector_claude_edicion', { envValue: envValues.edit })
	]);
	return read && edit;
}

/** Texto en una línea, sin caracteres de control. @param {unknown} v @param {number} max */
function oneLine(v, max) {
	return typeof v === 'string'
		? v
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, max)
				.trim()
		: '';
}

/** Quién confirmó (un nombre del equipo), o `null`. @param {unknown} v */
export const cleanConfirmedBy = (v) => oneLine(v, CONFIRMED_BY_MAX) || null;

/** El pedido (lo que se le pidió al bot), o `null`. @param {unknown} v */
export const cleanRequest = (v) => oneLine(v, REQUEST_MAX) || null;

/**
 * Cómo aparece quién hizo el cambio en Actividad: «Claude, confirmado por Mel» o «Claude».
 * @param {string | null} confirmedBy
 */
export const claudeLabel = (confirmedBy) =>
	confirmedBy ? `Claude, confirmado por ${confirmedBy}` : 'Claude';

/**
 * JSON con las claves ordenadas (el mismo texto para las mismas entradas, en cualquier orden).
 * Solo para datos ya normalizados: textos, números, booleanos, `null`, listas y objetos.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
	if (value === null || typeof value !== 'object') {
		if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
		return JSON.stringify(value ?? null);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	const obj = /** @type {Record<string, unknown>} */ (value);
	return `{${Object.keys(obj)
		.filter((k) => obj[k] !== undefined)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
		.join(',')}}`;
}

/**
 * @typedef {{
 *   operation: string,
 *   target: string,
 *   inputs: Record<string, unknown>,
 *   base: string
 * }} ChangeSpec
 */

/**
 * La huella de un cambio (base64url, 43 caracteres).
 * @param {D1Database} db
 * @param {ChangeSpec} spec
 */
export async function changeHash(db, spec) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await storedSecret(db, HASH_KEY_SETTING)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const message = canonicalJson({
		v: 1,
		op: spec.operation,
		target: spec.target,
		inputs: spec.inputs,
		base: spec.base
	});
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return toBase64url(new Uint8Array(sig));
}

/**
 * ¿La huella que trajo `aplicar` es la de este cambio?
 * @param {D1Database} db
 * @param {ChangeSpec} spec
 * @param {unknown} hash
 */
export async function hashMatches(db, spec, hash) {
	if (typeof hash !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(hash)) return false;
	return timingSafeEqual(await changeHash(db, spec), hash);
}

/**
 * Toma un lugar del tope por día. Si no hay, el mensaje para Claude.
 * @param {D1Database} db
 * @param {number} now
 * @param {number} [limit]
 * @returns {Promise<{ ok: true, release: () => Promise<void> } | { ok: false, message: string }>}
 */
export async function takeDailySlot(db, now, limit = dailyLimit()) {
	const rule = { limit, windowSeconds: DAILY_WINDOW };
	const r = await hitRateLimit(db, DAILY_BUCKET, rule, now);
	if (!r.allowed) {
		const hours = Math.max(1, Math.ceil(r.retryAfter / 3600));
		return {
			ok: false,
			message:
				`Se llegó al tope de ${limit} cambios por día del conector de Claude. ` +
				`No se guardó nada. Se libera lugar en ${hours === 1 ? 'una hora' : `unas ${hours} horas`}; ` +
				'si es urgente, hacelo desde el panel.'
		};
	}
	return { ok: true, release: () => releaseRateLimitHit(db, DAILY_BUCKET, rule, now) };
}

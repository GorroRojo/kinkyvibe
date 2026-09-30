/**
 * Códigos de descuento (tabla `discount_codes`, migrations/0002_tickets.sql).
 *
 * - El código no distingue mayúsculas: se guarda y se compara en mayúsculas.
 * - Un "uso" es una orden con ese código que está aprobada o todavía tiene la reserva vigente
 *   (igual que el cupo). Si la reserva vence o se cancela, el uso se libera.
 * - `checkDiscountCode` sirve para el botón "Aplicar" (informativo). La validez real se vuelve a
 *   comprobar DENTRO del `INSERT` que crea la orden (`discountGuardSql`), en la misma sentencia
 *   atómica que el cupo, así que dos compras simultáneas no pueden pasarse de `max_uses`.
 */
import { normalizeCode } from '$lib/utils/tickets.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{
 *   code: string, kind: 'percent' | 'fixed', value: number, event_slug: string | null,
 *   starts_at: number | null, ends_at: number | null, max_uses: number | null, active: number,
 *   created_at: number, created_by: string
 * }} DiscountCode
 */

/** Estados de orden que ocupan cupo (y un uso de código) mientras `expires_at` no pasó. */
export const HOLDING = "('pending', 'rejected', 'awaiting_transfer')";

/**
 * Subconsulta: usos vigentes de un código. `code` y `now` son expresiones SQL.
 *
 * @param {string} code
 * @param {string} now
 */
export function usesSql(code, now) {
	return `(SELECT COUNT(*) FROM orders ou WHERE ou.discount_code = ${code}
		AND (ou.status = 'approved' OR (ou.status IN ${HOLDING} AND ou.expires_at > ${now})))`;
}

/**
 * Condición SQL: el código sigue valiendo, con el mismo tipo y valor que usamos para calcular
 * el precio, y le queda al menos un uso. Los parámetros son expresiones SQL (p. ej. `?12`).
 *
 * @param {{ code: string, kind: string, value: string, event: string, now: string }} p
 */
export function discountGuardSql(p) {
	return `(${p.code} IS NULL OR EXISTS (
		SELECT 1 FROM discount_codes d
		WHERE d.code = ${p.code} AND d.active = 1 AND d.kind = ${p.kind} AND d.value = ${p.value}
			AND (d.event_slug IS NULL OR d.event_slug = ${p.event})
			AND (d.starts_at IS NULL OR d.starts_at <= ${p.now})
			AND (d.ends_at IS NULL OR d.ends_at > ${p.now})
			AND (d.max_uses IS NULL OR ${usesSql('d.code', p.now)} < d.max_uses)
	))`;
}

/**
 * ¿Se puede usar este código ahora en este evento?
 *
 * @param {D1Database} db
 * @param {{ code: unknown, eventSlug: string, now?: number }} input
 * @returns {Promise<{ ok: true, discount: DiscountCode }
 *   | { ok: false, reason: 'format' | 'unknown' | 'inactive' | 'not-started' | 'ended' | 'other-event' | 'used-up', message: string }>}
 */
export async function checkDiscountCode(db, { code: raw, eventSlug, now = Date.now() }) {
	const code = normalizeCode(raw);
	if (!code) {
		return { ok: false, reason: 'format', message: 'Ese código no existe.' };
	}
	const row = /** @type {(DiscountCode & { uses: number }) | null} */ (
		await db
			.prepare(
				`SELECT d.*, ${usesSql('d.code', '?2')} AS uses FROM discount_codes d WHERE d.code = ?1`
			)
			.bind(code, now)
			.first()
	);
	// Mismo mensaje para "no existe" y "es de otro evento": no ayuda a adivinar códigos.
	if (!row) return { ok: false, reason: 'unknown', message: 'Ese código no existe.' };
	if (row.event_slug !== null && row.event_slug !== eventSlug) {
		return { ok: false, reason: 'other-event', message: 'Ese código no existe.' };
	}
	if (!row.active)
		return { ok: false, reason: 'inactive', message: 'Ese código ya no está activo.' };
	if (row.starts_at !== null && now < row.starts_at) {
		return { ok: false, reason: 'not-started', message: 'Ese código todavía no está habilitado.' };
	}
	if (row.ends_at !== null && now >= row.ends_at) {
		return { ok: false, reason: 'ended', message: 'Ese código ya venció.' };
	}
	if (row.max_uses !== null && row.uses >= row.max_uses) {
		return {
			ok: false,
			reason: 'used-up',
			message: 'Ese código ya se usó todas las veces posibles.'
		};
	}
	/** @type {DiscountCode & { uses?: number }} */
	const discount = { ...row };
	delete discount.uses;
	return { ok: true, discount };
}

/**
 * Valida el formulario de alta de un código (admin).
 *
 * @param {Record<string, unknown>} input
 * @param {string[]} eventSlugs eventos que venden entradas
 * @returns {{ ok: true, value: Omit<DiscountCode, 'active' | 'created_at' | 'created_by'> }
 *   | { ok: false, errors: Record<string, string> }}
 */
export function validateNewCode(input, eventSlugs) {
	/** @type {Record<string, string>} */
	const errors = {};
	const code = normalizeCode(input.code);
	if (!code) errors.code = 'Entre 3 y 32 letras, números, - o _ (sin espacios).';
	const kind = input.kind === 'percent' || input.kind === 'fixed' ? input.kind : null;
	if (!kind) errors.kind = 'Elegí porcentaje o monto fijo.';
	const value = Number(input.value);
	if (!Number.isSafeInteger(value) || value < 1 || (kind === 'percent' && value > 100)) {
		errors.value =
			kind === 'percent'
				? 'Un número entero entre 1 y 100.'
				: 'Un monto entero en pesos, mayor a 0.';
	}
	const eventRaw = String(input.event_slug ?? '');
	const event_slug = eventRaw === '' ? null : eventRaw;
	if (event_slug !== null && !eventSlugs.includes(event_slug))
		errors.event_slug = 'Elegí un evento.';
	const starts_at = parseLocalDate(input.starts_at);
	const ends_at = parseLocalDate(input.ends_at);
	if (Number.isNaN(starts_at)) errors.starts_at = 'Fecha inválida.';
	if (Number.isNaN(ends_at)) errors.ends_at = 'Fecha inválida.';
	if (starts_at && ends_at && ends_at <= starts_at)
		errors.ends_at = 'Tiene que ser después de "desde".';
	const maxRaw = String(input.max_uses ?? '').trim();
	const max_uses = maxRaw === '' ? null : Number(maxRaw);
	if (max_uses !== null && (!Number.isSafeInteger(max_uses) || max_uses < 1)) {
		errors.max_uses = 'Un número entero mayor a 0, o vacío para sin límite.';
	}
	if (Object.keys(errors).length || !code || !kind) return { ok: false, errors };
	return {
		ok: true,
		value: {
			code,
			kind,
			value,
			event_slug,
			starts_at: starts_at || null,
			ends_at: ends_at || null,
			max_uses
		}
	};
}

/**
 * `<input type="datetime-local">` ("2026-12-01T20:00") en hora de Argentina → ms. Vacío → 0.
 *
 * @param {unknown} raw
 */
export function parseLocalDate(raw) {
	const s = String(raw ?? '').trim();
	if (!s) return 0;
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return NaN;
	return Date.parse(`${s}:00-03:00`);
}

/**
 * @param {D1Database} db
 * @param {Omit<DiscountCode, 'active' | 'created_at' | 'created_by'>} code
 * @param {{ by: string, now?: number }} meta
 * @returns {Promise<boolean>} `false` si el código ya existía
 */
export async function createDiscountCode(db, code, { by, now = Date.now() }) {
	const res = await db
		.prepare(
			`INSERT INTO discount_codes (code, kind, value, event_slug, starts_at, ends_at, max_uses,
				active, created_at, created_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9) ON CONFLICT (code) DO NOTHING`
		)
		.bind(
			code.code,
			code.kind,
			code.value,
			code.event_slug,
			code.starts_at,
			code.ends_at,
			code.max_uses,
			now,
			by
		)
		.run();
	return res.meta.changes === 1;
}

/**
 * @param {D1Database} db
 * @param {string} code
 * @param {boolean} active
 */
export async function setDiscountCodeActive(db, code, active) {
	const res = await db
		.prepare('UPDATE discount_codes SET active = ?2 WHERE code = ?1')
		.bind(String(code).toUpperCase(), active ? 1 : 0)
		.run();
	return res.meta.changes === 1;
}

/**
 * Todos los códigos (más nuevos primero) con sus usos: aprobados y reservas vigentes.
 *
 * @param {D1Database} db
 * @param {number} [now]
 * @returns {Promise<(DiscountCode & { approved: number, held: number, discounted: number })[]>}
 */
export async function listDiscountCodes(db, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT d.*,
				(SELECT COUNT(*) FROM orders o WHERE o.discount_code = d.code AND o.status = 'approved') AS approved,
				(SELECT COUNT(*) FROM orders o WHERE o.discount_code = d.code
					AND o.status IN ${HOLDING} AND o.expires_at > ?1) AS held,
				(SELECT COALESCE(SUM(o.discount_amount), 0) FROM orders o
					WHERE o.discount_code = d.code AND o.status = 'approved') AS discounted
			FROM discount_codes d ORDER BY d.created_at DESC`
		)
		.bind(now)
		.all();
	return /** @type {any} */ (results);
}

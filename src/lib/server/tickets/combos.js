/**
 * Códigos combo (pedido de gorrite, 10/10 y 12/10: «dos eventos a un precio especial si se compran
 * juntos», en su versión chica). Tabla `ticket_combos` y columnas `buyer_email` y
 * `source_order_id` de `discount_codes` (migrations/0056_combo_codigos.sql). Interruptor
 * `combo_codigos`. Guía: docs/tickets.md, «Códigos combo».
 *
 * - En la ficha del evento A (pestaña Códigos) un admin arma un combo con el evento B: descuento
 *   (porcentaje o monto fijo, como los códigos) y vencimiento opcional (vacío = hasta que cierre
 *   la venta de B).
 * - Cada compra **online** aprobada de A genera, al mandar el mail de las entradas, un código
 *   común de descuento (`discount_codes`) para B: un solo uso, solo para el mail de quien compró
 *   (`buyer_email`) y atado a esa orden (`source_order_id`). El mail lleva un bloque con el código.
 *   Las ventas en la puerta y las cargadas a mano no generan códigos.
 * - Reembolsar la compra de A anula el código si no se usó: `discountGuardSql` y
 *   `checkDiscountCode` (discounts.js) solo lo aceptan mientras la orden de origen siga aprobada.
 *   Si ya se usó, la compra de B queda como está (cada compra es su propia orden: el combo no
 *   toca el Fondo ni los reembolsos).
 * - Generar es idempotente: un código por orden de A y evento B (índice único), así que reenviar
 *   el mail o dos envíos a la vez muestran el mismo código.
 */
import { argDeadline } from '$lib/utils/dates.js';
import { formatARS } from '$lib/utils/money.js';
import { TICKET_CODE_ALPHABET } from './orders.js';
import { HOLDING, parseDiscountAmount, parseLocalDate } from './discounts.js';
import { getEventTickets } from './events.js';
import { salesState } from './config.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{
 *   event_slug: string, target_slug: string, kind: 'percent' | 'fixed', value: number,
 *   ends_at: number | null, active: number, created_at: number, created_by: string,
 *   updated_at: number, updated_by: string
 * }} Combo
 */
/**
 * Lo que va en el mail de las entradas por cada código combo.
 * @typedef {{ code: string, discount: string, targetTitle: string, targetUrl: string,
 *   until: string }} ComboMailItem
 */

/**
 * Un combo como lo muestra el panel (pestaña Códigos del evento A).
 * @typedef {{ target_slug: string, target_title: string, discount: string,
 *   ends_at: number | null, active: boolean, issued: number, used: number, held: number,
 *   revoked: number }} ComboRow
 */

/** Prefijo de los códigos combo (así se reconocen en la lista de órdenes de B). */
export const COMBO_CODE_PREFIX = 'COMBO-';
/** Caracteres al azar después del prefijo: 31⁶ ≈ 887 millones (no se adivinan). */
export const COMBO_CODE_RANDOM = 6;
/** Quién figura como creador de los códigos combo (`discount_codes.created_by`). */
export const COMBO_CREATED_BY = 'combo';

/** Un código combo nuevo al azar: `COMBO-` + 6 del alfabeto sin ambiguos de las entradas. */
export function newComboCode() {
	const n = TICKET_CODE_ALPHABET.length;
	// Se descartan los bytes del último tramo incompleto para que cada carácter salga parejo.
	const limit = 256 - (256 % n);
	const length = COMBO_CODE_PREFIX.length + COMBO_CODE_RANDOM;
	let out = COMBO_CODE_PREFIX;
	while (out.length < length) {
		for (const b of crypto.getRandomValues(new Uint8Array(COMBO_CODE_RANDOM))) {
			if (b >= limit) continue;
			out += TICKET_CODE_ALPHABET.charAt(Math.floor((b * n) / limit));
			if (out.length === length) break;
		}
	}
	return out;
}

/**
 * El descuento en palabras, para el panel y el mail: «20 % de descuento» o «$ 2.000 de descuento».
 *
 * @param {{ kind: 'percent' | 'fixed', value: number }} d
 */
export function comboDiscountText(d) {
	return d.kind === 'percent' ? `${d.value} % de descuento` : `${formatARS(d.value)} de descuento`;
}

/**
 * Valida el formulario del combo (panel, ficha del evento A).
 *
 * @param {Record<string, unknown>} input `target_slug`, `kind`, `value`, `ends_at`
 * @param {{ eventSlug: string, targets: string[], now?: number }} ctx `targets`: los eventos
 *   que venden entradas (sin A)
 * @returns {{ ok: true, value: { target_slug: string, kind: 'percent' | 'fixed', value: number,
 *   ends_at: number | null } } | { ok: false, errors: Record<string, string> }}
 */
export function validateCombo(input, { eventSlug, targets, now = Date.now() }) {
	/** @type {Record<string, string>} */
	const errors = {};
	const target_slug = String(input.target_slug ?? '');
	if (!target_slug || target_slug === eventSlug || !targets.includes(target_slug)) {
		errors.target_slug = 'Elegí otro evento que venda entradas.';
	}
	const { kind, value } = parseDiscountAmount(input, errors);
	const ends = parseLocalDate(input.ends_at);
	if (Number.isNaN(ends)) errors.ends_at = 'Fecha inválida.';
	else if (ends && ends <= now) errors.ends_at = 'Tiene que ser una fecha que todavía no pasó.';
	if (Object.keys(errors).length || !kind) return { ok: false, errors };
	return { ok: true, value: { target_slug, kind, value, ends_at: ends || null } };
}

/**
 * Guarda el combo de A con B (nuevo o reemplaza el que había, y lo deja prendido). Los códigos
 * ya generados no cambian.
 *
 * @param {D1Database} db
 * @param {string} eventSlug A
 * @param {{ target_slug: string, kind: 'percent' | 'fixed', value: number, ends_at: number | null }} combo
 * @param {{ by: string, now?: number }} meta
 */
export async function saveCombo(db, eventSlug, combo, { by, now = Date.now() }) {
	await db
		.prepare(
			`INSERT INTO ticket_combos (event_slug, target_slug, kind, value, ends_at, active,
				created_at, created_by, updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?6, ?7)
			ON CONFLICT (event_slug, target_slug) DO UPDATE SET kind = excluded.kind,
				value = excluded.value, ends_at = excluded.ends_at, active = 1,
				updated_at = excluded.updated_at, updated_by = excluded.updated_by`
		)
		.bind(eventSlug, combo.target_slug, combo.kind, combo.value, combo.ends_at, now, by)
		.run();
}

/**
 * Prende o apaga un combo (apagado no genera códigos nuevos; los ya mandados siguen valiendo).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} targetSlug
 * @param {boolean} active
 * @param {{ by: string, now?: number }} meta
 * @returns {Promise<boolean>} `false` si no existía
 */
export async function setComboActive(db, eventSlug, targetSlug, active, { by, now = Date.now() }) {
	const res = await db
		.prepare(
			`UPDATE ticket_combos SET active = ?3, updated_at = ?4, updated_by = ?5
			WHERE event_slug = ?1 AND target_slug = ?2`
		)
		.bind(eventSlug, targetSlug, active ? 1 : 0, now, by)
		.run();
	return res.meta.changes === 1;
}

/**
 * Los combos de A con sus números: códigos generados (`issued`), usados en una compra aprobada
 * de B (`used`), en una reserva vigente (`held`) y anulados porque se reembolsó la compra de A
 * sin usarlos (`revoked`). Más nuevos primero.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 * @returns {Promise<(Combo & { issued: number, used: number, held: number, revoked: number })[]>}
 */
export async function listCombos(db, eventSlug, now = Date.now()) {
	// Los códigos combo de este combo: los de B generados por órdenes de A.
	const codes = `discount_codes d JOIN orders so ON so.id = d.source_order_id
		WHERE so.event_slug = c.event_slug AND d.event_slug = c.target_slug`;
	const usedBy = (/** @type {string} */ status) =>
		`SELECT COUNT(*) FROM orders o JOIN ${codes} AND o.discount_code = d.code AND ${status}`;
	const holding = `(o.status IN ${HOLDING} AND o.expires_at > ?2)`;
	const { results } = await db
		.prepare(
			`SELECT c.*,
				(SELECT COUNT(*) FROM ${codes}) AS issued,
				(${usedBy("o.status = 'approved'")}) AS used,
				(${usedBy(holding)}) AS held,
				(SELECT COUNT(*) FROM ${codes} AND so.status != 'approved'
					AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.discount_code = d.code
						AND (o.status = 'approved' OR ${holding}))) AS revoked
			FROM ticket_combos c WHERE c.event_slug = ?1 ORDER BY c.created_at DESC`
		)
		.bind(eventSlug, now)
		.all();
	return /** @type {any} */ (results);
}

/**
 * ¿Esta orden genera códigos combo? Solo las compras online aprobadas: las ventas en la puerta y
 * las cargadas a mano no (no pasan por la página de compra, y suelen ser invitaciones).
 *
 * @param {Pick<import('./orders.js').Order, 'status'> & { channel?: string | null }} order
 */
export function orderEarnsCombos(order) {
	return order.status === 'approved' && (order.channel ?? 'online') === 'online';
}

/**
 * Los códigos combo de una orden de A, para el mail de las entradas: genera los que falten (uno
 * por cada combo prendido y vigente de A cuyo evento B todavía venda) y devuelve los que todavía
 * no se usaron. Idempotente: un reenvío muestra los mismos códigos. Nunca tira por un combo roto:
 * quien llama lo envuelve en try/catch y el mail sale sin el bloque.
 *
 * @param {D1Database} db
 * @param {import('./orders.js').Order & { channel?: string | null }} order
 * @param {{ origin: string, now?: number,
 *   loadEvent?: (slug: string) => Promise<import('./config.js').EventTickets | null> }} opts
 *   `loadEvent`: para los tests (por defecto, `getEventTickets`)
 * @returns {Promise<ComboMailItem[]>}
 */
export async function comboCodesForOrder(
	db,
	order,
	{ origin, now = Date.now(), loadEvent = getEventTickets }
) {
	if (!orderEarnsCombos(order)) return [];
	const { results: combos } = await db
		.prepare(
			`SELECT * FROM ticket_combos WHERE event_slug = ?1 AND active = 1
				AND (ends_at IS NULL OR ends_at > ?2)`
		)
		.bind(order.event_slug, now)
		.all();
	/** @type {Map<string, import('./config.js').EventTickets>} */
	const targets = new Map();
	for (const c of /** @type {Combo[]} */ (/** @type {unknown} */ (combos))) {
		const config = await loadEvent(c.target_slug);
		if (!config) continue;
		const state = salesState(config, now);
		// Cerrada, cancelada o marcada agotada: no tiene sentido mandar un código.
		if (!state.open && state.reason !== 'notyet') continue;
		targets.set(c.target_slug, config);
		await ensureComboCode(db, order, c, now);
	}
	// Los de esta orden que todavía no se usaron (también los de un combo que se apagó después:
	// se mandaron y siguen valiendo).
	const { results: codes } = await db
		.prepare(
			`SELECT d.* FROM discount_codes d WHERE d.source_order_id = ?1 AND d.active = 1
				AND (d.ends_at IS NULL OR d.ends_at > ?2)
				AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.discount_code = d.code
					AND (o.status = 'approved' OR (o.status IN ${HOLDING} AND o.expires_at > ?2)))
			ORDER BY d.created_at, d.code`
		)
		.bind(order.id, now)
		.all();
	/** @type {ComboMailItem[]} */
	const out = [];
	for (const d of /** @type {import('./discounts.js').DiscountCode[]} */ (
		/** @type {unknown} */ (codes)
	)) {
		const slug = /** @type {string} */ (d.event_slug);
		let config = targets.get(slug) ?? null;
		if (!config) {
			config = await loadEvent(slug);
			if (!config) continue;
			const state = salesState(config, now);
			if (!state.open && state.reason !== 'notyet') continue;
		}
		const until = d.ends_at ?? config.closesAt;
		out.push({
			code: d.code,
			discount: comboDiscountText(d),
			targetTitle: config.title || slug,
			targetUrl: `${origin}/calendario/${slug}/entradas`,
			until: until ? argDeadline(until) : ''
		});
	}
	return out;
}

/**
 * Crea el código combo de esta orden para el evento B del combo, si no lo tiene. Un código al
 * azar que choque con otro (muy raro) se reintenta con otro.
 *
 * @param {D1Database} db
 * @param {import('./orders.js').Order} order
 * @param {Combo} combo
 * @param {number} now
 */
async function ensureComboCode(db, order, combo, now) {
	for (let attempt = 0; attempt < 4; attempt++) {
		await db
			.prepare(
				`INSERT INTO discount_codes (code, kind, value, event_slug, starts_at, ends_at, max_uses,
					active, created_at, created_by, buyer_email, source_order_id)
				VALUES (?1, ?2, ?3, ?4, NULL, ?5, 1, 1, ?6, ?7, ?8, ?9) ON CONFLICT DO NOTHING`
			)
			.bind(
				newComboCode(),
				combo.kind,
				combo.value,
				combo.target_slug,
				combo.ends_at,
				now,
				COMBO_CREATED_BY,
				order.buyer_email,
				order.id
			)
			.run();
		const row = await db
			.prepare('SELECT code FROM discount_codes WHERE source_order_id = ?1 AND event_slug = ?2')
			.bind(order.id, combo.target_slug)
			.first();
		if (row) return;
	}
	throw new Error(`no se pudo generar el código combo de la orden ${order.id}`);
}

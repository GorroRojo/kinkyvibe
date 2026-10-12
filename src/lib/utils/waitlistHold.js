/**
 * Lista de espera de las entradas: cuánto se le guarda el lugar a quien le toca, y cómo se lee la
 * lista de cada evento (la clave `lista_espera` del frontmatter / `extra`). docs/tickets.md,
 * «Lista de espera».
 *
 * Los tiempos son fijos, en el código ({@link WAITLIST_SETTINGS}; gorrite, 12/10: cambiarlos es un
 * PR). La reserva se mide contra el comienzo del evento:
 *   - faltan 7 días o más → 24 h;
 *   - faltan de 48 h a 7 días → 12 h;
 *   - faltan de 6 h a 48 h → 2 h;
 *   - faltan menos de 6 h → aviso a toda la lista a la vez (sin lugar guardado);
 *   - la lista cierra en `min(comienzo − 30 min, cierre de la venta)`: ninguna reserva pasa de ahí.
 * Cada borde es «desde»: con 7 días justos ya son 24 h, con 48 h justas 12 h, con 6 h justas 2 h.
 *
 * Funciones puras (el reloj y el evento son parámetros), para el servidor, el editor y vitest.
 */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** La clave del frontmatter / `extra` del evento. */
export const WAITLIST_KEY = 'lista_espera';

/**
 * @typedef {{ overHours: number, holdHours: number }} HoldTier
 * «Si faltan `overHours` horas o más para el comienzo, se guarda el lugar `holdHours` horas.»
 */
/**
 * @typedef {{
 *   mode: 'one' | 'all',
 *   tiers: HoldTier[],
 *   broadcastUnderHours: number,
 *   endBeforeStartMinutes: number
 * }} WaitlistSettings
 * `mode`: `one` = de a una persona por vez; `all` = se le avisa a toda la lista a la vez desde el
 * principio («todes a la vez»).
 */
/**
 * @typedef {{ scope: 'event' | 'type', allAtOnce: boolean }} EventWaitlist
 * La lista de un evento (`config.waitlist`). Los tiempos de reserva son siempre los del código
 * (gorrite, 12/10: no se configuran ni por evento ni en el panel).
 */
/**
 * @typedef {{ kind: 'hold', until: number } | { kind: 'broadcast' } | { kind: 'closed' }} HoldResult
 */

/**
 * Los tiempos de la lista de espera, fijos (gorrite, 12/10: sin página de Ajustes; un valor que
 * haya quedado guardado en `ticket_settings` se ignora). De a una persona por vez; 24 h / 12 h /
 * 2 h según cuánto falte; aviso a todes a menos de 6 h; cierre 30 min antes del comienzo.
 *
 * @type {Readonly<{ mode: 'one' | 'all', tiers: readonly Readonly<HoldTier>[],
 *   broadcastUnderHours: number, endBeforeStartMinutes: number }>}
 */
export const WAITLIST_SETTINGS = Object.freeze({
	mode: 'one',
	tiers: Object.freeze([
		Object.freeze({ overHours: 168, holdHours: 24 }),
		Object.freeze({ overHours: 48, holdHours: 12 }),
		Object.freeze({ overHours: 6, holdHours: 2 })
	]),
	broadcastUnderHours: 6,
	endBeforeStartMinutes: 30
});

/**
 * La lista de espera de un evento (`lista_espera` en el frontmatter o en `extra`):
 *
 * - `'evento'` o `'tipo'` (atajo), o
 * - `{ alcance: 'evento' | 'tipo', todes_a_la_vez?: boolean }`.
 *
 * Sin la clave, `false`, o algo que no se entiende: `null` (sin lista). Una lista rota nunca
 * frena la venta: el evento vende como si no tuviera lista. `reservas` (tiempos propios del
 * evento, de antes del 12/10) se ignora: valen siempre los del código.
 *
 * @param {unknown} raw
 * @returns {EventWaitlist | null}
 */
export function parseEventWaitlist(raw) {
	if (raw === undefined || raw === null || raw === false || raw === '') return null;
	/** @param {unknown} a */
	const scopeOf = (a) => (a === 'evento' ? 'event' : a === 'tipo' ? 'type' : null);
	if (typeof raw === 'string') {
		const scope = scopeOf(raw.trim().toLowerCase());
		return scope ? { scope, allAtOnce: false } : null;
	}
	if (typeof raw !== 'object' || Array.isArray(raw)) return null;
	const o = /** @type {Record<string, unknown>} */ (raw);
	const scope = scopeOf(typeof o.alcance === 'string' ? o.alcance.trim().toLowerCase() : null);
	if (!scope) return null;
	const all = o.todes_a_la_vez;
	if (all !== undefined && all !== null && typeof all !== 'boolean') return null;
	return { scope, allAtOnce: all === true };
}

/**
 * Los ajustes que valen para un evento: los fijos ({@link WAITLIST_SETTINGS}) con lo que el
 * evento cambia («todes a la vez»; los tramos de reserva son siempre los fijos).
 *
 * @param {WaitlistSettings} global
 * @param {EventWaitlist | null | undefined} event
 * @returns {WaitlistSettings}
 */
export function effectiveWaitlistSettings(global, event) {
	return {
		...global,
		mode: event?.allAtOnce ? 'all' : global.mode,
		tiers: global.tiers.map((t) => ({ ...t }))
	};
}

/**
 * Un instante en ms, o `null` si no se puede leer (o no hay).
 * @param {number | string | Date | null | undefined} value
 */
function toMs(value) {
	if (value === null || value === undefined || value === '') return null;
	const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return Number.isFinite(ms) ? ms : null;
}

/**
 * Cuándo cierra la lista: `min(comienzo − endBeforeStartMinutes, cierre de la venta)`. `null` si
 * no hay ni comienzo ni cierre (no cierra sola).
 *
 * @param {{ start?: number | string | Date | null, salesClose?: number | string | Date | null,
 *   settings: WaitlistSettings }} input
 */
export function waitlistCutoff({ start, salesClose, settings }) {
	const s = toMs(start);
	const c = toMs(salesClose);
	const fromStart = s === null ? null : s - settings.endBeforeStartMinutes * MINUTE_MS;
	if (fromStart === null) return c;
	if (c === null) return fromStart;
	return Math.min(fromStart, c);
}

/**
 * Cuántas horas se guarda el lugar si faltan `untilStartMs` para el comienzo: el primer tramo
 * (de mayor a menor) cuyo `overHours` se alcanza; si no alcanza ninguno, el más corto.
 *
 * @param {HoldTier[]} tiers
 * @param {number} untilStartMs
 */
export function tierHoldHours(tiers, untilStartMs) {
	const sorted = [...tiers].sort((a, b) => b.overHours - a.overHours);
	for (const t of sorted) if (untilStartMs >= t.overHours * HOUR_MS) return t.holdHours;
	return sorted[sorted.length - 1].holdHours;
}

/**
 * Qué pasa si ahora le toca a alguien de la lista:
 *
 * - `{ kind: 'closed' }`: ya pasó el cierre de la lista (no se ofrece nada);
 * - `{ kind: 'broadcast' }`: se le avisa a toda la lista a la vez, sin lugar guardado (faltan
 *   menos de `broadcastUnderHours`, o el evento es «todes a la vez»);
 * - `{ kind: 'hold', until }`: se le guarda el lugar hasta `until` (nunca después del cierre, y
 *   siempre después de `now`).
 *
 * `settings` son los que valen para el evento ({@link effectiveWaitlistSettings}). Sin comienzo,
 * se usa el tramo más largo y el cierre de la venta.
 *
 * @param {{ now: number, start?: number | string | Date | null,
 *   salesClose?: number | string | Date | null, settings: WaitlistSettings }} input
 * @returns {HoldResult}
 */
export function holdUntil({ now, start, salesClose, settings }) {
	const cutoff = waitlistCutoff({ start, salesClose, settings });
	if (cutoff !== null && now >= cutoff) return { kind: 'closed' };
	const s = toMs(start);
	const untilStart = s === null ? Infinity : s - now;
	if (settings.mode === 'all' || untilStart < settings.broadcastUnderHours * HOUR_MS)
		return { kind: 'broadcast' };
	const until = now + tierHoldHours(settings.tiers, untilStart) * HOUR_MS;
	return { kind: 'hold', until: cutoff === null ? until : Math.min(until, cutoff) };
}

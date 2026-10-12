/**
 * Lista de espera de las entradas: cuánto se le guarda el lugar a quien le toca, y cómo se leen
 * los ajustes (globales en Ajustes, `ticket_settings` clave `waitlist`; por evento, la clave
 * `lista_espera` del frontmatter / `extra`). docs/tickets.md, «Lista de espera».
 *
 * La reserva se mide contra el comienzo del evento (con los ajustes por defecto):
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

/** Topes de los ajustes (para atajar un cero de más). */
export const WAITLIST_LIMITS = Object.freeze({
	/** Tramos de reserva. */
	maxTiers: 6,
	/** «Faltan N horas o más»: hasta un año. */
	maxOverHours: 24 * 365,
	/** Una reserva dura de 1 hora a 7 días. */
	maxHoldHours: 24 * 7,
	/** El aviso a todes arranca cuando faltan hasta 7 días. */
	maxBroadcastUnderHours: 24 * 7,
	/** La lista cierra hasta 24 h antes del comienzo. */
	maxEndBeforeStartMinutes: 24 * 60
});

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
 * La lista de un evento (`config.waitlist`). Los tiempos de reserva son siempre los de Ajustes
 * (gorrite, 12/10: no hace falta configurarlos por evento).
 */
/**
 * @typedef {{ kind: 'hold', until: number } | { kind: 'broadcast' } | { kind: 'closed' }} HoldResult
 */

/**
 * @type {Readonly<{ mode: 'one' | 'all', tiers: readonly Readonly<HoldTier>[],
 *   broadcastUnderHours: number, endBeforeStartMinutes: number }>}
 */
export const DEFAULT_WAITLIST_SETTINGS = Object.freeze({
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
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 */
function intIn(v, min, max) {
	const n = typeof v === 'string' && v.trim() ? Number(v) : v;
	return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * Lee una lista de tramos. `null` si algo no se entiende (vacía, repetida, fuera de rango).
 * Devuelve los tramos ordenados de mayor a menor `overHours`.
 *
 * @param {unknown} raw
 * @returns {HoldTier[] | null}
 */
export function parseHoldTiers(raw) {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > WAITLIST_LIMITS.maxTiers) return null;
	/** @type {HoldTier[]} */
	const out = [];
	for (const t of raw) {
		if (!t || typeof t !== 'object') return null;
		const overHours = intIn(t.overHours, 0, WAITLIST_LIMITS.maxOverHours);
		const holdHours = intIn(t.holdHours, 1, WAITLIST_LIMITS.maxHoldHours);
		if (overHours === null || holdHours === null) return null;
		if (out.some((o) => o.overHours === overHours)) return null;
		out.push({ overHours, holdHours });
	}
	return out.sort((a, b) => b.overHours - a.overHours);
}

/**
 * Los ajustes globales guardados (JSON en `ticket_settings`, clave `waitlist`). Vacío o algo que
 * no se entiende = los de por defecto (nunca frena nada). Un campo que falta usa el de por
 * defecto; uno que está mal invalida todo (mejor los de siempre que una mezcla rara).
 *
 * @param {unknown} raw string JSON (o el objeto ya leído)
 * @returns {WaitlistSettings}
 */
export function parseWaitlistSettings(raw) {
	const parsed = readWaitlistSettings(raw);
	return parsed ?? cloneDefaults();
}

function cloneDefaults() {
	return {
		...DEFAULT_WAITLIST_SETTINGS,
		tiers: DEFAULT_WAITLIST_SETTINGS.tiers.map((t) => ({ ...t }))
	};
}

/**
 * Como {@link parseWaitlistSettings}, pero `null` si no se entiende (vacío sí vale: defaults).
 *
 * @param {unknown} raw
 * @returns {WaitlistSettings | null}
 */
function readWaitlistSettings(raw) {
	if (raw === undefined || raw === null || raw === '') return cloneDefaults();
	let obj = raw;
	if (typeof raw === 'string') {
		try {
			obj = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
	const o = /** @type {Record<string, unknown>} */ (obj);
	const d = DEFAULT_WAITLIST_SETTINGS;
	const mode = o.mode === undefined ? d.mode : o.mode;
	if (mode !== 'one' && mode !== 'all') return null;
	const tiers = o.tiers === undefined ? d.tiers.map((t) => ({ ...t })) : parseHoldTiers(o.tiers);
	const broadcastUnderHours =
		o.broadcastUnderHours === undefined
			? d.broadcastUnderHours
			: intIn(o.broadcastUnderHours, 0, WAITLIST_LIMITS.maxBroadcastUnderHours);
	const endBeforeStartMinutes =
		o.endBeforeStartMinutes === undefined
			? d.endBeforeStartMinutes
			: intIn(o.endBeforeStartMinutes, 0, WAITLIST_LIMITS.maxEndBeforeStartMinutes);
	if (!tiers || broadcastUnderHours === null || endBeforeStartMinutes === null) return null;
	return { mode, tiers, broadcastUnderHours, endBeforeStartMinutes };
}

/**
 * ¿Qué tiene de malo un ajuste global guardado? `null` si está vacío o bien (para el panel).
 *
 * @param {unknown} raw
 */
export function waitlistSettingsProblem(raw) {
	return readWaitlistSettings(raw)
		? null
		: 'Los ajustes de la lista de espera no se entienden: revisá los tramos (horas enteras), el aviso a todes y el cierre.';
}

/**
 * La lista de espera de un evento (`lista_espera` en el frontmatter o en `extra`):
 *
 * - `'evento'` o `'tipo'` (atajo), o
 * - `{ alcance: 'evento' | 'tipo', todes_a_la_vez?: boolean }`.
 *
 * Sin la clave, `false`, o algo que no se entiende: `null` (sin lista). Una lista rota nunca
 * frena la venta: el evento vende como si no tuviera lista. `reservas` (tiempos propios del
 * evento, de antes del 12/10) se ignora: valen siempre los de Ajustes.
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
 * Los ajustes que valen para un evento: los globales con lo que el evento cambia («todes a la
 * vez»; los tramos de reserva son siempre los globales).
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

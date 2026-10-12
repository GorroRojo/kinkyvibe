/**
 * Los formularios de los tiempos de la lista de espera: la página Ajustes → Lista de espera (los
 * de todas las listas) y el bloque «Lista de espera» del editor del evento (los de un evento).
 * Código puro, para el navegador, el servidor y vitest. Las reglas de fondo son las de
 * ./waitlistHold.js (`parseHoldTiers`, `parseWaitlistSettings`).
 */
import { DEFAULT_WAITLIST_SETTINGS, WAITLIST_LIMITS, parseHoldTiers } from './waitlistHold.js';

/** @typedef {{ over: string, hold: string }} TierRow */

/** Lo que dice cualquier tramo mal cargado. */
export const TIERS_ERROR = `Revisá los tiempos de reserva: horas enteras, «faltan» de 0 a ${WAITLIST_LIMITS.maxOverHours}, «se guarda» de 1 a ${WAITLIST_LIMITS.maxHoldHours}, sin repetir «faltan» y hasta ${WAITLIST_LIMITS.maxTiers} tramos.`;

/**
 * Tramos de las filas del formulario. Las filas vacías se ignoran.
 *
 * @param {TierRow[]} rows
 * @returns {{ ok: true, tiers: import('./waitlistHold.js').HoldTier[] } | { ok: false, error: string }}
 */
export function tiersFromRows(rows) {
	const filled = rows.filter((r) => String(r.over ?? '').trim() || String(r.hold ?? '').trim());
	if (!filled.length) return { ok: false, error: 'Poné al menos un tiempo de reserva.' };
	const intOrNaN = (/** @type {string} */ v) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
	const tiers = parseHoldTiers(
		filled.map((r) => ({ overHours: intOrNaN(r.over ?? ''), holdHours: intOrNaN(r.hold ?? '') }))
	);
	return tiers ? { ok: true, tiers } : { ok: false, error: TIERS_ERROR };
}

/**
 * Filas del formulario para unos tramos (más una vacía para sumar otro, si entra).
 *
 * @param {readonly import('./waitlistHold.js').HoldTier[]} tiers
 * @param {{ blank?: boolean }} [opts]
 * @returns {TierRow[]}
 */
export function rowsFromTiers(tiers, { blank = true } = {}) {
	const rows = tiers.map((t) => ({ over: String(t.overHours), hold: String(t.holdHours) }));
	if (blank && rows.length < WAITLIST_LIMITS.maxTiers) rows.push({ over: '', hold: '' });
	return rows;
}

/**
 * ¿Son los tramos de por defecto?
 * @param {readonly import('./waitlistHold.js').HoldTier[]} tiers
 */
export function isDefaultTiers(tiers) {
	const d = DEFAULT_WAITLIST_SETTINGS.tiers;
	return (
		tiers.length === d.length &&
		tiers.every((t, i) => t.overHours === d[i].overHours && t.holdHours === d[i].holdHours)
	);
}

/**
 * Los ajustes globales del formulario de Ajustes → Lista de espera, como se guardan: el JSON, o
 * `''` si son los de por defecto (o se tildó «Volver a los de por defecto»).
 *
 * Campos: `mode` ('one' | 'all'), `broadcast_under` (horas), `end_before` (minutos),
 * `tier_over_<i>` y `tier_hold_<i>` (horas), `defaults` (tildado = los de por defecto).
 *
 * @param {Record<string, string>} form
 * @returns {{ ok: true, json: string } | { ok: false, error: string }}
 */
export function waitlistSettingsFromForm(form) {
	if (form.defaults) return { ok: true, json: '' };
	const mode = form.mode === 'all' ? 'all' : 'one';
	/** @type {TierRow[]} */
	const rows = [];
	for (let i = 0; i < WAITLIST_LIMITS.maxTiers + 1; i++) {
		if (form[`tier_over_${i}`] === undefined && form[`tier_hold_${i}`] === undefined) continue;
		rows.push({ over: form[`tier_over_${i}`] ?? '', hold: form[`tier_hold_${i}`] ?? '' });
	}
	const tiers = tiersFromRows(rows);
	if (!tiers.ok) return tiers;
	const broadcast = String(form.broadcast_under ?? '').trim();
	const end = String(form.end_before ?? '').trim();
	if (!/^\d+$/.test(broadcast) || Number(broadcast) > WAITLIST_LIMITS.maxBroadcastUnderHours) {
		return {
			ok: false,
			error: `El aviso a todes: un número entero de horas, de 0 a ${WAITLIST_LIMITS.maxBroadcastUnderHours}.`
		};
	}
	if (!/^\d+$/.test(end) || Number(end) > WAITLIST_LIMITS.maxEndBeforeStartMinutes) {
		return {
			ok: false,
			error: `El cierre de la lista: un número entero de minutos, de 0 a ${WAITLIST_LIMITS.maxEndBeforeStartMinutes}.`
		};
	}
	const value = {
		mode,
		tiers: tiers.tiers,
		broadcastUnderHours: Number(broadcast),
		endBeforeStartMinutes: Number(end)
	};
	const d = DEFAULT_WAITLIST_SETTINGS;
	const isDefault =
		value.mode === d.mode &&
		isDefaultTiers(value.tiers) &&
		value.broadcastUnderHours === d.broadcastUnderHours &&
		value.endBeforeStartMinutes === d.endBeforeStartMinutes;
	return { ok: true, json: isDefault ? '' : JSON.stringify(value) };
}

/**
 * «Si faltan 7 días o más, 24 h» (para mostrar un tramo).
 * @param {import('./waitlistHold.js').HoldTier} t
 */
export function describeTier(t) {
	const over =
		t.overHours === 0
			? 'Hasta el cierre'
			: t.overHours % 24 === 0
				? `Si faltan ${t.overHours / 24} ${t.overHours === 24 ? 'día' : 'días'} o más`
				: `Si faltan ${t.overHours} h o más`;
	return `${over}: se guarda ${t.holdHours} h`;
}

/**
 * Ajustes de venta que se editan desde el admin (/admin/entradas/ajustes), guardados en D1
 * (`ticket_settings`, migrations/0005_tickets_v4.sql): datos para transferir y comisión de
 * Mercado Pago. Si un ajuste está vacío se usa la variable de entorno de siempre
 * (TICKETS_TRANSFER_INFO, TICKETS_MP_FEE_PERCENT), así que un deploy sin nada cargado en el
 * admin funciona igual que antes.
 */
import { parseFeePercent } from '$lib/utils/tickets.js';
import { MAX_REMINDERS, normalizeReminder } from './reminders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Campos de transferencia, en el orden en que se muestran. Texto libre. */
export const TRANSFER_FIELDS = /** @type {const} */ ([
	{ key: 'transfer_alias', label: 'Alias', max: 60 },
	{ key: 'transfer_cbu', label: 'CBU/CVU', max: 40 },
	{ key: 'transfer_holder', label: 'Titular', max: 100 },
	{ key: 'transfer_bank', label: 'Banco', max: 80 }
]);

export const SETTING_KEYS = /** @type {const} */ ([
	...TRANSFER_FIELDS.map((f) => f.key),
	'mp_fee_percent',
	// Porcentaje del Fondo fijado a mano (vacío = automático, desde fondo.kinkyvibe.ar).
	'fondo_percent_override',
	// Mails: remitente ("KinkyVibe <entradas@kinkyvibe.ar>") y respuesta (entradas@kinkyvibe.ar).
	'from_email',
	'reply_to_email',
	// Recordatorios: JSON (ver reminders.js). Vacío = los de por defecto.
	'reminders'
]);

/** Remitente y dirección de respuesta por defecto de los mails de entradas. */
export const DEFAULT_FROM_EMAIL = 'KinkyVibe <entradas@kinkyvibe.ar>';
export const DEFAULT_REPLY_TO = 'entradas@kinkyvibe.ar';

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

/**
 * "Nombre <dir@dominio>" o "dir@dominio" (lo que acepta Resend en `from`).
 *
 * @param {string} v
 */
export function isValidFrom(v) {
	const m = v.match(/^([^<>"]{1,60})\s*<([^<>]+)>$/);
	return m ? EMAIL_RE.test(m[2].trim()) : EMAIL_RE.test(v);
}

/** @typedef {(typeof SETTING_KEYS)[number]} SettingKey */
/** @typedef {Record<SettingKey, string>} SalesSettings */

/** @returns {SalesSettings} */
function empty() {
	return /** @type {SalesSettings} */ (Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])));
}

/**
 * Lee los ajustes (vacíos si no hay base o todavía no se aplicó la migración).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<SalesSettings & { updatedAt: number | null, updatedBy: string | null }>}
 */
export async function getSalesSettings(db) {
	const out = { ...empty(), updatedAt: /** @type {number | null} */ (null), updatedBy: null };
	if (!db) return out;
	try {
		const { results } = await db
			.prepare('SELECT key, value, updated_at, updated_by FROM ticket_settings')
			.all();
		for (const r of results) {
			const key = /** @type {SettingKey} */ (String(r.key));
			if (!SETTING_KEYS.includes(key)) continue;
			out[key] = String(r.value ?? '');
			if (out.updatedAt === null || Number(r.updated_at) > out.updatedAt) {
				out.updatedAt = Number(r.updated_at);
				out.updatedBy = /** @type {any} */ (String(r.updated_by));
			}
		}
	} catch (error) {
		// Sin la tabla (migración pendiente) se usan las variables de entorno.
		if (!(error instanceof Error && /no such table/i.test(error.message))) throw error;
	}
	return out;
}

/** @param {unknown} raw */
function clean(raw) {
	return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Valida el formulario de ajustes. Los campos de transferencia son texto libre (con un largo
 * máximo); la comisión, un porcentaje de 0 a 49,99 o vacío.
 *
 * @param {Record<string, unknown>} form
 * @returns {{ ok: true, value: SalesSettings } | { ok: false, errors: Partial<Record<SettingKey, string>> }}
 */
export function validateSalesSettings(form) {
	/** @type {Partial<Record<SettingKey, string>>} */
	const errors = {};
	const value = empty();
	for (const f of TRANSFER_FIELDS) {
		const v = clean(form[f.key]);
		if (v.length > f.max) errors[f.key] = `Hasta ${f.max} caracteres.`;
		value[f.key] = v;
	}
	const fee = clean(form.mp_fee_percent);
	if (fee && parseFeePercent(fee) === null) {
		errors.mp_fee_percent =
			'Poné un porcentaje entre 0 y 49,99 (por ejemplo 2 o 6,29), o dejalo vacío.';
	}
	value.mp_fee_percent = fee;
	const fondo = clean(form.fondo_percent_override).replace(/\s*%$/, '');
	if (fondo && !/^(100|[1-9]?\d)$/.test(fondo)) {
		errors.fondo_percent_override =
			'Poné un número entero de 0 a 100, o dejalo vacío (automático).';
	}
	value.fondo_percent_override = fondo;
	const from = clean(form.from_email);
	if (from && (from.length > 120 || !isValidFrom(from))) {
		errors.from_email = 'Poné una dirección (entradas@kinkyvibe.ar) o "Nombre <dirección>".';
	}
	value.from_email = from;
	const replyTo = clean(form.reply_to_email).toLowerCase();
	if (replyTo && (replyTo.length > 120 || !EMAIL_RE.test(replyTo))) {
		errors.reply_to_email = 'Poné una dirección de email.';
	}
	value.reply_to_email = replyTo;
	// Recordatorios: filas reminder_kind_<i>, reminder_amount_<i> (horas o días),
	// reminder_time_<i>, reminder_enabled_<i>, reminder_delete_<i>. Solo si el form las trae.
	if (form.reminder_kind_0 !== undefined) {
		const list = [];
		for (let i = 0; i < MAX_REMINDERS + 1; i++) {
			const kind = clean(form[`reminder_kind_${i}`]);
			const amount = clean(form[`reminder_amount_${i}`]);
			if (!kind || form[`reminder_delete_${i}`] || !amount) continue;
			const enabled = Boolean(form[`reminder_enabled_${i}`]);
			const r = normalizeReminder(
				kind === 'hours_before'
					? { kind, hours: amount, enabled }
					: { kind, days: amount, time: clean(form[`reminder_time_${i}`]), enabled }
			);
			if (!r) {
				errors.reminders = `Revisá el recordatorio ${i + 1}: horas de 1 a 336, días de 0 a 14 y hora HH:MM.`;
				continue;
			}
			list.push(r);
		}
		if (list.length > MAX_REMINDERS) errors.reminders = `Hasta ${MAX_REMINDERS} recordatorios.`;
		value.reminders = JSON.stringify(list);
	}
	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, value };
}

/**
 * Guarda los ajustes (un valor vacío borra el ajuste: vuelve a usarse la variable de entorno).
 *
 * @param {D1Database} db
 * @param {SalesSettings} value
 * @param {{ by: string, now?: number }} meta
 */
export async function saveSalesSettings(db, value, { by, now = Date.now() }) {
	await db.batch(
		SETTING_KEYS.map((key) =>
			value[key]
				? db
						.prepare(
							`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
							ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4
							WHERE ticket_settings.value != ?2`
						)
						.bind(key, value[key], now, by)
				: db.prepare('DELETE FROM ticket_settings WHERE key = ?1').bind(key)
		)
	);
}

/**
 * Texto con los datos para transferir armado con los ajustes ("Alias: …\nCBU/CVU: …"), o `null`
 * si no hay ninguno cargado.
 *
 * @param {SalesSettings} settings
 */
export function transferInfoFromSettings(settings) {
	const lines = TRANSFER_FIELDS.filter((f) => settings[f.key]).map(
		(f) => `${f.label}: ${settings[f.key]}`
	);
	return lines.length ? lines.join('\n') : null;
}

/**
 * Cómo salen por defecto los formularios (docs/formularios.md, «Cómo salen por defecto»): la
 * encuesta de después de cada evento (si sale sola, cuántos días después, su privacidad, quién ve
 * las respuestas y su mail), los formularios nuevos (quién responde y privacidad) y el mail con el
 * link de un formulario «quienes tenían entrada». Se cambian en Comunidad › Formularios › Cómo
 * salen por defecto. La encuesta sale siempre, aunque sea tarde (gorrite, 5/11): no hay corte.
 *
 * Se guardan en `ticket_settings` (la tabla de los ajustes del panel, como el ajuste de PayPal o
 * la clave de los links), en una sola fila JSON (`forms_defaults`): sin migración. Sin fila, o con
 * un valor raro, vale {@link FORM_DEFAULTS} (lo de siempre); cada campo se lee por separado, así un
 * campo roto no se lleva puestos a los demás.
 */

import { mailTextError } from './email.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La clave de `ticket_settings`. */
export const FORM_DEFAULTS_KEY = 'forms_defaults';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días después del fin del evento en que sale la encuesta: de 0 a 14. */
export const SURVEY_DELAY_DAYS_MAX = 14;

/**
 * @typedef {{
 *   surveyAuto: boolean,
 *   surveyDelayDays: number,
 *   surveyPrivacy: import('$lib/utils/formularios.js').Privacy,
 *   surveyAudience: import('$lib/utils/formularios.js').Audience,
 *   formAccess: 'link' | 'account',
 *   formPrivacy: import('$lib/utils/formularios.js').Privacy,
 *   surveyMailSubject: string,
 *   surveyMailBody: string,
 *   formMailSubject: string,
 *   formMailBody: string
 * }} FormDefaults
 */

/**
 * Lo de siempre (lo que hacía el código antes de que se pudiera cambiar). Los textos del mail
 * vacíos = los de siempre (`email.js`).
 * @type {Readonly<FormDefaults>}
 */
export const FORM_DEFAULTS = Object.freeze({
	surveyAuto: true,
	surveyDelayDays: 1,
	surveyPrivacy: 'anonymous',
	surveyAudience: 'organizers',
	formAccess: 'link',
	formPrivacy: 'named',
	surveyMailSubject: '',
	surveyMailBody: '',
	formMailSubject: '',
	formMailBody: ''
});

const PRIVACIES = ['named', 'anonymous', 'choose'];
const AUDIENCES = ['organizers', 'admins'];
/** Un formulario nuevo no tiene evento: «quienes tenían entrada» no se puede elegir de entrada. */
const NEW_FORM_ACCESS = ['link', 'account'];

/**
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 */
function intIn(v, min, max) {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * Lo guardado, campo por campo, con lo de siempre donde falta o no vale.
 *
 * @param {unknown} raw el JSON guardado (texto) o un objeto
 * @returns {FormDefaults}
 */
export function parseFormDefaults(raw) {
	/** @type {Record<string, unknown>} */
	let v = {};
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed;
		} catch {
			// Un valor roto: lo de siempre.
		}
	} else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		v = /** @type {Record<string, unknown>} */ (raw);
	}
	const d = FORM_DEFAULTS;
	/** @param {unknown} x @param {string[]} list @param {string} fallback */
	const oneOf = (x, list, fallback) => (typeof x === 'string' && list.includes(x) ? x : fallback);
	/** @param {unknown} x @param {'subject' | 'body'} part */
	const text = (x, part) =>
		typeof x === 'string' && !mailTextError(x.trim(), part) ? x.trim() : '';
	return {
		surveyAuto: typeof v.surveyAuto === 'boolean' ? v.surveyAuto : d.surveyAuto,
		surveyDelayDays: intIn(v.surveyDelayDays, 0, SURVEY_DELAY_DAYS_MAX) ?? d.surveyDelayDays,
		surveyPrivacy: /** @type {FormDefaults['surveyPrivacy']} */ (
			oneOf(v.surveyPrivacy, PRIVACIES, d.surveyPrivacy)
		),
		surveyAudience: /** @type {FormDefaults['surveyAudience']} */ (
			oneOf(v.surveyAudience, AUDIENCES, d.surveyAudience)
		),
		formAccess: /** @type {FormDefaults['formAccess']} */ (
			oneOf(v.formAccess, NEW_FORM_ACCESS, d.formAccess)
		),
		formPrivacy: /** @type {FormDefaults['formPrivacy']} */ (
			oneOf(v.formPrivacy, PRIVACIES, d.formPrivacy)
		),
		surveyMailSubject: text(v.surveyMailSubject, 'subject'),
		surveyMailBody: text(v.surveyMailBody, 'body'),
		formMailSubject: text(v.formMailSubject, 'subject'),
		formMailBody: text(v.formMailBody, 'body')
	};
}

/**
 * Valida lo que llega del formulario de «Cómo salen por defecto».
 *
 * @param {FormData} fd
 * @returns {{ ok: true, value: FormDefaults } | { ok: false, errors: Partial<Record<keyof FormDefaults, string>> }}
 */
export function validateFormDefaults(fd) {
	/** @type {Partial<Record<keyof FormDefaults, string>>} */
	const errors = {};
	const delay = intIn(fd.get('surveyDelayDays'), 0, SURVEY_DELAY_DAYS_MAX);
	if (delay === null)
		errors.surveyDelayDays = `Poné un número de días de 0 a ${SURVEY_DELAY_DAYS_MAX}.`;
	/** @param {'surveyMailSubject' | 'surveyMailBody' | 'formMailSubject' | 'formMailBody'} key */
	const mail = (key) => {
		const x = String(fd.get(key) ?? '').trim();
		const err = mailTextError(x, key.endsWith('Subject') ? 'subject' : 'body');
		if (err) errors[key] = err;
		return x;
	};
	/** @param {string} key @param {string[]} list */
	const pick = (key, list) => {
		const x = String(fd.get(key) ?? '');
		if (!list.includes(x)) errors[/** @type {keyof FormDefaults} */ (key)] = 'Elegí una opción.';
		return x;
	};
	const value = {
		surveyAuto: fd.get('surveyAuto') === 'on',
		surveyDelayDays: delay ?? 0,
		surveyPrivacy: /** @type {FormDefaults['surveyPrivacy']} */ (pick('surveyPrivacy', PRIVACIES)),
		surveyAudience: /** @type {FormDefaults['surveyAudience']} */ (
			pick('surveyAudience', AUDIENCES)
		),
		formAccess: /** @type {FormDefaults['formAccess']} */ (pick('formAccess', NEW_FORM_ACCESS)),
		formPrivacy: /** @type {FormDefaults['formPrivacy']} */ (pick('formPrivacy', PRIVACIES)),
		surveyMailSubject: mail('surveyMailSubject'),
		surveyMailBody: mail('surveyMailBody'),
		formMailSubject: mail('formMailSubject'),
		formMailBody: mail('formMailBody')
	};
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/**
 * Lo que vale hoy. Sin base, sin la tabla o con la base caída: lo de siempre (nunca frena el
 * cron ni una página).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<FormDefaults & { updatedAt: number | null, updatedBy: string | null }>}
 */
export async function getFormDefaults(db) {
	if (!db) return { ...FORM_DEFAULTS, updatedAt: null, updatedBy: null };
	try {
		const r = await db
			.prepare('SELECT value, updated_at, updated_by FROM ticket_settings WHERE key = ?1')
			.bind(FORM_DEFAULTS_KEY)
			.first();
		if (r) {
			return {
				...parseFormDefaults(r.value),
				updatedAt: Number(r.updated_at) || null,
				updatedBy: r.updated_by == null ? null : String(r.updated_by)
			};
		}
	} catch {
		// Lo de siempre.
	}
	return { ...FORM_DEFAULTS, updatedAt: null, updatedBy: null };
}

/**
 * Guarda lo que vale desde ahora (ya validado).
 *
 * @param {D1Database} db
 * @param {FormDefaults} value
 * @param {{ by: string, now?: number }} meta
 */
export async function saveFormDefaults(db, value, { by, now = Date.now() }) {
	const json = JSON.stringify(parseFormDefaults(value));
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4`
		)
		.bind(FORM_DEFAULTS_KEY, json, now, by)
		.run();
}

/** @param {Pick<FormDefaults, 'surveyDelayDays'>} d cuánto después del fin sale la encuesta (ms) */
export const surveyDelayMs = (d) => d.surveyDelayDays * DAY_MS;

/**
 * «apenas termina el evento», «un día después del evento», «3 días después del evento»: para los
 * textos del panel.
 * @param {number} days
 */
export function delayText(days) {
	if (days === 0) return 'apenas termina el evento';
	return days === 1 ? 'un día después del evento' : `${days} días después del evento`;
}

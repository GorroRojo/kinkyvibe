/**
 * Ajustes del panel partidos en páginas (`/admin/ajustes/cobros`, `/fondo`, `/mails`), todos
 * sobre la misma tabla `ticket_settings`. Cada página manda solo sus campos:
 * `validateSalesSettings` devuelve solo los que vinieron y `saveSalesSettings` guarda solo esos,
 * así una página no borra los ajustes de las otras.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import {
	getSalesSettings,
	saveSalesSettings,
	validateSalesSettings
} from '$lib/server/tickets/settings.js';

/** @typedef {import('$lib/server/tickets/settings.js').SettingKey} SettingKey */

/** Qué claves de `ticket_settings` edita cada página. */
export const SECTIONS = Object.freeze({
	cobros: {
		label: 'cobros',
		keys: /** @type {SettingKey[]} */ ([
			'transfer_alias',
			'transfer_cbu',
			'transfer_holder',
			'transfer_bank',
			'mp_fee_percent'
		])
	},
	fondo: { label: 'fondo', keys: /** @type {SettingKey[]} */ (['fondo_percent_override']) },
	mails: {
		label: 'mails',
		keys: /** @type {SettingKey[]} */ ([
			'from_email',
			'reply_to_email',
			'reminders',
			'mail_batch_size',
			'mail_footer_contact',
			'mail_footer_signoff'
		])
	}
});

/** @typedef {keyof typeof SECTIONS} SectionId */

/**
 * Los ajustes guardados (o `null` sin base / sin la tabla).
 *
 * @param {App.Platform | undefined} platform
 */
export async function loadSettings(platform) {
	const db = getDB(platform);
	if (!db) return { db, settings: null };
	try {
		return { db, settings: await getSalesSettings(db) };
	} catch (error) {
		logDBError('ticket settings', error);
		return { db, settings: null };
	}
}

/**
 * Del formulario, solo las claves de la sección (y, para los recordatorios, sus filas).
 *
 * @param {Record<string, string>} form
 * @param {SectionId} section
 */
export function pickSectionFields(form, section) {
	const keys = SECTIONS[section].keys;
	/** @type {Record<string, string>} */
	const out = {};
	for (const [k, v] of Object.entries(form)) {
		const isReminderRow = k.startsWith('reminder_');
		if (isReminderRow ? keys.includes('reminders') : keys.includes(/** @type {SettingKey} */ (k)))
			out[k] = v;
	}
	return out;
}

/**
 * La action "save" de una página de ajustes.
 *
 * @param {SectionId} section
 * @returns {import('@sveltejs/kit').Action}
 */
export function saveSectionAction(section) {
	return async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const all = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 300)])
		);
		const form = pickSectionFields(all, section);
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {}, values: form });
		const valid = validateSalesSettings(form);
		if (!valid.ok) {
			return fail(400, { error: 'Revisá los datos marcados.', errors: valid.errors, values: form });
		}
		const value = Object.fromEntries(
			Object.entries(valid.value).filter(([k]) =>
				SECTIONS[section].keys.includes(/** @type {SettingKey} */ (k))
			)
		);
		try {
			await saveSalesSettings(db, value, { by: admin.login });
		} catch (error) {
			logDBError('save ticket settings', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.', errors: {}, values: form });
		}
		// Solo qué campos se guardaron, nunca los valores (hay datos bancarios).
		await logAdminAction(db, locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: 'ticket_settings',
			summary: `Guardó los ajustes de ${SECTIONS[section].label}`,
			detail: { section, fields: Object.keys(value) }
		});
		return { ok: true, message: 'Ajustes guardados.' };
	};
}

/**
 * Ajustes → Lista de espera (docs/tickets.md, «Lista de espera»): los ajustes de todas las listas
 * (cada evento puede cambiar «todes a la vez» y sus tiempos en su editor):
 *
 * - de a una persona por vez, o a toda la lista a la vez;
 * - cuánto se guarda el lugar según lo que falta para el evento (tramos);
 * - desde cuántas horas antes se le avisa a toda la lista a la vez;
 * - cuántos minutos antes del comienzo cierra la lista.
 *
 * Se guarda como JSON en `ticket_settings` (clave `waitlist`); igual a los de por defecto, vacío.
 * Solo admins (load y action). Con el interruptor apagado, la página se ve como «prueba».
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { loadSettings } from '$lib/server/admin/settingsForm.js';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { saveSalesSettings, validateSalesSettings } from '$lib/server/tickets/settings.js';
import {
	DEFAULT_WAITLIST_SETTINGS,
	WAITLIST_LIMITS,
	parseWaitlistSettings,
	waitlistSettingsProblem
} from '$lib/utils/waitlistHold.js';
import { waitlistSettingsFromForm } from '$lib/utils/waitlistSettingsForm.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const { db, settings } = await loadSettings(platform);
	const raw = settings?.waitlist ?? '';
	return {
		dbAvailable: Boolean(db && settings),
		enabled: await isFlagOn(db, 'lista_espera'),
		// Lo guardado no se entiende: se usan los de por defecto (y se avisa).
		problem: raw ? waitlistSettingsProblem(raw) : null,
		isDefault: !raw,
		current: parseWaitlistSettings(raw),
		defaults: {
			...DEFAULT_WAITLIST_SETTINGS,
			tiers: DEFAULT_WAITLIST_SETTINGS.tiers.map((t) => ({ ...t }))
		},
		limits: WAITLIST_LIMITS
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 40)])
		);
		if (!db) return fail(503, { error: 'Sin base de datos.', values: form });
		const built = waitlistSettingsFromForm(form);
		if (!built.ok) return fail(400, { error: built.error, values: form });
		const valid = validateSalesSettings({ waitlist: built.json });
		if (!valid.ok) {
			return fail(400, {
				error: valid.errors.waitlist ?? 'Revisá los datos.',
				values: form
			});
		}
		try {
			await saveSalesSettings(db, { waitlist: built.json }, { by: admin.login });
		} catch (error) {
			logDBError('save waitlist settings', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.', values: form });
		}
		await logAdminAction(db, locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: 'ticket_settings',
			summary: 'Guardó los ajustes de la lista de espera',
			detail: { section: 'lista-espera', fields: ['waitlist'], default: built.json === '' }
		});
		return { ok: true, message: 'Ajustes guardados.' };
	}
};

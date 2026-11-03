/**
 * Ajustes → Interruptores: prender y apagar funciones nuevas (decisión 0001: todo sale apagado y
 * se prende desde acá). Ver src/lib/server/flags.js. Solo admins; queda en el registro.
 * Arriba, las pausas de emergencia (TICKETS_PAUSED, MAILS_PAUSED; $lib/server/emergencia.js): solo
 * se ven, se prenden y se apagan en el panel de Cloudflare.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { FLAGS, listFlags, setFlag } from '$lib/server/flags.js';
import { emergencyPauses } from '$lib/server/emergencia.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	return {
		dbAvailable: Boolean(db),
		flags: db ? await listFlags(db) : [],
		pauses: emergencyPauses()
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	toggle: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base de datos.' });
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		if (!Object.hasOwn(FLAGS, key)) return fail(400, { error: 'Interruptor desconocido.' });
		const flagKey = /** @type {import('$lib/server/flags.js').FlagKey} */ (key);
		const enabled = form.get('enabled') === '1';
		try {
			await setFlag(db, flagKey, enabled, { by: admin.login });
		} catch (error) {
			logDBError('feature flag save', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.' });
		}
		await logAdminAction(db, locals, {
			action: 'flag.set',
			targetType: 'settings',
			targetId: `flag:${key}`,
			summary: `${enabled ? 'Prendió' : 'Apagó'} el interruptor «${FLAGS[flagKey].label}»`,
			detail: { key, enabled }
		});
		return { ok: true, message: enabled ? 'Prendido.' : 'Apagado.' };
	}
};

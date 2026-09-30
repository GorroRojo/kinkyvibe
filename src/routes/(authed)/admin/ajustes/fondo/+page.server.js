/**
 * Ajustes → Fondo: el porcentaje del Fondo KinkyVibe que se aplica ahora (y de dónde sale) y
 * el porcentaje fijado a mano para emergencias. Solo admins.
 */
import { requireAdmin } from '$lib/server/auth';
import { loadSettings, saveSectionAction } from '$lib/server/admin/settingsForm.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders, fetch }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const { db, settings } = await loadSettings(platform);
	return {
		dbAvailable: Boolean(db && settings),
		settings,
		// Porcentaje del Fondo que se está aplicando ahora y de dónde sale.
		fondo: await resolveFondoPercent({ db, fetch })
	};
}

/** @type {import('./$types').Actions} */
export const actions = { save: saveSectionAction('fondo') };

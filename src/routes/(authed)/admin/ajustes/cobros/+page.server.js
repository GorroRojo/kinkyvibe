/**
 * Ajustes → Cobros: datos para transferir (alias, CBU/CVU, titular, banco) y comisión de
 * Mercado Pago que se suma como recargo. En D1 (`ticket_settings`); vacío = la variable de
 * entorno (TICKETS_TRANSFER_INFO, TICKETS_MP_FEE_PERCENT). Solo admins.
 */
import { requireAdmin } from '$lib/server/auth';
import { loadSettings, saveSectionAction } from '$lib/server/admin/settingsForm.js';
import { envMpFeeBasisPoints, envTransferInfo } from '$lib/server/tickets/index.js';
import { TRANSFER_FIELDS } from '$lib/server/tickets/settings.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const { db, settings } = await loadSettings(platform);
	return {
		dbAvailable: Boolean(db && settings),
		settings,
		fields: TRANSFER_FIELDS.map((f) => ({ key: f.key, label: f.label, max: f.max })),
		// Solo si hay algo configurado en las variables (no se muestra el valor).
		env: {
			transfer: Boolean(envTransferInfo()),
			// TICKETS_MP_FEE_PERCENT o, si no está, la comisión por defecto (2 %).
			feePercent: envMpFeeBasisPoints() / 100
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = { save: saveSectionAction('cobros') };

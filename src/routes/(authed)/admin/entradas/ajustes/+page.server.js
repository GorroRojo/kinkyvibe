/**
 * Ajustes de venta: datos para transferir (alias, CBU/CVU, titular, banco) y comisión de
 * Mercado Pago. Se guardan en D1 (`ticket_settings`); si un ajuste queda vacío se usa la
 * variable de entorno (TICKETS_TRANSFER_INFO, TICKETS_MP_FEE_PERCENT). Solo admins: el `load` y
 * la action llaman a `requireAdmin` (las actions no pasan por el layout).
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { envMpFeeBasisPoints, envTransferInfo } from '$lib/server/tickets/index.js';
import {
	TRANSFER_FIELDS,
	getSalesSettings,
	saveSalesSettings,
	validateSalesSettings
} from '$lib/server/tickets/settings.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders, fetch }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Awaited<ReturnType<typeof getSalesSettings>> | null} */
	let settings = null;
	if (db) {
		try {
			settings = await getSalesSettings(db);
		} catch (error) {
			logDBError('ticket settings', error);
		}
	}
	return {
		// Porcentaje del Fondo que se está aplicando ahora y de dónde sale.
		fondo: await resolveFondoPercent({ db, fetch }),
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
export const actions = {
	save: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 300)])
		);
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {}, values: form });
		const valid = validateSalesSettings(form);
		if (!valid.ok) {
			return fail(400, { error: 'Revisá los datos marcados.', errors: valid.errors, values: form });
		}
		try {
			await saveSalesSettings(db, valid.value, { by: admin.login });
		} catch (error) {
			logDBError('save ticket settings', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.', errors: {}, values: form });
		}
		return { ok: true, message: 'Ajustes guardados.' };
	}
};

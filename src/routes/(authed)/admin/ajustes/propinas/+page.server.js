/**
 * Propinas (docs/propinas.md): total (y por destino), por mes, por publicación y la lista, con
 * CSV. Solo admins. `?destino=kinkyvibe|fondo` filtra la lista (cualquier otro valor, todas).
 *
 * Con el interruptor `paypal` prendido, además la parte de PayPal (decisión 0054): la cotización
 * de hoy, el ajuste en % (se cambia acá y queda en Actividad), el reparto por mes Fondo (Mercado
 * Pago en pesos, PayPal en dólares netos y en pesos estimados) y los retiros. Apagado, esa parte no
 * se carga y sus actions dan 404.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { paypalEnabled } from '$lib/server/flags.js';
import { listTips, tipSummary } from '$lib/server/propinas/index.js';
import {
	ADJUSTMENT_SETTING,
	addWithdrawal,
	deleteWithdrawal,
	getAdjustment,
	loadPaypalPanel,
	setAdjustment,
	validateWithdrawal
} from '$lib/server/paypal/index.js';
import { TIP_DESTINATIONS } from '$lib/utils/propinas.js';
import { parseAdjustmentPct } from '$lib/utils/paypal.js';

/**
 * El filtro de destino de la URL, solo si es uno conocido.
 * @param {URL} url
 * @returns {import('$lib/utils/propinas.js').TipDestination | null}
 */
function destinationFilter(url) {
	const d = url.searchParams.get('destino');
	return /** @type {readonly (string | null)[]} */ (TIP_DESTINATIONS).includes(d)
		? /** @type {import('$lib/utils/propinas.js').TipDestination} */ (d)
		: null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const destination = destinationFilter(url);
	/** @type {Awaited<ReturnType<typeof tipSummary>> | null} */
	let summary = null;
	/** @type {Awaited<ReturnType<typeof listTips>>} */
	let tips = [];
	if (db) {
		try {
			[summary, tips] = await Promise.all([tipSummary(db), listTips(db, { destination })]);
		} catch (error) {
			// Sin las migraciones 0019/0022 todavía: la página se ve vacía, no rota.
			logDBError('list tips', error);
		}
	}
	const paypal = db && (await paypalEnabled(platform)) ? await loadPaypalPanel(db) : null;
	return {
		dbAvailable: Boolean(db),
		summary,
		tips,
		destination,
		paypal
	};
}

/**
 * Lo común de las actions de PayPal: admin, interruptor prendido (si no, 404) y base.
 *
 * @param {{ locals: App.Locals, url: URL, platform: App.Platform | undefined }} event
 */
async function paypalAction({ locals, url, platform }) {
	const admin = requireAdmin(locals, url);
	if (!(await paypalEnabled(platform))) throw error(404, 'No encontrado');
	return { admin, db: getDB(platform) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	ajuste: async (event) => {
		const { admin, db } = await paypalAction(event);
		const raw = String((await event.request.formData()).get('adjustment') ?? '').slice(0, 20);
		const values = { adjustment: raw };
		const pct = parseAdjustmentPct(raw);
		if (pct === null) {
			return fail(400, {
				form: 'ajuste',
				error: 'Poné un porcentaje entre −50 y 50, con hasta 2 decimales (por ejemplo −4 o 2,5).',
				values
			});
		}
		if (!db) return fail(503, { form: 'ajuste', error: 'Sin base de datos.', values });
		let before;
		try {
			before = (await getAdjustment(db)).pct;
			await setAdjustment(db, pct, { by: admin.login });
		} catch (e) {
			logDBError('guardar ajuste paypal', e);
			return fail(500, { form: 'ajuste', error: 'No se pudo guardar. Probá de nuevo.', values });
		}
		await logAdminAction(db, event.locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: ADJUSTMENT_SETTING,
			summary: `Cambió el ajuste de la cotización de PayPal de ${before.toLocaleString('es-AR')} % a ${pct.toLocaleString('es-AR')} %`,
			detail: { from: before, to: pct }
		});
		return { form: 'ajuste', ok: true, message: 'Ajuste guardado: las estimaciones ya lo usan.' };
	},

	retiro: async (event) => {
		const { admin, db } = await paypalAction(event);
		const values = Object.fromEntries(
			[...(await event.request.formData())].map(([k, v]) => [k, String(v).slice(0, 300)])
		);
		const valid = validateWithdrawal(values);
		if (!valid.ok) {
			return fail(400, {
				form: 'retiro',
				error: 'Revisá los datos marcados.',
				errors: valid.errors,
				values
			});
		}
		if (!db) return fail(503, { form: 'retiro', error: 'Sin base de datos.', values });
		let id;
		try {
			id = await addWithdrawal(db, valid.value, { by: admin.login });
		} catch (e) {
			logDBError('guardar retiro paypal', e);
			return fail(500, { form: 'retiro', error: 'No se pudo guardar. Probá de nuevo.', values });
		}
		// Sin la nota (texto libre): solo la fecha y los montos.
		await logAdminAction(db, event.locals, {
			action: 'paypal.withdrawal.add',
			targetType: 'paypal_withdrawal',
			targetId: String(id),
			summary: `Cargó un retiro de PayPal del ${valid.value.day}`,
			detail: { day: valid.value.day, usdCents: valid.value.usdCents, ars: valid.value.ars }
		});
		return { form: 'retiro', ok: true, message: 'Retiro guardado.' };
	},

	borrarRetiro: async (event) => {
		const { db } = await paypalAction(event);
		const id = Number((await event.request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id <= 0) {
			return fail(400, { form: 'borrar', error: 'No se encontró ese retiro.' });
		}
		if (!db) return fail(503, { form: 'borrar', error: 'Sin base de datos.' });
		let deleted;
		try {
			deleted = await deleteWithdrawal(db, id);
		} catch (e) {
			logDBError('borrar retiro paypal', e);
			return fail(500, { form: 'borrar', error: 'No se pudo borrar. Probá de nuevo.' });
		}
		if (!deleted) return fail(404, { form: 'borrar', error: 'No se encontró ese retiro.' });
		await logAdminAction(db, event.locals, {
			action: 'paypal.withdrawal.delete',
			targetType: 'paypal_withdrawal',
			targetId: String(id),
			summary: `Borró un retiro de PayPal del ${deleted.day}`,
			detail: deleted
		});
		return { form: 'borrar', ok: true, message: 'Retiro borrado.' };
	}
};

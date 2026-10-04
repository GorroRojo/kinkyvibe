/**
 * Ficha del evento, pestaña Códigos: los códigos de descuento de este evento (y los que valen
 * para todos), alta de un código para este evento y activar/desactivar. Misma lógica que
 * /admin/ventas/codigos, con el evento fijo.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import {
	createDiscountCode,
	listDiscountCodes,
	setDiscountCodeActive,
	validateNewCode
} from '$lib/server/tickets/discounts.js';
import { getEventTickets } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!(await getEventTickets(params.slug))) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	/** @type {Awaited<ReturnType<typeof listDiscountCodes>>} */
	let codes = [];
	if (db) {
		try {
			codes = await listDiscountCodes(db);
		} catch (e) {
			logDBError('códigos del evento', e);
		}
	}
	return {
		codes: codes.filter((c) => c.event_slug === params.slug),
		global: codes.filter((c) => c.event_slug === null),
		dbAvailable: Boolean(db),
		now: Date.now()
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	create: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 100)])
		);
		// El evento es siempre el de la ficha (no se puede crear para otro desde acá).
		form.event_slug = params.slug;
		if (!db)
			return fail(503, { create: { error: 'Sin base de datos.', errors: {}, values: form } });
		if (!(await getEventTickets(params.slug))) {
			return fail(404, {
				create: { error: 'Ese evento no vende entradas.', errors: {}, values: form }
			});
		}
		const valid = validateNewCode(form, [params.slug]);
		if (!valid.ok) {
			return fail(400, {
				create: { error: 'Revisá los datos marcados.', errors: valid.errors, values: form }
			});
		}
		const created = await createDiscountCode(db, valid.value, { by: admin.login });
		if (!created) {
			return fail(409, {
				create: {
					error: 'Revisá los datos marcados.',
					errors: { code: `Ya existe un código ${valid.value.code}.` },
					values: form
				}
			});
		}
		await logAdminAction(db, locals, {
			action: 'discount.create',
			targetType: 'discount',
			targetId: valid.value.code,
			summary: `Creó el código de descuento ${valid.value.code} para ${params.slug}`,
			detail: valid.value
		});
		return { create: { ok: true, message: `Código ${valid.value.code} creado.` } };
	},

	toggle: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { toggle: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const code = String(form.get('code') ?? '')
			.slice(0, 40)
			.toUpperCase();
		const active = form.get('active') === '1';
		// Desde la ficha solo se tocan los códigos de este evento.
		const own = (await listDiscountCodes(db)).find(
			(c) => c.code === code && c.event_slug === params.slug
		);
		if (!own) return fail(404, { toggle: { ok: false, message: 'No encontramos ese código.' } });
		const ok = await setDiscountCodeActive(db, code, active);
		if (ok) {
			await logAdminAction(db, locals, {
				action: active ? 'discount.activate' : 'discount.deactivate',
				targetType: 'discount',
				targetId: code,
				summary: `${active ? 'Prendió' : 'Apagó'} el código ${code}`
			});
		}
		return ok
			? { toggle: { ok: true, message: `Código ${code} ${active ? 'prendido' : 'apagado'}.` } }
			: fail(404, { toggle: { ok: false, message: 'No encontramos ese código.' } });
	}
};

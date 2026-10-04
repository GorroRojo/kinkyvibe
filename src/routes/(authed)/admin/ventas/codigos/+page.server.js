/**
 * Códigos de descuento: lista con usos, alta y activar/desactivar. Solo admins (el `load` y
 * cada action llaman a `requireAdmin`: las actions no pasan por el layout).
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import {
	createDiscountCode,
	listDiscountCodes,
	setDiscountCodeActive,
	validateNewCode
} from '$lib/server/tickets/discounts.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const events = (await listTicketedEvents()).map((e) => ({
		slug: e.slug,
		title: e.config.title
	}));
	/** @type {Awaited<ReturnType<typeof listDiscountCodes>>} */
	let codes = [];
	if (db) {
		try {
			codes = await listDiscountCodes(db);
		} catch (error) {
			logDBError('list discount codes', error);
		}
	}
	return { codes, events, dbAvailable: Boolean(db), now: Date.now() };
}

/** @type {import('./$types').Actions} */
export const actions = {
	create: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 100)])
		);
		if (!db)
			return fail(503, { create: { error: 'Sin base de datos.', errors: {}, values: form } });
		const slugs = (await listTicketedEvents()).map((e) => e.slug);
		const valid = validateNewCode(form, slugs);
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
			summary: `Creó el código de descuento ${valid.value.code}`,
			detail: valid.value
		});
		return { create: { ok: true, message: `Código ${valid.value.code} creado.` } };
	},

	toggle: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { toggle: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const code = String(form.get('code') ?? '').slice(0, 40);
		const active = form.get('active') === '1';
		const ok = await setDiscountCodeActive(db, code, active);
		if (ok) {
			await logAdminAction(db, locals, {
				action: active ? 'discount.activate' : 'discount.deactivate',
				targetType: 'discount',
				targetId: code.toUpperCase(),
				summary: `${active ? 'Prendió' : 'Apagó'} el código ${code.toUpperCase()}`
			});
		}
		return ok
			? {
					toggle: {
						ok: true,
						message: `Código ${code.toUpperCase()} ${active ? 'prendido' : 'apagado'}.`
					}
				}
			: fail(404, { toggle: { ok: false, message: 'No encontramos ese código.' } });
	}
};

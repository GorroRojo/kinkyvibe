/**
 * Ficha del evento, pestaña Códigos: los códigos de descuento de este evento (y los que valen
 * para todos), alta de un código para este evento y activar/desactivar. Misma lógica que
 * /admin/ventas/codigos, con el evento fijo.
 *
 * Con el interruptor `combo_codigos`, además los combos con otros eventos (combos.js): cada
 * compra online de este evento trae un código personal para el otro. Apagado, `combos` es `null`
 * (la tarjeta no se ve) y sus actions dan 404.
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
import { getEventTickets, listTicketedEvents } from '$lib/server/tickets/events.js';
import { salesState } from '$lib/server/tickets/config.js';
import { comboCodigosEnabled } from '$lib/server/flags.js';
import {
	comboDiscountText,
	listCombos,
	saveCombo,
	setComboActive,
	validateCombo
} from '$lib/server/tickets/combos.js';

/**
 * Los otros eventos que venden entradas y todavía no cerraron la venta (los que se pueden elegir
 * para un combo), más nuevos primero.
 *
 * @param {string} slug el evento de la ficha (no se ofrece)
 * @param {number} now
 */
async function comboTargets(slug, now) {
	return (await listTicketedEvents())
		.filter((e) => e.slug !== slug)
		.filter((e) => {
			const state = salesState(e.config, now);
			return state.open || state.reason === 'notyet';
		})
		.map((e) => ({ slug: e.slug, title: e.config.title || e.slug }));
}

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
	const now = Date.now();
	/** @type {import('$lib/server/tickets/combos.js').ComboRow[] | null} */
	let combos = null;
	/** @type {{ slug: string, title: string }[]} */
	let targets = [];
	if (db && (await comboCodigosEnabled(platform))) {
		try {
			targets = await comboTargets(params.slug, now);
			const titles = new Map(
				(await listTicketedEvents()).map((e) => [e.slug, e.config.title || e.slug])
			);
			combos = (await listCombos(db, params.slug, now)).map((c) => ({
				target_slug: c.target_slug,
				target_title: titles.get(c.target_slug) ?? c.target_slug,
				discount: comboDiscountText(c),
				ends_at: c.ends_at,
				active: Boolean(c.active),
				issued: c.issued,
				used: c.used,
				held: c.held,
				revoked: c.revoked
			}));
		} catch (e) {
			logDBError('combos del evento', e);
			combos = [];
		}
	}
	return {
		codes: codes.filter((c) => c.event_slug === params.slug),
		global: codes.filter((c) => c.event_slug === null),
		combos,
		comboTargets: targets,
		dbAvailable: Boolean(db),
		now
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

	comboSave: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		if (!(await comboCodigosEnabled(platform))) error(404, 'No encontrado.');
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 200)])
		);
		/** @param {number} status @param {string} message @param {Record<string, string>} [errors] */
		const failWith = (status, message, errors = {}) =>
			fail(status, { combo: { error: message, errors, values: form } });
		if (!db) return failWith(503, 'Sin base de datos.');
		if (!(await getEventTickets(params.slug)))
			return failWith(404, 'Ese evento no vende entradas.');
		const now = Date.now();
		const targets = await comboTargets(params.slug, now);
		const valid = validateCombo(form, {
			eventSlug: params.slug,
			targets: targets.map((t) => t.slug),
			now
		});
		if (!valid.ok) return failWith(400, 'Revisá los datos marcados.', valid.errors);
		await saveCombo(db, params.slug, valid.value, { by: admin.login, now });
		const title = targets.find((t) => t.slug === valid.value.target_slug)?.title;
		await logAdminAction(db, locals, {
			action: 'combo.save',
			targetType: 'event',
			targetId: params.slug,
			summary: `Guardó el combo de ${params.slug} con ${valid.value.target_slug}`,
			detail: valid.value
		});
		return { combo: { ok: true, message: `Combo con ${title} guardado.` } };
	},

	comboToggle: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		if (!(await comboCodigosEnabled(platform))) error(404, 'No encontrado.');
		const db = getDB(platform);
		if (!db) return fail(503, { comboToggle: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const target = String(form.get('target_slug') ?? '').slice(0, 200);
		const active = form.get('active') === '1';
		const ok = await setComboActive(db, params.slug, target, active, { by: admin.login });
		if (!ok) {
			return fail(404, { comboToggle: { ok: false, message: 'No encontramos ese combo.' } });
		}
		await logAdminAction(db, locals, {
			action: active ? 'combo.activate' : 'combo.deactivate',
			targetType: 'event',
			targetId: params.slug,
			summary: `${active ? 'Prendió' : 'Apagó'} el combo de ${params.slug} con ${target}`
		});
		return {
			comboToggle: { ok: true, message: active ? 'Combo prendido.' : 'Combo apagado.' }
		};
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

/**
 * Ficha del evento, Ventas › Gastos y reparto (interruptor `gastos_reparto`; docs/tickets.md,
 * «Gastos y reparto»). Lo que entró sale de las órdenes del evento; lo cargado a mano (lugar,
 * contrataciones, gastos, otros ingresos, facilitadores y regla del reparto) se guarda en la base
 * (`event_accounts`, migración 0075). «Cerrar la cuenta» congela los números y guarda el resumen
 * (`event_account_closings`). Solo admins; cada cambio queda en Actividad.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { eventHref } from '$lib/admin/nav.js';
import {
	cleanAccount,
	cleanVenueRule,
	closingSummary,
	computeAccount,
	emptyAccount,
	eventIncome
} from '$lib/admin/reparto.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { eventVenue } from '$lib/server/amigues/venues.js';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { getPanelEvent } from '$lib/server/eventos/panel.js';
import { gastosRepartoEnabled } from '$lib/server/flags.js';
import {
	closeAccount,
	getAccount,
	getClosing,
	getVenueRule,
	reopenAccount,
	saveAccount,
	saveVenueRule
} from '$lib/server/tickets/cuentas.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { listOrders } from '$lib/server/tickets/orders.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/**
 * El lugar vinculado al evento, con su regla por defecto. `null` sin lugar (o si falla).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function venueOf(db, slug) {
	try {
		const link = await eventVenue(db, slug);
		if (!link) return null;
		return {
			id: link.venue.id,
			title: link.venue.title,
			rule: await getVenueRule(db, link.venue.id)
		};
	} catch (e) {
		logDBError('lugar de la cuenta del evento', e);
		return null;
	}
}

/**
 * Lo común de la página y de las acciones: admin, interruptor, que venda entradas y base.
 * @param {import('./$types').RequestEvent | Parameters<import('./$types').PageServerLoad>[0]} event
 */
async function guard({ locals, url, params, platform }) {
	const admin = requireAdmin(locals, url);
	if (!(await gastosRepartoEnabled(platform))) error(404, 'No encontramos esta página.');
	const config = await getEventTickets(params.slug);
	if (!config) redirect(303, eventHref(params.slug));
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	return { db, config, admin };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const { db, config } = await guard(event);
	const slug = event.params.slug;
	const [orders, venue, saved, closing] = await Promise.all([
		listOrders(db, slug),
		venueOf(db, slug),
		getAccount(db, slug),
		getClosing(db, slug)
	]);
	const income = eventIncome(orders);
	const snapshot = /** @type {{ income?: any, data?: any } | null} */ (closing?.snapshot ?? null);
	return {
		income,
		account: saved?.data ?? emptyAccount(venue?.rule ?? null),
		version: saved?.version ?? 0,
		updatedAt: saved?.updatedAt ?? null,
		updatedBy: saved?.updatedBy ?? null,
		venue,
		fondoEnabled: config.fondoEnabled,
		closing: closing
			? {
					closedAt: closing.closed_at,
					closedBy: closing.closed_by,
					income: snapshot?.income ?? income,
					account: cleanAccount(snapshot?.data),
					// Lo que cambió en las ventas desde el cierre (órdenes nuevas o reembolsadas).
					changed:
						(snapshot?.income?.gross ?? income.gross) !== income.gross ||
						(snapshot?.income?.tickets ?? income.tickets) !== income.tickets
				}
			: null
	};
}

/**
 * La cuenta que manda la página (un JSON en `data`) y la versión que se abrió.
 * @param {FormData} form
 */
function readForm(form) {
	let raw = null;
	try {
		raw = JSON.parse(String(form.get('data') ?? '').slice(0, 200000));
	} catch {
		raw = null;
	}
	const version = Number(form.get('version'));
	return {
		data: raw ? cleanAccount(raw) : null,
		version: Number.isInteger(version) && version >= 0 ? version : -1
	};
}

const CONFLICT =
	'Otre admin guardó esta cuenta mientras la tenías abierta. Recargá la página para ver sus cambios (lo tuyo no se guardó).';

/** @type {import('./$types').Actions} */
export const actions = {
	guardar: async (event) => {
		const { db, admin } = await guard(event);
		const { locals, params, request } = event;
		const { data, version } = readForm(await request.formData());
		if (!data || version < 0) return fail(400, { error: 'No se pudo leer lo que mandaste.' });
		const by = admin.login;
		const r = await saveAccount(db, { slug: params.slug, data, version, by });
		if (!r.ok) {
			return fail(409, {
				error: r.reason === 'closed' ? 'La cuenta está cerrada: reabrila para cambiarla.' : CONFLICT
			});
		}
		await logAdminAction(db, locals, {
			action: 'event_account.save',
			targetType: 'event',
			targetId: params.slug,
			summary: `Guardó la cuenta de gastos y reparto de ${params.slug}`,
			detail: {
				fees: data.fees.length,
				expenses: data.expenses.length,
				otherIncome: data.otherIncome.length,
				people: data.people.length,
				venueKind: data.venue.kind
			}
		});
		return { saved: true, version: r.version };
	},

	cerrar: async (event) => {
		const { db, admin } = await guard(event);
		const { locals, params, request } = event;
		const { data, version } = readForm(await request.formData());
		if (!data || version < 0) return fail(400, { error: 'No se pudo leer lo que mandaste.' });
		const by = admin.login;
		// Primero se guarda lo que hay en la página (así lo cerrado es lo que se ve).
		const saved = await saveAccount(db, { slug: params.slug, data, version, by });
		if (!saved.ok) {
			return fail(409, {
				error: saved.reason === 'closed' ? 'La cuenta ya estaba cerrada.' : CONFLICT
			});
		}
		const income = eventIncome(await listOrders(db, params.slug));
		const result = computeAccount(income, data);
		if (result.split.problem) {
			return fail(400, { error: `Antes de cerrar, arreglá el reparto: ${result.split.problem}` });
		}
		const panelEvent = await getPanelEvent(params.slug);
		const start = String(panelEvent?.start ?? '');
		const summary = closingSummary(income, result);
		const ok = await closeAccount(db, {
			slug: params.slug,
			title: panelEvent?.title ?? params.slug,
			date: /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : todayInArgentina(),
			summary,
			snapshot: { income, data },
			by
		});
		if (!ok) return fail(409, { error: 'La cuenta ya estaba cerrada.' });
		await logAdminAction(db, locals, {
			action: 'event_account.close',
			targetType: 'event',
			targetId: params.slug,
			summary: `Cerró la cuenta de ${params.slug}`,
			detail: summary
		});
		return { closed: true };
	},

	reabrir: async (event) => {
		const { db } = await guard(event);
		const { locals, params } = event;
		if (!(await reopenAccount(db, params.slug))) {
			return fail(409, { error: 'La cuenta no estaba cerrada.' });
		}
		await logAdminAction(db, locals, {
			action: 'event_account.reopen',
			targetType: 'event',
			targetId: params.slug,
			summary: `Reabrió la cuenta de ${params.slug}`
		});
		return { reopened: true };
	},

	reglaLugar: async (event) => {
		const { db, admin } = await guard(event);
		const { locals, params, request } = event;
		const venue = await venueOf(db, params.slug);
		if (!venue) return fail(400, { error: 'Este evento no tiene un lugar vinculado.' });
		let rule = null;
		try {
			rule = cleanVenueRule(JSON.parse(String((await request.formData()).get('rule') ?? '')));
		} catch {
			rule = null;
		}
		if (!rule) return fail(400, { error: 'No se pudo leer la regla del lugar.' });
		await saveVenueRule(db, { venueId: venue.id, rule, by: admin.login });
		await logAdminAction(db, locals, {
			action: 'venue.cost_rule',
			targetType: 'profile',
			targetId: String(venue.id),
			summary: `Guardó cómo cobra ${venue.title} por defecto (desde la cuenta de ${params.slug})`,
			detail: rule
		});
		return { venueRuleSaved: true };
	}
};

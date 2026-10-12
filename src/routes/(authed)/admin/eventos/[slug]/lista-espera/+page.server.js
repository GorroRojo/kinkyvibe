/**
 * Ficha del evento, Ventas › Lista de espera (docs/tickets.md, «Lista de espera»): las cuentas
 * por alcance (todo el evento o cada tipo con cupo), la fila en orden y lo que ya terminó, con
 * las acciones del panel:
 *
 * - «Terminar la reserva y pasar a la siguiente» (`terminar`): la oferta vigente termina
 *   (`expired`, motivo `admin`) y la lista avanza ya;
 * - «Sacar de la lista» (`sacar`): `cancelled` (o borrada si no había confirmado); si tenía un
 *   lugar ofrecido, la lista avanza;
 * - «Ofrecer ahora» (`ofrecer`): una pasada del motor ya, sin esperar al cron ni al límite de un
 *   empujón por minuto;
 * - «Cerrar la lista» (`cerrar`): nadie más espera (a quien esperaba le llega «se cerró»);
 * - «Volver a probar los mails» (`reintentar`): los mails que no salieron vuelven a la tanda.
 *
 * Todo queda en el registro de actividad, sin mails (solo el id de la anotación y cuentas). Solo
 * admins: cada load y cada acción lo controla (los layouts no alcanzan para las acciones).
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { mailBatchSize } from '$lib/server/tickets/batchSize.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { contactEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { endWaitlistEntry, removeFromWaitlist } from '$lib/server/tickets/waitlist.js';
import {
	closeWaitlist,
	emptyScopeCounts,
	panelEntry,
	retryFailedWaitlistMails,
	waitlistPanel
} from '$lib/server/tickets/waitlistAdmin.js';
import { advanceWaitlist, sendWaitlistMails } from '$lib/server/tickets/waitlistEngine.js';
import { waitlistSender } from '$lib/server/tickets/waitlistMail.js';

/** @typedef {import('./$types').RequestEvent} RequestEvent */

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	const enabled = await isFlagOn(db, 'lista_espera');
	const list = config.waitlist;
	// Los alcances de la lista: todo el evento, o cada tipo con cupo (como el motor).
	const scopeList = !list
		? []
		: list.scope === 'event'
			? [{ key: '', name: 'Todo el evento' }]
			: config.types
					.filter((t) => t.capacity !== null && t.capacity !== undefined)
					.map((t) => ({ key: t.id, name: t.name }));
	/** @type {Awaited<ReturnType<typeof waitlistPanel>> | null} */
	let panel = null;
	if (db) {
		try {
			panel = await waitlistPanel(db, params.slug);
		} catch (e) {
			// Sin la migración 0053 todavía: la pestaña se ve vacía, no rota.
			logDBError('lista de espera del evento', e);
		}
	}
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	// Alcances con anotaciones que ya no están en la lista (se cambió a mano): también se muestran.
	const extra = Object.keys(panel?.scopes ?? {})
		.filter((k) => !scopeList.some((s) => s.key === k))
		.map((k) => ({ key: k, name: k ? (names[k] ?? k) : 'Todo el evento', orphan: true }));
	return {
		enabled,
		dbAvailable: Boolean(db && panel),
		list: list ? { scope: list.scope, allAtOnce: list.allAtOnce } : null,
		scopes: [...scopeList.map((s) => ({ ...s, orphan: false })), ...extra].map((s) => ({
			...s,
			counts: panel?.scopes[s.key] ?? emptyScopeCounts()
		})),
		entries: (panel?.entries ?? []).map((e) => ({
			...e,
			scopeName: e.ticketType ? (names[e.ticketType] ?? e.ticketType) : null
		})),
		endedHidden: panel?.endedHidden ?? 0,
		now: Date.now()
	};
}

/**
 * La base y le admin de una acción (o la respuesta de error).
 * @param {RequestEvent} event
 */
async function actionContext(event) {
	const admin = requireAdmin(event.locals, event.url);
	const db = getDB(event.platform);
	const form = await event.request.formData();
	return { admin, db, form };
}

/**
 * Manda ya los mails de la lista de este evento (ofertas nuevas, cierres…), en segundo plano si
 * se puede. Nunca tira: si falla, el cron los manda después.
 *
 * @param {RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
async function sendMailsNow(event, db) {
	const task = (async () => {
		await sendWaitlistMails(db, {
			limit: mailBatchSize((await getSalesSettings(db)).mail_batch_size),
			send: waitlistSender(db, event.fetch),
			origin: siteOrigin(event.url),
			contactEmail: contactEmail(),
			eventSlug: event.params.slug
		});
	})().catch((e) => console.error('[lista de espera] no se pudieron mandar los mails:', e));
	const ctx = event.platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	else await task;
}

/**
 * Avanza la lista ya (sin el límite de un empujón por minuto) y manda sus mails. Con el
 * interruptor apagado no ofrece nada (la compra no mira la fila). Devuelve las ofertas nuevas, o
 * `null` si no se pudo.
 *
 * @param {RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
async function advanceNow(event, db) {
	if (!(await isFlagOn(db, 'lista_espera'))) return null;
	try {
		const r = await advanceWaitlist(db, { eventSlug: event.params.slug });
		await sendMailsNow(event, db);
		return r;
	} catch (e) {
		console.error(`[lista de espera] no se pudo avanzar la lista de ${event.params.slug}:`, e);
		return null;
	}
}

/** @param {number} n */
const offersText = (n) =>
	n === 0
		? 'Por ahora no hay un lugar libre para ofrecer.'
		: n === 1
			? 'Le ofrecimos el lugar a la próxima persona.'
			: `Les avisamos a ${n} personas.`;

/**
 * Las acciones sobre una anotación: la busca en este evento y anota lo que pasó.
 *
 * @param {RequestEvent} event
 * @param {'terminar' | 'sacar'} kind
 */
async function entryAction(event, kind) {
	const { admin, db, form } = await actionContext(event);
	if (!db) return fail(503, { action: { ok: false, message: 'No hay base de datos disponible.' } });
	const id = String(form.get('id') ?? '');
	const entry = await panelEntry(db, event.params.slug, id);
	if (!entry)
		return fail(404, { action: { ok: false, message: 'Esa anotación no es de este evento.' } });
	const ended =
		kind === 'terminar'
			? await endWaitlistEntry(db, id, { reason: 'admin', by: admin.login })
			: await removeFromWaitlist(db, id, { by: admin.login });
	if (!ended) {
		return fail(409, {
			action: {
				ok: false,
				message:
					kind === 'terminar'
						? 'Ya no tenía un lugar ofrecido (compró, venció o salió).'
						: 'Ya no estaba en la lista.'
			}
		});
	}
	await logAdminAction(db, event.locals, {
		action: kind === 'terminar' ? 'waitlist.end' : 'waitlist.remove',
		targetType: 'waitlist_entry',
		targetId: id,
		summary:
			kind === 'terminar'
				? `Terminó una reserva de la lista de espera de ${event.params.slug}`
				: `Sacó a alguien de la lista de espera de ${event.params.slug}`,
		detail: { eventSlug: event.params.slug, ticketType: entry.ticketType, was: ended.was }
	});
	// Se liberó un lugar guardado: pasa a la siguiente persona ya.
	const advanced = ended.was === 'offered' ? await advanceNow(event, db) : null;
	const base = kind === 'terminar' ? 'Listo: terminó su reserva.' : 'Listo: salió de la lista.';
	return {
		action: { ok: true, message: advanced ? `${base} ${offersText(advanced.offered)}` : base }
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	terminar: (event) => entryAction(event, 'terminar'),
	sacar: (event) => entryAction(event, 'sacar'),

	ofrecer: async (event) => {
		const { db } = await actionContext(event);
		if (!db)
			return fail(503, { action: { ok: false, message: 'No hay base de datos disponible.' } });
		if (!(await isFlagOn(db, 'lista_espera'))) {
			return fail(409, {
				action: {
					ok: false,
					message:
						'La lista de espera está apagada (Ajustes → Interruptores): no se ofrece ningún lugar.'
				}
			});
		}
		const r = await advanceNow(event, db);
		if (!r)
			return fail(500, { action: { ok: false, message: 'No se pudo avanzar. Probá de nuevo.' } });
		await logAdminAction(db, event.locals, {
			action: 'waitlist.advance',
			targetType: 'event',
			targetId: event.params.slug,
			summary: `Avanzó la lista de espera de ${event.params.slug} («Ofrecer ahora»)`,
			detail: { offered: r.offered, expired: r.expired, closed: r.closed }
		});
		return { action: { ok: true, message: offersText(r.offered) } };
	},

	cerrar: async (event) => {
		const { admin, db } = await actionContext(event);
		if (!db)
			return fail(503, { action: { ok: false, message: 'No hay base de datos disponible.' } });
		const r = await closeWaitlist(db, event.params.slug, { by: admin.login });
		await logAdminAction(db, event.locals, {
			action: 'waitlist.close',
			targetType: 'event',
			targetId: event.params.slug,
			summary: `Cerró la lista de espera de ${event.params.slug}`,
			detail: r
		});
		// El mail «se cerró la lista» a quien esperaba (solo con el interruptor prendido).
		if (r.closed && (await isFlagOn(db, 'lista_espera'))) await sendMailsNow(event, db);
		const people = r.closed + r.deleted;
		return {
			action: {
				ok: true,
				message:
					people === 0
						? 'La lista ya estaba vacía.'
						: `Listo: se cerró la lista (${people === 1 ? '1 persona' : `${people} personas`}). Para que nadie más se anote, apagala en Editar.`
			}
		};
	},

	reintentar: async (event) => {
		const { db } = await actionContext(event);
		if (!db)
			return fail(503, { action: { ok: false, message: 'No hay base de datos disponible.' } });
		const n = await retryFailedWaitlistMails(db, event.params.slug);
		await logAdminAction(db, event.locals, {
			action: 'waitlist.retry_mails',
			targetType: 'event',
			targetId: event.params.slug,
			summary: `Volvió a probar los mails de la lista de espera de ${event.params.slug}`,
			detail: { mails: n }
		});
		if (n && (await isFlagOn(db, 'lista_espera'))) await sendMailsNow(event, db);
		return {
			action: {
				ok: true,
				message:
					n === 0
						? 'No había mails para volver a probar.'
						: 'Listo: los mails que todavía corresponden salen en la próxima tanda.'
			}
		};
	}
};

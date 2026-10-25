/**
 * Modo puerta (check-in) de un evento: pantalla completa sin menús (`bare: true`).
 *
 * Acciones (todas con `requireAdmin`; la página las llama con fetch + `deserialize`, y también
 * andan sin JavaScript):
 * - `checkin`: valida un QR / link / código y marca el ingreso.
 * - `undo`: deshace un ingreso.
 * - `reveal`: DNI completo de quien compró (queda en el registro de actividad).
 * - `sell`: "Vender en puerta". Si se pasa algún límite (cupo, máximo por venta, evento solo
 *   anticipadas) contesta 409 con `needsConfirmation`; la página pregunta con un diálogo y
 *   reenvía con `override` (ver overrides.js). Pasar un límite queda en el registro.
 * - `sync`: ingresos marcados sin conexión.
 * - `syncSales`: ventas hechas sin conexión (decisión 0035), en orden, idempotentes (`client_sale_id`)
 *   y sin perder ninguna por un límite: si pasan uno se guardan igual y quedan en «Para revisar».
 *
 * En una parte (2 en adelante) de un taller con una sola entrada (docs/talleres-partes.md), las
 * entradas son las del taller y el ingreso se marca por parte (`doorContext` → `part`,
 * src/lib/server/tickets/partCheckins.js). Ahí no se vende en la puerta: la entrada es del taller
 * entero y se vende en el modo puerta del taller.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { isFlagOn } from '$lib/server/flags.js';
import { safeWaitlistSummary } from '$lib/server/tickets/waitlistAdmin.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { extractToken } from '$lib/server/tickets/checkin.js';
import { checkIn, getCounts, undoCheckIn } from '$lib/server/tickets/orders.js';
import {
	MAX_DOOR_SALE,
	PANEL_ORDER_HARD_MAX,
	applyQueuedCheckIns,
	applyQueuedSales,
	doorCounts,
	doorSaleLimits,
	doorSalesOpen,
	orderRef,
	parseDoorSale,
	parseQueue,
	parseSaleQueue,
	revealDni,
	sellAtDoor,
	ticketCard,
	ticketWithBuyer
} from '$lib/server/tickets/door.js';
import { inBackground, sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { checkOverride, logOverride, readOverride } from '$lib/server/tickets/overrides.js';
import {
	FREE_DOOR_MESSAGE,
	fondoOptionLabel,
	fondoOptionsFor,
	remainingOf
} from '$lib/utils/tickets.js';
import { doorPrice } from '$lib/utils/ticketTiers.js';
import {
	applyQueuedPartCheckIns,
	checkInPart,
	overlayPartCheckins,
	partDoorCounts,
	undoPartCheckIn
} from '$lib/server/tickets/partCheckins.js';
import { DOOR_AUTO_PARAM } from '$lib/utils/doorEvents.js';
import { NO_STORE, cachedPrior, doorContext, doorSeriesLabel } from './context.server.js';

/**
 * Contadores de la pantalla: los del evento o, en una parte de un taller, los de esa parte.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ ticketSlug: string, part: { slug: string } | null }} scope
 */
function countsFor(db, { ticketSlug, part }) {
	return part ? partDoorCounts(db, ticketSlug, part.slug) : doorCounts(db, ticketSlug);
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const admin = requireAdmin(event.locals, event.url);
	event.setHeaders(NO_STORE);
	const { db, config, ticketSlug, part } = await doorContext(event, { fondo: true });
	const [counts, sales, series, waitlist] = await Promise.all([
		countsFor(db, { ticketSlug, part }),
		getCounts(db, ticketSlug),
		doorSeriesLabel(ticketSlug, event.platform),
		// La nota de la lista de espera en «Vender en puerta» (no frena la venta).
		isFlagOn(db, 'lista_espera').then((enabled) => safeWaitlistSummary(db, ticketSlug, { enabled }))
	]);
	return {
		bare: true,
		slug: event.params.slug,
		title: config.title,
		start: config.start ?? null,
		// Parte de un taller: «Parte 2 de 3», con las entradas del taller.
		part,
		series,
		// Se abrió solo desde /admin/checkin (era el único evento de hoy): muestra «Otro evento».
		autoOpened: event.url.searchParams.has(DOOR_AUTO_PARAM),
		login: admin.login,
		counts,
		waitlist,
		fondoEnabled: config.fondoEnabled,
		// "Vender en puerta" salvo que el evento diga que no hay (`puerta: false`). En una parte de
		// un taller, nunca (la entrada es del taller entero).
		doorSales: !part && doorSalesOpen(config),
		doorPrice: config.door?.price ?? '',
		// Tope técnico de una venta (el máximo por venta, MAX_DOOR_SALE, se puede pasar confirmando).
		maxOrder: PANEL_ORDER_HARD_MAX,
		// Máximo por venta (sin conexión se avisa en el celu antes de guardar la venta).
		maxPerSale: MAX_DOOR_SALE,
		types: config.types.map((t) => {
			// En la puerta: el precio en la puerta del tipo o, si no tiene, el del último tramo.
			const atDoor = doorPrice(t);
			const fondo = atDoor ? atDoor.fondo : t.fondo;
			return {
				id: t.id,
				name: t.name,
				price: atDoor ? atDoor.price : t.price,
				fondo,
				gorra: t.gorra,
				capacity: t.capacity,
				// `null`: sin cupo (sin límite).
				available: remainingOf(t, sales.get(t.id)),
				// Aprobadas + reservas vigentes (puede pasar el cupo si une admin lo pasó).
				taken: (sales.get(t.id)?.sold ?? 0) + (sales.get(t.id)?.held ?? 0),
				options: t.gorra
					? []
					: fondoOptionsFor(fondo).map((o) => ({ id: o.id, label: fondoOptionLabel(o.id) }))
			};
		})
	};
}

/**
 * @param {Parameters<import('./$types').Actions['checkin']>[0]} event
 */
async function checkinAction(event) {
	const admin = requireAdmin(event.locals, event.url);
	const { db, typeNames, ticketSlug, part } = await doorContext(event);
	const slug = ticketSlug;
	const raw = (await event.request.formData()).get('token');
	const token = await extractToken(db, slug, raw);
	const r = part
		? await checkInPart(db, { token, ticketSlug, partSlug: part.slug, by: admin.login })
		: await checkIn(db, { token, eventSlug: slug, by: admin.login });
	const stamp = Date.now();
	if (r.result === 'invalid') {
		return { checkin: { result: r.result, stamp, card: null, otherEvent: null } };
	}
	if (r.result === 'wrong-event') {
		// De otro evento: solo de cuál, sin datos de la persona.
		const other = r.ticket ? await getEventTickets(r.ticket.event_slug) : null;
		return {
			checkin: {
				result: r.result,
				stamp,
				card: null,
				otherEvent: other?.title || r.ticket?.event_slug || null
			}
		};
	}
	// La entrada con quien compró, la primera vez en la serie y los contadores, juntos.
	const [full, prior, counts] = await Promise.all([
		r.ticket
			? ticketWithBuyer(db, { id: r.ticket.id }).then(async (found) =>
					found && part
						? (
								await overlayPartCheckins(db, part.slug, [found], {
									id: 'id',
									at: 'checked_in_at',
									by: 'checked_in_by'
								})
							)[0]
						: found
				)
			: null,
		cachedPrior(db, slug, event.platform),
		countsFor(db, { ticketSlug, part })
	]);
	return {
		checkin: {
			result: r.result,
			stamp,
			card: full ? ticketCard(full, { typeNames, prior }) : null,
			otherEvent: null
		},
		counts
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	checkin: checkinAction,

	undo: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db, ticketSlug, part } = await doorContext(event);
		const ticketId = String((await event.request.formData()).get('ticket') ?? '').slice(0, 64);
		const before = ticketId ? await ticketWithBuyer(db, { id: ticketId }) : null;
		const ok = part
			? await undoPartCheckIn(db, { ticketId, ticketSlug, partSlug: part.slug })
			: await undoCheckIn(db, { ticketId, eventSlug: ticketSlug });
		if (ok && before) {
			await logAdminAction(db, event.locals, {
				action: 'checkin.undo',
				targetType: 'order',
				targetId: before.order_id,
				summary: `Deshizo el ingreso de una entrada de ${orderRef(before.order_id)}`,
				detail: {
					event: event.params.slug,
					...(part ? { workshop: ticketSlug } : {}),
					ticket: ticketId,
					by: admin.login
				}
			});
		}
		return { undo: { ok, ticketId }, counts: await countsFor(db, { ticketSlug, part }) };
	},

	reveal: async (event) => {
		requireAdmin(event.locals, event.url);
		const { db, ticketSlug } = await doorContext(event);
		const ticketId = String((await event.request.formData()).get('ticket') ?? '').slice(0, 64);
		const dni = await revealDni(db, event.locals, { slug: ticketSlug, ticketId });
		if (!dni) return fail(404, { reveal: { ticketId, dni: null } });
		return { reveal: { ticketId, dni } };
	},

	sync: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db, ticketSlug, part } = await doorContext(event);
		const slug = ticketSlug;
		let raw;
		try {
			raw = JSON.parse(String((await event.request.formData()).get('queue') ?? ''));
		} catch {
			raw = null;
		}
		const items = parseQueue(raw);
		if (!items) return fail(400, { sync: { ok: false, results: [] } });
		const resolve = (/** @type {string} */ value) => extractToken(db, slug, value);
		const results = part
			? await applyQueuedPartCheckIns(db, {
					ticketSlug,
					partSlug: part.slug,
					by: admin.login,
					items,
					resolve
				})
			: await applyQueuedCheckIns(db, { eventSlug: slug, by: admin.login, items, resolve });
		const tally = /** @type {Record<string, number>} */ ({});
		for (const r of results) tally[r.result] = (tally[r.result] ?? 0) + 1;
		if (results.length) {
			await logAdminAction(db, event.locals, {
				action: 'checkin.sync',
				targetType: 'event',
				targetId: event.params.slug,
				summary: `Sincronizó ${results.length} ${results.length === 1 ? 'ingreso marcado' : 'ingresos marcados'} sin conexión`,
				detail: tally
			});
		}
		return { sync: { ok: true, results }, counts: await countsFor(db, { ticketSlug, part }) };
	},

	syncSales: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db, config, part } = await doorContext(event, { fondo: true });
		const slug = event.params.slug;
		let raw;
		try {
			raw = JSON.parse(String((await event.request.formData()).get('sales') ?? ''));
		} catch {
			raw = null;
		}
		const items = parseSaleQueue(raw);
		if (!items) return fail(400, { syncSales: { ok: false, results: [] } });
		if (part) {
			// En una parte de un taller no se vende (ver `sell`): se avisa venta por venta, sin borrarlas.
			return {
				syncSales: {
					ok: true,
					results: items.map((i) => ({
						id: i.id,
						result: 'rejected',
						message: 'En una parte del taller no se vende: cargala en el modo puerta del taller.'
					}))
				}
			};
		}
		const origin = siteOrigin(event.url);
		const results = await applyQueuedSales(db, event.locals, {
			eventSlug: slug,
			config,
			fondoPercent: config.fondoPercent,
			by: admin.login,
			items,
			onSold: async ({ order, tickets, sale }) => {
				if (!sale.sendEmail) return;
				await inBackground(
					sendOrderEmail({ db, order, tickets, origin, fetch: event.fetch }),
					event.platform
				);
			}
		});
		return { syncSales: { ok: true, results }, counts: await doorCounts(db, slug) };
	},

	sell: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db, config, typeNames, part } = await doorContext(event, { fondo: true });
		const slug = event.params.slug;
		if (part) {
			return fail(400, {
				sale: {
					ok: false,
					message: 'En una parte del taller no se vende: vendé en el modo puerta del taller.',
					tickets: []
				}
			});
		}
		const form = await event.request.formData();
		/** @param {string} message */
		const bad = (message) => fail(400, { sale: { ok: false, message, tickets: [] } });
		/** @param {import('$lib/server/tickets/overrides.js').NeedsConfirmation} needsConfirmation */
		const needsConfirmation = (needsConfirmation) =>
			fail(409, {
				sale: { ok: false, message: 'Hace falta confirmar.', needsConfirmation, tickets: [] }
			});

		// Los mismos controles que las ventas hechas sin conexión (`parseDoorSale`).
		const parsed = parseDoorSale(config, (name) => form.get(name));
		if (!parsed.ok) return bad(parsed.message);
		const { type, quantity, method, option, unitPrice, holders, buyer } = parsed.sale;

		// Límites (solo anticipadas, cupo, máximo por venta): une admin los puede pasar si confirmó
		// en el diálogo exactamente estos (la clave viene en `override`).
		const limitsFor = () => doorSaleLimits(db, { eventSlug: slug, config, type, quantity });
		const check = checkOverride(await limitsFor(), readOverride(form));
		if (!check.ok) return needsConfirmation(check.needsConfirmation);

		const r = await sellAtDoor(db, {
			eventSlug: slug,
			door: config.door,
			override: check.override,
			type,
			quantity,
			holders,
			buyer,
			method,
			option,
			unitPrice,
			fondoPercent: config.fondoPercent,
			by: admin.login
		});
		if (!r.ok && r.reason === 'free-door') return bad(FREE_DOOR_MESSAGE);
		if (!r.ok) {
			// Algo cambió entre el control y la venta (otra venta al mismo tiempo): se vuelve a
			// preguntar con los límites de ahora.
			const again = checkOverride(await limitsFor(), '');
			if (!again.ok) return needsConfirmation(again.needsConfirmation);
			return fail(409, {
				sale: { ok: false, message: 'No se pudo vender: probá de nuevo.', tickets: [] }
			});
		}
		await logAdminAction(db, event.locals, {
			action: 'order.door_sale',
			targetType: 'order',
			targetId: r.order.id,
			summary: `Vendió en la puerta ${quantity} × ${type.name} (${orderRef(r.order.id)}, ${r.order.payment_method})`,
			detail: {
				event: slug,
				type: type.id,
				quantity,
				method: r.order.payment_method,
				total: r.order.total,
				...(check.limits.length ? { overrides: check.limits } : {})
			}
		});
		await logOverride(db, event.locals, {
			event: slug,
			what: 'venta en la puerta',
			orderId: r.order.id,
			limits: check.limits
		});
		if (parsed.sale.sendEmail) {
			await inBackground(
				sendOrderEmail({
					db,
					order: r.order,
					tickets: r.tickets,
					origin: siteOrigin(event.url),
					fetch: event.fetch
				}),
				event.platform
			);
		}
		const prior = await cachedPrior(db, slug, event.platform);
		const cards = [];
		for (const t of r.tickets) {
			const full = await ticketWithBuyer(db, { id: t.id });
			if (full) cards.push(ticketCard(full, { typeNames, prior }));
		}
		return {
			sale: {
				ok: true,
				message: `Listo: ${quantity} × ${type.name} (${orderRef(r.order.id)}), ya adentro.`,
				total: r.order.total,
				method: r.order.payment_method,
				tickets: cards
			},
			counts: await doorCounts(db, slug)
		};
	}
};

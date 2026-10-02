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
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { extractToken } from '$lib/server/tickets/checkin.js';
import { checkIn, getCounts, undoCheckIn } from '$lib/server/tickets/orders.js';
import {
	PANEL_ORDER_HARD_MAX,
	applyQueuedCheckIns,
	doorCounts,
	doorSaleLimits,
	doorSalesOpen,
	orderRef,
	parseQueue,
	revealDni,
	sellAtDoor,
	ticketCard,
	ticketWithBuyer
} from '$lib/server/tickets/door.js';
import { inBackground, sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { checkOverride, logOverride, readOverride } from '$lib/server/tickets/overrides.js';
import {
	fondoOptionLabel,
	fondoOptionsFor,
	isFondoOption,
	normalizeDni,
	remainingOf
} from '$lib/utils/tickets.js';
import { doorPrice } from '$lib/utils/ticketTiers.js';
import { NO_STORE, cachedPrior, doorContext, doorSeriesLabel } from './context.server.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const admin = requireAdmin(event.locals, event.url);
	event.setHeaders(NO_STORE);
	const { db, config } = await doorContext(event, { fondo: true });
	const [counts, sales, series] = await Promise.all([
		doorCounts(db, event.params.slug),
		getCounts(db, event.params.slug),
		doorSeriesLabel(event.params.slug, event.platform)
	]);
	return {
		bare: true,
		slug: event.params.slug,
		title: config.title,
		start: config.start ?? null,
		series,
		login: admin.login,
		counts,
		fondoEnabled: config.fondoEnabled,
		// "Vender en puerta" salvo que el evento diga que no hay (`puerta: false`).
		doorSales: doorSalesOpen(config),
		doorPrice: config.door?.price ?? '',
		// Tope técnico de una venta (el máximo por venta, MAX_DOOR_SALE, se puede pasar confirmando).
		maxOrder: PANEL_ORDER_HARD_MAX,
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
	const { db, typeNames } = await doorContext(event);
	const slug = event.params.slug;
	const raw = (await event.request.formData()).get('token');
	const token = await extractToken(db, slug, raw);
	const r = await checkIn(db, { token, eventSlug: slug, by: admin.login });
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
	const full = r.ticket ? await ticketWithBuyer(db, { id: r.ticket.id }) : null;
	const prior = await cachedPrior(db, slug, event.platform);
	return {
		checkin: {
			result: r.result,
			stamp,
			card: full ? ticketCard(full, { typeNames, prior }) : null,
			otherEvent: null
		},
		counts: await doorCounts(db, slug)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	checkin: checkinAction,

	undo: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db } = await doorContext(event);
		const ticketId = String((await event.request.formData()).get('ticket') ?? '').slice(0, 64);
		const before = ticketId ? await ticketWithBuyer(db, { id: ticketId }) : null;
		const ok = await undoCheckIn(db, { ticketId, eventSlug: event.params.slug });
		if (ok && before) {
			await logAdminAction(db, event.locals, {
				action: 'checkin.undo',
				targetType: 'order',
				targetId: before.order_id,
				summary: `Deshizo el ingreso de una entrada de ${orderRef(before.order_id)}`,
				detail: { event: event.params.slug, ticket: ticketId, by: admin.login }
			});
		}
		return { undo: { ok, ticketId }, counts: await doorCounts(db, event.params.slug) };
	},

	reveal: async (event) => {
		requireAdmin(event.locals, event.url);
		const { db } = await doorContext(event);
		const ticketId = String((await event.request.formData()).get('ticket') ?? '').slice(0, 64);
		const dni = await revealDni(db, event.locals, { slug: event.params.slug, ticketId });
		if (!dni) return fail(404, { reveal: { ticketId, dni: null } });
		return { reveal: { ticketId, dni } };
	},

	sync: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db } = await doorContext(event);
		const slug = event.params.slug;
		let raw;
		try {
			raw = JSON.parse(String((await event.request.formData()).get('queue') ?? ''));
		} catch {
			raw = null;
		}
		const items = parseQueue(raw);
		if (!items) return fail(400, { sync: { ok: false, results: [] } });
		const results = await applyQueuedCheckIns(db, {
			eventSlug: slug,
			by: admin.login,
			items,
			resolve: (value) => extractToken(db, slug, value)
		});
		const tally = /** @type {Record<string, number>} */ ({});
		for (const r of results) tally[r.result] = (tally[r.result] ?? 0) + 1;
		if (results.length) {
			await logAdminAction(db, event.locals, {
				action: 'checkin.sync',
				targetType: 'event',
				targetId: slug,
				summary: `Sincronizó ${results.length} ${results.length === 1 ? 'ingreso marcado' : 'ingresos marcados'} sin conexión`,
				detail: tally
			});
		}
		return { sync: { ok: true, results }, counts: await doorCounts(db, slug) };
	},

	sell: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db, config, typeNames } = await doorContext(event, { fondo: true });
		const slug = event.params.slug;
		const form = await event.request.formData();
		const text = (/** @type {string} */ name, max = 120) =>
			String(form.get(name) ?? '')
				.trim()
				.slice(0, max);
		/** @param {string} message */
		const bad = (message) => fail(400, { sale: { ok: false, message, tickets: [] } });
		/** @param {import('$lib/server/tickets/overrides.js').NeedsConfirmation} needsConfirmation */
		const needsConfirmation = (needsConfirmation) =>
			fail(409, {
				sale: { ok: false, message: 'Hace falta confirmar.', needsConfirmation, tickets: [] }
			});

		const type = config.types.find((t) => t.id === text('type', 64));
		if (!type) return bad('Elegí un tipo de entrada.');
		const quantity = Number(text('quantity', 3));
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > PANEL_ORDER_HARD_MAX) {
			return bad(`La cantidad tiene que ser de 1 a ${PANEL_ORDER_HARD_MAX}.`);
		}
		const method = text('method', 20);
		if (method !== 'efectivo' && method !== 'transferencia') {
			return bad('Elegí cómo pagó: efectivo o transferencia.');
		}
		const name = text('name');
		if (!name) return bad('Falta el nombre de quien compra.');
		const email = text('email', 200).toLowerCase();
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('El email no es válido.');
		const dniRaw = text('dni', 20);
		const dni = dniRaw ? normalizeDni(dniRaw) : null;
		if (dniRaw && !dni) return bad('El DNI tiene que tener 7 a 9 números.');
		/** @type {import('$lib/utils/tickets.js').PriceOption | undefined} */
		let option;
		/** @type {number | undefined} */
		let unitPrice;
		if (type.gorra) {
			unitPrice = Number(text('amount', 12).replace(/[.\s$]/g, ''));
			if (!Number.isSafeInteger(unitPrice) || unitPrice < type.gorra.min) {
				return bad(`El monto por entrada tiene que ser de al menos $ ${type.gorra.min}.`);
			}
		} else {
			const o = text('option', 20);
			option = isFondoOption(o) ? /** @type {any} */ (o) : undefined;
			if (option === 'fondo' && !((doorPrice(type)?.fondo ?? 0) > 0)) option = undefined;
		}
		const holders = Array.from({ length: quantity }, (_, i) => ({
			name: text(`holder_${i}`) || name,
			pronouns: i === 0 ? text('pronouns', 40) : text(`pronouns_${i}`, 40)
		}));

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
			buyer: { name, pronouns: text('pronouns', 40), email, dni },
			method,
			option,
			unitPrice,
			fondoPercent: config.fondoPercent,
			by: admin.login
		});
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
		if (email && form.get('send_email') === 'on') {
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

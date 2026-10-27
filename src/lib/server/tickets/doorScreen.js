/**
 * El modo puerta de un evento (load, form actions y los tres GET de la pantalla), compartido por
 * las dos entradas:
 * - el panel: `/admin/eventos/<slug>/ingreso` (une admin, `adminActor`);
 * - la puerta con link: `/puerta/<slug>` (un link de puerta de ese evento, `requireDoorLink` en
 *   doorLinks.js), sin cuenta y sin el resto del panel.
 *
 * Cada función recibe quién hace la acción (`DoorActor`) ya verificado **en ese pedido** por la
 * ruta. Con un link:
 * - se ve lo que hace falta en la puerta (nombre, pronombres, tipo, quién compró y su mail, los
 *   últimos 3 del DNI, la compra), pero **no** el DNI completo (`reveal`: 403), ni el token de las
 *   entradas en el buscador, ni lo interno del panel en «Ver compra» (nota, quién confirmó,
 *   descuento, reembolso), ni los logins de admins (`linkSafeBy`);
 * - se vende en la puerta, pero **sin pasar límites** (cupo, 10 por venta, solo anticipadas,
 *   evento sin venta en la puerta o cancelado) y al precio de la puerta (`linkSaleRefusal`): eso lo
 *   decide une admin. Sin conexión, esos límites también frenan la venta (vuelve al celu como
 *   rechazada); solo una que pasa el cupo se guarda y va a «Para revisar» (decisión 0035);
 * - topes por link y por hora: entradas vendidas y mails de compra (solo en ventas con conexión);
 * - una entrada de otro evento dice solo «De otro evento», sin cuál;
 * - cada acción (ingreso, deshacer, venta, sincronizar, ver una compra) queda en el registro de
 *   actividad como `puerta:<id del link>`, con `doorLink` en el detalle.
 *
 * Acciones (la página las llama con fetch + `deserialize`, y también andan sin JavaScript):
 * - `checkin`: valida un QR / link / código y marca el ingreso.
 * - `undo`: deshace un ingreso.
 * - `reveal`: DNI completo de quien compró (queda en el registro de actividad). Solo admins.
 * - `sell`: "Vender en puerta". Si se pasa algún límite (cupo, máximo por venta, evento solo
 *   anticipadas) contesta 409 con `needsConfirmation`; la página pregunta con un diálogo y
 *   reenvía con `override` (ver overrides.js). Pasar un límite queda en el registro. Se puede
 *   cobrar otro precio por entrada (`amount`) y dejar una nota (`note`); ver `sellAtDoor`.
 * - `sync`: ingresos marcados sin conexión.
 * - `syncSales`: ventas hechas sin conexión (decisión 0035), en orden, idempotentes (`client_sale_id`)
 *   y sin perder ninguna por un límite: si pasan uno se guardan igual y quedan en «Para revisar».
 *
 * En una parte (2 en adelante) de un taller con una sola entrada (docs/talleres-partes.md), las
 * entradas son las del taller y el ingreso se marca por parte (`doorContext` → `part`,
 * src/lib/server/tickets/partCheckins.js). Ahí no se vende en la puerta: la entrada es del taller
 * entero y se vende en el modo puerta del taller.
 */
import { error, fail, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { isFlagOn } from '$lib/server/flags.js';
import { safeWaitlistSummary } from '$lib/server/tickets/waitlistAdmin.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { extractToken, searchRows } from '$lib/server/tickets/checkin.js';
import { checkIn, getCounts, searchTickets, undoCheckIn } from '$lib/server/tickets/orders.js';
import {
	MAX_DOOR_SALE,
	ORDER_NOTE_MAX,
	PANEL_ORDER_HARD_MAX,
	applyQueuedCheckIns,
	applyQueuedSales,
	doorCounts,
	doorSaleAuditExtra,
	doorSaleAuditSuffix,
	doorSaleLimits,
	doorSalesOpen,
	linkSafeBy,
	linkSalePriceProblem,
	linkSaleRefusal,
	offlineList,
	orderPriceChangeText,
	orderRef,
	parseDoorSale,
	parseQueue,
	parseSaleQueue,
	purchaseDetails,
	revealDni,
	sellAtDoor,
	ticketCard,
	ticketWithBuyer
} from '$lib/server/tickets/door.js';
import { inBackground, sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { checkOverride, logOverride, readOverride } from '$lib/server/tickets/overrides.js';
import {
	DOOR_LINK_PATH,
	DOOR_LINK_TICKETS_MESSAGE,
	takeDoorLinkEmail,
	takeDoorLinkTickets
} from './doorLinks.js';
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
import { NO_STORE, cachedPrior, doorContext, doorSeriesLabel } from './doorContext.js';

/** @typedef {import('./doorLinks.js').DoorActor} DoorActor */

/** Cuántas sugerencias como máximo en «Buscar persona». */
const SEARCH_LIMIT = 8;

/**
 * Une admin del panel como actor de la puerta (`requireAdmin`: redirige o da 403 si no).
 *
 * @param {{ locals: App.Locals, url: URL }} event
 * @returns {DoorActor}
 */
export function adminActor(event) {
	const admin = requireAdmin(event.locals, event.url);
	return { kind: 'admin', by: admin.login, audit: event.locals, link: null };
}

/**
 * Lo que se suma al detalle del registro con un link (su id); nada para une admin.
 *
 * @param {DoorActor} actor
 */
function linkDetail(actor) {
	return actor.link ? { doorLink: actor.link.id } : {};
}

/**
 * Con un link: quién marcó cada ingreso sin el login de GitHub de une admin (`linkSafeBy`). Une
 * admin ve las filas como están.
 *
 * @template {Record<string, any>} T
 * @param {DoorActor} actor
 * @param {T[]} rows
 * @param {string} key el campo con quién marcó (`by`, `checkedInBy`)
 * @returns {T[]}
 */
function hideLogins(actor, rows, key) {
	if (!actor.link) return rows;
	return rows.map((r) => (r && r[key] ? { ...r, [key]: linkSafeBy(r[key]) } : r));
}

/**
 * Contadores de la pantalla: los del evento o, en una parte de un taller, los de esa parte.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ ticketSlug: string, part: { slug: string } | null }} scope
 */
function countsFor(db, { ticketSlug, part }) {
	return part ? partDoorCounts(db, ticketSlug, part.slug) : doorCounts(db, ticketSlug);
}

/**
 * Base de los pedidos de la página (acciones y los tres GET), según la entrada.
 *
 * @param {DoorActor} actor
 * @param {string} slug
 */
export function doorBase(actor, slug) {
	const s = encodeURIComponent(slug);
	return actor.link ? `${DOOR_LINK_PATH}/${s}` : `/admin/eventos/${s}/ingreso`;
}

/**
 * @param {any} event el de SvelteKit (`params.slug`, `platform`, `fetch`, `url`, `setHeaders`)
 * @param {DoorActor} actor
 */
export async function doorLoad(event, actor) {
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
		// Adónde van los pedidos de la página (el panel o /puerta/<slug>).
		doorBase: doorBase(actor, event.params.slug),
		// Con un link de puerta: su etiqueta y hasta cuándo anda (la pantalla esconde lo del panel).
		doorLink: actor.link
			? { label: actor.link.label, expiresAt: Number(actor.link.expires_at) }
			: null,
		// Parte de un taller: «Parte 2 de 3», con las entradas del taller.
		part,
		series,
		// Se abrió solo desde /admin/checkin (era el único evento de hoy): muestra «Otro evento».
		autoOpened: !actor.link && event.url.searchParams.has(DOOR_AUTO_PARAM),
		login: actor.by,
		counts,
		waitlist,
		fondoEnabled: config.fondoEnabled,
		// Para la cuenta a la vista cuando se cambia el precio (el Fondo con el mismo porcentaje).
		fondoPercent: config.fondoPercent,
		// Largo máximo de la nota de la venta (como la de la carga a mano).
		noteMax: ORDER_NOTE_MAX,
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
 * @param {any} event
 * @param {DoorActor} actor
 */
async function checkinAction(event, actor) {
	const { db, typeNames, ticketSlug, part } = await doorContext(event);
	const slug = ticketSlug;
	const raw = (await event.request.formData()).get('token');
	const token = await extractToken(db, slug, raw);
	const r = part
		? await checkInPart(db, { token, ticketSlug, partSlug: part.slug, by: actor.by })
		: await checkIn(db, { token, eventSlug: slug, by: actor.by });
	const stamp = Date.now();
	if (r.result === 'invalid') {
		return { checkin: { result: r.result, stamp, card: null, otherEvent: null } };
	}
	if (r.result === 'wrong-event') {
		// De otro evento: solo de cuál, sin datos de la persona (con un link, ni eso).
		const other = r.ticket && !actor.link ? await getEventTickets(r.ticket.event_slug) : null;
		return {
			checkin: {
				result: r.result,
				stamp,
				card: null,
				otherEvent: actor.link ? null : other?.title || r.ticket?.event_slug || null
			}
		};
	}
	if (actor.link && r.ticket && (r.result === 'ok' || r.result === 'already')) {
		await logAdminAction(db, actor.audit, {
			action: r.result === 'ok' ? 'checkin.door_link' : 'checkin.door_link_already',
			targetType: 'order',
			targetId: r.ticket.order_id,
			summary:
				r.result === 'ok'
					? `Marcó el ingreso de una entrada de ${orderRef(r.ticket.order_id)} con un link de puerta`
					: `Escaneó una entrada que ya había ingresado (${orderRef(r.ticket.order_id)}) con un link de puerta`,
			detail: {
				event: event.params.slug,
				...(part ? { workshop: ticketSlug } : {}),
				ticket: r.ticket.id,
				...linkDetail(actor)
			}
		});
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
	const card = full ? ticketCard(full, { typeNames, prior }) : null;
	return {
		checkin: {
			result: r.result,
			stamp,
			card: card ? hideLogins(actor, [card], 'by')[0] : null,
			otherEvent: null
		},
		counts
	};
}

/**
 * Las form actions del modo puerta. `getActor` verifica quién es **en cada pedido** (las form
 * actions no pasan por el `load`).
 *
 * @param {(event: any) => DoorActor | Promise<DoorActor>} getActor
 */
export function doorActions(getActor) {
	return {
		/** @param {any} event */
		checkin: async (event) => checkinAction(event, await getActor(event)),

		/** @param {any} event */
		undo: async (event) => {
			const actor = await getActor(event);
			const { db, ticketSlug, part } = await doorContext(event);
			const ticketId = String((await event.request.formData()).get('ticket') ?? '').slice(0, 64);
			const before = ticketId ? await ticketWithBuyer(db, { id: ticketId }) : null;
			const ok = part
				? await undoPartCheckIn(db, { ticketId, ticketSlug, partSlug: part.slug })
				: await undoCheckIn(db, { ticketId, eventSlug: ticketSlug });
			if (ok && before) {
				await logAdminAction(db, actor.audit, {
					action: 'checkin.undo',
					targetType: 'order',
					targetId: before.order_id,
					summary: `Deshizo el ingreso de una entrada de ${orderRef(before.order_id)}${actor.link ? ' con un link de puerta' : ''}`,
					detail: {
						event: event.params.slug,
						...(part ? { workshop: ticketSlug } : {}),
						ticket: ticketId,
						by: actor.by,
						...linkDetail(actor)
					}
				});
			}
			return { undo: { ok, ticketId }, counts: await countsFor(db, { ticketSlug, part }) };
		},

		/** @param {any} event */
		reveal: async (event) => {
			const actor = await getActor(event);
			// El DNI completo es solo para admins (queda registrado a su nombre).
			if (actor.kind !== 'admin') error(403, 'Con un link de puerta no se ve el DNI completo.');
			const { db, ticketSlug } = await doorContext(event);
			const ticketId = String((await event.request.formData()).get('ticket') ?? '').slice(0, 64);
			const dni = await revealDni(db, event.locals, { slug: ticketSlug, ticketId });
			if (!dni) return fail(404, { reveal: { ticketId, dni: null } });
			return { reveal: { ticketId, dni } };
		},

		/** @param {any} event */
		sync: async (event) => {
			const actor = await getActor(event);
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
						by: actor.by,
						items,
						resolve
					})
				: await applyQueuedCheckIns(db, { eventSlug: slug, by: actor.by, items, resolve });
			/** @type {Record<string, number>} */
			const tally = {};
			for (const r of results) tally[r.result] = (tally[r.result] ?? 0) + 1;
			if (results.length) {
				await logAdminAction(db, actor.audit, {
					action: 'checkin.sync',
					targetType: 'event',
					targetId: event.params.slug,
					summary: `Sincronizó ${results.length} ${results.length === 1 ? 'ingreso marcado' : 'ingresos marcados'} sin conexión${actor.link ? ' con un link de puerta' : ''}`,
					detail: { ...tally, ...linkDetail(actor) }
				});
			}
			return {
				sync: { ok: true, results: hideLogins(actor, results, 'by') },
				counts: await countsFor(db, { ticketSlug, part })
			};
		},

		/** @param {any} event */
		syncSales: async (event) => {
			const actor = await getActor(event);
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
			const link = actor.link;
			// Con un link, las filas del registro quedan como `puerta:<id del link>` (`actor.audit`) y
			// lo que el link no puede pasar vuelve al celu como rechazado (solo el cupo va a revisar).
			const results = await applyQueuedSales(db, actor.audit, {
				eventSlug: slug,
				config,
				fondoPercent: config.fondoPercent,
				by: actor.by,
				items,
				doorLink: link?.id ?? null,
				refuse: link
					? async (sale) =>
							linkSaleRefusal(config, sale) ??
							((await takeDoorLinkTickets(db, link, sale.quantity))
								? null
								: DOOR_LINK_TICKETS_MESSAGE)
					: undefined,
				onSold: async ({ order, tickets, sale }) => {
					// Con un link, el mail de compra solo sale en las ventas con conexión.
					if (!sale.sendEmail || link) return;
					await inBackground(
						sendOrderEmail({ db, order, tickets, origin, fetch: event.fetch }),
						event.platform
					);
				}
			});
			return { syncSales: { ok: true, results }, counts: await doorCounts(db, slug) };
		},

		/** @param {any} event */
		sell: async (event) => {
			const actor = await getActor(event);
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
				actor.link
					? // Con un link no se pasan límites: lo confirma une admin.
						fail(409, {
							sale: {
								ok: false,
								message: `Esta venta pasa un límite (${needsConfirmation.limits
									.map((l) => l.message)
									.join(' ')}). La tiene que confirmar une admin.`,
								tickets: []
							}
						})
					: fail(409, {
							sale: { ok: false, message: 'Hace falta confirmar.', needsConfirmation, tickets: [] }
						});

			// Los mismos controles que las ventas hechas sin conexión (`parseDoorSale`).
			const parsed = parseDoorSale(config, (name) => form.get(name));
			if (!parsed.ok) return bad(parsed.message);
			const { type, quantity, method, option, unitPrice, note, holders, buyer } = parsed.sale;
			// Con un link, otro precio (o sin cargo) en un tipo con precio lo carga une admin.
			const priceProblem = actor.link ? linkSalePriceProblem(type, unitPrice) : null;
			if (priceProblem) return bad(priceProblem);

			// Límites (solo anticipadas, cupo, máximo por venta): une admin los puede pasar si confirmó
			// en el diálogo exactamente estos (la clave viene en `override`). Con un link, nunca.
			const limitsFor = () => doorSaleLimits(db, { eventSlug: slug, config, type, quantity });
			const check = checkOverride(await limitsFor(), actor.link ? '' : readOverride(form));
			if (!check.ok) return needsConfirmation(check.needsConfirmation);
			// Tope de entradas por hora de cada link.
			if (actor.link && !(await takeDoorLinkTickets(db, actor.link, quantity))) {
				return fail(429, { sale: { ok: false, message: DOOR_LINK_TICKETS_MESSAGE, tickets: [] } });
			}

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
				note,
				fondoPercent: config.fondoPercent,
				by: actor.by
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
			await logAdminAction(db, actor.audit, {
				action: 'order.door_sale',
				targetType: 'order',
				targetId: r.order.id,
				summary: `Vendió en la puerta ${quantity} × ${type.name} (${orderRef(r.order.id)}, ${r.order.payment_method}${doorSaleAuditSuffix(r.order)})${actor.link ? ' con un link de puerta' : ''}`,
				detail: {
					event: slug,
					type: type.id,
					quantity,
					method: r.order.payment_method,
					total: r.order.total,
					...doorSaleAuditExtra(r.order),
					...(check.limits.length ? { overrides: check.limits } : {}),
					...linkDetail(actor)
				}
			});
			await logOverride(db, actor.audit, {
				event: slug,
				what: 'venta en la puerta',
				orderId: r.order.id,
				limits: check.limits
			});
			// Con un link, los mails de compra tienen tope por hora: pasado el tope, la venta queda igual.
			const mailOk =
				parsed.sale.sendEmail && (!actor.link || (await takeDoorLinkEmail(db, actor.link)));
			if (mailOk) {
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
			const mailSkipped = parsed.sale.sendEmail && !mailOk;
			return {
				sale: {
					ok: true,
					message: `Listo: ${quantity} × ${type.name} (${orderRef(r.order.id)}), ya adentro.${mailSkipped ? ' No se mandó el mail: este link llegó al tope de mails por hora.' : ''}`,
					total: r.order.total,
					method: r.order.payment_method,
					// Para el resultado de la venta: la nota es interna del panel (con un link, no va).
					...(actor.link ? {} : { note: r.order.admin_note ?? '' }),
					priceChange: orderPriceChangeText(r.order),
					tickets: hideLogins(actor, cards, 'by')
				},
				counts: await doorCounts(db, slug)
			};
		}
	};
}

/**
 * Sugerencias del buscador («Buscar persona», autocompletar mientras se escribe): JSON con las
 * entradas que coinciden por nombre, pronombres, quien compró, email, DNI o código, y con qué
 * campo coincidió (el DNI, solo los últimos 3).
 *
 * Con un link: sin el token de las entradas ni buscar por su comienzo, y sin logins de admins.
 *
 * @param {any} event
 * @param {DoorActor} actor ya verificado por la ruta
 */
export async function doorSearch(event, actor) {
	// En una parte de un taller: las entradas del taller con el ingreso a esta parte.
	const { db, typeNames, ticketSlug, part } = await doorContext(event);
	const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const found =
		q.length >= 2
			? searchRows(
					await searchTickets(db, ticketSlug, q, {
						limit: SEARCH_LIMIT,
						tokenPrefix: !actor.link
					}),
					typeNames,
					{ forLink: Boolean(actor.link) }
				)
			: [];
	const results = part
		? await overlayPartCheckins(db, part.slug, found, {
				id: 'id',
				at: 'checkedInAt',
				by: 'checkedInBy'
			})
		: found;
	return json({ q, results: hideLogins(actor, results, 'checkedInBy') }, { headers: NO_STORE });
}

/**
 * Detalle de la compra de una entrada (hoja «Ver compra»): la orden, cómo pagó, montos y todas sus
 * entradas con su ingreso. Sin el DNI completo (se pide aparte con `reveal`, solo admins). Con un
 * link, queda en el registro y no lleva lo interno del panel (`purchaseDetails` con `forLink`).
 *
 * @param {any} event
 * @param {DoorActor} actor
 */
export async function doorPurchase(event, actor) {
	// En una parte de un taller: la compra del taller con el ingreso a esta parte.
	const { db, typeNames, ticketSlug, part } = await doorContext(event);
	const ticketId = (event.url.searchParams.get('ticket') ?? '').slice(0, 64);
	const details = ticketId
		? await purchaseDetails(db, {
				slug: ticketSlug,
				ticketId,
				typeNames,
				forLink: Boolean(actor.link)
			})
		: null;
	if (!details) error(404, 'No hay ninguna compra con esa entrada en este evento.');
	if (part) {
		details.tickets = hideLogins(
			actor,
			await overlayPartCheckins(db, part.slug, details.tickets, {
				id: 'id',
				at: 'at',
				by: 'by'
			}),
			'by'
		);
	}
	if (actor.link) {
		await logAdminAction(db, actor.audit, {
			action: 'order.door_view',
			targetType: 'order',
			targetId: details.id,
			summary: `Vio la compra ${details.ref} en la puerta con un link de puerta`,
			detail: { event: event.params.slug, ticket: ticketId, ...linkDetail(actor) }
		});
	}
	return json(details, { headers: NO_STORE });
}

/**
 * Lista de entradas del evento para validar sin conexión (el celu la guarda en localStorage). Lleva
 * el hash del token (no el token) y los últimos 3 dígitos del DNI (no el DNI): ver `offlineList`.
 *
 * @param {any} event
 * @param {DoorActor} actor ya verificado por la ruta (con un link, sin logins de admins)
 */
export async function doorList(event, actor) {
	// En una parte de un taller (docs/talleres-partes.md): las entradas del taller con el ingreso
	// a esta parte.
	const { db, typeNames, ticketSlug: slug, part } = await doorContext(event);
	const prior = await cachedPrior(db, slug, event.platform);
	const [all, counts] = await Promise.all([
		offlineList(db, { slug, typeNames, prior }),
		part ? partDoorCounts(db, slug, part.slug) : doorCounts(db, slug)
	]);
	const tickets = part
		? await overlayPartCheckins(db, part.slug, all, { id: 'ticketId', at: 'at', by: 'by' })
		: all;
	return json(
		{ at: Date.now(), tickets: hideLogins(actor, tickets, 'by'), counts },
		{ headers: NO_STORE }
	);
}

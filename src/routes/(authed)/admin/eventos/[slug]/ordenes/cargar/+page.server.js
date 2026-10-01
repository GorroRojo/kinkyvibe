/**
 * "Cargar entradas a mano" de un evento: invitaciones, cortesías y pagos que llegaron por otro
 * lado. Crea una orden aprobada (canal `manual`) con `createManualOrder` de manual.js, que usa la
 * misma sentencia que la venta en la puerta.
 *
 * Si se pasa algún límite (cupo, máximo por compra, venta cerrada) la acción contesta 409 con
 * `needsConfirmation`; la página pregunta con un diálogo y reenvía con `override` (la clave de
 * exactamente esos límites; ver overrides.js). Todo queda en el registro de actividad.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { salesState, typeOpen } from '$lib/server/tickets/config.js';
import { PANEL_ORDER_HARD_MAX, orderRef } from '$lib/server/tickets/door.js';
import {
	MANUAL_NOTE_MAX,
	createManualOrder,
	isManualMethod,
	manualOrderLimits
} from '$lib/server/tickets/manual.js';
import { getCounts } from '$lib/server/tickets/orders.js';
import { checkOverride, logOverride, readOverride } from '$lib/server/tickets/overrides.js';
import { inBackground, sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { MAX_TICKETS_PER_FORM, remainingOf } from '$lib/utils/tickets.js';
import { doorPrice } from '$lib/utils/ticketTiers.js';

const METHOD_TEXT = /** @type {Record<string, string>} */ ({
	efectivo: 'efectivo',
	transferencia: 'transferencia',
	cortesia: 'cortesía',
	otro: 'otro medio'
});

/**
 * @param {{ params: { slug: string }, platform: App.Platform | undefined }} event
 */
async function context({ params, platform }) {
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	return { db, config };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const { db, config } = await context(event);
	const now = Date.now();
	const counts = await getCounts(db, event.params.slug, now);
	const state = salesState(config, now);
	return {
		slug: event.params.slug,
		title: config.title,
		online: config.online,
		// Para avisar antes de enviar (el servidor igual controla y pide confirmar).
		salesClosed: !state.open && state.reason !== 'notyet',
		maxPerPurchase: MAX_TICKETS_PER_FORM,
		maxOrder: PANEL_ORDER_HARD_MAX,
		noteMax: MANUAL_NOTE_MAX,
		types: config.types.map((t) => {
			const c = counts.get(t.id);
			return {
				id: t.id,
				name: t.name,
				// Monto sugerido: el mismo que en la puerta (el del tipo o el del último tramo).
				price: doorPrice(t)?.price ?? t.price,
				gorra: t.gorra,
				capacity: t.capacity,
				taken: c ? c.sold + c.held : 0,
				available: remainingOf(t, c),
				open: typeOpen(config, t, now)
			};
		})
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async (event) => {
		const admin = requireAdmin(event.locals, event.url);
		const { db, config } = await context(event);
		const slug = event.params.slug;
		const form = await event.request.formData();
		const text = (/** @type {string} */ name, max = 120) =>
			String(form.get(name) ?? '')
				.trim()
				.slice(0, max);
		const values = {
			type: text('type', 64),
			quantity: text('quantity', 4),
			name: text('name', 80),
			email: text('email', 200).toLowerCase(),
			method: text('method', 20),
			amount: text('amount', 14),
			note: text('note', MANUAL_NOTE_MAX)
		};
		/** @param {string} message */
		const bad = (message) => fail(400, { ok: false, message, values });

		const type = config.types.find((t) => t.id === values.type);
		if (!type) return bad('Elegí un tipo de entrada.');
		const quantity = Number(values.quantity);
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > PANEL_ORDER_HARD_MAX) {
			return bad(`La cantidad tiene que ser de 1 a ${PANEL_ORDER_HARD_MAX}.`);
		}
		if (values.name.length < 2) return bad('Falta el nombre de quien recibe las entradas.');
		if (values.email && !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(values.email)) {
			return bad('El email no es válido.');
		}
		const method = values.method;
		if (!isManualMethod(method)) {
			return bad('Elegí cómo se pagó: efectivo, transferencia, cortesía u otro.');
		}
		let amount = 0;
		if (method !== 'cortesia') {
			amount = Number(values.amount.replace(/[.\s$]/g, ''));
			if (values.amount === '' || !Number.isSafeInteger(amount) || amount < 0) {
				return bad('Escribí el monto por entrada en pesos (0 si no pagó nada).');
			}
		}
		const holders = Array.from({ length: quantity }, (_, i) => ({
			name: text(`holder_${i}`, 80) || values.name,
			pronouns: text(`pronouns_${i}`, 40)
		}));

		const limitsFor = () => manualOrderLimits(db, { eventSlug: slug, config, type, quantity });
		const check = checkOverride(await limitsFor(), readOverride(form));
		if (!check.ok) {
			return fail(409, { ok: false, needsConfirmation: check.needsConfirmation, values });
		}

		const r = await createManualOrder(db, {
			eventSlug: slug,
			type,
			quantity,
			holders,
			buyer: { name: values.name, email: values.email },
			method,
			amount,
			note: values.note,
			override: check.override,
			by: admin.login
		});
		if (!r.ok) {
			// Otra venta entró entre el control y la carga: se vuelve a preguntar.
			const again = checkOverride(await limitsFor(), '');
			if (!again.ok) {
				return fail(409, { ok: false, needsConfirmation: again.needsConfirmation, values });
			}
			return bad('No se pudo cargar: probá de nuevo.');
		}

		const ref = orderRef(r.order.id);
		await logAdminAction(db, event.locals, {
			action: 'order.manual',
			targetType: 'order',
			targetId: r.order.id,
			summary: `Cargó a mano ${quantity} × ${type.name} (${ref}, ${METHOD_TEXT[method]}, total $ ${r.order.total})`,
			detail: {
				event: slug,
				type: type.id,
				quantity,
				method,
				total: r.order.total,
				withNote: Boolean(values.note),
				...(check.limits.length ? { overrides: check.limits } : {})
			}
		});
		await logOverride(db, event.locals, {
			event: slug,
			what: 'carga a mano',
			orderId: r.order.id,
			limits: check.limits
		});

		const mailed = Boolean(values.email && form.get('send_email') === 'on');
		if (mailed) {
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
		return {
			ok: true,
			message: `Listo: ${quantity} × ${type.name} (${ref})${mailed ? ', mandamos las entradas por mail' : ''}.`,
			order: { id: r.order.id, ref, total: r.order.total, method: r.order.payment_method },
			tickets: r.tickets.map((t) => ({ holder: t.holder_name, code: t.code ?? '' })),
			overrides: check.limits.length
		};
	}
};

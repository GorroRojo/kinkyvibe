/**
 * Ficha del evento, pestaña Ventas › Órdenes: todas las órdenes con sus entradas y respuestas,
 * reenviar el mail (o corregir la dirección y reenviar, `email`), reembolsar (en dos pasos) y
 * marcar como revisadas las que quedaron para revisar a mano. La casilla «Facturada»
 * (`invoiced`; ver $lib/server/admin/invoiced.js) en cada compra con plata.
 *
 * Transferencias (antes una pestaña aparte): «Llegó la transferencia ✓» (`confirm`, con el
 * diálogo de límites si pasa el cupo), «Cancelar» (`cancel`) y «Deshacer rechazo» (`reopen`).
 * `transferPending` marca las que esperan confirmación (esperando el pago o vencidas hace menos
 * de 7 días, `pendingTransfers`); `?estado=transferencias` abre la lista en ellas.
 *
 * Dos vistas (`?vista=respuestas`): «Compras» y «Respuestas» (una tarjeta por pregunta). Las
 * preguntas (`fields`) son las del formulario de compra, en su orden ($lib/admin/ordersView.js).
 *
 * «Editar» (`edit`, `undoEdit`; $lib/server/admin/orderEdits.js): cada compra trae su historial
 * de cambios (`edits`).
 *
 * DNI: la página solo trae los últimos 3 dígitos de cada orden. El completo sale de a uno con la
 * acción `dni` («Mostrar», queda en el registro de actividad) y el buscador encuentra órdenes por
 * DNI con `dniSearch` (devuelve solo ids). El CSV (`../ordenes.csv`) sí lleva el DNI completo: se
 * descarga a propósito.
 *
 * Evento cancelado (decisión 0051): arriba, «Reembolsar todas» con la cantidad y el total exactos
 * de las órdenes de Mercado Pago (`refundAllPreview`) y la lista de las que se devuelven a mano.
 *
 * Primera vez: cada entrada lleva `firstTime` (true/false; null si no se sabe) y de dónde sale
 * (`firstFrom`): lo que contestó en la pregunta de inscripción «¿primera vez…?» si el evento la
 * tiene (`answeredFirstTime`) y, si no, la misma regla que el modo puerta (entradas en ediciones
 * anteriores de la serie; $lib/server/tickets/series.js). `series` es el nombre para mostrar
 * ("Picantearla"); vacío si el evento no tiene serie.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { pickActions } from '$lib/server/admin/eventActions.js';
import { eventOrderRows, pendingTransfers } from '$lib/server/admin/eventOrders.js';
import { fieldsForEvent } from '$lib/server/tickets/signupFields.js';
import { editsByOrder } from '$lib/server/admin/orderEdits.js';
import { REFUND_ALL_BATCH, REFUND_ALL_WORD, refundAllPreview } from '$lib/server/admin/refunds.js';
import { orderReference } from '$lib/utils/tickets.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { cachedPrior } from '$lib/server/tickets/doorContext.js';
import { answeredFirstTime, isFirstTime } from '$lib/server/tickets/series.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	// same-origin y no no-referrer: el «Sí, confirmar igual» de una transferencia sin JavaScript es
	// un POST común, y con no-referrer sale con `Origin: null` y SvelteKit lo rechaza. Afuera no se
	// manda nada (los links de afuera, como el mailto, no llevan la dirección).
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'same-origin' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const now = Date.now();
	const [{ rows }, preview, prior, fields, edits] = await Promise.all([
		eventOrderRows(db, params.slug, config, now),
		config.status === 'cancelado' ? refundAllPreview(db, params.slug) : null,
		cachedPrior(db, params.slug, platform),
		signupFields(db, params.slug),
		editsByOrder(db, params.slug)
	]);
	const known = Boolean(prior?.known);
	const waiting = new Set(pendingTransfers(rows, now).map((r) => r.id));
	const orders = rows.map((r) => ({
		...r,
		transferPending: waiting.has(r.id),
		// «Editar»: los cambios guardados, del más nuevo al más viejo (orderEdits.js).
		edits: edits.get(r.id) ?? [],
		holders: r.holders.map((h, i) => {
			// Lo que dijo en el formulario gana; si no contestó, la historia de entradas.
			const said = answeredFirstTime(r.answers, i, r.holders.length);
			const history =
				known && prior
					? isFirstTime({ holder: h.name, buyerName: r.name, buyerEmail: r.email }, prior)
					: null;
			return {
				...h,
				/** @type {boolean | null} */
				firstTime: said ?? history,
				/** @type {'form' | 'history' | null} */
				firstFrom: said !== null ? 'form' : history !== null ? 'history' : null
			};
		})
	}));
	const anyKnown = orders.some((o) => o.holders.some((h) => h.firstTime !== null));
	return {
		refundAll: preview
			? {
					...preview,
					manual: preview.manual.map((o) => ({ ...o, reference: orderReference(o.id) })),
					word: REFUND_ALL_WORD,
					batch: REFUND_ALL_BATCH
				}
			: null,
		orders,
		// `firstTime` se puede usar (filtro y etiqueta) si hay alguna respuesta o historia.
		firstKnown: anyKnown,
		series: prior?.series?.label ?? '',
		// Órdenes para revisar a mano (pago tardío sin cupo, pago duplicado).
		review: orders.filter((r) => r.needsReview),
		fields,
		// Vista y estado con que arranca la página (después los cambia la página sin recargar).
		initial: {
			view: url.searchParams.get('vista') ?? '',
			status: url.searchParams.get('estado') ?? ''
		}
	};
}

/**
 * Las preguntas del formulario de compra, en su orden (las generales elegidas, después las del
 * evento). `shortLabel`, si la pregunta tiene un nombre corto. Con un error, ninguna: la página
 * sigue andando y las respuestas se agrupan por el texto guardado.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @returns {Promise<import('$lib/admin/ordersView.js').ViewField[]>}
 */
async function signupFields(db, slug) {
	try {
		return (await fieldsForEvent(db, slug)).map((f) => ({
			id: f.id,
			label: f.label,
			shortLabel: String(/** @type {any} */ (f).shortLabel ?? ''),
			kind: f.kind,
			required: f.required,
			options: f.options,
			perTicket: f.perTicket,
			ticketTypes: f.ticketTypes
		}));
	} catch (error) {
		logDBError('preguntas de inscripción (Órdenes)', error);
		return [];
	}
}

export const actions = pickActions(
	'reviewed',
	'invoiced',
	'resend',
	'email',
	'refund',
	'refundAll',
	'dni',
	'dniSearch',
	'confirm',
	'cancel',
	'reopen',
	'edit',
	'undoEdit'
);

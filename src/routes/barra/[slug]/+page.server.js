/**
 * La barra con link (/barra/<slug>; docs/tickets.md, «Link de barra»; decisión 0056): buscar una
 * entrada de **este** evento (QR, código o nombre) y entregar sus extras de a uno. Nada de ingresos,
 * ventas ni datos de quien compró: de la persona, solo el nombre de la entrada.
 *
 * El `load` y **cada** acción vuelven a mirar el link en la base (`requireDoorLink` con
 * `scope: 'barra'`): de este evento, de barra, sin vencer ni revocar, y dentro del tope de pedidos.
 * Con el interruptor `extras` apagado, 404.
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { extrasEnabled } from '$lib/server/flags.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { NO_STORE } from '$lib/server/tickets/doorContext.js';
import { requireDoorLink } from '$lib/server/tickets/doorLinks.js';
import { deliverAction } from '$lib/server/tickets/doorScreen.js';
import { extrasSummary } from '$lib/server/tickets/extras.js';
import { barLookup, barSearch } from '$lib/server/tickets/barra.js';

/**
 * El link de barra de este pedido (o 404 / 403 / 429), la base y la configuración del evento.
 * @param {any} event
 */
async function barContext(event) {
	if (!(await extrasEnabled(event.platform))) error(404, 'Not found');
	const db = getDB(event.platform);
	const actor = await requireDoorLink(event, db, { scope: 'barra' });
	const config = await getEventTickets(event.params.slug);
	if (!config || !db) error(404, 'Ese evento no vende entradas.');
	return { db, actor, config };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db, actor, config } = await barContext(event);
	event.setHeaders({ ...NO_STORE, 'x-robots-tag': 'noindex' });
	return {
		slug: event.params.slug,
		title: config.title,
		link: { label: actor.link?.label ?? '', expiresAt: Number(actor.link?.expires_at ?? 0) },
		summary: await extrasSummary(db, event.params.slug)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	/** Un QR, el link de una entrada o su código: la entrada y sus extras. */
	ver: async (event) => {
		const { db } = await barContext(event);
		const raw = (await event.request.formData()).get('token');
		const found = await barLookup(db, { eventSlug: event.params.slug, raw });
		if (!found)
			return fail(404, {
				ver: { ok: false, message: 'No hay ninguna entrada así en este evento.' }
			});
		return {
			ver: {
				ok: true,
				ticket: {
					ticketId: found.ticketId,
					holder: found.holder,
					approved: found.status === 'approved',
					extras: found.extras
				}
			}
		};
	},

	/** Buscar por el nombre de la entrada (desde 2 letras). Solo nombre e id de la entrada. */
	buscar: async (event) => {
		const { db } = await barContext(event);
		const q = String((await event.request.formData()).get('q') ?? '');
		return { buscar: { results: await barSearch(db, { eventSlug: event.params.slug, q }) } };
	},

	/** «Entregar 1»: nunca más que lo comprado; queda en Actividad como `barra:<id del link>`. */
	entregar: async (event) => {
		const { db, actor } = await barContext(event);
		const r = await deliverAction(event, db, actor, event.params.slug);
		if (r && 'status' in r) return r;
		return { ...r, summary: await extrasSummary(db, event.params.slug) };
	}
};

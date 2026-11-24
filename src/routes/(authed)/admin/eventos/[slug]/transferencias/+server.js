/**
 * La vieja pestaña Ventas › Transferencias del evento: ahora las transferencias se confirman en
 * Órdenes (filtro «Transferencias por confirmar»). Los links viejos (mails, marcadores, avisos)
 * llevan ahí.
 */
import { redirect } from '@sveltejs/kit';
import { eventHref } from '$lib/admin/nav.js';

/** @type {import('./$types').RequestHandler} */
export function GET({ params }) {
	redirect(303, `${eventHref(params.slug, 'ordenes')}?estado=transferencias`);
}

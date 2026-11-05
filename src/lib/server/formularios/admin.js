/**
 * Panel › Comunidad › Formularios (docs/formularios.md): lo común a sus páginas. Cada `load` y cada
 * acción llama a {@link requireFormsAdmin} (las acciones no pasan por el layout): solo admins, con
 * base y con el interruptor `formularios` prendido (si no, 404).
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { formulariosEnabled } from '$lib/server/flags.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { getForm } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @param {{ locals: App.Locals, url: URL, platform?: App.Platform }} event
 * @returns {Promise<{ admin: NonNullable<App.Locals['user']>, db: D1Database }>}
 */
export async function requireFormsAdmin({ locals, url, platform }) {
	const admin = requireAdmin(locals, url);
	if (!(await formulariosEnabled(platform))) error(404, 'Not found');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	return { admin, db };
}

/**
 * El formulario de `params.id`, o 404.
 *
 * @param {D1Database} db
 * @param {string | undefined} rawId
 */
export async function formOr404(db, rawId) {
	const id = Number(rawId);
	const form = Number.isSafeInteger(id) && id > 0 ? await getForm(db, id) : null;
	if (!form) error(404, 'Ese formulario no existe.');
	return form;
}

/**
 * Los eventos con entradas, para elegir el de un formulario (los más nuevos primero): dirección,
 * título y fecha.
 *
 * @returns {Promise<{ slug: string, title: string, start: string | null }[]>}
 */
export async function ticketedEventChoices() {
	return (await listTicketedEvents()).map(({ slug, config }) => ({
		slug,
		title: config.title || slug,
		start: typeof config.start === 'string' ? config.start : null
	}));
}

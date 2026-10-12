/**
 * Lo que comparten las páginas de los links de los mails de la lista de espera (confirmar, salir
 * y volver a anotarse): la base, los encabezados y el nombre del evento.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { listaEsperaEnabled } from '$lib/server/flags.js';
import { getEventInfo } from '$lib/server/tickets/events.js';

/** Encabezados de las páginas con un token en la dirección. */
export const PRIVATE_HEADERS = Object.freeze({
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex',
	'referrer-policy': 'no-referrer'
});

/**
 * La base (503 sin base). Con `flag`, además el interruptor `lista_espera` (404 apagado).
 *
 * @param {App.Platform | undefined} platform
 * @param {{ flag?: boolean }} [opts]
 */
export async function requireWaitlistDB(platform, { flag = true } = {}) {
	if (flag && !(await listaEsperaEnabled(platform))) error(404, 'No encontrado.');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	return db;
}

/**
 * El nombre y la página del evento, o `null` (si ya no está publicado).
 *
 * @param {string | null | undefined} slug
 * @returns {Promise<{ name: string, path: string } | null>}
 */
export async function eventLabel(slug) {
	if (!slug) return null;
	try {
		const info = await getEventInfo(slug);
		return info ? { name: info.title, path: `/calendario/${slug}` } : null;
	} catch (e) {
		console.error('[lista de espera] no se pudo leer el evento:', e);
		return null;
	}
}

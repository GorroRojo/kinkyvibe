/**
 * Entrada de la barra con link (docs/tickets.md, «Link de barra»; decisión 0056). Igual que
 * /puerta: el link es `/barra#<token>`, el token va en el fragmento (no llega al servidor), la
 * página lo manda en el cuerpo de un POST (`?/entrar`) y, si es de un link de barra vivo, queda en
 * una cookie httpOnly solo para /barra y la página va a /barra/<slug>. `?/salir` borra la cookie.
 *
 * Solo con el interruptor `extras` prendido (apagado: 404). Un link de puerta no entra acá (ni uno
 * de barra en /puerta): ver `findDoorLink`. Nunca se loguea ni se devuelve el token. Entrar tiene
 * el mismo tope por IP (anónima) que la puerta.
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { sha256Hex } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { extrasEnabled } from '$lib/server/flags.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { NO_STORE } from '$lib/server/tickets/doorContext.js';
import {
	BAR_LINK_COOKIE,
	BAR_LINK_PATH,
	DOOR_LINK_ENTER_LIMIT,
	doorCookieOptions,
	findDoorLink,
	touchDoorLink
} from '$lib/server/tickets/doorLinks.js';

/** @param {App.Platform | undefined} platform */
async function requireOn(platform) {
	if (!(await extrasEnabled(platform))) error(404, 'Not found');
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ cookies, platform, setHeaders }) {
	await requireOn(platform);
	setHeaders({ ...NO_STORE, 'x-robots-tag': 'noindex' });
	const db = getDB(platform);
	const token = cookies.get(BAR_LINK_COOKIE);
	if (!db || token === undefined) return { current: null };
	const found = await findDoorLink(db, token, Date.now(), 'barra');
	if (!found.ok) {
		cookies.delete(BAR_LINK_COOKIE, { path: BAR_LINK_PATH });
		return { current: null };
	}
	const config = await getEventTickets(found.link.event_slug).catch(() => null);
	return {
		current: {
			slug: found.link.event_slug,
			title: config?.title ?? found.link.event_slug,
			expiresAt: Number(found.link.expires_at)
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	entrar: async ({ request, cookies, platform, url, getClientAddress }) => {
		await requireOn(platform);
		const db = getDB(platform);
		if (!db) return fail(503, { message: 'No hay base de datos disponible: probá en un rato.' });
		const client = await sha256Hex(`puerta:client:${getClientAddress()}`);
		const rate = await hitRateLimit(db, `puerta:enter:${client}`, DOOR_LINK_ENTER_LIMIT);
		if (!rate.allowed) {
			return fail(429, {
				message: 'Demasiados intentos desde esta conexión: esperá unos minutos.'
			});
		}
		const token = (await request.formData()).get('token');
		const found = await findDoorLink(db, token, Date.now(), 'barra');
		if (!found.ok) {
			return fail(403, {
				message:
					found.reason === 'expired'
						? 'Este link de barra ya venció. Pedile uno nuevo a une organizadore.'
						: 'Este link de barra no sirve: puede estar incompleto o lo revocaron. Pedile uno nuevo a une organizadore.'
			});
		}
		cookies.set(
			BAR_LINK_COOKIE,
			/** @type {string} */ (token),
			doorCookieOptions(url, Number(found.link.expires_at), Date.now(), 'barra')
		);
		await touchDoorLink(db, found.link.id);
		return { slug: found.link.event_slug };
	},

	salir: async ({ cookies }) => {
		cookies.delete(BAR_LINK_COOKIE, { path: BAR_LINK_PATH });
		return { left: true };
	}
};

/**
 * Entrada de la puerta con link (docs/tickets.md, «Link de puerta»). El link es `/puerta#<token>`:
 * el token va en el fragmento, que el navegador no manda al servidor. La página lo lee y lo manda
 * acá en el cuerpo de un POST (`?/entrar`); si es de un link vivo, queda en una cookie httpOnly
 * solo para /puerta y la página va a /puerta/<slug>. `?/salir` borra la cookie.
 *
 * Nunca se loguea ni se devuelve el token. Entrar tiene tope por IP (anónima).
 */
import { fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { sha256Hex } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { NO_STORE } from '$lib/server/tickets/doorContext.js';
import {
	DOOR_LINK_COOKIE,
	DOOR_LINK_ENTER_LIMIT,
	DOOR_LINK_PATH,
	doorCookieOptions,
	findDoorLink,
	touchDoorLink
} from '$lib/server/tickets/doorLinks.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ cookies, platform, setHeaders }) {
	setHeaders({ ...NO_STORE, 'x-robots-tag': 'noindex' });
	const db = getDB(platform);
	const token = cookies.get(DOOR_LINK_COOKIE);
	if (!db || token === undefined) return { current: null };
	const found = await findDoorLink(db, token);
	if (!found.ok) {
		cookies.delete(DOOR_LINK_COOKIE, { path: DOOR_LINK_PATH });
		return { current: null };
	}
	const config = await getEventTickets(found.link.event_slug).catch(() => null);
	return {
		// Este celu ya tiene un link vivo: «Abrir la puerta de …».
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
		const found = await findDoorLink(db, token);
		if (!found.ok) {
			return fail(403, {
				message:
					found.reason === 'expired'
						? 'Este link de puerta ya venció. Pedile uno nuevo a une organizadore.'
						: 'Este link de puerta no sirve: puede estar incompleto o lo revocaron. Pedile uno nuevo a une organizadore.'
			});
		}
		cookies.set(
			DOOR_LINK_COOKIE,
			/** @type {string} */ (token),
			doorCookieOptions(url, Number(found.link.expires_at))
		);
		await touchDoorLink(db, found.link.id);
		return { slug: found.link.event_slug };
	},

	salir: async ({ cookies }) => {
		cookies.delete(DOOR_LINK_COOKIE, { path: DOOR_LINK_PATH });
		return { left: true };
	}
};

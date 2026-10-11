/**
 * Ficha del evento, pestaña Ventas, de un evento que NO vende entradas de verdad (por ejemplo los
 * eventos de prueba `prueba-entradas-*` en el sitio publicado, o una configuración inválida) pero
 * que tiene `tickets` en su metadata: la lista del panel linkea a Ventas igual, así que en lugar
 * de un 404 se va al Resumen de la ficha.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	getEventTickets: async () => null
}));
vi.mock('$lib/server/tickets/fondo.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	resolveFondoPercent: async () => ({ percent: null })
}));

import { ADMINS } from '$lib/server/auth.js';
import { load } from './+page.server.js';

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('no tiró nada');
}

describe('Ventas de un evento sin entradas', () => {
	it('va al Resumen de la ficha (no 404)', async () => {
		const slug = 'evento-de-prueba-sin-venta';
		const e = await thrown(() =>
			load(
				/** @type {any} */ ({
					locals: admin,
					url: new URL(`https://kinkyvibe.ar/admin/eventos/${slug}/ventas`),
					params: { slug },
					platform: {},
					setHeaders: () => {},
					fetch: async () => new Response('{}')
				})
			)
		);
		expect(e).toMatchObject({ status: 303, location: `/admin/eventos/${slug}` });
	});
});

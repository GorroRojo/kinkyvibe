/**
 * GET /admin/buscar (paleta de comandos): solo admins, con límite por admin, y resultados de la
 * base sin DNI completo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { insertOrder } from '$lib/server/admin/testRows.js';
import { GET } from './+server.js';

// Los eventos salen del bundle (cientos de markdown): acá, una lista inventada y chica.
vi.mock('$lib/server/eventos/index.js', () => ({
	listEvents: async () => [
		{
			slug: 'fiesta-inventada-2026-10',
			title: 'Fiesta Inventada',
			start: '2026-10-10T21:00-03:00',
			end: '',
			status: 'abierto',
			location: '',
			unlisted: false,
			unpublished: false
		}
	]
}));
vi.mock('$lib/server/tickets/events.js', () => ({
	isTestEventSlug: (/** @type {string} */ s) => s.startsWith('prueba-entradas'),
	listTicketedEvents: async () => [{ slug: 'fiesta-inventada-2026-10', config: {} }]
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {string} q
 * @param {{ user?: any, token?: string | null, platform?: any }} [o]
 */
function call(q, o = {}) {
	const url = new URL(`http://localhost/admin/buscar?q=${encodeURIComponent(q)}`);
	const locals = {
		user: o.user === undefined ? admin : o.user,
		user_token: o.token === undefined ? 'token-de-prueba' : o.token
	};
	return GET(/** @type {any} */ ({ url, locals, platform: o.platform ?? t.platform }));
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return /** @type {any} */ (e);
	}
	return null;
}

describe('/admin/buscar', () => {
	it('sin sesión redirige al login', async () => {
		const e = await thrown(() => call('ana', { user: null, token: null }));
		expect(e?.status).toBe(303);
		expect(e?.location).toContain('/login');
	});

	it('une usuarie que no es admin recibe 403', async () => {
		const e = await thrown(() => call('ana', { user: { id: 1, login: 'no-admin' } }));
		expect(e?.status).toBe(403);
	});

	it('busca órdenes y personas; el DNI sale enmascarado', async () => {
		await insertOrder(t.db, {
			name: 'Dana Inventada',
			email: 'dana@example.com',
			dni: '28999555'
		});
		const res = await call('dana');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toContain('no-store');
		const body = await res.json();
		const ids = body.groups.map((/** @type {any} */ g) => g.id);
		expect(ids).toContain('orders');
		expect(ids).toContain('people');
		expect(JSON.stringify(body)).not.toContain('28999555');
		const byDni = await (await call('28999555')).json();
		expect(JSON.stringify(byDni)).toContain('DNI ···555');
		expect(JSON.stringify(byDni)).not.toContain('28999555');
		expect(Array.isArray(body.today)).toBe(true);
	});

	it('busca eventos del bundle aunque no haya base de datos', async () => {
		const res = await call('fiesta', { platform: {} });
		const body = await res.json();
		// Sin base: los eventos (y las etiquetas, que salen del árbol en memoria; «fiesta» también
		// es una etiqueta). Nada de lo que sale de la base.
		expect(body.groups.map((/** @type {any} */ g) => g.id).filter((id) => id !== 'tags')).toEqual([
			'events'
		]);
		expect(body.groups[0].id).toBe('events');
		expect(body.groups[0].items[0]).toMatchObject({
			title: 'Fiesta Inventada',
			// La ficha del evento (#106), en su pestaña Ventas.
			href: '/admin/eventos/fiesta-inventada-2026-10/ventas'
		});
	});

	it('búsqueda corta: sin grupos (solo los eventos de hoy)', async () => {
		const body = await (await call('a')).json();
		expect(body.groups).toEqual([]);
	});

	it('corta con 429 después de demasiadas búsquedas seguidas', async () => {
		// Reloj fijo a mitad de una ventana de un minuto. En vez de hacer 119 búsquedas de verdad
		// (tarda ~10 s), el contador de esa ventana arranca en 119: la 120 pasa y la 121 no.
		const at = Date.UTC(2026, 8, 30, 12, 0, 30);
		const windowStart = Math.floor(at / 1000) - 30;
		await t.db
			.prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, 119)')
			.bind(`admin-search:${admin.id}`, windowStart)
			.run();
		const now = vi.spyOn(Date, 'now').mockReturnValue(at);
		let ok, last;
		try {
			ok = await call('zz120');
			last = await call('zz121');
		} finally {
			now.mockRestore();
		}
		expect(ok.status).toBe(200);
		expect(last?.status).toBe(429);
		expect(last?.headers.get('retry-after')).toBe('30');
	});
});

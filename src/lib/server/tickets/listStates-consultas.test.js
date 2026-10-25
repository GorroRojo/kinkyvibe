/**
 * Las tarjetas de una lista piden la configuración de la venta de todos sus eventos en una tanda
 * (`getEventTicketsMany`): las mismas pocas consultas con 5 o con 20 eventos. Antes eran dos por
 * evento (el evento y si tiene lugar): 2·N + 1. Y por cada evento dice lo mismo que
 * `getEventTickets` (la página del evento). D1 de miniflare; eventos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

// Para las tandas automáticas: un pedido GET de mentira (sin pedido, una ida por consulta).
const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
const N = 20;
/** @param {number} i */
const slugOf = (i) => `evento-inventado-${i}`;

beforeAll(async () => {
	t = await createTestDB();
	const common = {
		category: 'calendario',
		summary: 'Un evento de prueba',
		published_date: '2026-09-01Z-03:00',
		status: 'abierto',
		// Online: con lugar vinculado pasa a presencial (`hasVenue`), así se nota si lo leyó.
		modalidad: 'online',
		tags: [],
		authors: [],
		payment_methods: ['transferencia']
	};
	await seedPosts(t.db, [
		...Array.from({ length: N }, (_, i) => ({
			...common,
			postID: slugOf(i),
			title: `Evento Inventado ${i}`,
			start: `2099-01-${String((i % 28) + 1).padStart(2, '0')}T20:00-03:00`,
			tickets: [{ id: 'general', name: 'General', price: 5000 + i, capacity: 10 }]
		})),
		// Uno sin entradas y uno con una dirección vieja de .md (mayúsculas).
		{
			...common,
			postID: 'sin-entradas-inventado',
			title: 'Sin Entradas',
			start: '2099-02-01T20:00-03:00'
		},
		// Con lista de espera (el interruptor se prende abajo): la venta lee también la fila.
		{
			...common,
			postID: 'con-lista-inventado',
			title: 'Con Lista',
			start: '2099-02-03T20:00-03:00',
			lista_espera: 'evento',
			tickets: [{ id: 'general', name: 'General', price: 4000, capacity: 5 }]
		},
		{
			...common,
			postID: 'Viejo_Inventado-2099',
			title: 'Viejo Inventado',
			start: '2099-02-02T20:00-03:00',
			tickets: [{ id: 'general', name: 'General', price: 4000 }]
		}
	]);
	// La mitad con lugar vinculado: la venta lo trata como presencial (`hasVenue`).
	const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
	const venues = await import('$lib/server/amigues/venues.js');
	for (let i = 0; i < N; i += 2) {
		await makeEvent(t.db, slugOf(i));
		await venues.setEventVenue(t.db, {
			eventSlug: slugOf(i),
			venueId: venue.id,
			privacy: null,
			by: 'admin-de-prueba'
		});
	}
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/** @param {number} n */
async function countFor(n) {
	vi.resetModules();
	const counted = countingDB(t.db);
	(await import('$lib/server/contenido/repo.js')).setContentDB(counted.db);
	const { getListTicketStates } = await import('./listStates.js');
	const slugs = Array.from({ length: n }, (_, i) => slugOf(i));
	const states = await getListTicketStates(counted.db, slugs, { cacheMs: 0 });
	return { states, queries: counted.log.length };
}

describe('estados de la venta de una lista, en una tanda', () => {
	it('las mismas consultas con 5 o con 20 eventos', async () => {
		const five = await countFor(5);
		const twenty = await countFor(N);
		expect(Object.keys(five.states)).toHaveLength(5);
		expect(Object.keys(twenty.states)).toHaveLength(N);
		// Los eventos (1), cuáles tienen lugar (1), los datos para transferir (1), lo vendido (1), el
		// interruptor de la lista (1) y la fila (1): todo a la par, en una tanda. Antes eran 3, pero en
		// fila, porque lo vendido y la fila se leían solo después de saber quién vende (acá nadie:
		// no hay datos para transferir).
		expect(twenty.queries).toBe(five.queries);
		expect(twenty.queries).toBeLessThanOrEqual(6);
	});

	it('getEventTicketsMany dice lo mismo que getEventTickets, evento por evento', async () => {
		vi.resetModules();
		(await import('$lib/server/contenido/repo.js')).setContentDB(t.db);
		const events = await import('./events.js');
		const slugs = [
			...Array.from({ length: 6 }, (_, i) => slugOf(i)),
			'sin-entradas-inventado',
			'Viejo_Inventado-2099',
			'no-existe-inventado',
			'_privado',
			'con espacios',
			slugOf(0)
		];
		const many = await events.getEventTicketsMany(slugs, { fondoPercent: 15 });
		expect([...many.keys()]).toEqual([...new Set(slugs)]);
		for (const slug of new Set(slugs)) {
			expect(many.get(slug), slug).toEqual(
				await events.getEventTickets(slug, { fondoPercent: 15 })
			);
		}
		// Con y sin lugar, como la página.
		expect(many.get(slugOf(0))?.online).toBe(false);
		expect(many.get(slugOf(1))?.online).toBe(true);
		expect(many.get('Viejo_Inventado-2099')).not.toBeNull();
		expect(many.get('sin-entradas-inventado')).toBeNull();
		expect(many.get('no-existe-inventado')).toBeNull();
	});

	it('sin base, ninguno vende (como getEventTickets)', async () => {
		vi.resetModules();
		(await import('$lib/server/contenido/repo.js')).setContentDB(null);
		const events = await import('./events.js');
		const many = await events.getEventTicketsMany([slugOf(0), slugOf(1)]);
		expect([...many.values()]).toEqual([null, null]);
	});
});

describe('todo lo que lee la venta de una lista, a la par', () => {
	it('una tanda (antes, cinco en fila: eventos → lugares → ajustes → vendido → fila)', async () => {
		const { saveSalesSettings } = await import('./settings.js');
		await saveSalesSettings(t.db, { transfer_alias: 'alias.inventado' }, { by: 'admin-de-prueba' });
		const { setFlag } = await import('$lib/server/flags.js');
		await setFlag(t.db, 'lista_espera', true, { by: 'admin-de-prueba' });
		const slugs = [slugOf(0), slugOf(1), 'con-lista-inventado', 'sin-entradas-inventado'];

		/** @param {boolean} batch con las tandas automáticas */
		const run = async (batch) => {
			vi.resetModules();
			const counted = countingDB(t.db, { delayMs: 10 });
			const platform = {
				env: { ...t.env, DB: counted.db, ...(batch ? {} : { KV_D1_TANDAS: 'off' }) }
			};
			const url = new URL('https://kinkyvibe.ar/calendario');
			fake.event = { request: new Request(url), url };
			try {
				const db = /** @type {any} */ ((await import('$lib/server/db')).getDB(platform));
				(await import('$lib/server/contenido/repo.js')).setContentDB(db);
				const { getListTicketStates } = await import('./listStates.js');
				const states = await getListTicketStates(db, slugs, { cacheMs: 0 });
				return { states, queries: counted.queries, waves: counted.waves };
			} finally {
				fake.event = null;
			}
		};
		const batched = await run(true);
		const plain = await run(false);
		expect(batched.states).toEqual(plain.states);
		expect(Object.keys(batched.states).sort()).toEqual(
			[slugOf(0), slugOf(1), 'con-lista-inventado'].sort()
		);
		expect(batched.states['con-lista-inventado']).toMatchObject({ open: true });
		// Sin tandas, todo a la par igual: una tanda en fila (varias idas).
		expect(plain.waves).toBe(1);
		expect(batched).toMatchObject({ queries: 1, waves: 1 });
	});
});

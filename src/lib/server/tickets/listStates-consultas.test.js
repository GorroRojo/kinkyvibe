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
		// Los eventos (1), cuáles tienen lugar (1) y los datos para transferir (1).
		expect(twenty.queries).toBe(five.queries);
		expect(twenty.queries).toBeLessThanOrEqual(3);
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

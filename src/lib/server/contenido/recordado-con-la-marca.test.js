/**
 * Lo que se recuerda junto a las listas mientras no cambie la marca del contenido
 * (`fromContentState`, ./posts.js): los lugares de los eventos como los ve cualquiera y las
 * etiquetas «Parte N de M». Sin consultas mientras la marca es la misma; lo mismo que leído de la
 * base; y un cambio (otro lugar, otras partes) se ve en el pedido siguiente. D1 de miniflare; datos
 * inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from './testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

const BY = 'admin-de-prueba';
const EVENTS = ['encuentro-uno-inventado', 'encuentro-dos-inventado', 'taller-tres-inventado'];

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ id: number }} */
let venueA;
/** @type {{ id: number }} */
let venueB;

beforeAll(async () => {
	t = await createTestDB();
	await seedPosts(
		t.db,
		[...EVENTS, 'taller-tres-inventado-parte-2'].map((postID, i) => ({
			category: 'calendario',
			postID,
			title: `Evento ${postID}`,
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			start: `2099-03-0${i + 1}T20:00-03:00`,
			tags: [],
			authors: []
		}))
	);
	const data = (/** @type {string} */ address) => ({
		address,
		city: 'Ciudad Inventada',
		venue_privacy: 'public'
	});
	venueA = await makeProfile(t.db, { title: 'Galpón A', kind: 'lugar', data: data('Calle A 1') });
	venueB = await makeProfile(t.db, { title: 'Galpón B', kind: 'lugar', data: data('Calle B 2') });
	const venues = await import('$lib/server/amigues/venues.js');
	await venues.setEventVenue(t.db, {
		eventSlug: EVENTS[0],
		venueId: venueA.id,
		privacy: null,
		by: BY
	});
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/** Un GET nuevo en el mismo isolate, con una base que cuenta. */
async function request() {
	const counted = countingDB(t.db);
	const url = new URL('https://kinkyvibe.ar/calendario');
	fake.event = { request: new Request(url), url };
	const platform = { env: { ...t.env, DB: counted.db, KV_D1_TANDAS: 'off' } };
	const db = /** @type {any} */ ((await import('$lib/server/db')).getDB(platform));
	const posts = await (await import('./posts.js')).sitePosts(platform);
	const events = posts.filter((p) => p.meta.category === 'calendario');
	counted.reset();
	return { counted, db, events };
}

/** El «Dónde» que queda en cada evento. @param {ProcessedPost[]} posts */
const placesOf = (posts) =>
	Object.fromEntries(posts.map((p) => [p.meta.postID, p.meta.location_name ?? null]));

describe('recordado con la marca del contenido', () => {
	it('los lugares: sin consultas con la misma marca, igual que de la base, y al día con un cambio', async () => {
		vi.resetModules();
		const { withVenuePlaces, feedVenues } = await import('$lib/server/amigues/venues.js');
		const first = await request();
		const a = await withVenuePlaces(first.db, first.events);
		expect(placesOf(a)[EVENTS[0]]).toBe('Galpón A');
		// Lo mismo que leer los lugares directo de la base.
		const direct = await feedVenues(
			t.db,
			first.events.map((p) => String(p.meta.postID))
		);
		expect([...direct.keys()]).toEqual([EVENTS[0]]);

		const second = await request();
		const b = await withVenuePlaces(second.db, second.events);
		expect(b).toEqual(a);
		// Solo la marca (que ya leyó la lista): ninguna consulta de lugares.
		expect(second.counted.statements).toBe(0);

		const venues = await import('$lib/server/amigues/venues.js');
		await venues.setEventVenue(t.db, {
			eventSlug: EVENTS[1],
			venueId: venueB.id,
			privacy: null,
			by: BY
		});
		const third = await request();
		const c = await withVenuePlaces(third.db, third.events);
		expect(placesOf(c)[EVENTS[1]]).toBe('Galpón B');
		expect(placesOf(c)[EVENTS[0]]).toBe('Galpón A');
	});

	it('las etiquetas «Parte N de M»: sin consultas con la misma marca, y al día con un cambio', async () => {
		vi.resetModules();
		const { partLabelsOrNone } = await import('$lib/server/eventos/pasados.js');
		const first = await request();
		expect((await partLabelsOrNone(first.db)).size).toBe(0);
		const second = await request();
		expect((await partLabelsOrNone(second.db)).size).toBe(0);
		expect(second.counted.statements).toBe(0);

		const { setWorkshopParts } = await import('$lib/server/eventos/partes.js');
		expect(
			await setWorkshopParts(t.db, {
				eventSlug: EVENTS[2],
				partSlugs: ['taller-tres-inventado-parte-2'],
				by: BY
			})
		).toEqual({ ok: true });
		const third = await request();
		const labels = await partLabelsOrNone(third.db);
		expect(labels.get('taller-tres-inventado-parte-2')).toMatchObject({ n: 2, m: 2 });
	});
});

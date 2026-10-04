/**
 * La página de un lugar con muchos eventos hace las mismas pocas consultas a la base con 5 o con
 * 60 eventos. Antes, el «Dónde» de cada evento (un lugar vinculado manda sobre el del .md) se
 * pedía evento por evento: 3 consultas por evento, y en producción la página de un lugar con ~80
 * eventos tardaba 10 s. D1 de miniflare; eventos y lugares inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { ANON } from '$lib/server/objects/visibility.js';
import { venuePlaceMeta } from '$lib/utils/eventPlace.js';

// La primera prueba compila la ruta: tarda.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 90_000 });

const fake = vi.hoisted(() => ({
	/** @type {any[]} */
	posts: []
}));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki) =>
		wiki ? [] : structuredClone(fake.posts)
}));

/** @param {number} i */
const slugOf = (i) => `encuentro-inventado-${i}`;
/** @param {number} i */
function fakeEventPost(i) {
	const slug = slugOf(i);
	return {
		path: `/calendario/${slug}`,
		meta: {
			category: 'calendario',
			layout: 'calendario',
			postID: slug,
			title: `Encuentro Inventado ${i}`,
			summary: 'Un evento de prueba',
			start: `2099-01-${String((i % 28) + 1).padStart(2, '0')}T20:00-03:00`,
			status: 'abierto',
			published_date: '2026-09-01Z-03:00',
			tags: [],
			authors: [],
			location: `Calle Md ${slug}`,
			location_name: `Nombre Md ${slug}`
		}
	};
}

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/**
 * Un lugar con `n` eventos vinculados (uno de cada cinco cambia el nivel en el evento) y la página
 * del lugar cargada con una base que cuenta las consultas.
 * @param {number} n
 */
async function venuePage(n) {
	await resetDB(t.db);
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			PERFILES_PUBLICOS_ENABLED: '1',
			PERSONAS_EVENTOS_ENABLED: '1',
			CUENTAS_ENABLED: '0'
		}
	}));
	fake.posts = Array.from({ length: n }, (_, i) => fakeEventPost(i));
	// Los eventos salen de la base.
	await seedPosts(t.db, fake.posts);
	const venue = await makeProfile(t.db, {
		title: 'Galpón Inventado',
		kind: 'lugar',
		data: {
			address: 'Calle Del Lugar 222',
			area: 'Barrio Inventado',
			city: 'Ciudad Inventada',
			venue_privacy: 'public'
		}
	});
	const venues = await import('$lib/server/amigues/venues.js');
	for (let i = 0; i < n; i++) {
		// «Sucede en» es un edge del evento: el evento tiene que estar en la base.
		await makeEvent(t.db, slugOf(i));
		await venues.setEventVenue(t.db, {
			eventSlug: slugOf(i),
			venueId: venue.id,
			privacy: i % 5 === 4 ? 'name' : null,
			by: 'a'
		});
	}
	const counted = countingDB(t.db);
	const { load } = await import('./+page.server.js');
	const url = new URL(`/amigues/${venue.slug}`, 'https://kinkyvibe.ar');
	const page = /** @type {any} */ (
		await load(
			/** @type {any} */ ({
				url,
				params: { profile: String(venue.slug) },
				platform: { env: { ...t.env, DB: counted.db } },
				locals: { user: undefined, user_token: '' },
				setHeaders: () => {}
			})
		)
	);
	return { page, queries: counted.queries, log: counted.log, venues };
}

describe('la página de un lugar con muchos eventos', () => {
	it('hace las mismas consultas con 5 o con 60 eventos', async () => {
		const few = await venuePage(5);
		const many = await venuePage(60);
		expect(few.page.venueEvents).toHaveLength(5);
		expect(many.page.venueEvents).toHaveLength(60);
		expect(many.queries).toBe(few.queries);
		expect(many.queries).toBeLessThanOrEqual(10);
		// Ninguna consulta pide el lugar de un evento por separado (ni la tabla de antes ni el edge).
		expect(many.log.filter((q) => /WHERE ev\.event_slug = \?1/.test(q.sql))).toEqual([]);
		expect(many.log.filter((q) => /legacy_slug, ev\.slug\) = \?1/.test(q.sql))).toEqual([]);
	});

	it('cada evento muestra el mismo lugar que su página (como antes, evento por evento)', async () => {
		const { page, venues } = await venuePage(12);
		for (const post of page.venueEvents) {
			const slug = String(post.meta.postID);
			const original = fake.posts.find((p) => p.meta.postID === slug);
			const view = await venues.publicVenueForEvent(t.db, slug, ANON);
			expect(view, slug).not.toBeNull();
			expect(post.meta, slug).toEqual(venuePlaceMeta(original.meta, view));
			expect(JSON.stringify(post.meta)).not.toContain('Calle Md');
		}
	});
});

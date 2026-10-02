/**
 * Lugares → «Importar de eventos» contra un D1 de miniflare: crea los lugares elegidos (visibles,
 * aprobados, no listados en /amigues salvo que se elija «Públicos», con el nivel que muestra lo
 * que ya mostraban los eventos), vincula solo los eventos marcados, no pisa vínculos, va de a
 * tandas y se puede repetir. Y lo más importante: **vincular
 * no cambia lo que muestra el sitio** (la página del evento, las listas y el .ics muestran lo mismo
 * antes y después). Eventos y lugares inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON } from '$lib/server/objects/index.js';
import { eventPlace, venuePlaceMeta } from '$lib/utils/eventPlace.js';
import { feedLocation } from '$lib/utils/icsFeed.js';
import { addressKey } from '$lib/utils/venueImport.js';
import { makeProfile } from './testing.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const posts = vi.hoisted(() => ({
	listed: /** @type {any[]} */ ([]),
	unlisted: /** @type {any[]} */ ([])
}));
vi.mock('$lib/server/contenido/posts.js', () => ({
	sitePosts: async (/** @type {unknown} */ _p, /** @type {boolean} */ _wiki, unlisted = false) =>
		structuredClone(unlisted ? posts.unlisted : posts.listed)
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
	posts.listed = [];
	posts.unlisted = [];
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** Los módulos con `perfiles_publicos` prendido. */
async function modules() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { PERFILES_PUBLICOS_ENABLED: '1' } }));
	return {
		imp: await import('./venueImport.js'),
		venues: await import('./venues.js'),
		profiles: await import('./profiles.js')
	};
}

/**
 * Un evento como lo da `sitePosts`.
 * @param {string} slug
 * @param {Record<string, unknown>} place
 * @param {string} [start]
 */
const post = (slug, place, start = '2025-05-01T20:00-03:00') => ({
	path: `/calendario/${slug}`,
	meta: { category: 'calendario', postID: slug, title: `Evento ${slug}`, start, ...place }
});

/** @param {any[]} list */
const setPosts = (list) => {
	posts.listed = list;
};

const FAKE = {
	full: { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' },
	nameOnly: { location_name: 'Galpón Inventado' },
	addressOnly: { location: 'Calle Falsa 123, CABA' },
	otherName: { location_name: 'El Galpón de Prueba', location: 'Calle Falsa 123, CABA' },
	area: { location: 'Barrio Falso, Ciudad Inventada' }
};

/**
 * Todo lo que el sitio muestra del «Dónde» de un evento, en textos comparables: el encabezado de
 * la página, la meta de las listas / carrusel / `/api/posts` (`location_name`, `location`) y el
 * .ics. Separa «Nombre · Dirección» y saca «Online» y «Lugar a confirmar» (no son datos).
 *
 * @param {Record<string, any>} meta
 * @param {import('$lib/utils/venues.js').VenueView | null} view
 */
function shown(meta, view) {
	const page = eventPlace(meta, view);
	const list = venuePlaceMeta(meta, view);
	const texts = [page.text, list.location_name, list.location, feedLocation(meta, view)];
	const out = new Set();
	for (const text of texts) {
		for (const part of String(text ?? '').split(' · ')) {
			const k = addressKey(part);
			if (k && k !== 'online' && k !== 'lugar a confirmar') out.add(k);
		}
	}
	return [...out].sort();
}

describe('leer los eventos', () => {
	it('listados y no listados, una vez cada uno, solo eventos', async () => {
		const { imp } = await modules();
		posts.listed = [
			post('a', FAKE.full),
			{ path: '/material/x', meta: { category: 'material', postID: 'x' } }
		];
		posts.unlisted = [post('a', FAKE.full), post('b', FAKE.area)];
		const events = await imp.importableEvents(undefined);
		expect(events.map((e) => e.slug)).toEqual(['a', 'b']);
	});
});

describe('crear lugares', () => {
	it('crea el lugar visible y aprobado (no listado), con el nivel de sus eventos, y vincula solo los marcados', async () => {
		const { imp, venues } = await modules();
		setPosts([
			post('ev-full', FAKE.full),
			post('ev-name', FAKE.nameOnly),
			post('ev-address', FAKE.addressOnly),
			post('ev-other', FAKE.otherName)
		]);
		const plan = await imp.loadVenueImportPlan(t.db, await imp.importableEvents(undefined));
		expect(plan.candidates).toHaveLength(1);
		const [c] = plan.candidates;
		// El de otro nombre se ve distinto con el lugar: no se propone.
		expect(
			c.events
				.filter((e) => e.fits)
				.map((e) => e.slug)
				.sort()
		).toEqual(['ev-address', 'ev-full', 'ev-name']);
		const { results, remaining } = await imp.runVenueImport(
			t.db,
			plan,
			[
				{
					key: c.key,
					title: c.title,
					location: c.address,
					events: ['ev-full', 'ev-name', 'ev-address', 'no-es-de-aca']
				}
			],
			{ actor: 'admin-inventade' }
		);
		expect(remaining).toBe(0);
		expect(results).toMatchObject([
			{ action: 'created', title: 'Galpón Inventado', venuePrivacy: 'public' }
		]);

		const row = await t.db
			.prepare(
				`SELECT o.visibility, o.data, o.created_by, a.approved_by FROM objects o
				JOIN profile_approvals a ON a.profile_id = o.id WHERE o.id = ?1`
			)
			.bind(results[0].venueId)
			.first();
		expect(row).toMatchObject({
			visibility: 'public',
			created_by: 'admin-inventade',
			approved_by: 'admin-inventade'
		});
		// Sin elegir cómo se crea: no listado (decisión de gorrite).
		expect(JSON.parse(String(row?.data))).toEqual({
			kind: 'lugar',
			address: 'Calle Falsa 123, CABA',
			venue_privacy: 'public',
			unlisted: true
		});
		const links = await venues.listEventVenues(t.db);
		expect(links.map((l) => [l.eventSlug, l.privacy, l.updatedBy])).toEqual([
			['ev-address', 'address', 'admin-inventade'],
			['ev-full', null, 'admin-inventade'],
			['ev-name', 'name', 'admin-inventade']
		]);
	});

	it('repetir no duplica: lo ya creado pasa a ser un lugar existente', async () => {
		const { imp, venues } = await modules();
		setPosts([post('ev-full', FAKE.full), post('ev-name', FAKE.nameOnly)]);
		const events = await imp.importableEvents(undefined);
		const plan = await imp.loadVenueImportPlan(t.db, events);
		const [c] = plan.candidates;
		const choice = { key: c.key, title: c.title, location: c.address, events: ['ev-full'] };
		await imp.runVenueImport(t.db, plan, [choice], { actor: 'a' });
		// El mismo formulario otra vez (por ejemplo, la tanda siguiente).
		const again = await imp.loadVenueImportPlan(t.db, events);
		expect(again.skipped.linked).toBe(1);
		expect(again.candidates).toHaveLength(1);
		expect(again.candidates[0].existing?.title).toBe('Galpón Inventado');
		const r = await imp.runVenueImport(t.db, again, [choice], { actor: 'a' });
		expect(r.results).toEqual([]);
		const count = await t.db
			.prepare("SELECT count(*) AS n FROM objects WHERE type = 'perfil'")
			.first();
		expect(count?.n).toBe(1);
		// Y se pueden vincular los que faltaban al lugar que ya existe, con su propio nivel.
		const k = again.candidates[0].key;
		const linked = await imp.runVenueImport(
			t.db,
			again,
			[{ key: k, title: '', location: '', events: ['ev-name'] }],
			{ actor: 'a' }
		);
		expect(linked.results).toMatchObject([
			{ action: 'linked', links: [{ slug: 'ev-name', privacy: 'name' }] }
		]);
		expect((await venues.listEventVenues(t.db)).map((l) => l.eventSlug)).toEqual([
			'ev-full',
			'ev-name'
		]);
	});

	it('no pisa el lugar de un evento que ya tiene uno', async () => {
		const { imp, venues } = await modules();
		setPosts([post('ev-full', FAKE.full), post('ev-name', FAKE.nameOnly)]);
		const plan = await imp.loadVenueImportPlan(t.db, await imp.importableEvents(undefined));
		// Mientras tanto, alguien le puso otro lugar a uno de los eventos.
		const other = await makeProfile(t.db, { title: 'Sótano Inventado', kind: 'lugar' });
		await venues.setEventVenue(t.db, {
			eventSlug: 'ev-name',
			venueId: other.id,
			privacy: null,
			by: 'otre'
		});
		const [c] = plan.candidates;
		await imp.runVenueImport(
			t.db,
			plan,
			[{ key: c.key, title: c.title, location: c.address, events: ['ev-full', 'ev-name'] }],
			{ actor: 'a' }
		);
		const links = await venues.listEventVenues(t.db);
		expect(links.find((l) => l.eventSlug === 'ev-name')).toMatchObject({
			venueId: other.id,
			updatedBy: 'otre'
		});
	});

	it('va de a tandas', async () => {
		const { imp } = await modules();
		setPosts(
			Array.from({ length: 5 }, (_, i) =>
				post(`ev-${i}`, {
					location_name: `Lugar Inventado ${i}`,
					location: `Calle Falsa ${i + 1}00`
				})
			)
		);
		const events = await imp.importableEvents(undefined);
		const keys = (await imp.loadVenueImportPlan(t.db, events)).candidates.map((c) => c.key);
		/** @param {Awaited<ReturnType<typeof imp.loadVenueImportPlan>>} plan */
		const choices = (plan) =>
			keys.map((key) => {
				const c = plan.candidates.find((x) => x.key === key);
				return {
					key,
					title: c?.title ?? '',
					location: c?.address ?? '',
					events: c ? c.events.map((e) => e.slug) : []
				};
			});
		let total = 0;
		for (let round = 0; round < 5; round++) {
			const plan = await imp.loadVenueImportPlan(t.db, events);
			const r = await imp.runVenueImport(t.db, plan, choices(plan), { actor: 'a', budget: 12 });
			total += r.results.length;
			if (!r.remaining) break;
			expect(r.results).toHaveLength(2);
		}
		expect(total).toBe(5);
	});
});

describe('cómo se crean: no listados (por defecto) o públicos en /amigues', () => {
	it('el formulario: no listado por defecto, la opción para todos y la de cada lugar', async () => {
		const { imp } = await modules();
		/** @param {[string, string][]} entries */
		const form = (entries) => {
			const f = new FormData();
			for (const [k, v] of entries) f.append(k, v);
			return f;
		};
		const base = /** @type {[string, string][]} */ ([
			['crear', 'a'],
			['crear', 'b'],
			['evento:a', 'ev-a'],
			['evento:b', 'ev-b']
		]);
		const listings = (/** @type {[string, string][]} */ extra) =>
			imp.readVenueChoices(form([...base, ...extra])).map((c) => c.listing);
		expect(listings([])).toEqual(['unlisted', 'unlisted']);
		expect(listings([['listado', 'otra-cosa']])).toEqual(['unlisted', 'unlisted']);
		expect(listings([['listado', 'listed']])).toEqual(['listed', 'listed']);
		expect(
			listings([
				['listado', 'listed'],
				['listado:a', ''],
				['listado:b', 'unlisted']
			])
		).toEqual(['listed', 'unlisted']);
		expect(
			listings([
				['listado', 'unlisted'],
				['listado:a', 'listed']
			])
		).toEqual(['listed', 'unlisted']);
	});

	it('no listado: fuera de /amigues, pero el evento lo muestra igual y su página anda', async () => {
		const { imp, venues, profiles } = await modules();
		setPosts([
			post('ev-full', FAKE.full),
			post('ev-name', FAKE.nameOnly),
			post('ev-otro', { location_name: 'Bar Inventado', location: 'Pasaje Falso 45, CABA' })
		]);
		const events = await imp.importableEvents(undefined);
		const before = Object.fromEntries(events.map((e) => [e.slug, shown(e.meta, null)]));
		const plan = await imp.loadVenueImportPlan(t.db, events);
		const galpon = plan.candidates.find((c) => c.title === 'Galpón Inventado');
		const bar = plan.candidates.find((c) => c.title === 'Bar Inventado');
		if (!galpon || !bar) throw new Error('faltan candidatos');
		const { results } = await imp.runVenueImport(
			t.db,
			plan,
			[
				// Sin elegir: no listado.
				{
					key: galpon.key,
					title: galpon.title,
					location: galpon.address,
					events: ['ev-full', 'ev-name']
				},
				{
					key: bar.key,
					title: bar.title,
					location: bar.address,
					events: ['ev-otro'],
					listing: 'listed'
				}
			],
			{ actor: 'a' }
		);
		expect(results).toMatchObject([
			{ action: 'created', title: 'Galpón Inventado', listing: 'unlisted' },
			{ action: 'created', title: 'Bar Inventado', listing: 'listed' }
		]);
		const data = async (/** @type {number | undefined} */ id) =>
			JSON.parse(
				String(
					(await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(id).first())?.data
				)
			);
		expect((await data(results[0].venueId)).unlisted).toBe(true);
		expect(await data(results[1].venueId)).not.toHaveProperty('unlisted');

		// /amigues (todas las listas, también la de lugares): solo el público.
		for (const kind of [undefined, /** @type {const} */ ('lugar')]) {
			const listed = await profiles.listPublicProfiles(t.db, ANON, { kind });
			expect(listed.map((p) => p.object.title)).toEqual(['Bar Inventado']);
		}
		// La página de los dos anda (el evento linkea al lugar con «Nombre + dirección»).
		for (const r of results) {
			const page = await profiles.findPublicProfile(t.db, String(r.slug), ANON);
			expect(page?.object.title, r.title).toBe(r.title);
		}
		// Y cada evento muestra exactamente lo mismo que antes, listado o no.
		for (const e of events) {
			const view = await venues.publicVenueForEvent(t.db, e.slug, ANON);
			expect(view, e.slug).not.toBeNull();
			expect(shown(e.meta, view), e.slug).toEqual(before[e.slug]);
		}
		expect(await venues.publicVenueForEvent(t.db, 'ev-full', ANON)).toMatchObject({
			name: 'Galpón Inventado',
			href: `/amigues/${results[0].slug}`
		});
	});
});

describe('vincular no cambia lo que muestra el sitio', () => {
	it('cada evento muestra lo mismo antes y después, en el nivel elegido', async () => {
		const { imp, venues } = await modules();
		const cases = {
			'ev-full': FAKE.full,
			'ev-name': FAKE.nameOnly,
			'ev-address': FAKE.addressOnly,
			'ev-area': FAKE.area,
			'ev-area-2': { location: 'barrio falso,  ciudad inventada' },
			'ev-map': {
				location_name: 'Plaza Inventada',
				location: 'Parque Falso 10, CABA',
				location_map: 'https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4'
			}
		};
		setPosts(Object.entries(cases).map(([slug, place]) => post(slug, place)));
		const events = await imp.importableEvents(undefined);
		const before = Object.fromEntries(events.map((e) => [e.slug, shown(e.meta, null)]));
		const plan = await imp.loadVenueImportPlan(t.db, events);
		// Todos los candidatos, con un nombre para los que no tienen y los eventos propuestos.
		const choices = plan.candidates.map((c) => ({
			key: c.key,
			title: c.hasName ? c.title : 'Nombre Que Nunca Se Ve',
			location: c.address || c.area,
			events: c.events.filter((e) => e.fits).map((e) => e.slug)
		}));
		await imp.runVenueImport(t.db, plan, choices, { actor: 'a' });
		const linked = await venues.listEventVenues(t.db);
		expect(linked.map((l) => l.eventSlug).sort()).toEqual(Object.keys(cases).sort());
		for (const e of events) {
			const view = await venues.publicVenueForEvent(t.db, e.slug, ANON);
			expect(view, e.slug).not.toBeNull();
			expect(view?.level, e.slug).not.toBe('hidden');
			expect(shown(e.meta, view), e.slug).toEqual(before[e.slug]);
			expect(JSON.stringify(view), e.slug).not.toContain('Nombre Que Nunca Se Ve');
		}
	});

	it('control: un evento que no se propone sí mostraría otra cosa (la comparación lo ve)', async () => {
		const { imp, venues } = await modules();
		setPosts([post('ev-full', FAKE.full), post('ev-other', FAKE.otherName)]);
		const events = await imp.importableEvents(undefined);
		const plan = await imp.loadVenueImportPlan(t.db, events);
		const [c] = plan.candidates;
		expect(c.events.find((e) => e.slug === 'ev-other')?.fits).toBe(false);
		// Le admin lo marca igual (está avisade en la vista previa).
		await imp.runVenueImport(
			t.db,
			plan,
			[
				{
					key: c.key,
					title: 'Galpón Inventado',
					location: c.address,
					events: ['ev-full', 'ev-other']
				}
			],
			{ actor: 'a' }
		);
		const other = /** @type {(typeof events)[number]} */ (
			events.find((e) => e.slug === 'ev-other')
		);
		const view = await venues.publicVenueForEvent(t.db, 'ev-other', ANON);
		expect(shown(other.meta, view)).not.toEqual(shown(other.meta, null));
	});
});

/**
 * Un lugar vinculado manda sobre el «Dónde» del .md (`location`, `location_name`,
 * `location_map`) en todas las salidas públicas, no solo en la página del evento: el calendario
 * .ics, /api/posts, el buscador, el RSS, las listas (inicio, /todo, /calendario), los posts
 * relacionados, la página del lugar y la imagen para compartir. Un evento con lugar en cada
 * nivel de privacidad y con «Dónde» en su .md: nada del .md aparece. D1 de miniflare; eventos y
 * lugares inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';

// La primera prueba compila las rutas (y la ficha real de Yuyo): tarda.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 90_000 });

const LEVELS = /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden']);

const fake = vi.hoisted(() => {
	/** @param {string} slug @param {number} month */
	const event = (slug, month) => ({
		path: `/calendario/${slug}`,
		meta: {
			category: 'calendario',
			layout: 'calendario',
			postID: slug,
			title: `Evento ${slug}`,
			summary: 'Un evento de prueba',
			start: `2099-0${month}-01T20:00-03:00`,
			status: 'abierto',
			published_date: '2026-09-01Z-03:00',
			tags: [],
			// relacionados con la ficha (real, pública) de Yuyo
			authors: ['Yuyo'],
			location: `Calle Md ${slug}`,
			location_name: `Nombre Md ${slug}`,
			location_map: `https://www.openstreetmap.org/node/mapa-md-${slug}`
		}
	});
	return {
		posts: [
			event('lugar-public', 1),
			event('lugar-name', 2),
			event('lugar-address', 3),
			event('lugar-area', 4),
			event('lugar-hidden', 5),
			// sin lugar vinculado: su «Dónde» sí sale (control)
			event('sin-lugar', 6)
		]
	};
});
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki) =>
		wiki ? [] : structuredClone(fake.posts)
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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/**
 * @param {string} perfiles '1' prendido, '0' apagado
 */
function flags(perfiles) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			PERFILES_PUBLICOS_ENABLED: perfiles,
			CUENTAS_ENABLED: '1'
		}
	}));
}

/** Los eventos inventados, en la base (de donde salen los eventos), con su «Dónde». */
const seedEvents = () => seedPosts(t.db, fake.posts);

/** @param {{ path?: string, params?: Record<string, string> }} [o] */
function fakeEvent({ path = '/', params = {} } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	return /** @type {any} */ ({
		url,
		params,
		platform: t.platform,
		locals: { user: undefined, user_token: '' },
		setHeaders: () => {},
		fetch: async () => new Response('{}', { status: 503 }),
		request: new Request(url),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	});
}

/** Un lugar público con todo cargado, vinculado a cada evento con su nivel. */
async function linkVenues() {
	const venue = await makeProfile(t.db, {
		title: 'Galpón Inventado',
		kind: 'lugar',
		data: {
			address: 'Calle Del Lugar 222',
			area: 'Barrio Inventado',
			city: 'Ciudad Inventada',
			lat: -34.61,
			lng: -58.42,
			how_to_get_there: 'Tocar timbre inventado',
			venue_privacy: 'public'
		}
	});
	const { setEventVenue } = await import('$lib/server/amigues/venues.js');
	for (const level of LEVELS) {
		// «Sucede en» es un edge del evento: el evento tiene que estar en la base (si ya se importó,
		// es ese).
		await makeEvent(t.db, `lugar-${level}`);
		await setEventVenue(t.db, {
			eventSlug: `lugar-${level}`,
			venueId: venue.id,
			privacy: level,
			by: 'a'
		});
	}
	return venue;
}

/** Las salidas públicas, como texto. */
async function publicOutputs() {
	/** @type {Record<string, string>} */
	const out = {};
	const text = async (/** @type {Response} */ r) => r.text();
	// las líneas largas del .ics se pliegan: se despliegan para buscar
	out.ics = (
		await text(await (await import('../calendario.ics/+server.js')).GET(fakeEvent()))
	).replace(/\r\n[ \t]/g, '');
	out.posts = await text(await (await import('../../api/posts/+server.js')).GET(fakeEvent()));
	out.search = await text(
		await (await import('../../api/search-index.json/+server.js')).GET(fakeEvent())
	);
	out.rss = await text(await (await import('../../rss/+server.js')).GET());
	out.inicio = JSON.stringify(await (await import('../+page.server.js')).load(fakeEvent()));
	out.todo = JSON.stringify(await (await import('../todo/+page.server.js')).load(fakeEvent()));
	out.calendario = JSON.stringify(await (await import('./+page.server.js')).load(fakeEvent()));
	out.relacionados = JSON.stringify(
		await (
			await import('../amigues/[profile]/+page.server.js')
		).load(fakeEvent({ path: '/amigues/Yuyo', params: { profile: 'Yuyo' } }))
	);
	for (const level of LEVELS) {
		const slug = `lugar-${level}`;
		out[`compartir ${slug}`] = JSON.stringify(
			await (
				await import('./[event]/compartir/+page.server.js')
			).load(fakeEvent({ path: `/calendario/${slug}/compartir`, params: { event: slug } }))
		);
	}
	return out;
}

/** @param {string} slug */
const mdPlace = (slug) => [`Calle Md ${slug}`, `Nombre Md ${slug}`, `mapa-md-${slug}`];

describe('un lugar vinculado manda sobre el «Dónde» del .md', () => {
	it('en ninguna salida pública aparece el «Dónde» del .md de un evento con lugar', async () => {
		flags('1');
		await seedEvents();
		await linkVenues();
		const outputs = await publicOutputs();
		for (const [name, out] of Object.entries(outputs)) {
			for (const level of LEVELS) {
				for (const s of mdPlace(`lugar-${level}`)) expect(out, `${name}: ${s}`).not.toContain(s);
			}
			// "Cómo llegar" solo en "Nombre + dirección", como en la página del evento.
			if (name !== 'compartir lugar-public') expect(out, name).not.toContain('Tocar timbre');
		}
		// El evento sin lugar sigue con su «Dónde» (la prueba no pasa por no mostrar nada).
		for (const name of ['ics', 'posts', 'inicio', 'todo', 'calendario', 'relacionados']) {
			expect(outputs[name], name).toContain('Calle Md sin-lugar');
		}
	});

	it('en su lugar va lo que el nivel deja ver', async () => {
		flags('1');
		await seedEvents();
		await linkVenues();
		const outputs = await publicOutputs();
		/** @type {{ path: string, meta: Record<string, any> }[]} */
		const posts = JSON.parse(outputs.posts);
		/** @param {string} level */
		const meta = (level) => posts.find((p) => p.meta.postID === `lugar-${level}`)?.meta ?? {};
		expect(meta('public')).toMatchObject({
			location_name: 'Galpón Inventado',
			location: 'Calle Del Lugar 222'
		});
		expect(meta('name')).toMatchObject({ location_name: 'Galpón Inventado' });
		expect(JSON.stringify(meta('name'))).not.toContain('Calle Del Lugar');
		expect(meta('address').location).toBe(
			'Calle Del Lugar 222, Barrio Inventado, Ciudad Inventada'
		);
		expect(JSON.stringify(meta('address'))).not.toContain('Galpón');
		expect(meta('area').location).toBe('Barrio Inventado, Ciudad Inventada');
		expect(meta('hidden')).toMatchObject({
			location_name: 'Lugar a confirmar',
			location: 'Lugar a confirmar'
		});
		for (const level of LEVELS) expect(meta(level), level).not.toHaveProperty('location_map');

		// El .ics: el lugar de "Nombre + dirección", sin el link al mapa del .md.
		expect(outputs.ics).toContain('Galpón Inventado · Calle Del Lugar 222');
		// La imagen para compartir recibe el lugar según su nivel.
		expect(JSON.parse(outputs['compartir lugar-name']).venue).toEqual({
			level: 'name',
			name: 'Galpón Inventado',
			href: '/amigues/galpon-inventado'
		});
		expect(JSON.parse(outputs['compartir lugar-hidden']).venue).toEqual({ level: 'hidden' });
	});

	it('la página del lugar lista sus eventos sin el «Dónde» del .md', async () => {
		flags('1');
		await seedEvents();
		const venue = await linkVenues();
		const page = /** @type {any} */ (
			await (
				await import('../amigues/[profile]/+page.server.js')
			).load(fakeEvent({ path: `/amigues/${venue.slug}`, params: { profile: String(venue.slug) } }))
		);
		expect(page.venueEvents.map((/** @type {any} */ p) => p.path).sort()).toEqual([
			'/calendario/lugar-name',
			'/calendario/lugar-public'
		]);
		const text = JSON.stringify(page);
		for (const level of LEVELS) {
			for (const s of mdPlace(`lugar-${level}`)) expect(text, s).not.toContain(s);
		}
	});

	it('con `perfiles_publicos` apagado, todo como antes (el «Dónde» del evento)', async () => {
		flags('0');
		await seedEvents();
		await linkVenues();
		const posts = await (
			await (await import('../../api/posts/+server.js')).GET(fakeEvent())
		).text();
		expect(posts).toContain('Calle Md lugar-hidden');
		const share = await (
			await import('./[event]/compartir/+page.server.js')
		).load(fakeEvent({ params: { event: 'lugar-hidden' } }));
		expect(share).toMatchObject({ venue: null, meta: { location: 'Calle Md lugar-hidden' } });
	});
});

describe('los eventos salen de la base, no de su .md', () => {
	/** Los eventos importados a la base, con un «Dónde» distinto del de su .md. */
	async function importEvents() {
		const { stringify } = await import('yaml');
		const { runImport } = await import('$lib/server/contenido/importer.js');
		const files = fake.posts.map((p) => {
			const slug = String(p.meta.postID);
			const meta = {
				...p.meta,
				location: `Calle Base ${slug}`,
				location_name: `Nombre Base ${slug}`,
				location_map: `https://www.openstreetmap.org/node/mapa-base-${slug}`
			};
			delete (/** @type {any} */ (meta).postID);
			return { legacySlug: slug, raw: `---\n${stringify(meta)}---\n\nTexto.\n`, meta };
		});
		const r = await runImport(t.db, 'calendario', files, { actor: 'admin-inventade' });
		expect(r.remaining).toBe(0);
		expect(r.results.every((x) => x.action === 'created')).toBe(true);
		(await import('$lib/server/contenido/posts.js')).clearContentCache();
	}

	/** @param {string} slug */
	const anyPlace = (slug) => [...mdPlace(slug), `Calle Base ${slug}`, `Nombre Base ${slug}`];

	it('un evento de la base con lugar tampoco muestra su «Dónde» en ninguna salida', async () => {
		flags('1');
		await importEvents();
		await linkVenues();
		const outputs = await publicOutputs();
		for (const level of LEVELS) {
			const slug = `lugar-${level}`;
			outputs[`evento ${slug}`] = JSON.stringify(
				await (
					await import('./[event]/+page.server.js')
				).load(fakeEvent({ path: `/calendario/${slug}`, params: { event: slug } }))
			);
		}
		for (const [name, out] of Object.entries(outputs)) {
			for (const level of LEVELS) {
				for (const s of anyPlace(`lugar-${level}`)) expect(out, `${name}: ${s}`).not.toContain(s);
			}
		}
		// Salen de la base: el evento sin lugar muestra el «Dónde» de la base, no el del .md.
		for (const name of ['posts', 'inicio', 'todo', 'calendario']) {
			expect(outputs[name], name).toContain('Calle Base sin-lugar');
			expect(outputs[name], name).not.toContain('Calle Md sin-lugar');
		}
		expect(JSON.parse(outputs['evento lugar-name']).post.path).toBe('/calendario/lugar-name');
		expect(JSON.parse(outputs['compartir lugar-name']).path).toBe('/calendario/lugar-name');
	});
});

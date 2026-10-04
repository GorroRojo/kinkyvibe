/**
 * /api/search-index.json con la base (D1 de miniflare; datos inventados): lo creado solo en la base
 * (eventos, material y perfiles) entra con los interruptores prendidos, lo oculto, no listado, sin
 * aprobar nunca; los lugares, solo los que se alcanzan navegando (listados, o no listados con link
 * desde un evento visible) y nunca su calle; y el índice recordado se vuelve a armar cuando cambia
 * la base (y solo entonces).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NOW = Date.parse('2031-01-10T12:00:00-03:00');

/** Lo que devuelve `fetchMarkdownPosts` (unos .md de muestra, ya sin ocultos ni no listados). */
const md = vi.hoisted(() => ({
	listed: [
		{
			path: '/calendario/evento-md-inventado',
			meta: {
				postID: 'evento-md-inventado',
				category: 'calendario',
				layout: 'calendario',
				title: 'Evento Md Inventado',
				start: '2031-02-01T20:00:00-03:00',
				tags: [],
				authors: []
			}
		},
		{
			path: '/amigues/Ficha_Importada',
			meta: {
				postID: 'Ficha_Importada',
				category: 'amigues',
				layout: 'amigues',
				title: 'Ficha Importada Del Md',
				tags: [],
				authors: []
			}
		},
		{
			path: '/amigues/Ficha_Sin_Importar',
			meta: {
				postID: 'Ficha_Sin_Importar',
				category: 'amigues',
				layout: 'amigues',
				title: 'Ficha Sin Importar',
				tags: [],
				authors: []
			}
		}
	]
}));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(md.listed)
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
	vi.doUnmock('$app/environment');
	vi.doUnmock('$lib/server/search/siteIndex.js');
	vi.resetModules();
});

/**
 * El endpoint con los interruptores como se pidan, como en producción (`dev` apagado: recuerda el
 * índice), y un contador de cuántas veces se arma.
 * @param {{ contenido?: string, perfiles?: string }} [o]
 */
async function endpoint({ contenido = '1', perfiles = '1' } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			CONTENIDO_DB_ENABLED: contenido,
			PERFILES_PUBLICOS_ENABLED: perfiles,
			ETIQUETAS_DB_ENABLED: '0',
			SERIES_ENABLED: '1'
		}
	}));
	vi.doMock('$app/environment', () => ({ dev: false, building: false, browser: false }));
	const builds = { count: 0 };
	vi.doMock('$lib/server/search/siteIndex.js', async (importOriginal) => {
		const actual = /** @type {typeof import('$lib/server/search/siteIndex.js')} */ (
			await importOriginal()
		);
		return {
			...actual,
			buildSearchIndex: (/** @type {any} */ input) => {
				builds.count++;
				return actual.buildSearchIndex(input);
			}
		};
	});
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	const api = await import('./+server.js');
	return {
		builds,
		/** @returns {Promise<import('$lib/utils/search').RawSearchIndex>} */
		get: async () => (await api.GET(/** @type {any} */ ({ platform: t.platform }))).json()
	};
}

/**
 * @param {'evento' | 'material'} type
 * @param {string} slug
 * @param {Record<string, unknown>} data
 * @param {'public' | 'hidden'} [visibility]
 */
async function dbObject(type, slug, data, visibility = 'public') {
	await saveObject(
		t.db,
		{ type, slug, title: `Inventado ${slug}`, visibility, data },
		{ actor: 'admin-inventade', now: NOW }
	);
}

/** @param {import('$lib/utils/search').RawSearchIndex} index */
const hrefs = (index) => index.docs.map((d) => d.h);

describe('contenido_db', () => {
	it('prendido: eventos y material creados solo en la base, sin lo oculto ni lo no listado', async () => {
		await dbObject('evento', 'evento-base-inventado', {
			start: '2031-03-01T20:00:00-03:00',
			body: 'Texto con una palabra rarísima: zarandaja.'
		});
		await dbObject(
			'evento',
			'evento-base-oculto',
			{ start: '2031-03-02T20:00:00-03:00' },
			'hidden'
		);
		await dbObject('evento', 'evento-base-no-listado', {
			start: '2031-03-03T20:00:00-03:00',
			unlisted: true
		});
		await dbObject('material', 'nota-base-inventada', { published_date: '2030-02-01' });
		await dbObject('material', 'nota-base-oculta', { published_date: '2030-02-02' }, 'hidden');
		const index = await (await endpoint()).get();
		expect(hrefs(index)).toEqual(
			expect.arrayContaining([
				'/calendario/evento-md-inventado',
				'/calendario/evento-base-inventado',
				'/material/nota-base-inventada'
			])
		);
		const json = JSON.stringify(index);
		expect(json).not.toContain('evento-base-oculto');
		expect(json).not.toContain('evento-base-no-listado');
		expect(json).not.toContain('nota-base-oculta');
		// El cuerpo guardado en la base.
		expect(index.docs.find((d) => d.h === '/calendario/evento-base-inventado')?.b).toContain(
			'zarandaja'
		);
	});

	it('apagado: solo los .md', async () => {
		await dbObject('evento', 'evento-base-inventado', { start: '2031-03-01T20:00:00-03:00' });
		const index = await (await endpoint({ contenido: '0' })).get();
		expect(hrefs(index)).toContain('/calendario/evento-md-inventado');
		expect(JSON.stringify(index)).not.toContain('evento-base-inventado');
	});

	it('el índice recordado se vuelve a armar cuando cambia la base, y solo entonces', async () => {
		const api = await endpoint();
		const first = await api.get();
		expect(api.builds.count).toBe(1);
		expect(await api.get()).toEqual(first);
		expect(api.builds.count).toBe(1);

		await dbObject('evento', 'evento-nuevo-inventado', { start: '2031-04-01T20:00:00-03:00' });
		expect(hrefs(await api.get())).toContain('/calendario/evento-nuevo-inventado');
		expect(api.builds.count).toBe(2);

		// Un perfil nuevo también (otra marca).
		await makeProfile(t.db, { title: 'Perfil Nuevo Inventado', slug: 'perfil-nuevo-inventado' });
		expect(hrefs(await api.get())).toContain('/amigues/perfil-nuevo-inventado');
		expect(api.builds.count).toBe(3);
		await api.get();
		expect(api.builds.count).toBe(3);
	});
});

describe('perfiles_publicos', () => {
	async function seedProfiles() {
		const imported = await makeProfile(t.db, {
			title: 'Ficha Importada Desde La Base',
			slug: 'ficha-importada',
			visibility: 'hidden'
		});
		await t.db
			.prepare(
				`INSERT INTO profile_sources (profile_id, legacy_slug, source_hash, imported_version,
					suggested_kind, imported_at, updated_at) VALUES (?1, ?2, ?3, 1, 'persona', ?4, ?4)`
			)
			.bind(imported.id, 'Ficha_Importada', 'f'.repeat(64), NOW)
			.run();
		await makeProfile(t.db, {
			title: 'Persona Visible Inventada',
			slug: 'persona-visible',
			data: { bio: 'Hace talleres inventados', email: 'persona@example.invalid' }
		});
		await makeProfile(t.db, {
			title: 'Persona Oculta',
			slug: 'persona-oculta',
			visibility: 'hidden'
		});
		await makeProfile(t.db, {
			title: 'Persona Solo Cuentas',
			slug: 'persona-cuentas',
			visibility: 'members'
		});
		await makeProfile(t.db, {
			title: 'Persona Sin Aprobar',
			slug: 'persona-sin-aprobar',
			approved: false
		});
		await makeProfile(t.db, {
			title: 'Persona No Listada',
			slug: 'persona-no-listada',
			data: { unlisted: true }
		});
		await makeProfile(t.db, {
			title: 'Lugar Listado Inventado',
			slug: 'lugar-listado',
			kind: 'lugar',
			data: { address: 'Avenida Inventada 4321', venue_privacy: 'public' }
		});
		await makeProfile(t.db, {
			title: 'Lugar Desde Evento',
			slug: 'lugar-desde-evento',
			kind: 'lugar',
			data: { address: 'Pasaje Inventado 99', venue_privacy: 'public', unlisted: true }
		});
	}

	// Antes: «nunca lugares». Ahora la regla de gorrite: lo que ya se alcanza navegando se puede
	// encontrar buscando. Un lugar listado está en /amigues, así que entra (sin su calle); uno no
	// listado sin ningún link que lleve a él, no.
	it('prendido: los perfiles que lista /amigues (también lugares listados), nunca ocultos, sin aprobar ni no listados', async () => {
		await seedProfiles();
		const index = await (await endpoint()).get();
		const amigues = index.docs.filter((d) => d.c === 'amigues').map((d) => d.h);
		expect(amigues.sort()).toEqual([
			'/amigues/Ficha_Sin_Importar',
			'/amigues/lugar-listado',
			'/amigues/persona-visible'
		]);
		const json = JSON.stringify(index);
		for (const text of [
			'Ficha Importada',
			'Persona Oculta',
			'Persona Solo Cuentas',
			'Persona Sin Aprobar',
			'Persona No Listada',
			'Lugar Desde Evento',
			'lugar-desde-evento',
			'Avenida Inventada',
			'Pasaje Inventado',
			'persona@example.invalid'
		]) {
			expect(json, text).not.toContain(text);
		}
	});

	it('un lugar no listado entra solo si lo linkea un evento visible, y nunca su calle', async () => {
		/** @param {string} slug @param {Record<string, unknown>} [data] @param {Partial<{ visibility: 'public' | 'hidden' | 'members', approved: boolean }>} [o] */
		const venue = (slug, data = {}, o = {}) =>
			makeProfile(t.db, {
				title: `Lugar ${slug}`,
				slug,
				kind: 'lugar',
				...o,
				data: {
					address: `Calle Secreta ${slug} 1`,
					area: `Barrio ${slug}`,
					venue_privacy: 'public',
					unlisted: true,
					...data
				}
			});
		/** @param {string} eventSlug @param {{ id: number }} v @param {any} [privacy] */
		const link = async (eventSlug, v, privacy = null) => {
			// «Sucede en» es un edge del evento: el evento tiene que estar en la base.
			await makeEvent(t.db, eventSlug);
			return setEventVenue(t.db, { eventSlug, venueId: v.id, privacy, by: 'admin-inventade' });
		};
		// Un evento de la base no listado (su página no se alcanza navegando).
		await dbObject('evento', 'evento-no-listado', {
			start: '2031-03-03T20:00:00-03:00',
			unlisted: true
		});
		// Linkeado desde un evento visible, «Nombre + dirección»: entra.
		await link('evento-md-inventado', await venue('por-evento'));
		const api = await endpoint();
		let index = await api.get();
		expect(hrefs(index)).toContain('/amigues/por-evento');
		expect(index.docs.find((d) => d.h === '/amigues/por-evento')).toMatchObject({
			t: 'Lugar por-evento',
			b: 'Barrio por-evento'
		});

		// Cambiar el vínculo vuelve a armar el índice: el evento pasa a otro lugar, en «Sólo dirección
		// parcial». El primero ya no tiene ningún link que lleve a él, y el nuevo tampoco (en ese
		// nivel la página del evento no muestra el nombre ni el link).
		const builds = api.builds.count;
		await link('evento-md-inventado', await venue('nivel-barrio'), 'area');
		index = await api.get();
		expect(api.builds.count).toBe(builds + 1);
		expect(JSON.stringify(index)).not.toContain('por-evento');
		expect(JSON.stringify(index)).not.toContain('nivel-barrio');

		// Ningún otro camino: solo desde un evento no listado, oculto para el público, sin aprobar,
		// o con el evento en «Nada» o «Sólo dirección».
		await resetDB(t.db);
		await dbObject('evento', 'evento-no-listado', {
			start: '2031-03-03T20:00:00-03:00',
			unlisted: true
		});
		await dbObject('evento', 'evento-visible', { start: '2031-03-04T20:00:00-03:00' });
		await dbObject('evento', 'evento-visible-2', { start: '2031-03-05T20:00:00-03:00' });
		await link('evento-no-listado', await venue('desde-no-listado'));
		await link('evento-md-inventado', await venue('oculto', {}, { visibility: 'hidden' }));
		await link('evento-visible', await venue('sin-aprobar', {}, { approved: false }));
		await link('evento-visible-2', await venue('evento-nada'), 'hidden');
		index = await (await endpoint()).get();
		const json = JSON.stringify(index);
		for (const slug of ['desde-no-listado', 'oculto', 'sin-aprobar', 'evento-nada']) {
			expect(json, slug).not.toContain(`Lugar ${slug}`);
			expect(json, slug).not.toContain(`/amigues/${slug}`);
		}
		expect(json).not.toContain('Calle Secreta');
	});

	it('un lugar no listado linkeado en «Sólo dirección» no entra (su nombre no se muestra)', async () => {
		await dbObject('evento', 'evento-visible', { start: '2031-03-04T20:00:00-03:00' });
		const v = await makeProfile(t.db, {
			title: 'Casa Particular Inventada',
			slug: 'casa-particular',
			kind: 'lugar',
			data: { address: 'Calle De La Casa 5', venue_privacy: 'public', unlisted: true }
		});
		await setEventVenue(t.db, {
			eventSlug: 'evento-visible',
			venueId: v.id,
			privacy: 'address',
			by: 'admin-inventade',
			now: NOW
		});
		const json = JSON.stringify(await (await endpoint()).get());
		expect(json).not.toContain('Casa Particular');
		expect(json).not.toContain('casa-particular');
		expect(json).not.toContain('Calle De La Casa');
	});

	it('apagado: las fichas .md, ningún perfil de la base', async () => {
		await seedProfiles();
		const index = await (await endpoint({ perfiles: '0' })).get();
		const amigues = index.docs.filter((d) => d.c === 'amigues').map((d) => d.h);
		expect(amigues).toEqual(['/amigues/Ficha_Importada', '/amigues/Ficha_Sin_Importar']);
		expect(JSON.stringify(index)).not.toContain('Persona Visible');
	});
});

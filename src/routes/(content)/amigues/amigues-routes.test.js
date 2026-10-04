/**
 * /amigues y los lugares en las páginas, con el interruptor `perfiles_publicos` apagado (todo como
 * antes) y prendido (los perfiles de la base, con las mismas direcciones), "Es mi perfil", el
 * "sucede en" de los eventos y la prueba de filtraciones: un lugar con dirección oculta no
 * aparece en el calendario, el sitemap, el RSS, el .ics, el JSON de posts, el buscador, las
 * páginas ni sus datos. D1 de miniflare; los lugares y eventos son inventados (las fichas de
 * amigues son las reales, públicas a propósito).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { importAmigues, mdToProfile } from '$lib/server/amigues/importer.js';
import {
	addManager,
	makeAccount,
	makeProfile,
	readAmigueFiles
} from '$lib/server/amigues/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

// Compilar los ~600 posts reales tarda mucho: las listas usan unos posts de muestra (un evento
// inventado y una ficha). Las páginas de amigues compilan solo la ficha que abren.
const fake = vi.hoisted(() => ({
	posts: [
		{
			path: '/calendario/fiesta-inventada',
			meta: {
				category: 'calendario',
				layout: 'calendario',
				postID: 'fiesta-inventada',
				title: 'Fiesta Inventada',
				summary: 'Una fiesta de prueba',
				start: '2099-01-01T20:00-03:00',
				status: 'abierto',
				published_date: '2026-09-01Z-03:00',
				tags: [],
				authors: []
			}
		},
		{
			path: '/calendario/taller-inventado',
			meta: {
				category: 'calendario',
				layout: 'calendario',
				postID: 'taller-inventado',
				title: 'Taller Inventado',
				summary: 'Un taller de prueba',
				start: '2099-02-01T20:00-03:00',
				status: 'abierto',
				tags: [],
				authors: []
			}
		},
		{
			path: '/amigues/Yuyo',
			meta: {
				category: 'amigues',
				layout: 'amigues',
				postID: 'Yuyo',
				title: 'Yuyo',
				summary: 'Ficha de muestra',
				tags: [],
				authors: ['Yuyo']
			}
		}
	]
}));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki) =>
		wiki ? [] : structuredClone(fake.posts)
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ legacySlug: string, raw: string }[]} */
let files;
beforeAll(async () => {
	t = await createTestDB();
	files = await readAmigueFiles();
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

/** Las rutas con los interruptores como se pidan ('1' prendido, '0' apagado). */
async function modules({ perfiles = '1', cuentas = '1' } = {}) {
	vi.resetModules();
	// Los eventos de muestra salen de la base (las fichas, de los .md).
	await seedPosts(t.db, fake.posts);
	vi.doMock('$env/dynamic/private', () => ({
		env: { PERFILES_PUBLICOS_ENABLED: perfiles, CUENTAS_ENABLED: cuentas }
	}));
	return {
		list: await import('./+page.server.js'),
		page: await import('./[profile]/+page.server.js'),
		event: await import('../calendario/[event]/+page.server.js')
	};
}

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, member?: { id: string, email: string }, admin?: boolean }} [o]
 */
function fakeEvent({ path = '/amigues', params = {}, form, member } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch: async () => new Response('{}', { status: 503 }),
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		}),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return event;
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

/** @param {string} slug */
const profilePage = async (/** @type {any} */ m, slug, o = {}) =>
	/** @type {any} */ (
		await m.page.load(fakeEvent({ path: `/amigues/${slug}`, params: { profile: slug }, ...o }))
	);

describe('interruptor apagado: como siempre', () => {
	it('/amigues y las fichas salen de los .md, aunque la base tenga perfiles', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules({ perfiles: '0' });
		const list = /** @type {any} */ (await m.list.load(fakeEvent()));
		expect(list.kinds).toBeNull();
		expect(list.posts.map((/** @type {any} */ p) => p.path)).toEqual(['/amigues/Yuyo']);
		const page = await profilePage(m, 'Yuyo');
		expect(page.mode).toBe('md');
		expect(page.meta.title).toBe('Yuyo');
		// Los eventos no muestran lugar.
		const v = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const { setEventVenue } = await import('$lib/server/amigues/venues.js');
		await setEventVenue(t.db, {
			eventSlug: 'fiesta-inventada',
			venueId: v.id,
			privacy: 'public',
			by: 'a'
		});
		const ev = /** @type {any} */ (
			await m.event.load(
				fakeEvent({ path: '/calendario/fiesta-inventada', params: { event: 'fiesta-inventada' } })
			)
		);
		expect(ev.venue).toBeNull();
	});

	it('"Es mi perfil" no existe', async () => {
		const m = await modules({ perfiles: '0' });
		const me = await makeAccount(t.db, 'persona-prueba');
		const r = await thrown(() =>
			m.page.actions.esMiPerfil(fakeEvent({ params: { profile: 'Yuyo' }, form: {}, member: me }))
		);
		expect(r?.status).toBe(404);
	});
});

describe('interruptor prendido', () => {
	it('sin importar todavía: las fichas .md siguen saliendo de su archivo', async () => {
		const m = await modules();
		const list = /** @type {any} */ (await m.list.load(fakeEvent()));
		expect(list.kinds).toBeTruthy();
		expect(list.posts.map((/** @type {any} */ p) => p.path)).toEqual(['/amigues/Yuyo']);
		expect((await profilePage(m, 'Yuyo')).mode).toBe('md');
	});

	it('importadas: mismas direcciones, desde la base, sin duplicar las fichas', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules();
		const list = /** @type {any} */ (await m.list.load(fakeEvent()));
		const paths = list.posts.map((/** @type {any} */ p) => p.path).sort();
		const expected = files
			.map((f) => f.legacySlug)
			.filter((s) => !s.startsWith('_') && s !== 'lacerdapunk') // no listada en su .md
			.map((s) => `/amigues/${s}`)
			.sort();
		expect(paths).toEqual(expected);
		const gorrite = list.posts.find((/** @type {any} */ p) => p.path === '/amigues/Gorro_Rojo');
		expect(gorrite.meta).toMatchObject({ title: 'gorrite', category: 'amigues', kind: 'persona' });
		expect(gorrite.meta.featured).toMatch(/\.webp/);
		expect(JSON.stringify(list)).not.toMatch(/gorro\.rojo@gmail|created_by|admin-de-prueba/);

		const page = await profilePage(m, 'Gorro_Rojo');
		expect(page).toMatchObject({ mode: 'db', canonical: '/amigues/Gorro_Rojo' });
		expect(page.profile).toMatchObject({
			title: 'gorrite',
			slug: 'Gorro_Rojo',
			pronounLabel: 'eso/elle'
		});
		expect(page.bodyHtml).toContain('gorrite');
		expect(JSON.stringify(page)).not.toContain('admin-de-prueba');
		// El contacto de la ficha (mail y teléfono) se muestra: es público a propósito (decisión
		// de gorrite, docs/decisiones/0023-contacto-publico.md). El cumpleaños y la identidad de
		// género no viajan a la página (la página vieja tampoco los mostraba).
		const luzi = await profilePage(m, 'Luzi');
		expect(luzi.profile.title).toBe('Luzi');
		const luziMeta = mdToProfile(
			'Luzi',
			files.find((f) => f.legacySlug === 'Luzi')?.raw ?? ''
		).meta;
		expect(
			luziMeta.email && luziMeta.tel && luziMeta.bday && luziMeta.gender_identity
		).toBeTruthy();
		expect(luzi.profile).toMatchObject({ email: luziMeta.email, tel: luziMeta.tel });
		expect(JSON.stringify(luzi)).not.toMatch(/1993-12-22|No binarie/);
		for (const key of ['bday', 'gender_identity']) expect(luzi.profile).not.toHaveProperty(key);
		// La dirección nueva del objeto también lleva, con la vieja como canónica.
		expect((await profilePage(m, 'gorro-rojo')).canonical).toBe('/amigues/Gorro_Rojo');
		// La no listada se abre con su link.
		expect((await profilePage(m, 'lacerdapunk')).profile.title).toBe('Kono/lacerdapunk');
	});

	it('los textos reales con imágenes de mdsvex se ven con sus imágenes', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules();
		const sole = await profilePage(m, 'soleropebunny');
		expect(sole.bodyHtml).toContain('href="/material/con-la-soga-al-cuello"');
		expect(sole.bodyHtml).toMatch(/<img[^>]*\ssrc="[^"]+5\.webp/);
		expect(sole.bodyHtml).not.toContain('<script');
		const drux = await profilePage(m, 'Drux');
		expect(
			(drux.bodyHtml.match(/<img[^>]*\ssrc="[^"]+\.webp/g) ?? []).length
		).toBeGreaterThanOrEqual(20);
		expect(drux.bodyHtml).not.toMatch(/\{foto\d+\}/);
	});

	it('oculta o borrada en la base: 404, aunque el .md siga en el repo', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules();
		const row = await t.db
			.prepare(
				"SELECT o.id, o.version FROM objects o JOIN profile_sources s ON s.profile_id = o.id WHERE s.legacy_slug = 'Yuyo'"
			)
			.first();
		await saveObject(
			t.db,
			{ id: Number(row?.id), type: 'perfil', version: Number(row?.version), visibility: 'hidden' },
			{ actor: 'admin-de-prueba' }
		);
		expect((await thrown(() => profilePage(m, 'Yuyo')))?.status).toBe(404);
		const list = /** @type {any} */ (await m.list.load(fakeEvent()));
		expect(list.posts.map((/** @type {any} */ p) => p.path)).not.toContain('/amigues/Yuyo');
	});

	it('un perfil nuevo sin aprobar: 404 para el público; su dueñe lo ve con el aviso', async () => {
		const m = await modules();
		const owner = await makeAccount(t.db, 'duene');
		const p = await makeProfile(t.db, {
			title: 'Perfil Sin Aprobar',
			approved: false,
			actor: `cuenta:${owner.id}`
		});
		await addManager(t.db, p.id, owner.id);
		expect((await thrown(() => profilePage(m, p.slug)))?.status).toBe(404);
		const mine = await profilePage(m, p.slug, { member: owner });
		expect(mine.badges.pending).toBe(true);
		expect(mine.claim).toEqual({ state: 'manager' });
	});

	it('"Es mi perfil": botón para cuentas con permiso, pedido guardado, sin revelar otros', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules();
		expect((await profilePage(m, 'Yuyo')).claim).toBeNull();
		const without = await makeAccount(t.db, 'sin-permiso', { profiles: false });
		expect((await profilePage(m, 'Yuyo', { member: without })).claim).toBeNull();
		expect(
			(
				await thrown(() =>
					m.page.actions.esMiPerfil(
						fakeEvent({ params: { profile: 'Yuyo' }, form: {}, member: without })
					)
				)
			)?.status
		).toBe(404);

		const me = await makeAccount(t.db, 'persona-prueba');
		const other = await makeAccount(t.db, 'otra-persona');
		expect((await profilePage(m, 'Yuyo', { member: me })).claim).toEqual({ state: 'none' });
		const r1 = /** @type {any} */ (
			await m.page.actions.esMiPerfil(
				fakeEvent({ params: { profile: 'Yuyo' }, form: { mensaje: 'Soy yo' }, member: other })
			)
		);
		const r2 = /** @type {any} */ (
			await m.page.actions.esMiPerfil(
				fakeEvent({ params: { profile: 'Yuyo' }, form: {}, member: me })
			)
		);
		expect(r2).toEqual(r1);
		expect(r2.claim.ok).toBe(true);
		expect((await profilePage(m, 'Yuyo', { member: me })).claim).toEqual({ state: 'pending' });
		const n = await t.db
			.prepare("SELECT COUNT(*) AS n FROM profile_claims WHERE status = 'pending'")
			.first();
		expect(n?.n).toBe(2);
	});

	it('un perfil que no existe: 404', async () => {
		const m = await modules();
		expect((await thrown(() => profilePage(m, 'no-existe-inventado')))?.status).toBe(404);
	});
});

describe('lugares en las páginas', () => {
	it('el evento muestra su lugar según la privacidad; la página del lugar, sus eventos', async () => {
		const m = await modules();
		const v = await makeProfile(t.db, {
			title: 'Galpón Inventado',
			kind: 'lugar',
			data: { address: 'Calle Falsa 742', area: 'Barrio Inventado', venue_privacy: 'name' }
		});
		const { setEventVenue } = await import('$lib/server/amigues/venues.js');
		await setEventVenue(t.db, {
			eventSlug: 'fiesta-inventada',
			venueId: v.id,
			privacy: null,
			by: 'a'
		});
		await setEventVenue(t.db, {
			eventSlug: 'taller-inventado',
			venueId: v.id,
			privacy: 'hidden',
			by: 'a'
		});
		const ev = /** @type {any} */ (
			await m.event.load(
				fakeEvent({ path: '/calendario/fiesta-inventada', params: { event: 'fiesta-inventada' } })
			)
		);
		expect(ev.venue).toEqual({
			level: 'name',
			name: 'Galpón Inventado',
			href: '/amigues/galpon-inventado'
		});
		const page = await profilePage(m, 'galpon-inventado');
		expect(page.profile.kind).toBe('lugar');
		expect(page.location).toEqual({
			level: 'name',
			name: 'Galpón Inventado',
			href: '/amigues/galpon-inventado'
		});
		// Lista el evento que muestra el lugar, no el que lo oculta.
		expect(page.venueEvents.map((/** @type {any} */ p) => p.path)).toEqual([
			'/calendario/fiesta-inventada'
		]);
	});
});

describe('un lugar no listado (como nacen los importados de eventos)', () => {
	it('su evento lo muestra según la privacidad, pero no está en /amigues ni en otras listas', async () => {
		const m = await modules();
		const NAME = 'Galpón No Listado Inventado';
		const v = await makeProfile(t.db, {
			title: NAME,
			kind: 'lugar',
			data: { address: 'Calle Falsa 742', venue_privacy: 'public', unlisted: true }
		});
		const href = `/amigues/${v.slug}`;
		const { setEventVenue } = await import('$lib/server/amigues/venues.js');
		await setEventVenue(t.db, {
			eventSlug: 'fiesta-inventada',
			venueId: v.id,
			privacy: null,
			by: 'a'
		});
		const ev = /** @type {any} */ (
			await m.event.load(
				fakeEvent({ path: '/calendario/fiesta-inventada', params: { event: 'fiesta-inventada' } })
			)
		);
		// Lo mismo que mostraría un lugar listado: nombre (con link), dirección.
		expect(ev.venue).toMatchObject({ level: 'public', name: NAME, href });
		expect(JSON.stringify(ev.venue)).toContain('Calle Falsa 742');
		// Su página anda (por el link del evento) y lista el evento.
		const page = await profilePage(m, v.slug);
		expect(page.profile.title).toBe(NAME);
		expect(page.venueEvents.map((/** @type {any} */ p) => p.path)).toEqual([
			'/calendario/fiesta-inventada'
		]);
		// Pero no está en /amigues (ni para alguien con cuenta).
		const member = await makeAccount(t.db, 'curiosa');
		for (const o of [{}, { member }]) {
			const list = /** @type {any} */ (await m.list.load(fakeEvent(o)));
			const paths = list.posts.map((/** @type {any} */ p) => p.path);
			expect(paths).not.toContain(href);
			expect(JSON.stringify(list)).not.toContain(NAME);
		}
		// Ni en el sitemap, el RSS ni el JSON de posts (el evento sí puede llevar el nombre del
		// lugar, como lo muestra su página; lo que no tiene que estar es el perfil).
		const text = async (/** @type {Response} */ r) => r.text();
		/** @type {Record<string, string>} */
		const outputs = {
			sitemap: await text(
				await (await import('../sitemap.xml/+server.js')).GET(/** @type {any} */ ({}))
			),
			rss: await text(await (await import('../../rss/+server.js')).GET()),
			posts: await text(
				await (await import('../../api/posts/+server.js')).GET(/** @type {any} */ ({}))
			)
		};
		for (const [name, out] of Object.entries(outputs)) {
			expect(out, name).not.toContain(href);
			expect(out, name).not.toContain(v.slug);
		}
		// El buscador sí (antes no): la página del evento linkea el lugar, así que se alcanza
		// navegando, y la regla de gorrite es que lo que se alcanza navegando se puede encontrar
		// buscando. Con su nombre, nunca su calle; y deja de estar si el evento ya no lo linkea.
		const searchIndex = async () =>
			text(
				await (
					await import('../../api/search-index.json/+server.js')
				).GET(/** @type {any} */ ({ platform: t.platform }))
			);
		const search = await searchIndex();
		expect(search).toContain(href);
		expect(search).toContain(NAME);
		expect(search).not.toContain('Calle Falsa 742');
		await setEventVenue(t.db, {
			eventSlug: 'fiesta-inventada',
			venueId: v.id,
			privacy: 'area',
			by: 'a'
		});
		const unlinked = await searchIndex();
		expect(unlinked).not.toContain(href);
		expect(unlinked).not.toContain(NAME);
	});
});

describe('prueba de filtraciones: un lugar con la dirección oculta', () => {
	const SECRET = 'Calle Secretísima 1234';
	const AREA = 'Barrio Reservado';
	const NAME = 'Sótano Inventado';

	it('no aparece en ninguna salida pública', async () => {
		const m = await modules();
		const hidden = await makeProfile(t.db, {
			title: NAME,
			kind: 'lugar',
			data: {
				address: SECRET,
				area: AREA,
				city: 'Ciudad Inventada',
				lat: -34.61,
				lng: -58.42,
				how_to_get_there: 'Tocar timbre 3B',
				venue_privacy: 'hidden'
			}
		});
		const { setEventVenue, buyerLocation } = await import('$lib/server/amigues/venues.js');
		await setEventVenue(t.db, {
			eventSlug: 'fiesta-inventada',
			venueId: hidden.id,
			privacy: null,
			by: 'a'
		});
		// Otro lugar público cuyo evento oculta la dirección (la del evento manda).
		const open = await makeProfile(t.db, {
			title: 'Bar Abierto Inventado',
			kind: 'lugar',
			data: { address: 'Avenida Pública 99', area: 'Barrio Público', venue_privacy: 'public' }
		});
		await setEventVenue(t.db, {
			eventSlug: 'taller-inventado',
			venueId: open.id,
			privacy: 'hidden',
			by: 'a'
		});

		/** @type {Record<string, string>} */
		const outputs = {};
		const text = async (/** @type {Response} */ r) => r.text();
		outputs.sitemap = await text(
			await (await import('../sitemap.xml/+server.js')).GET(/** @type {any} */ ({}))
		);
		outputs.rss = await text(await (await import('../../rss/+server.js')).GET());
		outputs.ics = await text(
			await (await import('../calendario.ics/+server.js')).GET(/** @type {any} */ ({}))
		);
		outputs.posts = await text(
			await (await import('../../api/posts/+server.js')).GET(/** @type {any} */ ({}))
		);
		// Con la base (antes sin `platform`, así que el buscador no leía ningún lugar).
		outputs.search = await text(
			await (
				await import('../../api/search-index.json/+server.js')
			).GET(/** @type {any} */ ({ platform: t.platform }))
		);
		for (const slug of ['fiesta-inventada', 'taller-inventado']) {
			outputs[`evento ${slug}`] = JSON.stringify(
				await m.event.load(fakeEvent({ path: `/calendario/${slug}`, params: { event: slug } }))
			);
		}
		outputs.amigues = JSON.stringify(await m.list.load(fakeEvent()));
		outputs.lugarOculto = JSON.stringify(await profilePage(m, hidden.slug));
		outputs.lugarAbierto = JSON.stringify(await profilePage(m, open.slug));
		// También para alguien con cuenta.
		const member = await makeAccount(t.db, 'curiosa');
		outputs.lugarConCuenta = JSON.stringify(await profilePage(m, hidden.slug, { member }));

		for (const [name, out] of Object.entries(outputs)) {
			expect(out, name).not.toContain(SECRET);
			expect(out, name).not.toContain(AREA);
			expect(out, name).not.toContain('Tocar timbre');
			expect(out, name).not.toContain('-34.61');
			// El lugar es un perfil público (su nombre puede estar en /amigues y en el buscador, que
			// lleva lo que se alcanza navegando); lo que no puede aparecer es en qué evento está ni su
			// dirección.
			if (!name.startsWith('lugar') && name !== 'amigues' && name !== 'search') {
				expect(out, name).not.toContain(NAME);
			}
			if (name !== 'lugarAbierto') expect(out, name).not.toContain('Avenida Pública 99');
		}
		// En el buscador, el nombre solo en la entrada del lugar mismo (nunca junto a un evento).
		/** @type {import('$lib/utils/search').RawSearchIndex} */
		const index = JSON.parse(outputs.search);
		const withName = index.docs.filter((d) => JSON.stringify(d).includes(NAME));
		expect(withName.map((d) => d.h)).toEqual([`/amigues/${hidden.slug}`]);
		// La página del lugar no lista el evento que lo oculta.
		expect(JSON.parse(outputs.lugarOculto).venueEvents).toEqual([]);
		expect(JSON.parse(outputs.lugarAbierto).venueEvents).toEqual([]);
		// Quien compró sí recibe la dirección completa.
		expect((await buyerLocation(t.db, 'fiesta-inventada'))?.location).toContain(SECRET);
		expect((await buyerLocation(t.db, 'taller-inventado'))?.location).toContain(
			'Avenida Pública 99'
		);
	});
});

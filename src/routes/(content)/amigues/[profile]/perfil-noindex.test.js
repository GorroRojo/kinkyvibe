/**
 * «No aparecer en buscadores» (decisión de gorrite: los perfiles de persona aparecen en Google por
 * defecto; quienes los gestionan pueden sacarlos sin esconderlos del sitio). Con la casilla, la
 * página de un perfil de persona lleva `noindex` (también la cabecera), no va al sitemap ni a
 * IndexNow, y se sigue viendo igual en el sitio y en /amigues. Solo personas; apagado por defecto.
 * D1 de miniflare; datos inventados. Ver docs/amigues.md («Buscadores»).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { addManager, makeAccount, makeProfile } from '$lib/server/amigues/testing.js';
import { createProfile, updateProfile } from '$lib/server/cuentas/perfiles.js';
import { getObject } from '$lib/server/objects/read.js';
import { saveObject } from '$lib/server/objects/save.js';
import { ObjectError } from '$lib/server/objects/index.js';
import { indexNowUrls, publicPaths } from '$lib/server/seo/indexnow.js';

// La primera prueba compila las rutas: tarda.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// Sin las publicaciones .md (las listas salen de la base).
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async () => []
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

/** Las rutas, de nuevo en cada prueba (las listas se recuerdan por isolate). */
async function modules() {
	vi.resetModules();
	await seedPosts(t.db, []);
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	return {
		list: await import('../+page.server.js'),
		page: await import('./+page.server.js'),
		sitemap: await import('../../sitemap.xml/+server.js'),
		posts: await import('$lib/server/contenido/posts.js')
	};
}

/**
 * La página de un perfil como la pide alguien (sin sesión, salvo `member`), con las cabeceras que
 * puso.
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {string} slug
 * @param {{ id: string, email: string }} [member]
 */
async function profilePage(m, slug, member) {
	/** @type {Record<string, string>} */
	const headers = {};
	const url = new URL(`/amigues/${slug}`, 'https://kinkyvibe.ar');
	const data = /** @type {any} */ (
		await m.page.load(
			/** @type {any} */ ({
				url,
				params: { profile: slug },
				platform: t.platform,
				locals: { user: undefined, user_token: '', member },
				setHeaders: (/** @type {Record<string, string>} */ h) => {
					for (const [k, v] of Object.entries(h)) {
						if (k in headers) throw new Error(`«${k}» dos veces`);
						headers[k] = v;
					}
				},
				getClientAddress: () => '203.0.113.7',
				fetch: async () => new Response('{}', { status: 503 }),
				request: new Request(url),
				cookies: { get: () => undefined, set: () => {}, delete: () => {} }
			})
		)
	);
	return { data, headers };
}

/** /amigues sin sesión: las direcciones que lista. @param {Awaited<ReturnType<typeof modules>>} m */
async function listed(m) {
	const url = new URL('/amigues', 'https://kinkyvibe.ar');
	const list = /** @type {any} */ (
		await m.list.load(
			/** @type {any} */ ({
				url,
				params: {},
				platform: t.platform,
				locals: { user: undefined, user_token: '' },
				setHeaders: () => {},
				request: new Request(url),
				cookies: { get: () => undefined, set: () => {}, delete: () => {} }
			})
		)
	);
	return list.posts.map((/** @type {any} */ p) => p.path);
}

describe('«No aparecer en buscadores» en la página del perfil', () => {
	it('prendido: noindex (meta y cabecera), fuera del sitemap y de IndexNow, igual en el sitio', async () => {
		const quiet = await makeProfile(t.db, {
			title: 'Persona Sin Buscadores',
			slug: 'persona-sin-buscadores',
			data: { bio: 'Una bio inventada.', noindex: true }
		});
		await makeProfile(t.db, {
			title: 'Persona Con Buscadores',
			slug: 'persona-con-buscadores',
			data: { bio: 'Otra bio inventada.' }
		});
		const m = await modules();

		// La página anda para quien no tiene sesión y muestra lo mismo que siempre.
		const off = await profilePage(m, 'persona-sin-buscadores');
		expect(off.data.noindex).toBe(true);
		expect(off.data.profile).toMatchObject({
			title: 'Persona Sin Buscadores',
			bio: 'Una bio inventada.',
			noindex: true
		});
		expect(off.headers['x-robots-tag']).toBe('noindex');
		// El aviso es para quienes lo gestionan y les admins, no para cualquiera.
		expect(off.data.badges.noindex).toBe(false);

		// Sin la casilla: ni noindex ni cabecera (lo de siempre).
		const on = await profilePage(m, 'persona-con-buscadores');
		expect(on.data.noindex).toBe(false);
		expect(on.headers).not.toHaveProperty('x-robots-tag');

		// Los dos siguen en /amigues.
		expect(await listed(m)).toEqual(
			expect.arrayContaining(['/amigues/persona-sin-buscadores', '/amigues/persona-con-buscadores'])
		);

		// El sitemap no lo lista; al otro, sí.
		const xml = await (await m.sitemap.GET(/** @type {any} */ ({ platform: t.platform }))).text();
		expect(xml).toContain('/amigues/persona-con-buscadores</loc>');
		expect(xml).not.toContain('persona-sin-buscadores');

		// IndexNow: aunque los dos acaben de cambiar, solo se avisa el que aparece en buscadores.
		const posts = await m.posts.sitePosts(t.platform);
		expect(
			indexNowUrls(
				[
					{ type: 'perfil', slug: quiet.slug },
					{ type: 'perfil', slug: 'persona-con-buscadores' }
				],
				publicPaths(posts, [])
			)
		).toEqual(['https://kinkyvibe.ar/amigues/persona-con-buscadores']);
	});

	it('quien lo gestiona ve el aviso en la página', async () => {
		const p = await makeProfile(t.db, {
			title: 'Persona Gestionada',
			slug: 'persona-gestionada',
			data: { noindex: true }
		});
		const owner = await makeAccount(t.db, 'duene-inventade');
		await addManager(t.db, p.id, owner.id);
		const m = await modules();
		const { data } = await profilePage(m, 'persona-gestionada', owner);
		expect(data.badges.noindex).toBe(true);
		// Otra cuenta cualquiera, no.
		const other = await makeAccount(t.db, 'curiose-inventade');
		expect((await profilePage(m, 'persona-gestionada', other)).data.badges.noindex).toBe(false);
	});
});

describe('«No aparecer en buscadores» al guardar', () => {
	it('solo perfiles de persona: el tipo `perfil` lo rechaza en un proyecto o un lugar', async () => {
		for (const kind of ['proyecto', 'lugar']) {
			const error = await saveObject(
				t.db,
				{ type: 'perfil', title: `Un ${kind}`, data: { kind, noindex: true } },
				{ actor: 'admin-de-prueba' }
			).catch((e) => e);
			expect(error).toBeInstanceOf(ObjectError);
		}
	});

	it('Mi rincón: apagado al crear, se prende y se apaga; sin la casilla, queda como estaba', async () => {
		const owner = await makeAccount(t.db, 'duene-inventade');
		const created = await createProfile(t.db, owner.id, {
			kind: 'persona',
			title: 'Persona Nueva Inventada',
			visibility: 'public'
		});
		if (!created.ok) throw new Error(created.message);
		const slug = created.profile.slug;
		expect(created.profile.data).not.toHaveProperty('noindex');

		/** @param {Record<string, unknown>} extra */
		const save = async (extra) => {
			const current = await getObject(t.db, { id: created.profile.id }, { role: 'admin', id: 'x' });
			const r = await updateProfile(t.db, owner.id, slug, {
				title: 'Persona Nueva Inventada',
				visibility: 'public',
				version: Number(current?.version),
				...extra
			});
			if (!r.ok) throw new Error(r.message);
			return r.profile.data;
		};
		expect((await save({ noindex: true })).noindex).toBe(true);
		// Un formulario sin la casilla (viejo) no la toca.
		expect((await save({})).noindex).toBe(true);
		expect(await save({ noindex: false })).not.toHaveProperty('noindex');
	});

	it('Mi rincón: un proyecto no la guarda aunque llegue', async () => {
		const owner = await makeAccount(t.db, 'duene-inventade');
		const created = await createProfile(t.db, owner.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado',
			visibility: 'public'
		});
		if (!created.ok) throw new Error(created.message);
		const r = await updateProfile(t.db, owner.id, created.profile.slug, {
			title: 'Proyecto Inventado',
			visibility: 'public',
			version: created.profile.version,
			noindex: true
		});
		if (!r.ok) throw new Error(r.message);
		expect(r.profile.data).not.toHaveProperty('noindex');
	});
});

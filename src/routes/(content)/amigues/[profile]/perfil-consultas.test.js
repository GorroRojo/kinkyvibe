/**
 * La página de un perfil hace sus consultas a la base en pocas tandas en fila: la base está lejos
 * (en el este de EE. UU.) y cada consulta que espera a la anterior es una ida y vuelta más. La
 * dirección, el perfil, si está aprobado, su imagen y lo que la cuenta tiene que ver con él salen
 * en una consulta; lo demás, a la par. Quién ve qué no cambia: oculto, solo para cuentas y sin
 * aprobar siguen dando 404 a quien no los puede ver. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ADMINS } from '$lib/server/auth.js';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { addManager, makeAccount, makeProfile } from '$lib/server/amigues/testing.js';
import { MEMBER_EDGE, PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { getObject } from '$lib/server/objects/read.js';
import { ANON, visibleWhere } from '$lib/server/objects/visibility.js';

// La primera prueba compila la ruta: tarda.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// Como en un pedido de verdad (GET): lo que se lee una vez por pedido se comparte.
const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** Cada consulta tarda esto de más, para contar bien lo que sale a la par. */
const DELAY_MS = 15;
const BY = 'admin-de-prueba';
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const LEGACY = 'Ficha-Vieja-Inventada';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** Quién mira: sin sesión, una cuenta cualquiera, una que gestiona perfiles y une admin. */
/** @type {Record<'anon' | 'member' | 'manager' | 'admin', Record<string, unknown>>} */
const LOCALS = {
	anon: { user: undefined, user_token: '' },
	member: {},
	manager: {},
	admin: { user: ADMIN, user_token: 'tok' }
};

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {number} from
 * @param {number} to
 * @param {string} kind
 */
const edge = (db, from, to, kind) =>
	db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, created_at, created_by)
			VALUES (?1, ?2, ?3, 0, 1, ?4)`
		)
		.bind(from, kind, to, BY)
		.run();

beforeAll(async () => {
	t = await createTestDB();
	const authors = ['autore-inventade', 'perfil-sin-aprobar-inventado', 'Ficha Vieja Inventada'];
	const person = await makeProfile(t.db, {
		title: 'Autore Inventade',
		slug: 'autore-inventade',
		data: { body: 'Hola, soy **inventade**.', tags: ['KinkyVibe'] }
	});
	const legacy = await makeProfile(t.db, {
		title: 'Ficha Vieja',
		slug: 'ficha-vieja-objeto',
		data: { authors: ['autore-inventade'] }
	});
	await t.db
		.prepare(
			`INSERT INTO profile_sources (profile_id, legacy_slug, source_hash, imported_version,
			suggested_kind, imported_at, updated_at) VALUES (?1, ?2, ?3, 1, 'persona', 1, 1)`
		)
		.bind(legacy.id, LEGACY, 'a'.repeat(64))
		.run();
	const project = await makeProfile(t.db, {
		title: 'Proyecto Inventado',
		slug: 'proyecto-inventado',
		kind: 'proyecto',
		data: { show_members: true, authors }
	});
	const hidden = await makeProfile(t.db, {
		title: 'Perfil Oculto',
		slug: 'perfil-oculto-inventado',
		visibility: 'hidden',
		data: { authors }
	});
	await makeProfile(t.db, {
		title: 'Perfil Para Cuentas',
		slug: 'perfil-solo-cuentas-inventado',
		visibility: 'members',
		data: { authors }
	});
	const unapproved = await makeProfile(t.db, {
		title: 'Perfil Sin Aprobar',
		slug: 'perfil-sin-aprobar-inventado',
		approved: false,
		data: { authors }
	});
	await makeProfile(t.db, {
		title: 'Galpón Inventado',
		slug: 'galpon-inventado',
		kind: 'lugar',
		data: { address: 'Calle Del Lugar 222', city: 'Ciudad Inventada', venue_privacy: 'public' }
	});
	for (const p of [person, legacy, hidden]) await edge(t.db, p.id, project.id, MEMBER_EDGE);
	const member = await makeAccount(t.db, 'cuenta-inventada');
	const manager = await makeAccount(t.db, 'gestora-inventada');
	await addManager(t.db, unapproved.id, manager.id);
	await t.db
		.prepare(
			`INSERT INTO profile_claims (profile_id, account_id, status, created_at)
			VALUES (?1, ?2, 'pending', 1)`
		)
		.bind(person.id, manager.id)
		.run();
	LOCALS.member = { user: undefined, user_token: '', member };
	LOCALS.manager = { user: undefined, user_token: '', member: manager };
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: 'taller-inventado',
			title: 'Taller Inventado',
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			start: '2099-03-06T20:00-03:00',
			status: 'abierto',
			modalidad: 'presencial',
			location: 'Calle Inventada 123',
			tags: [],
			authors: ['autore-inventade', 'proyecto-inventado'],
			personas: [{ perfil: 'autore-inventade', rol: 'Organiza' }]
		},
		{
			category: 'material',
			postID: 'guia-inventada',
			title: 'Guía Inventada',
			summary: 'Un material de prueba',
			published_date: '2026-09-01Z-03:00',
			tags: [],
			authors: ['autore-inventade']
		}
	]);
	const venues = await import('$lib/server/amigues/venues.js');
	const venue = await t.db
		.prepare(`SELECT id FROM objects WHERE type = 'perfil' AND slug = 'galpon-inventado'`)
		.first();
	await venues.setEventVenue(t.db, {
		eventSlug: 'taller-inventado',
		venueId: Number(venue?.id),
		privacy: null,
		by: BY
	});
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/**
 * La página de `slug` cargada en frío (sin nada recordado de otro pedido) o en caliente (un pedido
 * antes en el mismo isolate), con una base que cuenta las consultas y las tandas en fila. Un 404
 * sale como el error que tiró.
 * @param {string} slug
 * @param {{ as?: keyof typeof LOCALS, warm?: boolean }} [opts]
 */
async function profilePage(slug, { as = 'anon', warm = false } = {}) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS });
	const platform = { env: { ...t.env, DB: counted.db } };
	// Como hooks.server.js: el contenido se lee con la base de `getDB` (con sus tandas).
	(await import('$lib/server/contenido/repo.js')).setContentDB(
		(await import('$lib/server/db')).getDB(platform)
	);
	const url = new URL(`/amigues/${slug}`, 'https://kinkyvibe.ar');
	fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
	// Como cada pedido: hooks.server.js lee el árbol de etiquetas al empezar.
	await (await import('$lib/server/etiquetas/source.js')).siteTagSource(platform);
	const { load } = await import('./+page.server.js');
	/** @type {Record<string, string>} */
	const headers = {};
	const event = /** @type {any} */ ({
		url,
		params: { profile: slug },
		platform,
		locals: LOCALS[as],
		setHeaders: (/** @type {Record<string, string>} */ h) => Object.assign(headers, h)
	});
	if (warm) {
		await Promise.resolve(load(event)).catch(() => {});
		fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
		for (const k of Object.keys(headers)) delete headers[k];
	}
	counted.reset();
	try {
		const page = /** @type {any} */ (await load(event));
		if (process.env.KV_CONSULTAS) {
			console.info(
				`[${slug}, ${as}${warm ? ', en caliente' : ''}] ${counted.queries} consultas en ${counted.waves} tandas`
			);
		}
		return { page, headers, queries: counted.queries, waves: counted.waves };
	} finally {
		fake.event = null;
	}
}

describe('la página de un perfil, en pocas tandas', () => {
	it('un proyecto con integrantes, autores, "Más cosas de…" y «Participa en»', async () => {
		const r = await profilePage('proyecto-inventado');
		expect(r.page.profile.title).toBe('Proyecto Inventado');
		expect(r.page.authors).toEqual([
			{ name: 'autore-inventade', href: '/amigues/autore-inventade' },
			{ name: 'perfil-sin-aprobar-inventado', href: null },
			{ name: 'Ficha Vieja Inventada', href: `/amigues/${LEGACY}` }
		]);
		expect(r.page.members).toEqual([
			{ slug: 'autore-inventade', title: 'Autore Inventade' },
			{ slug: LEGACY, title: 'Ficha Vieja' }
		]);
		expect(r.page.relatedPosts.map((/** @type {any} */ p) => p.meta.postID)).toEqual([
			'taller-inventado',
			'guia-inventada',
			LEGACY
		]);
		expect(r.page.claim).toBeNull();
		expect(r.headers).toEqual({});
		// Antes: 23 consultas en 16 tandas en frío; 21 en 14 en caliente (un pedido antes en el
		// mismo isolate).
		expect(r.queries).toBeLessThanOrEqual(10);
		expect(r.waves).toBeLessThanOrEqual(4);
		const warm = await profilePage('proyecto-inventado', { warm: true });
		expect(warm.page).toEqual(r.page);
		expect(warm.queries).toBeLessThanOrEqual(8);
		expect(warm.waves).toBeLessThanOrEqual(3);
		// Con cuenta, lo mismo más lo de la cuenta (antes: 30 consultas en 21 tandas).
		const member = await profilePage('proyecto-inventado', { as: 'member' });
		expect(member.queries).toBeLessThanOrEqual(12);
		expect(member.waves).toBeLessThanOrEqual(4);
	});

	it('con cuenta: lo que la cuenta tiene que ver con el perfil, sin tandas de más', async () => {
		const r = await profilePage('autore-inventade', { as: 'manager' });
		expect(r.page.claim).toEqual({ state: 'pending' });
		expect(r.page.participa).not.toBeNull();
		expect(r.headers).toEqual({ 'cache-control': 'private, no-store' });
		// Antes: 14 consultas en 14 tandas.
		expect(r.waves).toBeLessThanOrEqual(4);
		const mine = await profilePage('perfil-sin-aprobar-inventado', { as: 'manager' });
		expect(mine.page.claim).toEqual({ state: 'manager' });
		expect(mine.page.badges).toEqual({ hidden: false, membersOnly: false, pending: true });
		expect((await profilePage('autore-inventade', { as: 'member' })).page.claim).toEqual({
			state: 'none'
		});
	});

	it('un lugar con sus eventos', async () => {
		const r = await profilePage('galpon-inventado');
		expect(r.page.venueEvents.map((/** @type {any} */ p) => p.meta.postID)).toEqual([
			'taller-inventado'
		]);
		expect(r.page.location).not.toBeNull();
		// Antes: 11 consultas en 11 tandas.
		expect(r.waves).toBeLessThanOrEqual(4);
	});

	it('la dirección vieja de una ficha importada y la del objeto llevan al mismo perfil', async () => {
		const old = await profilePage(LEGACY);
		expect(old.page.canonical).toBe(`/amigues/${LEGACY}`);
		const byObject = await profilePage('ficha-vieja-objeto');
		expect(byObject.page.canonical).toBe(`/amigues/${LEGACY}`);
		expect(byObject.page.profileId).toBe(old.page.profileId);
	});

	it('quién ve qué: oculto, solo para cuentas y sin aprobar', async () => {
		/** @param {string} slug @param {keyof typeof LOCALS} as */
		const status = (slug, as) =>
			profilePage(slug, { as }).then(
				() => 200,
				(e) => e.status
			);
		const seen = {};
		for (const slug of [
			'perfil-oculto-inventado',
			'perfil-solo-cuentas-inventado',
			'perfil-sin-aprobar-inventado',
			'no-existe-inventado'
		]) {
			for (const as of /** @type {const} */ (['anon', 'member', 'manager', 'admin'])) {
				/** @type {any} */ (seen)[`${slug} ${as}`] = await status(slug, as);
			}
		}
		expect(seen).toEqual({
			'perfil-oculto-inventado anon': 404,
			'perfil-oculto-inventado member': 404,
			'perfil-oculto-inventado manager': 404,
			'perfil-oculto-inventado admin': 200,
			'perfil-solo-cuentas-inventado anon': 404,
			'perfil-solo-cuentas-inventado member': 200,
			'perfil-solo-cuentas-inventado manager': 200,
			'perfil-solo-cuentas-inventado admin': 200,
			'perfil-sin-aprobar-inventado anon': 404,
			'perfil-sin-aprobar-inventado member': 404,
			'perfil-sin-aprobar-inventado manager': 200,
			'perfil-sin-aprobar-inventado admin': 200,
			'no-existe-inventado anon': 404,
			'no-existe-inventado member': 404,
			'no-existe-inventado manager': 404,
			'no-existe-inventado admin': 404
		});
	});

	it('quien gestiona un perfil sin aprobar ve el link a ese perfil entre les autores', async () => {
		const r = await profilePage('proyecto-inventado', { as: 'manager' });
		expect(r.page.authors[1]).toEqual({
			name: 'perfil-sin-aprobar-inventado',
			href: '/amigues/perfil-sin-aprobar-inventado'
		});
		const admin = await profilePage('proyecto-inventado', { as: 'admin' });
		expect(admin.page.authors[1].href).toBe('/amigues/perfil-sin-aprobar-inventado');
		expect(admin.page.members).toEqual(r.page.members);
	});
});

/**
 * `findPublicProfile` como era antes (una consulta detrás de otra: la dirección, el objeto, la
 * aprobación y la imagen, el rol), para comparar.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} urlSlug
 * @param {import('$lib/server/objects/visibility.js').Viewer} viewer
 * @param {string | undefined} accountId
 */
async function findPublicProfileBefore(db, urlSlug, viewer, accountId) {
	const { managerRole, resolveProfileSlug } = await import('$lib/server/amigues/profiles.js');
	const ref = await resolveProfileSlug(db, urlSlug);
	if (!ref) return null;
	const object = await getObject(db, { id: ref.id }, viewer);
	if (!object || object.type !== PROFILE_TYPE) return null;
	const vi = visibleWhere(ANON, 'i');
	const row = await db
		.prepare(
			`SELECT EXISTS (SELECT 1 FROM profile_approvals WHERE profile_id = ?) AS approved,
				(SELECT json_extract(i.data, '$.key') FROM edges e
					JOIN objects i ON i.id = e.to_id AND i.type = 'imagen'
					WHERE e.from_id = ? AND e.kind = 'avatar' AND ${vi.sql}
					ORDER BY e.position LIMIT 1) AS avatar_key`
		)
		.bind(object.id, object.id, ...vi.params)
		.first();
	const approved = Boolean(row?.approved);
	const avatarKey = typeof row?.avatar_key === 'string' ? row.avatar_key : null;
	const role = accountId ? await managerRole(db, accountId, object.id) : null;
	if (!approved && viewer.role !== 'admin' && !role) return null;
	return { object, legacySlug: ref.legacySlug, approved, role, avatarKey };
}

describe('findPublicProfile en una consulta', () => {
	it('dice lo mismo que antes, para cada dirección y cada quien mira', async () => {
		const { findPublicProfile, viewerFor } = await import('$lib/server/amigues/profiles.js');
		const slugs = [
			'proyecto-inventado',
			'autore-inventade',
			LEGACY,
			'ficha-vieja-objeto',
			'perfil-oculto-inventado',
			'perfil-solo-cuentas-inventado',
			'perfil-sin-aprobar-inventado',
			'galpon-inventado',
			'taller-inventado',
			'no-existe-inventado',
			'Ficha Vieja Inventada',
			'',
			'x'.repeat(101)
		];
		let compared = 0;
		for (const as of /** @type {const} */ (['anon', 'member', 'manager', 'admin'])) {
			const locals = /** @type {any} */ (LOCALS[as]);
			const viewer = viewerFor(locals);
			const accountId = locals.member?.id;
			for (const slug of slugs) {
				const counted = countingDB(t.db);
				const now = await findPublicProfile(counted.db, slug, viewer, { accountId });
				expect(now, `${slug} ${as}`).toEqual(
					await findPublicProfileBefore(t.db, slug, viewer, accountId)
				);
				expect(counted.queries).toBeLessThanOrEqual(1);
				if (now) compared++;
			}
		}
		// Que la comparación no sea solo de `null`.
		expect(compared).toBeGreaterThan(20);
	});
});

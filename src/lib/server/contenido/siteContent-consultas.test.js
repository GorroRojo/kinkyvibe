/**
 * Un evento para su página (`siteEvent`) en pocas tandas en fila: la base está lejos y cada
 * consulta que espera a otra es una ida y vuelta más. Sus relaciones, su portada y si es una parte
 * oculta se leen a la par, y les autores con perfil en una sola consulta (antes, cuatro por
 * autore, una detrás de otra). `findPublicProfiles` dice lo mismo que `findPublicProfile`
 * dirección por dirección. D1 de miniflare; perfiles y eventos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { saveObject } from '$lib/server/objects/index.js';
import { ANON } from '$lib/server/objects/visibility.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** Cada consulta tarda esto de más, para contar bien lo que sale a la par. */
const DELAY_MS = 15;
const BY = 'admin-de-prueba';
const LEGACY = 'Ficha-Vieja-Inventada';

/** Les autores, por dirección: cada caso que se tiene que ver y cada uno que no. */
const AUTHORS = [
	'Ficha Vieja Inventada',
	'autore-inventade',
	'perfil-oculto-inventado',
	'perfil-solo-cuentas-inventado',
	'perfil-sin-aprobar-inventado',
	'perfil-borrado-inventado',
	'no-existe-inventado',
	'autore-inventade'
];

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let memberId;

beforeAll(async () => {
	t = await createTestDB();
	const legacy = await makeProfile(t.db, { title: 'Ficha Vieja', slug: 'ficha-vieja-objeto' });
	await t.db
		.prepare(
			`INSERT INTO profile_sources (profile_id, legacy_slug, source_hash, imported_version,
			suggested_kind, imported_at, updated_at) VALUES (?1, ?2, ?3, 1, 'persona', 1, 1)`
		)
		.bind(legacy.id, LEGACY, 'a'.repeat(64))
		.run();
	const hash = 'b'.repeat(64);
	const image = await saveObject(
		t.db,
		{
			type: 'imagen',
			slug: hash,
			title: 'Imagen inventada',
			data: { key: `img/${hash}.webp`, mime: 'image/webp', size: 10, width: 1, height: 1 }
		},
		{ actor: BY }
	);
	await t.db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, created_at, created_by)
			VALUES (?1, 'avatar', ?2, 0, 1, ?3)`
		)
		.bind(legacy.id, image.id, BY)
		.run();
	await makeProfile(t.db, { title: 'Autore Inventade', slug: 'autore-inventade' });
	await makeProfile(t.db, {
		title: 'Oculto',
		slug: 'perfil-oculto-inventado',
		visibility: 'hidden'
	});
	await makeProfile(t.db, {
		title: 'Solo cuentas',
		slug: 'perfil-solo-cuentas-inventado',
		visibility: 'members'
	});
	await makeProfile(t.db, {
		title: 'Sin aprobar',
		slug: 'perfil-sin-aprobar-inventado',
		approved: false
	});
	const gone = await makeProfile(t.db, { title: 'Borrado', slug: 'perfil-borrado-inventado' });
	await t.db
		.prepare('UPDATE objects SET deleted_at = 1, version = version + 1 WHERE id = ?1')
		.bind(gone.id)
		.run();
	memberId = 'cuenta-inventada';
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: 'evento-con-autores-inventado',
			title: 'Evento con autores',
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			start: '2099-03-06T20:00-03:00',
			status: 'abierto',
			tags: [],
			authors: AUTHORS
		}
	]);
});
afterAll(async () => {
	await t?.dispose();
});

describe('findPublicProfiles: lo mismo que findPublicProfile, en una consulta', () => {
	const viewers = () => [
		ANON,
		/** @type {const} */ ({ role: 'member', id: memberId }),
		/** @type {const} */ ({ role: 'admin', id: BY })
	];
	const slugs = [
		LEGACY,
		'ficha-vieja-objeto',
		...AUTHORS.map((a) => a.replaceAll(' ', '-')),
		'',
		'x'.repeat(101)
	];

	it.each([0, 1, 2])('quien mira nº %i', async (i) => {
		const viewer = viewers()[i];
		const { findPublicProfile, findPublicProfiles } =
			await import('$lib/server/amigues/profiles.js');
		const counted = countingDB(t.db);
		const many = await findPublicProfiles(counted.db, slugs, viewer);
		expect(counted.queries).toBe(1);
		for (const slug of new Set(slugs)) {
			expect(many.get(slug) ?? null, slug).toEqual(await findPublicProfile(t.db, slug, viewer));
		}
		// Algo se ve y algo no (si no, la prueba no prueba nada).
		expect(many.get(LEGACY)?.avatarKey).toBe(`img/${'b'.repeat(64)}.webp`);
		expect(many.get('ficha-vieja-objeto')?.legacySlug).toBe(LEGACY);
		expect(many.has('perfil-borrado-inventado')).toBe(false);
		expect(many.has('perfil-sin-aprobar-inventado')).toBe(viewer.role === 'admin');
	});

	it('sin direcciones, ninguna consulta', async () => {
		const { findPublicProfiles } = await import('$lib/server/amigues/profiles.js');
		const counted = countingDB(t.db);
		expect((await findPublicProfiles(counted.db, [], ANON)).size).toBe(0);
		expect(counted.queries).toBe(0);
	});
});

describe('siteEvent en pocas tandas', () => {
	it('les autores en el orden de `authors:`, con todas sus consultas en pocas tandas', async () => {
		vi.resetModules();
		const counted = countingDB(t.db, { delayMs: DELAY_MS });
		(await import('$lib/server/contenido/repo.js')).setContentDB(counted.db);
		const { siteEvent } = await import('./posts.js');
		const post = await siteEvent(
			{ env: { ...t.env, DB: counted.db } },
			'evento-con-autores-inventado'
		);
		expect(post?.meta.title).toBe('Evento con autores');
		expect(post?.authorsProfiles?.map((p) => p.meta.postID)).toEqual([
			'Ficha-Vieja-Inventada',
			'autore-inventade',
			'autore-inventade'
		]);
		expect(post?.authorsProfiles?.[0].meta.featured).toBe(`/media/img/${'b'.repeat(64)}.webp`);
		// Antes: 31 consultas en 31 tandas (con 8 autores, hasta 4 por autore). Ahora 6 en 4: la
		// dirección, el objeto, [parte oculta, relaciones, portada] y les autores (más los vínculos
		// públicos del texto, si nombra perfiles o etiquetas).
		expect(counted.queries).toBeLessThanOrEqual(7);
		expect(counted.waves).toBeLessThanOrEqual(5);
	});
});

/**
 * La migración 0027 rehace `event_venues` para que `privacy` acepte 'address' («Sólo dirección»).
 * Se aplica sobre una base con todas las migraciones anteriores y filas inventadas para comprobar
 * que las filas pasan tal cual, que vuelve el índice, que el CHECK nuevo acepta 'address' y sigue
 * rechazando lo demás, y que la foreign key al lugar sigue andando.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0027')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {string} slug */
function venue(slug) {
	return t.db
		.prepare(
			`INSERT INTO objects (type, slug, title, data, created_at, created_by, updated_at, updated_by)
			VALUES ('perfil', ?1, ?2, '{"kind":"lugar"}', ?3, 'cuenta:inventada', ?3, 'cuenta:inventada')`
		)
		.bind(slug, `Lugar ${slug}`, NOW);
}

/**
 * @param {string} eventSlug
 * @param {string} venueSlug
 * @param {string | null} privacy
 */
function link(eventSlug, venueSlug, privacy) {
	return t.db
		.prepare(
			`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by)
			SELECT ?1, id, ?2, ?3, 'admin-inventade', ?4, 'otre-admin' FROM objects WHERE slug = ?5`
		)
		.bind(eventSlug, privacy, NOW, NOW + 1, venueSlug);
}

async function runMigration() {
	const sql = await readFile(path.join('migrations', '0027_lugar_solo_direccion.sql'), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
}

async function rows() {
	const { results } = await t.db
		.prepare(
			`SELECT ev.event_slug, o.slug AS venue, ev.privacy, ev.created_at, ev.created_by,
				ev.updated_at, ev.updated_by
			FROM event_venues ev JOIN objects o ON o.id = ev.venue_id ORDER BY ev.event_slug`
		)
		.all();
	return results;
}

describe('migración 0027 (nivel «Sólo dirección» en event_venues)', () => {
	it('antes, el CHECK de 0017 no acepta address', async () => {
		await t.db.batch([
			t.db.prepare(
				`INSERT INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', ${NOW})`
			),
			venue('galpon-inventado'),
			venue('casa-inventada')
		]);
		await expect(link('evento-x', 'casa-inventada', 'address').run()).rejects.toThrow();
	});

	it('pasa las filas tal cual, vuelve el índice y acepta address', async () => {
		await t.db.batch([
			link('evento-a', 'galpon-inventado', null),
			link('evento-b', 'galpon-inventado', 'public'),
			link('evento-c', 'casa-inventada', 'name'),
			link('evento-d', 'casa-inventada', 'area'),
			link('evento-e', 'casa-inventada', 'hidden')
		]);
		const old = await rows();
		expect(old).toHaveLength(5);

		await runMigration();

		expect(await rows()).toEqual(old);
		const index = await t.db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'event_venues_venue'"
			)
			.first();
		expect(index).toEqual({ name: 'event_venues_venue' });
		expect(
			await t.db.prepare("SELECT name FROM sqlite_master WHERE name = 'event_venues_new'").first()
		).toBeNull();

		await link('evento-f', 'casa-inventada', 'address').run();
		expect((await rows()).find((r) => r.event_slug === 'evento-f')).toMatchObject({
			venue: 'casa-inventada',
			privacy: 'address'
		});
		await expect(link('evento-g', 'casa-inventada', 'secreta').run()).rejects.toThrow();
	});

	it('la foreign key al lugar sigue: no acepta un lugar que no existe', async () => {
		await expect(
			t.db
				.prepare(
					`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by)
					VALUES ('evento-h', 999999, NULL, ?1, 'a', ?1, 'a')`
				)
				.bind(NOW)
				.run()
		).rejects.toThrow();
	});
});

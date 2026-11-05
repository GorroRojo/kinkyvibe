/**
 * La migración 0075 borra la tabla vieja `event_venues`. Antes de aplicarla en producción se corre
 * el chequeo que está escrito en la misma migración (cada fila tiene su edge `lugar`): acá se
 * prueba ese mismo texto, leído del archivo, sobre una base con todas las migraciones anteriores y
 * filas inventadas, y después que la migración borra la tabla y su índice sin tocar los edges.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

const FILE = path.join('migrations', '0075_borrar_event_venues.sql');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0075')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
	await t.db
		.prepare(
			`INSERT OR IGNORE INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', ?1),
				('evento', 'core', ?1)`
		)
		.bind(NOW)
		.run();
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const NOW = Date.parse('2026-11-04T12:00:00Z');

/** El chequeo de la migración, tal como está escrito en su comentario (paso 2). */
async function checkQuery() {
	const sql = await readFile(FILE, 'utf8');
	const lines = sql.split('\n');
	const from = lines.findIndex((l) => /^--\s+SELECT v\.event_slug/.test(l));
	const to = lines.findIndex((l, i) => i > from && /;\s*$/.test(l));
	expect(from).toBeGreaterThan(0);
	return lines
		.slice(from, to + 1)
		.map((l) => l.replace(/^--/, ''))
		.join('\n')
		.trim()
		.replace(/;$/, '');
}

/**
 * @param {string} type
 * @param {string} slug
 * @param {string} data
 */
async function object(type, slug, data) {
	const r = await t.db
		.prepare(
			`INSERT INTO objects (type, slug, title, data, created_at, created_by, updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, 'admin-inventade', ?5, 'admin-inventade')`
		)
		.bind(type, slug, `Título ${slug}`, data, NOW)
		.run();
	return Number(r.meta.last_row_id);
}

/** @param {string} eventSlug @param {number} venueId */
function oldRow(eventSlug, venueId) {
	return t.db
		.prepare(
			`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by)
			VALUES (?1, ?2, NULL, ?3, 'admin-inventade', ?3, 'admin-inventade')`
		)
		.bind(eventSlug, venueId, NOW)
		.run();
}

/** @param {number} eventId @param {number} venueId */
function edge(eventId, venueId) {
	return t.db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
			VALUES (?1, 'lugar', ?2, 0, NULL, ?3, 'admin-inventade')`
		)
		.bind(eventId, venueId, NOW)
		.run();
}

describe('migración 0075 (borrar event_venues)', () => {
	it('el chequeo encuentra las filas sin edge `lugar`, y después la tabla se borra', async () => {
		const venue = await object('perfil', 'lugar-inventado', '{"kind":"lugar"}');
		const migrated = await object('evento', 'fiesta-migrada', '{}');
		await object('evento', 'fiesta-sin-edge', '{}');
		await oldRow('fiesta-migrada', venue);
		await oldRow('fiesta-sin-edge', venue);
		await edge(migrated, venue);

		const query = await checkQuery();
		const missing = await t.db.prepare(query).all();
		expect(missing.results).toEqual([{ event_slug: 'fiesta-sin-edge', venue_id: venue }]);

		// Con su edge, el chequeo da 0 filas: se puede borrar.
		const other = await t.db
			.prepare("SELECT id FROM objects WHERE slug = 'fiesta-sin-edge'")
			.first();
		await edge(Number(other?.id), venue);
		expect((await t.db.prepare(query).all()).results).toEqual([]);

		const sql = await readFile(FILE, 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		const left = await t.db
			.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'event_venues%'")
			.all();
		expect(left.results).toEqual([]);
		// Los edges `lugar` no se tocan.
		const edges = await t.db
			.prepare("SELECT count(*) AS n FROM edges WHERE kind = 'lugar'")
			.first();
		expect(edges?.n).toBe(2);
	});
});

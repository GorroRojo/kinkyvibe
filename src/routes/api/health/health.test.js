/**
 * GET /api/health: la base, las migraciones (que esté la última del código, sin decir cuál) y el
 * commit del build. D1 de miniflare vacía; `d1_migrations` se arma a mano (wrangler la crea, los
 * tests no).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { createTestDB } from '$lib/server/db/testing.js';
import { isTrackedPath } from '$lib/server/analytics/classify.js';
import { commitShaFromEnv, latestMigrationName } from '$lib/server/buildInfo.js';
import { GET } from './+server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const LATEST = __LATEST_MIGRATION__;

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB({ migrate: false });
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await t.db.prepare('DROP TABLE IF EXISTS d1_migrations').run();
});

/** @param {string[]} names */
async function ledger(names) {
	await t.db
		.prepare('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)')
		.run();
	for (const name of names) {
		await t.db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(name).run();
	}
}

/** @param {any} db */
async function call(db) {
	const res = await GET(/** @type {any} */ ({ platform: db ? { env: { DB: db } } : undefined }));
	return { res, body: await res.json() };
}

describe('GET /api/health', () => {
	it('la constante del build es la última migración de migrations/', () => {
		const files = readdirSync(new URL('../../../../migrations', import.meta.url));
		expect(LATEST).toMatch(/^\d{4}_[\w-]+\.sql$/);
		expect(LATEST).toBe(latestMigrationName(files));
	});

	it('con la última migración aplicada: 200, ok, sin caché', async () => {
		await ledger(['0001_init.sql', LATEST]);
		const { res, body } = await call(t.db);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(body).toEqual({ ok: true, db: 'ok', migrations: 'ok', sha: '' });
	});

	it('la base adelantada (migraciones más nuevas que el código): sigue ok', async () => {
		await ledger([LATEST, '9998_futura.sql', '9999_mas_futura.sql']);
		const { res, body } = await call(t.db);
		expect(res.status).toBe(200);
		expect(body.migrations).toBe('ok');
	});

	it('sin la última migración: 503 «atrasada», sin decir cuál falta', async () => {
		await ledger(['0001_init.sql']);
		const { res, body } = await call(t.db);
		expect(res.status).toBe(503);
		expect(body).toMatchObject({ ok: false, db: 'ok', migrations: 'atrasada' });
		expect(JSON.stringify(body)).not.toContain(LATEST.replace(/\.sql$/, ''));
	});

	it('sin d1_migrations (bases locales y de los E2E): «sin registro», 200', async () => {
		const { res, body } = await call(t.db);
		expect(res.status).toBe(200);
		expect(body).toMatchObject({ ok: true, db: 'ok', migrations: 'sin registro' });
	});

	it('sin base: 503', async () => {
		const { res, body } = await call(null);
		expect(res.status).toBe(503);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(body).toMatchObject({ ok: false, db: 'sin base', migrations: 'sin base' });
	});

	it('si la base falla: 503', async () => {
		const broken = {
			prepare: () => ({
				first: () => Promise.reject(new Error('D1_ERROR: caída')),
				bind: () => ({ first: () => Promise.reject(new Error('D1_ERROR: caída')) })
			})
		};
		const { res, body } = await call(broken);
		expect(res.status).toBe(503);
		expect(body).toMatchObject({ ok: false, db: 'error' });
		expect(JSON.stringify(body)).not.toContain('D1_ERROR');
	});

	it('no se cuenta en las visitas', () => {
		expect(isTrackedPath('/api/health')).toBe(false);
	});
});

describe('buildInfo', () => {
	it('latestMigrationName: el último NNNN_*.sql, ignorando otros archivos', () => {
		expect(latestMigrationName(['0002_b.sql', '0010_c.sql', '0001_a.sql', 'README.md'])).toBe(
			'0010_c.sql'
		);
		expect(latestMigrationName([])).toBe('');
	});

	it('commitShaFromEnv: el de Workers Builds, o vacío', () => {
		const sha = 'a'.repeat(40);
		expect(commitShaFromEnv({ WORKERS_CI_COMMIT_SHA: sha })).toBe(sha);
		expect(commitShaFromEnv({ WORKERS_CI_COMMIT_SHA: '  ' })).toBe('');
		expect(commitShaFromEnv({ WORKERS_CI_COMMIT_SHA: 'no es un sha' })).toBe('');
		expect(commitShaFromEnv({})).toBe('');
	});
});

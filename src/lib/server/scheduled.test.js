import { describe, expect, it, vi } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import { createTestDB } from './db/testing.js';
import { lastIntegrityRun } from './objects/integrity.js';
import { saveObject } from './objects/save.js';
import {
	BACKUP_CRON,
	REMINDERS_CRON,
	handleScheduled,
	runObjectsIntegrity,
	runReminders
} from './scheduled.js';

const ctx = /** @type {any} */ ({ waitUntil() {}, passThroughOnException() {} });

describe('wrangler.toml', () => {
	it('tiene exactamente los crons que maneja scheduled.js', () => {
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		expect([...(config.triggers.crons ?? [])].sort()).toEqual([BACKUP_CRON, REMINDERS_CRON].sort());
	});

	it('el Worker usa worker/index.js y el bucket de backups; los Previews, la base de prueba', () => {
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		expect(config.name).toBe('kinkyvibe');
		expect(config.main).toMatch(/worker[\\/]index\.js$/);
		expect(config.r2_buckets).toEqual([
			expect.objectContaining({ binding: 'BACKUPS', bucket_name: 'kinkyvibe-backups' })
		]);
		expect(config.d1_databases).toEqual([
			expect.objectContaining({ binding: 'DB', database_name: 'kinkyvibe' })
		]);
		const previews = /** @type {any} */ (config).previews;
		expect(previews.d1_databases).toEqual([
			expect.objectContaining({ binding: 'DB', database_name: 'kinkyvibe-preview' })
		]);
		// Los Previews nunca escriben en el bucket de backups de producción.
		expect(previews.r2_buckets ?? []).toEqual([]);
	});
});

describe('recordatorios', () => {
	it('le pide al fetch de SvelteKit POST /api/cron/recordatorios con CRON_SECRET', async () => {
		const appFetch = vi.fn(async () => Response.json({ sent: 2, failed: 0 }));
		const env = { CRON_SECRET: 'x'.repeat(32), SITE_URL: 'https://ejemplo.test/' };
		await handleScheduled({ cron: REMINDERS_CRON, scheduledTime: 0 }, env, ctx, appFetch);

		expect(appFetch).toHaveBeenCalledTimes(1);
		const [request, passedEnv, passedCtx] = /** @type {any[]} */ (appFetch.mock.calls[0]);
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://ejemplo.test/api/cron/recordatorios');
		expect(request.headers.get('x-cron-secret')).toBe(env.CRON_SECRET);
		// Mismo env y ctx: SvelteKit ve los mismos bindings que en un pedido normal.
		expect(passedEnv).toBe(env);
		expect(passedCtx).toBe(ctx);
	});

	it('sin SITE_URL usa kinkyvibe.ar', async () => {
		const appFetch = vi.fn(async () => Response.json({}));
		await runReminders({ CRON_SECRET: 'x'.repeat(32) }, ctx, appFetch);
		const [request] = /** @type {any[]} */ (appFetch.mock.calls[0]);
		expect(request.url).toBe('https://kinkyvibe.ar/api/cron/recordatorios');
	});

	it('si el endpoint falla, la corrida falla (queda como error en Cloudflare)', async () => {
		const appFetch = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401 }));
		await expect(runReminders({}, ctx, appFetch)).rejects.toThrow(/401/);
	});
});

describe('backup', () => {
	it('sin bindings falla con un mensaje claro', async () => {
		const appFetch = vi.fn();
		await expect(
			handleScheduled({ cron: BACKUP_CRON, scheduledTime: 0 }, {}, ctx, appFetch)
		).rejects.toThrow(/DB/);
		expect(appFetch).not.toHaveBeenCalled();
	});
});

describe('integridad de objetos (después del backup)', () => {
	it('con problemas NO hace fallar la corrida: los guarda para "Para revisar"', async () => {
		const t = await createTestDB();
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await saveObject(
				t.db,
				{ type: 'lugar', title: 'Salón Inventado' },
				{ actor: 'admin-inventade' }
			);
			const first = new Date('2026-10-01T06:00:00Z');
			expect(await runObjectsIntegrity({ DB: t.db }, first)).toEqual({ count: 0 });
			expect(await lastIntegrityRun(t.db)).toEqual({
				ranAt: first.getTime(),
				count: 0,
				problems: []
			});

			// Un índice de búsqueda desincronizado (algo que escribió por fuera de saveObject).
			await t.db
				.prepare("INSERT INTO objects_fts (rowid, title, search_text) VALUES (777, 'x', '')")
				.run();
			const second = new Date('2026-10-02T06:00:00Z');
			expect(await runObjectsIntegrity({ DB: t.db }, second)).toEqual({ count: 1 });
			expect(await lastIntegrityRun(t.db)).toEqual({
				ranAt: second.getTime(),
				count: 1,
				problems: [{ code: 'fts_out_of_sync' }]
			});
			expect(error).toHaveBeenCalledWith(expect.stringContaining('[fts_out_of_sync]'));
		} finally {
			log.mockRestore();
			error.mockRestore();
			await t.dispose();
		}
	}, 30_000);

	it('el cron nocturno termina bien (backup OK) aunque el chequeo encuentre problemas', async () => {
		const t = await createTestDB();
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await t.db
				.prepare("INSERT INTO objects_fts (rowid, title, search_text) VALUES (777, 'x', '')")
				.run();
			const scheduledTime = Date.parse('2026-10-03T06:00:00Z');
			const result = await handleScheduled(
				{ cron: BACKUP_CRON, scheduledTime },
				{ DB: t.db, BACKUPS: /** @type {any} */ (t.env).BACKUPS },
				ctx,
				vi.fn()
			);
			expect(result).toMatchObject({ key: 'd1/2026-10-03.sql.gz' });
			expect(await lastIntegrityRun(t.db)).toMatchObject({ ranAt: scheduledTime, count: 1 });
		} finally {
			log.mockRestore();
			error.mockRestore();
			await t.dispose();
		}
	}, 60_000);

	it('si el chequeo mismo falla, lo escribe en el log y no tira error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('base caída');
			}
		});
		try {
			expect(await runObjectsIntegrity({ DB: broken })).toBeNull();
			expect(await runObjectsIntegrity({})).toBeNull();
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining('el chequeo falló'),
				expect.any(Error)
			);
		} finally {
			error.mockRestore();
		}
	});

	it('si la base todavía no tiene la migración 0012, no hace nada', async () => {
		const t = await createTestDB({ migrate: false });
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			expect(await runObjectsIntegrity({ DB: t.db })).toBeNull();
			expect(log).toHaveBeenCalledWith(expect.stringContaining('0012'));
		} finally {
			log.mockRestore();
			await t.dispose();
		}
	}, 30_000);
});

describe('cron desconocido', () => {
	it('falla en vez de hacer algo por las dudas', async () => {
		await expect(
			handleScheduled({ cron: '* * * * *', scheduledTime: 0 }, {}, ctx, vi.fn())
		).rejects.toThrow(/desconocido/);
	});
});

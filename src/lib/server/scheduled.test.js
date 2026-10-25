import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import { createTestDB, resetDB } from './db/testing.js';
import { BINDING, DATASET } from './analytics/track.js';
import { lastIntegrityRun } from './objects/integrity.js';
import { saveObject } from './objects/save.js';
import {
	BACKUP_CRON,
	REMINDERS_CRON,
	handleScheduled,
	runObjectsIntegrity,
	runReminders,
	runSessionCleanup
} from './scheduled.js';
import { STALE_SESSION_MS } from './cuentas/sessionAge.js';

const ctx = /** @type {any} */ ({ waitUntil() {}, passThroughOnException() {} });

describe('wrangler.toml', () => {
	it('tiene exactamente los crons que maneja scheduled.js', () => {
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		expect([...(config.triggers.crons ?? [])].sort()).toEqual([BACKUP_CRON, REMINDERS_CRON].sort());
	});

	it('el Worker usa worker/index.js, el bucket de backups y el de imágenes; los Previews, la base y el bucket de imágenes de prueba', () => {
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		expect(config.name).toBe('kinkyvibe');
		expect(config.main).toMatch(/worker[\\/]index\.js$/);
		expect(config.r2_buckets).toEqual([
			expect.objectContaining({ binding: 'BACKUPS', bucket_name: 'kinkyvibe-backups' }),
			// La biblioteca de imágenes (docs/imagenes.md).
			expect.objectContaining({ binding: 'MEDIA', bucket_name: 'kinkyvibe-media' })
		]);
		expect(config.d1_databases).toEqual([
			expect.objectContaining({ binding: 'DB', database_name: 'kinkyvibe' })
		]);
		const previews = /** @type {any} */ (config).previews;
		expect(previews.d1_databases).toEqual([
			expect.objectContaining({ binding: 'DB', database_name: 'kinkyvibe-preview' })
		]);
		// Los Previews nunca escriben en el bucket de backups ni en el de imágenes de producción:
		// solo tienen el bucket de imágenes de prueba.
		expect(previews.r2_buckets ?? []).toEqual([
			{ binding: 'MEDIA', bucket_name: 'kinkyvibe-media-preview' }
		]);
	});

	it('el Worker corre al lado de la base D1 (este de EE. UU.)', () => {
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		// EXPERIMENTO (25/10): sin ubicación fija por 2 horas; el PR que la restaura vuelve a esperar
		// `aws:us-east-1`.
		expect(/** @type {any} */ (config.placement)?.region).toBeUndefined();
	});

	it('visitas anónimas: Analytics Engine solo en producción, con el dataset del código', () => {
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		expect(config.analytics_engine_datasets).toEqual([
			expect.objectContaining({ binding: BINDING, dataset: DATASET })
		]);
		// Los Previews no tienen el binding: el código no hace nada sin él.
		const previews = /** @type {any} */ (config).previews;
		expect(previews.analytics_engine_datasets ?? []).toEqual([]);
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
	// Las bases, levantadas antes de las pruebas (una con migraciones, vaciada antes de cada una, y
	// otra sin): el arranque de miniflare no cuenta para el tiempo límite de cada prueba.
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let bare;
	beforeAll(async () => {
		[t, bare] = await Promise.all([createTestDB(), createTestDB({ migrate: false })]);
	});
	afterAll(async () => {
		await Promise.all([t?.dispose(), bare?.dispose()]);
	});
	beforeEach(async () => {
		await resetDB(t.db);
	});

	it('con problemas NO hace fallar la corrida: los guarda para "Para revisar"', async () => {
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
		}
	}, 30_000);

	it('el cron nocturno termina bien (backup OK) aunque el chequeo encuentre problemas', async () => {
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
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			expect(await runObjectsIntegrity({ DB: bare.db })).toBeNull();
			expect(log).toHaveBeenCalledWith(expect.stringContaining('0012'));
		} finally {
			log.mockRestore();
		}
	}, 30_000);
});

describe('sesiones sin cookie (después del backup)', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	const DAY = 24 * 60 * 60 * 1000;
	const now = Date.parse('2026-10-03T06:00:00Z');

	/** @param {string} hash una letra (el hash de prueba es esa letra 64 veces) @param {number} lastSeen */
	async function session(hash, lastSeen) {
		await t.db
			.prepare(
				`INSERT INTO account_sessions (token_hash, account_id, method, created_at, last_seen_at)
				VALUES (?1, '00000000-0000-4000-8000-00000000c0de', 'code', ?2, ?2)`
			)
			.bind(hash.repeat(64), lastSeen)
			.run();
	}

	it('borra solo las que ya no tienen cookie en ningún navegador (más de 401 días sin uso)', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			await t.db
				.prepare(
					`INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at)
					VALUES ('00000000-0000-4000-8000-00000000c0de', 'cuenta@example.com', 1, 1, 1)`
				)
				.run();
			// La cookie dura 400 días desde que se mandó por última vez (cuando cambia
			// `last_seen_at`); un día más de margen.
			expect(STALE_SESSION_MS).toBe(401 * DAY);
			await session('a', now); // de hoy
			await session('b', now - 400 * DAY); // la cookie todavía puede estar
			await session('c', now - STALE_SESSION_MS); // justo en el límite: queda
			await session('d', now - STALE_SESSION_MS - 1); // ya no tiene cookie
			await session('e', now - 900 * DAY); // ya no tiene cookie
			expect(await runSessionCleanup({ DB: t.db }, new Date(now))).toBe(2);
			const { results } = await t.db
				.prepare('SELECT substr(token_hash, 1, 1) AS h FROM account_sessions ORDER BY h')
				.all();
			expect(results.map((r) => r.h)).toEqual(['a', 'b', 'c']);
			// En el log, solo cuántas.
			expect(log).toHaveBeenCalledWith('sesiones viejas: 2 borrada(s)');
			// Otra vez: nada más que borrar.
			expect(await runSessionCleanup({ DB: t.db }, new Date(now))).toBe(0);
		} finally {
			log.mockRestore();
		}
	}, 30_000);

	it('si falla, lo escribe en el log y no tira error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('base caída');
			}
		});
		try {
			expect(await runSessionCleanup({ DB: broken })).toBeNull();
			expect(await runSessionCleanup({})).toBeNull();
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining('la limpieza falló'),
				expect.any(Error)
			);
		} finally {
			error.mockRestore();
		}
	});
});

describe('cron desconocido', () => {
	it('falla en vez de hacer algo por las dudas', async () => {
		await expect(
			handleScheduled({ cron: '* * * * *', scheduledTime: 0 }, {}, ctx, vi.fn())
		).rejects.toThrow(/desconocido/);
	});
});

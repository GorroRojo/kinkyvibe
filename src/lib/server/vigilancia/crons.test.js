/**
 * El latido de los crons y la vigilancia (./crons.js), con el D1 de miniflare:
 *
 * - cada corrida anota cuándo arrancó y, si terminó bien, cuándo terminó (`handleScheduled`);
 *   una corrida que falla no anota el final;
 * - anotar nunca hace fallar la corrida (sin la tabla, sin base);
 * - un cron está «parado» cuando no terminó bien en su plazo; uno que nunca anduvo cuenta desde
 *   que se empezó a mirar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import { handleScheduled } from '../scheduled.js';
import {
	BACKUP_CRON,
	RATES_CRON,
	REMINDERS_CRON,
	WATCH_CRON,
	WATCHED_CRONS,
	recordCronOk,
	recordCronStart,
	staleCrons
} from './crons.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ctx = /** @type {any} */ ({ waitUntil() {}, passThroughOnException() {} });
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const T0 = Date.parse('2031-01-08T15:00:00Z');

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

/** @param {string} cron */
async function row(cron) {
	return t.db.prepare('SELECT * FROM cron_heartbeats WHERE cron = ?1').bind(cron).first();
}

describe('los crons vigilados', () => {
	it('son exactamente los de wrangler.toml, con sus plazos', () => {
		expect(WATCHED_CRONS.map((w) => [w.cron, w.maxSilenceMs])).toEqual([
			[REMINDERS_CRON, HOUR],
			[WATCH_CRON, 3 * HOUR],
			[BACKUP_CRON, 26 * HOUR],
			[RATES_CRON, 26 * HOUR]
		]);
	});
});

describe('el latido de cada corrida', () => {
	it('anota el arranque y el final de una corrida que terminó bien', async () => {
		const appFetch = vi.fn(async () => Response.json({ sent: 0 }));
		let now = T0;
		await handleScheduled(
			{ cron: REMINDERS_CRON, scheduledTime: T0 },
			{ DB: t.db, CRON_SECRET: 'x'.repeat(32) },
			ctx,
			appFetch,
			() => (now += 1000)
		);
		expect(await row(REMINDERS_CRON)).toEqual({
			cron: REMINDERS_CRON,
			first_seen_at: T0 + 1000,
			last_started_at: T0 + 1000,
			last_ok_at: T0 + 2000
		});
	});

	it('una corrida que falla anota el arranque pero no el final (y sigue fallando)', async () => {
		await recordCronOk(t.db, REMINDERS_CRON, T0 - HOUR);
		const appFetch = vi.fn(async () => Response.json({ error: 'x' }, { status: 500 }));
		await expect(
			handleScheduled(
				{ cron: REMINDERS_CRON, scheduledTime: T0 },
				{ DB: t.db },
				ctx,
				appFetch,
				() => T0
			)
		).rejects.toThrow(/500/);
		expect(await row(REMINDERS_CRON)).toMatchObject({
			last_started_at: T0,
			last_ok_at: T0 - HOUR
		});
	});

	it('sin la tabla o sin base, la corrida anda igual (solo queda en el log)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const appFetch = vi.fn(async () => Response.json({}));
			await expect(
				handleScheduled({ cron: WATCH_CRON, scheduledTime: T0 }, { DB: bare.db }, ctx, appFetch)
			).resolves.toBeDefined();
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('[vigilancia] no se pudo anotar'),
				expect.anything()
			);
			await expect(recordCronStart(null, WATCH_CRON, T0)).resolves.toBeUndefined();
		} finally {
			warn.mockRestore();
		}
	});
});

describe('staleCrons', () => {
	it('la primera vez no avisa: empieza a contar desde ahora', async () => {
		expect(await staleCrons(t.db, T0)).toEqual([]);
		expect(await row(BACKUP_CRON)).toMatchObject({ first_seen_at: T0, last_ok_at: null });
	});

	it('uno que nunca anduvo avisa pasado su plazo desde que se empezó a mirar', async () => {
		await staleCrons(t.db, T0);
		for (const w of WATCHED_CRONS) await recordCronOk(t.db, w.cron, T0 + 26 * HOUR);
		await t.db
			.prepare('UPDATE cron_heartbeats SET last_ok_at = NULL WHERE cron = ?1')
			.bind(BACKUP_CRON)
			.run();
		const stale = await staleCrons(t.db, T0 + 26 * HOUR + MIN);
		expect(stale).toEqual([
			{
				cron: BACKUP_CRON,
				label: 'Todas las noches: backup de la base',
				lastOkAt: null,
				silentMs: 26 * HOUR + MIN
			}
		]);
	});

	it('el de cada 15 minutos: avisa pasada 1 hora sin terminar bien, no antes', async () => {
		for (const w of WATCHED_CRONS) await recordCronOk(t.db, w.cron, T0);
		expect(await staleCrons(t.db, T0 + HOUR)).toEqual([]);
		const stale = await staleCrons(t.db, T0 + HOUR + MIN);
		expect(stale.map((s) => s.cron)).toEqual([REMINDERS_CRON]);
		expect(stale[0]).toMatchObject({ lastOkAt: T0, silentMs: HOUR + MIN });
	});

	it('la vigilancia a las 3 horas; los de todos los días a las 26', async () => {
		for (const w of WATCHED_CRONS) await recordCronOk(t.db, w.cron, T0);
		expect((await staleCrons(t.db, T0 + 3 * HOUR + MIN)).map((s) => s.cron)).toEqual([
			REMINDERS_CRON,
			WATCH_CRON
		]);
		expect((await staleCrons(t.db, T0 + 26 * HOUR + MIN)).map((s) => s.cron)).toEqual([
			REMINDERS_CRON,
			WATCH_CRON,
			BACKUP_CRON,
			RATES_CRON
		]);
	});

	it('anotar un arranque sin final no lo saca de parado', async () => {
		for (const w of WATCHED_CRONS) await recordCronOk(t.db, w.cron, T0);
		await recordCronStart(t.db, REMINDERS_CRON, T0 + 2 * HOUR);
		expect((await staleCrons(t.db, T0 + 2 * HOUR)).map((s) => s.cron)).toEqual([REMINDERS_CRON]);
	});
});

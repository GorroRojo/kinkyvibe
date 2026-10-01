/**
 * El seed de demo de series (scripts/demo/n3-series.sql) se aplica sobre las migraciones, dos
 * veces sin duplicar nada, y solo trae mails inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '../../src/lib/server/db/testing.js';
import { subscriberCounts } from '../../src/lib/server/series/subscriptions.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

async function applySeed() {
	const sql = await readFile('scripts/demo/n3-series.sql', 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
	return sql;
}

describe('scripts/demo/n3-series.sql', () => {
	it('se aplica (dos veces) y deja el interruptor prendido y suscripciones de prueba', async () => {
		const sql = await applySeed();
		await applySeed();
		const flag = await t.db
			.prepare("SELECT enabled FROM feature_flags WHERE key = 'series'")
			.first();
		expect(flag?.enabled).toBe(1);
		expect(Object.fromEntries(await subscriberCounts(t.db))).toEqual({
			Picantearla: { confirmed: 2, pending: 1 },
			'Cine para Sucixs': { confirmed: 1, pending: 0 }
		});
		for (const m of sql.match(/[\w.+-]+@[\w.-]+/g) ?? []) expect(m).toMatch(/@example\.com$/);
	});
});

/**
 * La migración 0081 (avisos de «Lo que sigo» que fallaron): solo agrega una tabla. Sobre una base
 * con todas las migraciones anteriores se aplica sin tocar lo que ya había, y se puede aplicar dos
 * veces (`IF NOT EXISTS`). Después, las reglas de `follow_notification_failures`: un contador por
 * día, canal y motivo, sin columnas para datos de personas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

const FILE = path.join('migrations', '0081_sigo_avisos_fallidos.sql');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0081')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

async function migrate() {
	const sql = await readFile(FILE, 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
}

/**
 * @param {string} day
 * @param {string} channel
 * @param {string} reason
 * @param {number} [failures]
 */
const insert = (day, channel, reason, failures = 1) =>
	t.db
		.prepare(
			`INSERT INTO follow_notification_failures (day, channel, reason, failures)
			VALUES (?1, ?2, ?3, ?4)`
		)
		.bind(day, channel, reason, failures)
		.run();

describe('migración 0081', () => {
	it('solo agrega la tabla, y aplicarla dos veces no rompe', async () => {
		const tables = async () =>
			(
				await t.db
					.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
					.all()
			).results.map((r) => r.name);
		const old = await tables();
		expect(old).not.toContain('follow_notification_failures');
		await migrate();
		await migrate();
		expect(await tables()).toEqual([...old, 'follow_notification_failures'].sort());
	});

	it('las columnas son solo día, canal, motivo y cuántos (nada de personas)', async () => {
		const { results } = await t.db
			.prepare('SELECT name FROM pragma_table_info(?1) ORDER BY cid')
			.bind('follow_notification_failures')
			.all();
		expect(results.map((r) => r.name)).toEqual(['day', 'channel', 'reason', 'failures']);
	});

	it('canal mail o telegram, motivo error o bloqueado, día AAAA-MM-DD, nunca negativo', async () => {
		await insert('2026-11-05', 'mail', 'error');
		await insert('2026-11-05', 'telegram', 'bloqueado', 3);
		await expect(insert('2026-11-05', 'sms', 'error')).rejects.toThrow();
		await expect(insert('2026-11-05', 'mail', 'otro')).rejects.toThrow();
		await expect(insert('5/11', 'mail', 'error')).rejects.toThrow();
		await expect(insert('2026-11-06', 'mail', 'error', -1)).rejects.toThrow();
		// Una fila por día, canal y motivo.
		await expect(insert('2026-11-05', 'mail', 'error')).rejects.toThrow();
	});
});

/**
 * La plantilla de la base de prueba (src/tests/globalSetup.js → `startTemplateDB` en ./testing.js):
 * una base que arranca copiando la plantilla tiene que ser igual a una migrada archivo por archivo
 * (mismo esquema, mismas filas que dejan las migraciones, mismas secuencias), y cada copia tiene
 * que ser independiente de las demás. Si esta prueba falla, la plantilla esconde una diferencia:
 * arreglala o sacala, no relajes la comparación.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEMPLATE_ENV, createTestDB, snapshotDB } from './testing.js';

/** Espera a que el globalSetup termine de armar la plantilla (se arma en segundo plano). */
async function waitForTemplate() {
	const dir = process.env[TEMPLATE_ENV];
	if (!dir) return;
	for (let i = 0; i < 600 && !existsSync(path.join(dir, 'migrations.sha256')); i++)
		await new Promise((resolve) => setTimeout(resolve, 50));
}

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let fromTemplate;
/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let migrated;
/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let other;

beforeAll(async () => {
	await waitForTemplate();
	[fromTemplate, migrated, other] = await Promise.all([
		createTestDB(),
		createTestDB({ template: false }),
		createTestDB()
	]);
}, 60_000);
afterAll(async () => {
	await Promise.all([fromTemplate?.dispose(), migrated?.dispose(), other?.dispose()]);
});

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function schema(db) {
	const { results } = await db
		.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
		.all();
	return results;
}

/** @param {import('@cloudflare/workers-types').D1Database} db @param {string} sql */
const rows = async (db, sql) => (await db.prepare(sql).all()).results;

describe('plantilla de la base de prueba', () => {
	it('el globalSetup la armó y createTestDB arranca de ella', () => {
		expect(process.env[TEMPLATE_ENV]).toBeTruthy();
		expect(fromTemplate.fromTemplate).toBe(true);
		expect(other.fromTemplate).toBe(true);
		expect(migrated.fromTemplate).toBe(false);
	});

	it('mismo esquema que una base migrada archivo por archivo', async () => {
		const expected = await schema(migrated.db);
		expect(expected.length).toBeGreaterThan(50);
		expect(await schema(fromTemplate.db)).toEqual(expected);
	});

	it('mismas filas (las que insertan las migraciones), mismas secuencias y misma tabla de migraciones', async () => {
		expect(await snapshotDB(fromTemplate.db)).toEqual(await snapshotDB(migrated.db));
		const sequences = 'SELECT name, seq FROM sqlite_sequence ORDER BY name';
		expect(await rows(fromTemplate.db, sequences)).toEqual(await rows(migrated.db, sequences));
		// applyMigrations no lleva la cuenta en d1_migrations (eso es de wrangler): ninguna de las
		// dos la tiene, y si algún día la tiene una, tiene que tenerla igual la otra.
		const ledger = "SELECT name FROM sqlite_master WHERE name = 'd1_migrations'";
		expect(await rows(fromTemplate.db, ledger)).toEqual(await rows(migrated.db, ledger));
	});

	it('cada copia es independiente: lo que se escribe en una no aparece en otra', async () => {
		await fromTemplate.db
			.prepare('CREATE TABLE prueba_plantilla (id INTEGER PRIMARY KEY, v TEXT)')
			.run();
		await fromTemplate.db.prepare("INSERT INTO prueba_plantilla (v) VALUES ('solo acá')").run();
		const table = "SELECT name FROM sqlite_master WHERE name = 'prueba_plantilla'";
		expect(await rows(fromTemplate.db, table)).toHaveLength(1);
		expect(await rows(other.db, table)).toEqual([]);
		// Y una base nueva, creada después, tampoco lo ve (la plantilla no se toca).
		const later = await createTestDB();
		try {
			expect(later.fromTemplate).toBe(true);
			expect(await rows(later.db, table)).toEqual([]);
		} finally {
			await later.dispose();
		}
	});
});

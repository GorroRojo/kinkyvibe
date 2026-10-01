/**
 * Backup completo contra un D1 y un R2 reales de miniflare (en memoria): volcar, comprimir,
 * subir, bajar, restaurar en una base nueva y comparar fila por fila.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '../db/testing.js';
import { dumpDatabase } from './dump.js';
import { backupDatabase, gunzipText, gzipText, nightlyBackup, pruneBackups } from './index.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

// Levanta varias bases de miniflare y restaura unas miles de sentencias.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let source;

// Datos inventados que cubren los casos difíciles del volcado.
const FIXTURES = [
	`CREATE TABLE kv_tipos (
		id INTEGER PRIMARY KEY,
		texto TEXT,
		entero INTEGER,
		real REAL,
		sin_tipo,
		datos BLOB
	)`,
	`INSERT INTO kv_tipos VALUES (1, 'it''s; -- no es comentario
/* tampoco */ ñandú 🦄', 9007199254740993, 1.0, 0.30000000000000004, X'00FF10')`,
	`INSERT INTO kv_tipos VALUES (2, NULL, -42, -2.5, 3.0, X'')`,
	`INSERT INTO kv_tipos VALUES (3, 'con' || char(0) || 'nul', 0, 1e300, 'texto', NULL)`,
	`INSERT INTO kv_tipos VALUES (4, '', NULL, NULL, 7, NULL)`,
	// Sin INTEGER PRIMARY KEY: el rowid se conserva aunque haya huecos.
	`CREATE TABLE kv_sin_pk (nombre TEXT NOT NULL, nota TEXT)`,
	`INSERT INTO kv_sin_pk (rowid, nombre, nota) VALUES (10, 'Persona Inventada', 'a'), (25, 'Otra Persona', NULL)`,
	`CREATE TABLE kv_without (clave TEXT PRIMARY KEY, valor INTEGER) WITHOUT ROWID`,
	`INSERT INTO kv_without VALUES ('b', 2), ('a', 1)`,
	// Foreign key hacia una tabla creada después: el orden no importa (defer_foreign_keys).
	`CREATE TABLE kv_hijo (id INTEGER PRIMARY KEY, padre_id INTEGER NOT NULL REFERENCES kv_padre(id))`,
	`CREATE TABLE kv_padre (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT)`,
	`INSERT INTO kv_padre (id, nombre) VALUES (1, 'uno'), (5, 'cinco')`,
	`INSERT INTO kv_hijo VALUES (1, 5), (2, 1)`,
	`CREATE TABLE "raro ""nombre""" ("col 1" TEXT, "select" INTEGER)`,
	`INSERT INTO "raro ""nombre""" VALUES ('x', 1)`,
	`CREATE INDEX kv_hijo_padre ON kv_hijo (padre_id)`,
	`CREATE VIEW kv_vista AS SELECT h.id, p.nombre FROM kv_hijo h JOIN kv_padre p ON p.id = h.padre_id`,
	// El trigger no se tiene que disparar al restaurar (va después de las filas).
	`CREATE TABLE kv_log (msg TEXT)`,
	`CREATE TRIGGER kv_padre_log AFTER INSERT ON kv_padre BEGIN INSERT INTO kv_log VALUES ('insert ' || NEW.id); END`,
	// Tablas virtuales: FTS5 con contenido propio y con contenido externo.
	`CREATE VIRTUAL TABLE kv_buscar USING fts5(titulo, cuerpo)`,
	`INSERT INTO kv_buscar (rowid, titulo, cuerpo) VALUES (7, 'hola', 'mundo'), (9, 'chau', 'todes')`,
	`CREATE VIRTUAL TABLE kv_buscar_padre USING fts5(nombre, content='kv_padre', content_rowid='id')`,
	`INSERT INTO kv_buscar_padre (kv_buscar_padre) VALUES ('rebuild')`
];

beforeAll(async () => {
	source = await createTestDB();
	for (const sql of FIXTURES) await source.db.prepare(sql).run();
	// Muchas filas, para pasar por varias páginas de lectura.
	await source.db
		.prepare(
			`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1234)
			 INSERT INTO kv_log SELECT 'fila ' || i FROM n`
		)
		.run();
});
afterAll(async () => {
	await source?.dispose();
});

/**
 * Esquema (sin tablas internas) y todas las filas de todas las tablas, con su tipo exacto.
 *
 * Las tablas sombra de FTS (`x_data`, `x_idx`…) se comparan por lo que indexan, no byte a byte:
 * el backup no las copia (dump.js) y SQLite las regenera con una estructura interna que puede
 * ser distinta (por ejemplo, un índice nunca escrito contra uno reconstruido con 'rebuild').
 * Por eso se leen las filas de la tabla virtual (su contenido) y `assertFtsIntact` verifica el
 * índice de la copia.
 *
 * @param {D1Database} db
 */
async function snapshot(db) {
	const { results: schema } = await db
		.prepare(
			"SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name"
		)
		.all();
	/** @type {Record<string, unknown[]>} */
	const rows = {};
	const { results: tableList } = await db
		.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'shadow'")
		.all();
	const shadows = new Set(tableList.map((r) => String(r.name)));
	const tables = schema
		.filter((r) => r.type === 'table' && !shadows.has(String(r.name)))
		.map((r) => String(r.name));
	for (const name of tables) {
		const q = `"${name.replaceAll('"', '""')}"`;
		const { results: cols } = await db.prepare(`PRAGMA table_xinfo(${q})`).all();
		const visible = cols.filter((c) => Number(c.hidden) === 0).map((c) => String(c.name));
		const exprs = visible.map((c) => {
			const qc = `"${c.replaceAll('"', '""')}"`;
			return `typeof(${qc}) || ':' || coalesce(hex(${qc}), '')`;
		});
		const wr = /WITHOUT\s+ROWID/i.test(String(schema.find((s) => s.name === name)?.sql));
		const select = wr ? exprs.join(', ') : ['rowid', ...exprs].join(', ');
		const { results } = await db.prepare(`SELECT ${select} FROM ${q}`).all();
		rows[name] = results.map((r) => Object.values(r));
	}
	return { schema, rows };
}

/**
 * Cada índice FTS5 de la base coincide con su contenido (si no, SQLite tira SQLITE_CORRUPT_VTAB).
 *
 * @param {D1Database} db
 */
async function assertFtsIntact(db) {
	const { results } = await db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE 'CREATE VIRTUAL TABLE%fts5%'"
		)
		.all();
	expect(results.length).toBeGreaterThan(0);
	for (const { name } of results) {
		const q = `"${String(name).replaceAll('"', '""')}"`;
		await db.prepare(`INSERT INTO ${q} (${q}, rank) VALUES ('integrity-check', 1)`).run();
	}
}

/**
 * Restaura un volcado en una base (como `wrangler d1 execute --file`).
 *
 * @param {D1Database} db
 * @param {string} sql
 */
async function restore(db, sql) {
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await db.batch(statements.map((s) => db.prepare(s)));
}

describe('dump → restore', () => {
	it('una base nueva queda con el mismo esquema y exactamente las mismas filas', async () => {
		const { sql, stats } = await dumpDatabase(source.db, {
			now: new Date('2026-10-01T06:00:00Z')
		});
		expect(stats.perTable.kv_log).toBe(1234);
		expect(stats.perTable.kv_tipos).toBe(4);
		// Las tablas sombra de FTS5 no se copian: SQLite las regenera.
		expect(Object.keys(stats.perTable)).not.toContain('kv_buscar_data');
		expect(sql).toContain(
			'INSERT INTO "kv_buscar_padre" ("kv_buscar_padre") VALUES (\'rebuild\');'
		);

		const target = await createTestDB({ migrate: false });
		try {
			const { results: empty } = await target.db
				.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'kv_%'")
				.all();
			expect(empty).toEqual([]);

			await restore(target.db, sql);

			const before = await snapshot(source.db);
			const after = await snapshot(target.db);
			expect(after.schema).toEqual(before.schema);
			expect(after.rows).toEqual(before.rows);
			await assertFtsIntact(target.db);

			// Las búsquedas de texto completo andan en la copia.
			const hit = await target.db
				.prepare("SELECT rowid FROM kv_buscar WHERE kv_buscar MATCH 'todes'")
				.all();
			expect(hit.results).toEqual([{ rowid: 9 }]);
			const hitExt = await target.db
				.prepare("SELECT rowid FROM kv_buscar_padre WHERE kv_buscar_padre MATCH 'cinco'")
				.all();
			expect(hitExt.results).toEqual([{ rowid: 5 }]);
			// El entero grande no perdió precisión.
			const big = await target.db
				.prepare('SELECT CAST(entero AS TEXT) AS e FROM kv_tipos WHERE id = 1')
				.first();
			expect(big).toEqual({ e: '9007199254740993' });
		} finally {
			await target.dispose();
		}
	});

	it('el volcado es SQL que wrangler puede partir en sentencias', async () => {
		const { sql } = await dumpDatabase(source.db);
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		expect(statements[0]).toMatch(/PRAGMA defer_foreign_keys = true/);
		expect(statements.some((s) => /^CREATE TABLE kv_tipos/m.test(s))).toBe(true);
	});
});

describe('backup en R2', () => {
	it('sube el volcado comprimido con la clave del día y se puede bajar y restaurar', async () => {
		const bucket = /** @type {import('@cloudflare/workers-types').R2Bucket} */ (source.env.BACKUPS);
		expect(bucket).toBeTruthy();
		const now = new Date('2026-10-01T06:00:07Z');
		const result = await backupDatabase({ db: source.db, bucket, now });
		expect(result.key).toBe('d1/2026-10-01.sql.gz');

		const object = await bucket.get(result.key);
		expect(object).toBeTruthy();
		const bytes = new Uint8Array(await /** @type {any} */ (object).arrayBuffer());
		// Cabecera gzip.
		expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
		const sql = await gunzipText(bytes);
		expect(sql).toContain('CREATE TABLE kv_tipos');
		expect(/** @type {any} */ (object).customMetadata.rows).toBe(String(result.rows));

		const target = await createTestDB({ migrate: false });
		try {
			await restore(target.db, sql);
			expect((await snapshot(target.db)).rows).toEqual((await snapshot(source.db)).rows);
			await assertFtsIntact(target.db);
		} finally {
			await target.dispose();
		}
	});

	it('el manual va aparte y el nocturno borra los viejos según la retención', async () => {
		const bucket = /** @type {import('@cloudflare/workers-types').R2Bucket} */ (source.env.BACKUPS);
		for (const key of ['d1/2026-07-01.sql.gz', 'd1/2026-07-02.sql.gz', 'd1/notas.txt']) {
			await bucket.put(key, 'x');
		}
		const manual = await backupDatabase({
			db: source.db,
			bucket,
			now: new Date('2026-10-02T12:00:00Z'),
			manual: true
		});
		expect(manual.key).toBe('d1/manual/2026-10-02T12-00-00Z.sql.gz');

		const result = await nightlyBackup({
			db: source.db,
			bucket,
			now: new Date('2026-10-03T06:00:00Z')
		});
		expect(result.key).toBe('d1/2026-10-03.sql.gz');
		expect(result.deleted).toEqual(['d1/2026-07-02.sql.gz']);

		const { objects } = await bucket.list({ prefix: 'd1/' });
		expect(objects.map((o) => o.key).sort()).toEqual([
			'd1/2026-07-01.sql.gz',
			'd1/2026-10-01.sql.gz',
			'd1/2026-10-03.sql.gz',
			'd1/manual/2026-10-02T12-00-00Z.sql.gz',
			'd1/notas.txt'
		]);
		// Idempotente.
		expect(await pruneBackups({ bucket, now: new Date('2026-10-03T06:00:00Z') })).toEqual([]);
	});
});

describe('gzip', () => {
	it('ida y vuelta sin perder nada', async () => {
		const text = "línea 1\nit's 🦄\0fin";
		expect(await gunzipText(await gzipText(text))).toBe(text);
	});
});

/**
 * `snapshotDB` y `restoreDB` (./testing.js): la copia de la base de prueba vuelve exactamente con
 * las mismas filas (ids, textos, bytes, FTS, columnas generadas), aunque en el medio se haya
 * borrado, cambiado o agregado de todo. Datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDB, resetDB, restoreDB, snapshotDB } from './testing.js';
import { importTags } from '../etiquetas/importer.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	// Tablas que la app no tiene, para probar lo que las migraciones de hoy no usan: bytes y
	// números raros, una tabla WITHOUT ROWID y una FTS5 sin contenido externo.
	await t.db.batch([
		t.db.prepare('CREATE TABLE prueba_tipos (id INTEGER PRIMARY KEY, b BLOB, r REAL, s TEXT)'),
		t.db.prepare('CREATE TABLE prueba_sin_rowid (k TEXT PRIMARY KEY, v INTEGER) WITHOUT ROWID'),
		t.db.prepare('CREATE VIRTUAL TABLE prueba_fts USING fts5 (texto)')
	]);
});
afterAll(async () => {
	await t?.dispose();
});

/** Todas las filas de cada tabla (con las columnas generadas), para comparar. */
async function dump() {
	const { results: tables } = await t.db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name != 'd1_migrations' AND name NOT LIKE '%fts_%' ORDER BY name"
		)
		.all();
	/** @type {Record<string, unknown[]>} */
	const out = {};
	for (const { name } of tables) {
		const { results } = await t.db.prepare(`SELECT * FROM "${name}"`).all();
		out[String(name)] = results.map((r) => JSON.stringify(r)).sort();
	}
	return out;
}

/** @param {string} sql @param {string} term */
const ids = async (sql, term) =>
	(await t.db.prepare(sql).bind(term).all()).results.map((r) => Number(r.id));

const SEARCH_OBJECTS =
	'SELECT rowid AS id FROM objects_fts WHERE objects_fts MATCH ?1 ORDER BY rowid';
const SEARCH_PRUEBA = 'SELECT rowid AS id FROM prueba_fts WHERE prueba_fts MATCH ?1 ORDER BY rowid';

describe('snapshotDB / restoreDB', () => {
	it('vuelve a dejar exactamente las mismas filas, con la búsqueda andando', async () => {
		await resetDB(t.db);
		await importTags(
			t.db,
			{
				rawTags: [
					{ id: 'root', children: ['Etiqueta Madre'] },
					{ id: 'Etiqueta Madre', children: ['Hija de prueba'], related: ['Otra cosa'] },
					{ id: 'Hija de prueba' },
					{ id: 'Otra cosa' }
				]
			},
			{ actor: 'prueba', now: Date.UTC(2026, 9, 1) }
		);
		await t.db.batch([
			t.db
				.prepare('INSERT INTO prueba_tipos (id, b, r, s) VALUES (?1, ?2, ?3, ?4)')
				.bind(7, new Uint8Array([0, 1, 254, 255]), 1.5, 'comillas "dobles" y \'simples\''),
			t.db.prepare('INSERT INTO prueba_tipos (id, b, r, s) VALUES (8, NULL, -0.25, NULL)'),
			t.db.prepare("INSERT INTO prueba_sin_rowid (k, v) VALUES ('b', 2), ('a', 1)"),
			t.db.prepare("INSERT INTO prueba_fts (rowid, texto) VALUES (40, 'palabra única')")
		]);
		const before = await dump();
		expect(before.objects.length).toBeGreaterThanOrEqual(4);
		expect(before.edges.length).toBeGreaterThan(0);
		const found = await ids(SEARCH_OBJECTS, 'madre');
		expect(found).toHaveLength(1);

		const snap = await snapshotDB(t.db);

		// Cambios de todo tipo en el medio.
		await t.db.batch([
			t.db.prepare('PRAGMA defer_foreign_keys = on'),
			t.db.prepare('DELETE FROM edges'),
			t.db.prepare(
				"UPDATE objects SET title = 'Otro título', search_text = '', version = version + 1"
			),
			t.db.prepare('DELETE FROM prueba_tipos WHERE id = 7'),
			t.db.prepare("INSERT INTO prueba_sin_rowid (k, v) VALUES ('c', 3)"),
			t.db.prepare("INSERT INTO prueba_fts (rowid, texto) VALUES (41, 'palabra nueva')")
		]);
		expect(await ids(SEARCH_OBJECTS, 'madre')).toEqual([]);

		await restoreDB(t.db, snap);
		expect(await dump()).toEqual(before);
		expect(await ids(SEARCH_OBJECTS, 'madre')).toEqual(found);
		expect(await ids(SEARCH_PRUEBA, 'palabra')).toEqual([40]);
		const blob = await t.db.prepare('SELECT hex(b) AS h FROM prueba_tipos WHERE id = 7').first();
		expect(blob).toEqual({ h: '0001FEFF' });

		// Una copia sigue sirviendo después de usarla, y sobre una base vacía también.
		await resetDB(t.db);
		await restoreDB(t.db, snap);
		expect(await dump()).toEqual(before);
	});

	it('los ids nuevos no repiten los de la copia (AUTOINCREMENT, como con resetDB)', async () => {
		await resetDB(t.db);
		await importTags(
			t.db,
			{ rawTags: [{ id: 'root', children: ['Una'] }, { id: 'Una' }] },
			{ actor: 'prueba' }
		);
		const snap = await snapshotDB(t.db);
		await resetDB(t.db);
		await restoreDB(t.db, snap);
		const { max } = /** @type {{ max: number }} */ (
			await t.db.prepare('SELECT max(id) AS max FROM objects').first()
		);
		await importTags(
			t.db,
			{ rawTags: [{ id: 'root', children: ['Una', 'Otra'] }, { id: 'Una' }, { id: 'Otra' }] },
			{ actor: 'prueba' }
		);
		const row = /** @type {{ id: number }} */ (
			await t.db.prepare("SELECT id FROM objects WHERE title = 'Otra'").first()
		);
		expect(row.id).toBeGreaterThan(max);
	});

	it('una base vacía da una copia sin filas', async () => {
		await resetDB(t.db);
		const snap = await snapshotDB(t.db);
		expect(snap.every((table) => table.rows.length === 0)).toBe(true);
		await restoreDB(t.db, snap);
		expect(await t.db.prepare('SELECT count(*) AS n FROM objects').first()).toEqual({ n: 0 });
	});
});

// Cada consulta viaja por un WebSocket con el worker de prueba; lo que no entra en un mensaje
// (más de 4 M caracteres de JSON) va por un pedido HTTP suelto. Las respuestas tienen que ser las
// mismas por los dos caminos.
describe('el canal con la base de prueba', () => {
	it('una tanda que no entra en un mensaje llega entera', async () => {
		const s = 'x'.repeat(900_000);
		const results = await t.db.batch(
			Array.from({ length: 5 }, (_, i) =>
				t.db.prepare('SELECT ?1 AS i, length(?2) AS n').bind(i, s)
			)
		);
		expect(results.map((r) => r.results[0])).toEqual(
			Array.from({ length: 5 }, (_, i) => ({ i, n: 900_000 }))
		);
	});

	it('una respuesta que no entra en un mensaje vuelve entera', async () => {
		const { results } = await t.db
			.prepare(
				"WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 5000) SELECT i, printf('%.*c', 1000, 'y') AS s FROM c"
			)
			.all();
		expect(results).toHaveLength(5000);
		expect(results[4999]).toEqual({ i: 5000, s: 'y'.repeat(1000) });
	});

	it('consultas a la vez: cada una recibe su respuesta, y los errores vuelven como errores', async () => {
		const values = await Promise.all(
			Array.from({ length: 50 }, (_, i) => t.db.prepare('SELECT ?1 AS i').bind(i).first('i'))
		);
		expect(values).toEqual(Array.from({ length: 50 }, (_, i) => i));
		await expect(t.db.prepare('SELECT * FROM no_existe').all()).rejects.toThrow(
			/no such table: no_existe/
		);
		// El canal sigue andando después de un error.
		expect(await t.db.prepare('SELECT 1 AS uno').first()).toEqual({ uno: 1 });
	});
});

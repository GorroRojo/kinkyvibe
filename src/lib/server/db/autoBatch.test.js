/**
 * Las tandas automáticas (./autoBatch.js): las lecturas de un pedido que salen a la par van en una
 * ida; los errores, las escrituras y lo de fuera de un pedido, como siempre. D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from './testing.js';
import { autoBatcher } from './autoBatch.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	await t.db.exec('CREATE TABLE tanda_prueba (id INTEGER PRIMARY KEY, nombre TEXT)');
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await t.db.prepare('DELETE FROM tanda_prueba').run();
	await t.db
		.prepare("INSERT INTO tanda_prueba (id, nombre) VALUES (1, 'uno'), (2, 'dos'), (3, 'tres')")
		.run();
});

/** Un pedido de mentira: la tanda es de este objeto mientras `scope.current` lo apunte. */
function setup() {
	const counted = countingDB(t.db);
	const scope = { current: /** @type {object | null} */ ({}) };
	const db = autoBatcher(() => scope.current)(counted.db);
	return { counted, scope, db };
}

const byId = 'SELECT id, nombre FROM tanda_prueba WHERE id = ?1';

describe('autoBatcher', () => {
	it('lo que sale a la par va en una ida, cada una con su respuesta', async () => {
		const { counted, db } = setup();
		const [a, b, all, name] = await Promise.all([
			db.prepare(byId).bind(1).first(),
			db.prepare(byId).bind(2).first(),
			db.prepare('SELECT id FROM tanda_prueba ORDER BY id').all(),
			db.prepare(byId).bind(3).first('nombre')
		]);
		expect(a).toEqual({ id: 1, nombre: 'uno' });
		expect(b).toEqual({ id: 2, nombre: 'dos' });
		expect(all.results.map((r) => r.id)).toEqual([1, 2, 3]);
		expect(name).toBe('tres');
		expect(counted.queries).toBe(1);
		expect(counted.statements).toBe(4);
	});

	it('también lo que sale después de varias microtareas (caminos con await en el medio)', async () => {
		const { counted, db } = setup();
		const deep = async () => {
			for (let i = 0; i < 20; i++) await Promise.resolve();
			return db.prepare(byId).bind(2).first();
		};
		const [a, b] = await Promise.all([db.prepare(byId).bind(1).first(), deep()]);
		expect([a?.nombre, b?.nombre]).toEqual(['uno', 'dos']);
		expect(counted.queries).toBe(1);
	});

	it('la misma lectura dos veces en el pedido: una sola consulta, y cada une recibe su copia', async () => {
		const { counted, db } = setup();
		const a = await db.prepare(byId).bind(1).first();
		const b = await db.prepare(byId).bind(1).first();
		expect(b).toEqual(a);
		expect(b).not.toBe(a);
		expect(counted.statements).toBe(1);
	});

	it('una escritura sale enseguida, después de lo que esperaba, y olvida lo leído', async () => {
		const { counted, db } = setup();
		expect(await db.prepare(byId).bind(1).first('nombre')).toBe('uno');
		const read = db.prepare(byId).bind(2).first('nombre');
		await db.prepare("UPDATE tanda_prueba SET nombre = 'UNO' WHERE id = 1").run();
		expect(await read).toBe('dos');
		// Lo leído antes de la escritura no se reusa.
		expect(await db.prepare(byId).bind(1).first('nombre')).toBe('UNO');
		expect(counted.statements).toBe(4);
	});

	it('si una falla, las demás reciben lo suyo y la que falla, su error', async () => {
		const { db } = setup();
		const [ok, bad, other] = await Promise.allSettled([
			db.prepare(byId).bind(1).first('nombre'),
			db.prepare('SELECT * FROM no_existe_inventada').all(),
			db.prepare(byId).bind(3).first('nombre')
		]);
		expect(ok).toEqual({ status: 'fulfilled', value: 'uno' });
		expect(bad.status).toBe('rejected');
		expect(String(/** @type {any} */ (bad).reason)).toMatch(/no such table/);
		expect(other).toEqual({ status: 'fulfilled', value: 'tres' });
	});

	it('un db.batch de lecturas entra en la tanda; uno con escrituras va directo', async () => {
		const { counted, db } = setup();
		const [pair, one] = await Promise.all([
			db.batch([db.prepare(byId).bind(1), db.prepare(byId).bind(2)]),
			db.prepare(byId).bind(3).first('nombre')
		]);
		expect(pair.map((/** @type {any} */ r) => r.results[0].nombre)).toEqual(['uno', 'dos']);
		expect(one).toBe('tres');
		expect(counted.queries).toBe(1);
		await db.batch([
			db.prepare("UPDATE tanda_prueba SET nombre = 'x' WHERE id = 1"),
			db.prepare(byId).bind(1)
		]);
		expect(counted.queries).toBe(2);
	});

	it('fuera de un pedido de lectura, una ida por consulta, como siempre', async () => {
		const { counted, db, scope } = setup();
		scope.current = null;
		await Promise.all([db.prepare(byId).bind(1).first(), db.prepare(byId).bind(2).first()]);
		expect(counted.queries).toBe(2);
	});

	it('cada pedido con su tanda', async () => {
		const { counted, db, scope } = setup();
		const a = db.prepare(byId).bind(1).first('nombre');
		scope.current = {};
		const b = db.prepare(byId).bind(1).first('nombre');
		expect([await a, await b]).toEqual(['uno', 'uno']);
		expect(counted.queries).toBe(2);
	});

	it('el mismo envoltorio para el mismo binding', () => {
		const wrap = autoBatcher(() => null);
		expect(wrap(t.db)).toBe(wrap(t.db));
		expect(wrap(null)).toBeNull();
	});
});

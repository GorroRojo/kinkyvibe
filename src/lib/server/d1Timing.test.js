/**
 * La parte `d1` de `Server-Timing` (./d1Timing.js): cuenta las sentencias y las idas a D1 de cada
 * pedido, sin cambiar lo que devuelve la base y sin mezclar pedidos que corren a la par.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createD1Stats, d1ServerTiming, d1Timer } from './d1Timing.js';
import { countingDB, createTestDB } from './db/testing.js';

/** Un reloj que se mueve a mano. */
function fakeClock(start = 1000) {
	let now = start;
	const clock = () => now;
	clock.advance = (/** @type {number} */ ms) => (now += ms);
	return clock;
}

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(() => t?.dispose());

/** El Worker real: un contexto por pedido y un envoltorio por binding. */
function setup() {
	const context = new AsyncLocalStorage();
	const wrap = d1Timer(() => /** @type {any} */ (context.getStore()));
	return { context, wrap };
}

describe('d1Timer', () => {
	it('3 sentencias dan n=3 (first, all, run y raw cuentan; prepare y bind no)', async () => {
		const { context, wrap } = setup();
		const counted = countingDB(t.db);
		const db = wrap(counted.db);
		const stats = createD1Stats();
		await context.run(stats, async () => {
			const one = db.prepare('SELECT ?1 AS n').bind(7);
			expect(await one.first()).toEqual({ n: 7 });
			expect((await db.prepare('SELECT 1 AS n').all()).results).toEqual([{ n: 1 }]);
			expect(await db.prepare('SELECT 2 AS n').raw()).toEqual([[2]]);
		});
		expect(counted.queries).toBe(3);
		expect(stats.statements).toBe(3);
		expect(stats.trips).toBe(3);
		expect(d1ServerTiming(stats)).toMatch(/^d1;dur=[\d.]+;desc="3 consultas en 3 idas"$/);
	});

	it('una tanda cuenta sus sentencias en una sola ida y le pasa a D1 las originales', async () => {
		const { context, wrap } = setup();
		const db = wrap(t.db);
		const stats = createD1Stats();
		const results = await context.run(stats, () =>
			db.batch([db.prepare('SELECT 1 AS n'), db.prepare('SELECT ?1 AS n').bind(2)])
		);
		expect(results.map((r) => r.results)).toEqual([[{ n: 1 }], [{ n: 2 }]]);
		expect(stats.statements).toBe(2);
		expect(stats.trips).toBe(1);
		expect(d1ServerTiming(stats)).toMatch(/desc="2 consultas en 1 ida"$/);
	});

	it('no mezcla dos pedidos a la par, aunque compartan el envoltorio', async () => {
		const { context, wrap } = setup();
		const db = wrap(t.db);
		const a = createD1Stats();
		const b = createD1Stats();
		/** @param {number} n */
		const queries = async (n) => {
			for (let i = 0; i < n; i++) {
				await db.prepare('SELECT ?1 AS i').bind(i).first();
				await new Promise((r) => setTimeout(r, 1));
			}
		};
		await Promise.all([context.run(a, () => queries(2)), context.run(b, () => queries(5))]);
		expect([a.statements, b.statements]).toEqual([2, 5]);
	});

	it('fuera de un pedido no cuenta nada (y la consulta anda igual)', async () => {
		const { wrap } = setup();
		const db = wrap(t.db);
		expect(await db.prepare('SELECT 3 AS n').first()).toEqual({ n: 3 });
	});

	it('el mismo binding da siempre el mismo envoltorio; sin binding, lo deja igual', () => {
		const { wrap } = setup();
		expect(wrap(t.db)).toBe(wrap(t.db));
		expect(wrap(undefined)).toBeUndefined();
		expect(wrap(null)).toBeNull();
	});

	it('el tiempo es el que hubo alguna sentencia en camino (las que van a la par no se suman)', async () => {
		const clock = fakeClock();
		const stats = createD1Stats(clock);
		/** @type {(() => void)[]} */
		const pending = [];
		const fake = {
			prepare: (/** @type {string} */ _sql) => ({
				first: () => new Promise((resolve) => pending.push(() => resolve(null)))
			})
		};
		const context = new AsyncLocalStorage();
		const db = d1Timer(() => /** @type {any} */ (context.getStore()))(fake);
		const both = context.run(stats, () =>
			Promise.all([db.prepare('a').first(), db.prepare('b').first()])
		);
		clock.advance(30);
		expect(d1ServerTiming(stats)).toBe('d1;dur=30;desc="2 consultas en 2 idas"');
		pending.forEach((done) => done());
		await both;
		clock.advance(100);
		expect(d1ServerTiming(stats)).toBe('d1;dur=30;desc="2 consultas en 2 idas"');
	});

	it('si la sentencia falla, la cuenta igual y el error sigue de largo', async () => {
		const { context, wrap } = setup();
		const db = wrap(t.db);
		const stats = createD1Stats();
		await expect(
			context.run(stats, () => db.prepare('SELECT * FROM no_existe').all())
		).rejects.toThrow(/no such table/);
		expect(stats.statements).toBe(1);
		expect(stats.inFlight).toBe(0);
	});

	it('sin consultas (página guardada en la caché): 0', () => {
		expect(d1ServerTiming(createD1Stats())).toBe('d1;dur=0;desc="0 consultas en 0 idas"');
	});
});

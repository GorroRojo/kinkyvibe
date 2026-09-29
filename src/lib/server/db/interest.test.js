import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from './testing.js';
import {
	INTEREST_RATE_LIMITS,
	checkInterestRateLimit,
	getInterest,
	hashVisitor,
	setInterest
} from './interest.js';
import { hitRateLimit } from './rateLimit.js';
import { getDB } from './index.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

describe('getDB', () => {
	it('devuelve null sin plataforma o sin binding', () => {
		expect(getDB(undefined)).toBeNull();
		expect(getDB(/** @type {any} */ ({ env: {} }))).toBeNull();
	});

	it('devuelve null si el env tira error (rutas prerenderizadas)', () => {
		const env = {};
		Object.defineProperty(env, 'DB', {
			get: () => {
				throw new Error('Cannot access platform.env.DB in a prerenderable route');
			}
		});
		expect(getDB(/** @type {any} */ ({ env }))).toBeNull();
	});

	it('devuelve el binding real', () => {
		expect(getDB(t.platform)).toBe(t.db);
	});
});

describe('hashVisitor', () => {
	it('es determinístico y no contiene el id', async () => {
		const h = await hashVisitor('evento', A);
		expect(h).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashVisitor('evento', A)).toBe(h);
		expect(h).not.toContain(A.slice(0, 8));
	});

	it('cambia según evento y sal (no se puede cruzar entre eventos)', async () => {
		const h = await hashVisitor('evento', A);
		expect(await hashVisitor('otro-evento', A)).not.toBe(h);
		expect(await hashVisitor('evento', A, 'sal-secreta')).not.toBe(h);
		expect(await hashVisitor('evento', B)).not.toBe(h);
	});

	it('rechaza entradas inválidas', async () => {
		await expect(hashVisitor("x'; DROP TABLE event_interest;--", A)).rejects.toThrow(TypeError);
		await expect(hashVisitor('evento', 'no-es-un-uuid')).rejects.toThrow(TypeError);
	});
});

describe('interés por evento', () => {
	it('arranca en cero', async () => {
		expect(await getInterest(t.db, 'evento')).toEqual({ count: 0, interested: false });
		const h = await hashVisitor('evento', A);
		expect(await getInterest(t.db, 'evento', h)).toEqual({ count: 0, interested: false });
	});

	it('cuenta un voto por navegador y es idempotente', async () => {
		const ha = await hashVisitor('evento', A);
		const hb = await hashVisitor('evento', B);
		expect(await setInterest(t.db, 'evento', ha, true)).toEqual({ count: 1, interested: true });
		expect(await setInterest(t.db, 'evento', ha, true)).toEqual({ count: 1, interested: true });
		expect(await setInterest(t.db, 'evento', hb, true)).toEqual({ count: 2, interested: true });
		expect(await getInterest(t.db, 'evento', ha)).toEqual({ count: 2, interested: true });
		expect(await getInterest(t.db, 'evento')).toEqual({ count: 2, interested: false });
	});

	it('permite quitar el interés', async () => {
		const ha = await hashVisitor('evento', A);
		await setInterest(t.db, 'evento', ha, true);
		expect(await setInterest(t.db, 'evento', ha, false)).toEqual({ count: 0, interested: false });
		expect(await setInterest(t.db, 'evento', ha, false)).toEqual({ count: 0, interested: false });
	});

	it('separa los contadores por evento', async () => {
		await setInterest(t.db, 'uno', await hashVisitor('uno', A), true);
		await setInterest(t.db, 'uno', await hashVisitor('uno', B), true);
		await setInterest(t.db, 'dos', await hashVisitor('dos', A), true);
		expect((await getInterest(t.db, 'uno')).count).toBe(2);
		expect((await getInterest(t.db, 'dos')).count).toBe(1);
		expect((await getInterest(t.db, 'tres')).count).toBe(0);
	});

	it('solo guarda el slug y el hash', async () => {
		const ha = await hashVisitor('evento', A);
		await setInterest(t.db, 'evento', ha, true);
		const { results } = await t.db.prepare('SELECT * FROM event_interest').all();
		expect(results).toEqual([{ event_slug: 'evento', visitor_hash: ha }]);
	});

	it('valida el hash antes de escribir', async () => {
		await expect(setInterest(t.db, 'evento', 'cualquier-cosa', true)).rejects.toThrow(TypeError);
	});
});

describe('rate limiting', () => {
	const rule = { limit: 3, windowSeconds: 60 };
	const now = Date.UTC(2026, 0, 1, 12, 0, 10);

	it('corta al pasar el límite y se libera en la siguiente ventana', async () => {
		for (let i = 1; i <= 3; i++) {
			expect(await hitRateLimit(t.db, 'b', rule, now)).toMatchObject({ allowed: true, hits: i });
		}
		expect(await hitRateLimit(t.db, 'b', rule, now)).toEqual({
			allowed: false,
			hits: 4,
			retryAfter: 50
		});
		expect(await hitRateLimit(t.db, 'otro', rule, now)).toMatchObject({ allowed: true });
		expect(await hitRateLimit(t.db, 'b', rule, now + 60_000)).toMatchObject({
			allowed: true,
			hits: 1
		});
	});

	it('borra ventanas de más de una hora', async () => {
		await hitRateLimit(t.db, 'viejo', rule, now);
		await hitRateLimit(t.db, 'nuevo', rule, now + 2 * 60 * 60_000);
		const { results } = await t.db.prepare('SELECT bucket FROM rate_limits').all();
		expect(results.map((r) => r.bucket)).toEqual(['nuevo']);
	});

	it('limita por navegador en cada evento', async () => {
		const ha = await hashVisitor('evento', A);
		const hb = await hashVisitor('evento', B);
		const { limit } = INTEREST_RATE_LIMITS.visitor;
		for (let i = 0; i < limit; i++) {
			expect((await checkInterestRateLimit(t.db, 'evento', ha, now)).allowed).toBe(true);
		}
		expect((await checkInterestRateLimit(t.db, 'evento', ha, now)).allowed).toBe(false);
		expect((await checkInterestRateLimit(t.db, 'evento', hb, now)).allowed).toBe(true);
	});
});

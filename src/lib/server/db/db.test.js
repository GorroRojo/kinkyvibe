import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from './testing.js';
import { getDB, isMissingTableError } from './index.js';
import { MAX_WINDOW_SECONDS, hitRateLimit } from './rateLimit.js';

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

describe('createTestDB', () => {
	it('levanta un D1 real que responde consultas', async () => {
		expect(await t.db.prepare('SELECT 1 AS uno').first()).toEqual({ uno: 1 });
	});

	it('aplica las migraciones', async () => {
		const { results } = await t.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rate_limits'")
			.all();
		expect(results).toHaveLength(1);
	});
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

describe('isMissingTableError', () => {
	it('reconoce el error de D1 cuando falta una tabla', async () => {
		const error = await t.db
			.prepare('SELECT * FROM tabla_que_no_existe')
			.all()
			.catch((e) => e);
		expect(isMissingTableError(error)).toBe(true);
		expect(isMissingTableError(new Error('otra cosa'))).toBe(false);
	});
});

describe('hitRateLimit', () => {
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
		expect(await hitRateLimit(t.db, 'b', rule, now + 60000)).toMatchObject({
			allowed: true,
			hits: 1
		});
	});

	it('borra ventanas más viejas que la ventana más larga permitida', async () => {
		await hitRateLimit(t.db, 'viejo', rule, now);
		await hitRateLimit(t.db, 'nuevo', rule, now + (MAX_WINDOW_SECONDS + 3600) * 1000);
		const { results } = await t.db.prepare('SELECT bucket FROM rate_limits').all();
		expect(results.map((r) => r.bucket)).toEqual(['nuevo']);
	});

	it('respeta ventanas de más de una hora aunque otros límites sean cortos', async () => {
		const daily = { limit: 2, windowSeconds: MAX_WINDOW_SECONDS };
		const start = Date.UTC(2026, 0, 1, 0, 0, 5);
		expect(await hitRateLimit(t.db, 'diario', daily, start)).toMatchObject({ allowed: true });
		expect(await hitRateLimit(t.db, 'diario', daily, start + 1000)).toMatchObject({ hits: 2 });
		// Un límite corto, horas después, no borra la ventana diaria en curso.
		await hitRateLimit(t.db, 'corto', rule, start + 5 * 3600 * 1000);
		expect(await hitRateLimit(t.db, 'diario', daily, start + 6 * 3600 * 1000)).toMatchObject({
			allowed: false,
			hits: 3
		});
	});

	it('rechaza ventanas fuera de rango', async () => {
		for (const windowSeconds of [0, -1, 1.5, MAX_WINDOW_SECONDS + 1]) {
			await expect(hitRateLimit(t.db, 'x', { limit: 1, windowSeconds }, now)).rejects.toThrow(
				RangeError
			);
		}
	});
});

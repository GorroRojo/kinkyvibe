import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	fondoMonthWindow,
	parseFondoStatus,
	resetFondoMonthMemo,
	resolveFondoMonth
} from './fondoMonth.js';

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
	resetFondoMonthMemo();
});
afterEach(() => {
	vi.restoreAllMocks();
});

/** Instante a partir de una hora de Argentina. @param {string} local ej. '2026-10-04T23:59' */
const ar = (local) => new Date(`${local}:00-03:00`).getTime();

describe('fondoMonthWindow (del 5 al 4)', () => {
	it('el 30 de septiembre es la ventana del 5 de septiembre al 4 de octubre', () => {
		const w = fondoMonthWindow(ar('2026-09-30T12:00'));
		expect(w.startDate).toBe('2026-09-05');
		expect(w.endDate).toBe('2026-10-04');
		expect(w.start).toBe(ar('2026-09-05T00:00'));
		expect(w.end).toBe(ar('2026-10-05T00:00'));
	});
	it('el 4 a las 23:59 (hora de Argentina) sigue en el mes anterior', () => {
		expect(fondoMonthWindow(ar('2026-10-04T23:59')).startDate).toBe('2026-09-05');
		// En UTC ya es 5 de octubre, pero en Argentina todavía es 4.
		expect(fondoMonthWindow(Date.parse('2026-10-05T02:59:00Z')).startDate).toBe('2026-09-05');
	});
	it('el 5 a las 00:00 arranca el mes nuevo', () => {
		const w = fondoMonthWindow(ar('2026-10-05T00:00'));
		expect(w.startDate).toBe('2026-10-05');
		expect(w.endDate).toBe('2026-11-04');
	});
	it('cruza el año: el 3 de enero es del 5 de diciembre al 4 de enero', () => {
		const w = fondoMonthWindow(ar('2027-01-03T10:00'));
		expect(w.startDate).toBe('2026-12-05');
		expect(w.endDate).toBe('2027-01-04');
		expect(fondoMonthWindow(ar('2026-12-20T10:00')).endDate).toBe('2027-01-04');
	});
});

describe('parseFondoStatus', () => {
	it('se queda solo con los números agregados', () => {
		const s = parseFondoStatus({
			percent: 10,
			collected: 488193.55,
			goal: 4000000,
			step: 10,
			updatedAt: '2026-09-30T03:40:16.223Z',
			donors: [{ name: 'Nadie Real', amount: 1 }]
		});
		expect(s).toEqual({
			percent: 10,
			collected: 488194,
			goal: 4000000,
			step: 10,
			updatedAt: Date.parse('2026-09-30T03:40:16.223Z')
		});
		expect(JSON.stringify(s)).not.toContain('Nadie');
	});
	it('rechaza respuestas sin collected o goal', () => {
		expect(parseFondoStatus(null)).toBe(null);
		expect(parseFondoStatus({ percent: 10 })).toBe(null);
		expect(parseFondoStatus({ collected: 'mucho', goal: 1 })).toBe(null);
		expect(parseFondoStatus({ collected: -1, goal: 1 })).toBe(null);
	});
});

/** @param {any} body @param {number} [status] */
const fakeFetch = (body, status = 200) =>
	vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('resolveFondoMonth', () => {
	const now = ar('2026-09-30T12:00');
	const body = {
		percent: 10,
		collected: 500000,
		goal: 4000000,
		step: 10,
		updatedAt: '2026-09-30T03:40:16.223Z',
		donors: ['Nombre Inventado']
	};

	it('lee la API, la recuerda 10 minutos y guarda el último valor bueno', async () => {
		const f = fakeFetch(body);
		const a = await resolveFondoMonth({ db: t.db, fetch: f, now, url: 'https://fondo.test/api' });
		expect(a).toMatchObject({ collected: 500000, goal: 4000000, source: 'live', stale: false });
		expect(a?.window.startDate).toBe('2026-09-05');
		await resolveFondoMonth({
			db: t.db,
			fetch: f,
			now: now + 60_000,
			url: 'https://fondo.test/api'
		});
		expect(f).toHaveBeenCalledTimes(1);
		const [, init] = /** @type {any} */ (f.mock.calls[0]);
		expect(init.signal).toBeInstanceOf(AbortSignal);
		const row = await t.db
			.prepare("SELECT value FROM ticket_settings WHERE key = 'fondo_status_last'")
			.first();
		expect(String(row?.value)).not.toContain('Nombre Inventado');
	});

	it('si la API falla usa el último valor guardado; sin nada, null', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(
			await resolveFondoMonth({ db: t.db, fetch: fakeFetch({}, 503), now, url: 'https://x.test' })
		).toBe(null);
		await resolveFondoMonth({
			db: t.db,
			fetch: fakeFetch(body),
			now: now + 2 * 60_000,
			url: 'https://x.test'
		});
		resetFondoMonthMemo();
		const down = vi.fn(async () => {
			throw new Error('sin red');
		});
		const s = await resolveFondoMonth({
			db: t.db,
			fetch: down,
			now: now + 3 * 60_000,
			url: 'https://x.test'
		});
		expect(s).toMatchObject({ collected: 500000, source: 'stored' });
		// Los avisos nunca llevan el cuerpo de la respuesta.
		for (const call of warn.mock.calls) expect(call.join(' ')).not.toContain('Nombre Inventado');
	});

	it('marca como viejo un dato de antes del día 5 de esta ventana', async () => {
		const s = await resolveFondoMonth({
			db: t.db,
			fetch: fakeFetch({ ...body, updatedAt: '2026-09-03T12:00:00Z' }),
			now,
			url: 'https://x.test'
		});
		expect(s?.stale).toBe(true);
	});

	it('anda sin base de datos', async () => {
		const s = await resolveFondoMonth({
			db: null,
			fetch: fakeFetch(body),
			now,
			url: 'https://x.test'
		});
		expect(s?.collected).toBe(500000);
	});
});

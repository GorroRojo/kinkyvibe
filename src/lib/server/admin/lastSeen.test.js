import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { FIRST_VISIT_WINDOW_MS, VISIT_GAP_MS, markSeen, touchLastSeen } from './lastSeen.js';

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

const T0 = 1_800_000_000_000;
const MIN = 60 * 1000;

describe('touchLastSeen', () => {
	it('primera visita: novedades de los últimos 7 días', async () => {
		expect(await touchLastSeen(t.db, 1, T0)).toEqual({
			since: T0 - FIRST_VISIT_WINDOW_MS,
			first: true
		});
	});

	it('recargar al rato no borra las novedades; una visita nueva arranca donde terminó la anterior', async () => {
		await touchLastSeen(t.db, 1, T0);
		// Recarga a los 5 minutos: mismo corte.
		expect(await touchLastSeen(t.db, 1, T0 + 5 * MIN)).toEqual({
			since: T0 - FIRST_VISIT_WINDOW_MS,
			first: false
		});
		// Vuelve 2 horas después: las novedades son desde la última vez que miró (T0 + 5 min).
		expect(await touchLastSeen(t.db, 1, T0 + 5 * MIN + 2 * 60 * MIN)).toEqual({
			since: T0 + 5 * MIN,
			first: false
		});
	});

	it('cada admin tiene su propio corte', async () => {
		await touchLastSeen(t.db, 1, T0);
		await touchLastSeen(t.db, 2, T0 + VISIT_GAP_MS * 3);
		const a = await touchLastSeen(t.db, 1, T0 + VISIT_GAP_MS * 4);
		expect(a?.since).toBe(T0);
	});

	it('acepta la sesión demo (id negativo) y rechaza ids raros', async () => {
		expect(await touchLastSeen(t.db, -1, T0)).not.toBe(null);
		expect(await touchLastSeen(t.db, /** @type {any} */ ('1'), T0)).toBe(null);
		expect(await touchLastSeen(t.db, undefined, T0)).toBe(null);
	});

	it('sin base de datos devuelve null', async () => {
		expect(await touchLastSeen(null, 1, T0)).toBe(null);
		expect(await markSeen(null, 1, T0)).toBe(false);
	});
});

describe('markSeen', () => {
	it('"Marcar como visto" corre el corte a ahora', async () => {
		await touchLastSeen(t.db, 1, T0);
		expect(await markSeen(t.db, 1, T0 + MIN)).toBe(true);
		expect((await touchLastSeen(t.db, 1, T0 + 2 * MIN))?.since).toBe(T0 + MIN);
	});
	it('funciona aunque nunca haya abierto el Inicio', async () => {
		expect(await markSeen(t.db, 7, T0)).toBe(true);
		expect((await touchLastSeen(t.db, 7, T0 + MIN))?.since).toBe(T0);
	});
});

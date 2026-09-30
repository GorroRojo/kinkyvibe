import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	FLAG_CACHE_MS,
	clearFlagCache,
	envOverride,
	isFlagOn,
	listFlags,
	readFlag,
	setFlag
} from './flags.js';

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
	clearFlagCache();
});

describe('interruptores', () => {
	it('sin fila, sin base o sin tabla: apagado', async () => {
		expect(await readFlag(t.db, 'cuentas')).toBe(false);
		expect(await readFlag(null, 'cuentas')).toBe(false);
		expect(await isFlagOn(null, 'cuentas', { envValue: '' })).toBe(false);
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await readFlag(bare.db, 'cuentas')).toBe(false);
		} finally {
			await bare.dispose();
		}
	});

	it('se prende y apaga desde la base (y queda quién fue)', async () => {
		await setFlag(t.db, 'cuentas', true, { by: 'admin-de-prueba', now: 1 });
		expect(await isFlagOn(t.db, 'cuentas', { envValue: '' })).toBe(true);
		const [flag] = await listFlags(t.db);
		expect(flag).toMatchObject({ key: 'cuentas', enabled: true, updatedBy: 'admin-de-prueba' });
		await setFlag(t.db, 'cuentas', false, { by: 'admin-de-prueba', now: 2 });
		expect(await isFlagOn(t.db, 'cuentas', { envValue: '' })).toBe(false);
	});

	it('la variable de entorno manda: 1 prende, 0 apaga, vacía no dice nada', async () => {
		expect(envOverride('1')).toBe(true);
		expect(envOverride(' 0 ')).toBe(false);
		expect(envOverride('')).toBeNull();
		expect(envOverride('si')).toBeNull();
		expect(envOverride(undefined)).toBeNull();
		expect(await isFlagOn(t.db, 'cuentas', { envValue: '1' })).toBe(true);
		await setFlag(t.db, 'cuentas', true, { by: 'admin-de-prueba' });
		expect(await isFlagOn(t.db, 'cuentas', { envValue: '0' })).toBe(false);
	});

	it('recuerda el valor unos segundos; setFlag lo olvida', async () => {
		const now = 1_000_000;
		expect(await isFlagOn(t.db, 'cuentas', { now, envValue: '' })).toBe(false);
		// Cambio directo en la base (otro isolate): acá se sigue viendo el valor recordado…
		await t.db.prepare("INSERT INTO feature_flags VALUES ('cuentas', 1, 1, 'otro-isolate')").run();
		expect(await isFlagOn(t.db, 'cuentas', { now: now + 1, envValue: '' })).toBe(false);
		// …hasta que vence.
		expect(await isFlagOn(t.db, 'cuentas', { now: now + FLAG_CACHE_MS, envValue: '' })).toBe(true);
		await setFlag(t.db, 'cuentas', false, { by: 'admin-de-prueba' });
		expect(await isFlagOn(t.db, 'cuentas', { now: now + FLAG_CACHE_MS + 1, envValue: '' })).toBe(
			false
		);
	});

	it('no acepta interruptores desconocidos', async () => {
		await expect(
			setFlag(t.db, /** @type {any} */ ('inventado'), true, { by: 'admin-de-prueba' })
		).rejects.toThrow(RangeError);
	});
});

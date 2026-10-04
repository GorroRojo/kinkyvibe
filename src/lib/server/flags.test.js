import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { navFlagKeys } from '$lib/admin/nav.js';
import {
	FLAGS,
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
		expect(await readFlag(t.db, 'lo_que_sigo')).toBe(false);
		expect(await readFlag(null, 'lo_que_sigo')).toBe(false);
		expect(await isFlagOn(null, 'lo_que_sigo', { envValue: '' })).toBe(false);
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await readFlag(bare.db, 'lo_que_sigo')).toBe(false);
		} finally {
			await bare.dispose();
		}
	});

	it('se prende y apaga desde la base (y queda quién fue)', async () => {
		await setFlag(t.db, 'lo_que_sigo', true, { by: 'admin-de-prueba', now: 1 });
		expect(await isFlagOn(t.db, 'lo_que_sigo', { envValue: '' })).toBe(true);
		const [flag] = await listFlags(t.db);
		expect(flag).toMatchObject({ key: 'lo_que_sigo', enabled: true, updatedBy: 'admin-de-prueba' });
		await setFlag(t.db, 'lo_que_sigo', false, { by: 'admin-de-prueba', now: 2 });
		expect(await isFlagOn(t.db, 'lo_que_sigo', { envValue: '' })).toBe(false);
	});

	it('la variable de entorno manda: 1 prende, 0 apaga, vacía no dice nada', async () => {
		expect(envOverride('1')).toBe(true);
		expect(envOverride(' 0 ')).toBe(false);
		expect(envOverride('')).toBeNull();
		expect(envOverride('si')).toBeNull();
		expect(envOverride(undefined)).toBeNull();
		expect(await isFlagOn(t.db, 'lo_que_sigo', { envValue: '1' })).toBe(true);
		await setFlag(t.db, 'lo_que_sigo', true, { by: 'admin-de-prueba' });
		expect(await isFlagOn(t.db, 'lo_que_sigo', { envValue: '0' })).toBe(false);
	});

	it('recuerda el valor unos segundos; setFlag lo olvida', async () => {
		const now = 1_000_000;
		expect(await isFlagOn(t.db, 'lo_que_sigo', { now, envValue: '' })).toBe(false);
		// Cambio directo en la base (otro isolate): acá se sigue viendo el valor recordado…
		await t.db
			.prepare("INSERT INTO feature_flags VALUES ('lo_que_sigo', 1, 1, 'otro-isolate')")
			.run();
		expect(await isFlagOn(t.db, 'lo_que_sigo', { now: now + 1, envValue: '' })).toBe(false);
		// …hasta que vence.
		expect(await isFlagOn(t.db, 'lo_que_sigo', { now: now + FLAG_CACHE_MS, envValue: '' })).toBe(
			true
		);
		await setFlag(t.db, 'lo_que_sigo', false, { by: 'admin-de-prueba' });
		expect(
			await isFlagOn(t.db, 'lo_que_sigo', { now: now + FLAG_CACHE_MS + 1, envValue: '' })
		).toBe(false);
	});

	it('no acepta interruptores desconocidos', async () => {
		await expect(
			setFlag(t.db, /** @type {any} */ ('inventado'), true, { by: 'admin-de-prueba' })
		).rejects.toThrow(RangeError);
	});

	it('los interruptores del menú del panel (flag en nav.js) existen', () => {
		for (const key of navFlagKeys()) expect(Object.keys(FLAGS), key).toContain(key);
	});

	it('una página que mira varios interruptores consulta la base una sola vez', async () => {
		await setFlag(t.db, 'lo_que_sigo', true, { by: 'admin-de-prueba' });
		await setFlag(t.db, 'telegram_bot', true, { by: 'admin-de-prueba' });
		clearFlagCache();
		const counted = countingDB(t.db);
		const now = 5_000_000;
		const keys = /** @type {(keyof typeof FLAGS)[]} */ (Object.keys(FLAGS));
		// Todos juntos (como los loads en paralelo) y después uno por uno.
		const together = await Promise.all(
			keys.map((k) => isFlagOn(counted.db, k, { now, envValue: '' }))
		);
		for (const k of keys) await isFlagOn(counted.db, k, { now: now + 1, envValue: '' });
		expect(counted.queries).toBe(1);
		expect(Object.fromEntries(keys.map((k, i) => [k, together[i]]))).toEqual(
			Object.fromEntries(keys.map((k) => [k, k === 'lo_que_sigo' || k === 'telegram_bot']))
		);
		// Cuando vence, otra vez una sola.
		await Promise.all(
			keys.map((k) => isFlagOn(counted.db, k, { now: now + FLAG_CACHE_MS, envValue: '' }))
		);
		expect(counted.queries).toBe(2);
		// Sin la tabla: todos apagados, como readFlag.
		clearFlagCache();
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await isFlagOn(bare.db, 'lo_que_sigo', { envValue: '' })).toBe(false);
		} finally {
			await bare.dispose();
		}
	});
});

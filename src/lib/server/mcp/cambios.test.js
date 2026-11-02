/**
 * Lo común a los cambios del conector de Claude (./cambios.js): la huella (determinista, distinta
 * ante cualquier cambio de las entradas o de la versión, imposible de armar sin la clave), el tope
 * por día, los interruptores y «confirmado por». En un D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache } from '$lib/server/flags.js';
import {
	HASH_KEY_SETTING,
	canonicalJson,
	changeHash,
	claudeLabel,
	cleanConfirmedBy,
	cleanRequest,
	dailyLimit,
	editingOn,
	hashMatches,
	takeDailySlot
} from './cambios.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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

const spec = () => ({
	operation: 'editar_evento',
	target: 'fiesta-inventada-2031-01',
	inputs: { titulo: 'Fiesta nueva', precios: [{ tipo: 'general', precio: 1200 }] },
	base: 'abc123:-:-'
});

describe('canonicalJson', () => {
	it('da el mismo texto con las claves en cualquier orden', () => {
		expect(canonicalJson({ b: 1, a: { d: [1, 'x'], c: null } })).toBe(
			canonicalJson({ a: { c: null, d: [1, 'x'] }, b: 1 })
		);
		expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}');
	});
});

describe('la huella', () => {
	it('es la misma para el mismo cambio (determinista)', async () => {
		const a = await changeHash(t.db, spec());
		const b = await changeHash(t.db, { ...spec(), inputs: { ...spec().inputs } });
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(b).toBe(a);
		expect(await hashMatches(t.db, spec(), a)).toBe(true);
	});

	it('cambia con cualquier entrada, el objetivo, la operación o la versión', async () => {
		const h = await changeHash(t.db, spec());
		const variants = [
			{ ...spec(), inputs: { ...spec().inputs, titulo: 'Fiesta nueva!' } },
			{ ...spec(), inputs: { ...spec().inputs, precios: [{ tipo: 'general', precio: 1201 }] } },
			{ ...spec(), target: 'otra-fiesta' },
			{ ...spec(), operation: 'crear_codigo' },
			{ ...spec(), base: 'abc124:-:-' }
		];
		for (const v of variants) {
			expect(await changeHash(t.db, v)).not.toBe(h);
			expect(await hashMatches(t.db, v, h)).toBe(false);
		}
	});

	it('rechaza una huella tocada, inventada o de otra forma', async () => {
		const h = await changeHash(t.db, spec());
		const flipped = (h[0] === 'A' ? 'B' : 'A') + h.slice(1);
		expect(await hashMatches(t.db, spec(), flipped)).toBe(false);
		expect(await hashMatches(t.db, spec(), 'x'.repeat(43))).toBe(false);
		expect(await hashMatches(t.db, spec(), h + 'A')).toBe(false);
		expect(await hashMatches(t.db, spec(), undefined)).toBe(false);
		expect(await hashMatches(t.db, spec(), { hash: h })).toBe(false);
	});

	it('depende de la clave del servidor: con otra clave, la huella vieja no vale', async () => {
		const h = await changeHash(t.db, spec());
		await t.db.prepare('DELETE FROM ticket_settings WHERE key = ?1').bind(HASH_KEY_SETTING).run();
		expect(await hashMatches(t.db, spec(), h)).toBe(false);
	});
});

describe('el tope por día', () => {
	it('lee la variable o usa 50', () => {
		expect(dailyLimit(undefined)).toBe(50);
		expect(dailyLimit('')).toBe(50);
		expect(dailyLimit('10')).toBe(10);
		expect(dailyLimit('0')).toBe(50);
		expect(dailyLimit('muchos')).toBe(50);
		expect(dailyLimit('5000')).toBe(50);
	});

	it('deja pasar hasta el tope, después avisa en castellano, y devolver libera el lugar', async () => {
		const now = Date.UTC(2026, 10, 2, 15);
		const a = await takeDailySlot(t.db, now, 2);
		const b = await takeDailySlot(t.db, now + 1000, 2);
		expect(a.ok && b.ok).toBe(true);
		const c = await takeDailySlot(t.db, now + 2000, 2);
		expect(c.ok).toBe(false);
		if (!c.ok) expect(c.message).toMatch(/tope de 2 cambios por día/);
		// Un cambio que al final no se guardó devuelve su lugar.
		if (b.ok) await b.release();
		expect((await takeDailySlot(t.db, now + 3000, 2)).ok).toBe(true);
		// Al día siguiente hay lugar otra vez.
		expect((await takeDailySlot(t.db, now + 25 * 60 * 60 * 1000, 2)).ok).toBe(true);
	});
});

describe('los interruptores', () => {
	/** @param {string} key @param {boolean} on */
	const setFlag = (key, on) =>
		t.db
			.prepare(
				`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, 0, 'test')
				ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled`
			)
			.bind(key, on ? 1 : 0)
			.run();

	it('cambiar necesita los dos prendidos', async () => {
		expect(await editingOn(t.db)).toBe(false);
		await setFlag('conector_claude', true);
		clearFlagCache();
		expect(await editingOn(t.db)).toBe(false);
		await setFlag('conector_claude_edicion', true);
		clearFlagCache();
		expect(await editingOn(t.db)).toBe(true);
		await setFlag('conector_claude', false);
		clearFlagCache();
		expect(await editingOn(t.db)).toBe(false);
	});

	it('la variable de entorno manda (0 lo corta de golpe)', async () => {
		expect(await editingOn(t.db, { read: '1', edit: '1' })).toBe(true);
		expect(await editingOn(t.db, { read: '1', edit: '0' })).toBe(false);
		expect(await editingOn(t.db, { read: '0', edit: '1' })).toBe(false);
	});
});

describe('confirmado por', () => {
	it('se muestra «Claude, confirmado por …» o solo «Claude»', () => {
		expect(claudeLabel('Mel')).toBe('Claude, confirmado por Mel');
		expect(claudeLabel(null)).toBe('Claude');
	});

	it('es texto corto en una línea; vacío es null', () => {
		expect(cleanConfirmedBy('  Mel  ')).toBe('Mel');
		expect(cleanConfirmedBy('Pau\n\u0000(bot)')).toBe('Pau (bot)');
		expect(cleanConfirmedBy('x'.repeat(100))).toHaveLength(40);
		expect(cleanConfirmedBy('   ')).toBeNull();
		expect(cleanConfirmedBy(42)).toBeNull();
		expect(cleanRequest('cambiá el precio\r\na 1200')).toBe('cambiá el precio a 1200');
		expect(cleanRequest('y'.repeat(900))).toHaveLength(500);
	});
});

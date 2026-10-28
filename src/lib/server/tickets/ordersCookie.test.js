/**
 * La cookie de las compras de este navegador (`kv_orders`): el servidor solo cuenta las entradas
 * que firmó él. D1 de miniflare; ids inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ORDERS_COOKIE, rememberedOrders, signedOrderEntry } from './checkout.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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

/** @param {string | undefined} value */
const cookies = (value) =>
	/** @type {any} */ ({
		get: (/** @type {string} */ name) => (name === ORDERS_COOKIE ? value : undefined)
	});

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-9222-222222222222';
const C = '33333333-3333-4333-a333-333333333333';

describe('rememberedOrders', () => {
	it('sin cookie: ninguna', async () => {
		expect(await rememberedOrders(t.db, cookies(undefined))).toEqual([]);
	});

	it('una entrada firmada por el servidor cuenta', async () => {
		const value = await signedOrderEntry(t.db, A);
		expect(value).toMatch(new RegExp(`^${A}\\.[A-Za-z0-9_-]{16}$`));
		expect(await rememberedOrders(t.db, cookies(value))).toEqual([A]);
	});

	it('un id válido sin firma (como la cookie vieja) no cuenta', async () => {
		expect(await rememberedOrders(t.db, cookies(A))).toEqual([]);
		expect(await rememberedOrders(t.db, cookies(`${A}.${B}`))).toEqual([]);
	});

	it('una firma inventada o cambiada no cuenta', async () => {
		const signed = await signedOrderEntry(t.db, A);
		const sig = signed.slice(A.length + 1);
		const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
		expect(await rememberedOrders(t.db, cookies(`${A}.${flipped}`))).toEqual([]);
		expect(await rememberedOrders(t.db, cookies(`${A}.AAAAAAAAAAAAAAAA`))).toEqual([]);
		// La firma de otra orden tampoco sirve.
		expect(await rememberedOrders(t.db, cookies(`${B}.${sig}`))).toEqual([]);
	});

	it('una lista mezclada: quedan solo las firmadas, en orden', async () => {
		const a = await signedOrderEntry(t.db, A);
		const c = await signedOrderEntry(t.db, C);
		const value = [a, B, `${B}.AAAAAAAAAAAAAAAA`, 'basura', c].join('~');
		expect(await rememberedOrders(t.db, cookies(value))).toEqual([A, C]);
	});
});

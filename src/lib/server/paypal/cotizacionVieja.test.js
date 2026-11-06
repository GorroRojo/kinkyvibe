/** Sin una cotización de los últimos 5 días, PayPal no se ofrece y la vigilancia avisa. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { storeRate } from './rates.js';

vi.mock('./gateway.js', () => ({ paypalCharging: async () => true, isPaypalMock: () => false }));
const { paypalOffer, paypalRateMissing } = await import('./payments.js');

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

const NOW = Date.parse('2026-11-10T15:00:00Z');
/** @param {string} day */
const rate = (day) =>
	storeRate(t.db, { day, compra: 1250, venta: 1300, source: 'dolarapi', fetchedAt: NOW });

describe('cotización vieja', () => {
	it('de hasta 5 días: se ofrece; más vieja o sin ninguna: no, y se avisa', async () => {
		expect(await paypalRateMissing(t.db, NOW)).toBe(true);
		expect(await paypalOffer(t.db, NOW)).toBeNull();
		await rate('2026-11-04');
		expect(await paypalRateMissing(t.db, NOW)).toBe(true);
		expect(await paypalOffer(t.db, NOW)).toBeNull();
		await rate('2026-11-05');
		expect(await paypalRateMissing(t.db, NOW)).toBe(false);
		expect(await paypalOffer(t.db, NOW)).toMatchObject({
			base: 1250,
			feeBasisPoints: 540,
			fixedCents: 30
		});
	});
});

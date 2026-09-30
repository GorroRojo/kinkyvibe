import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { dayNumber } from '$lib/admin/salesChart.js';
import { previousEditionSales } from './salesHistory.js';

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

const at = (/** @type {string} */ iso) => new Date(iso).getTime();

/** @param {string} slug @param {number} quantity @param {number} createdAt @param {string} [status] */
function insert(slug, quantity, createdAt, status = 'approved') {
	return t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at)
			VALUES (?1, ?2, 'general', ?3, 1000, ?3 * 1000, ?3 * 1000, 'Persona de prueba',
				'prueba@example.com', ?4, ?5, ?5, ?5)`
		)
		.bind(crypto.randomUUID(), slug, quantity, status, createdAt)
		.run();
}

const EVENTS = [
	{ slug: 'fiesta-2026-10', title: 'Fiesta octubre', start: at('2026-10-17T21:00-03:00') },
	{ slug: 'fiesta-2026-09', title: 'Fiesta septiembre', start: at('2026-09-19T21:00-03:00') },
	{ slug: 'fiesta-2026-08', title: 'Fiesta agosto', start: at('2026-08-15T21:00-03:00') },
	{ slug: 'otra-2026-09', title: 'Otra', start: at('2026-09-20T21:00-03:00') }
];
const CURRENT = { slug: 'fiesta-2026-10', start: EVENTS[0].start, events: EVENTS };

describe('previousEditionSales', () => {
	it('agrupa por día de Argentina las aprobadas de la edición anterior', async () => {
		// 23:30 del 10/9 en Argentina (ya 11/9 en UTC): cuenta el 10.
		await insert('fiesta-2026-09', 2, at('2026-09-10T23:30-03:00'));
		await insert('fiesta-2026-09', 3, at('2026-09-10T10:00-03:00'));
		await insert('fiesta-2026-09', 1, at('2026-09-18T10:00-03:00'));
		await insert('fiesta-2026-09', 9, at('2026-09-18T10:00-03:00'), 'refunded');
		await insert('otra-2026-09', 7, at('2026-09-18T10:00-03:00'));
		const prev = await previousEditionSales(t.db, CURRENT);
		expect(prev?.slug).toBe('fiesta-2026-09');
		expect(prev?.title).toBe('Fiesta septiembre');
		expect(prev?.daily.sort((a, b) => a.day - b.day)).toEqual([
			{ day: dayNumber(at('2026-09-10T12:00-03:00')), tickets: 5 },
			{ day: dayNumber(at('2026-09-18T12:00-03:00')), tickets: 1 }
		]);
	});

	it('si la más reciente no vendió acá, usa la anterior; sin ventas, null', async () => {
		expect(await previousEditionSales(t.db, CURRENT)).toBeNull();
		await insert('fiesta-2026-08', 4, at('2026-08-01T12:00-03:00'));
		expect((await previousEditionSales(t.db, CURRENT))?.slug).toBe('fiesta-2026-08');
	});
});

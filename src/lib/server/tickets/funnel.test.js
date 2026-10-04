/**
 * Embudo anónimo de la compra (docs/analiticas.md): crear la orden y aprobarla anotan un paso con
 * el evento y el medio de pago, y nada de quien compra. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		payment_methods: ['mercadopago', 'transferencia'],
		tickets: [
			{ id: 'general', name: 'General', price: 10000, capacity: 200 },
			{ id: 'libre', name: 'Libre', a_la_gorra: { minimo: 0, sugerido: 0 }, capacity: 200 }
		]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts),
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { buyAction } from './checkout.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
/** @type {any[]} */
let points;
beforeEach(async () => {
	await resetDB(t.db);
	points = [];
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
});

const EMAIL = 'persona.inventada@example.com';

/** @param {Record<string, string>} fields */
async function buy(fields) {
	const body = new FormData();
	for (const [k, v] of Object.entries({
		quantity: '1',
		name: 'Persona Inventada',
		pronouns: 'elle',
		email: EMAIL,
		dni: '30111222',
		accept: 'on',
		holder_name_0: 'Persona Inventada',
		holder_pronouns_0: 'elle',
		...fields
	}))
		body.set(k, v);
	/** @type {any} */
	const event = {
		params: { event: 'fiesta-rara' },
		platform: {
			env: { DB: t.db, ANALYTICS: { writeDataPoint: (/** @type {any} */ p) => points.push(p) } }
		},
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL('http://localhost/calendario/fiesta-rara/entradas'),
		fetch: async () => new Response('{}', { status: 503 }),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.7'
	};
	try {
		return /** @type {any} */ (await buyAction(event));
	} catch (e) {
		const r = /** @type {any} */ (e);
		if (r?.status === 303) return { redirect: r.location };
		throw e;
	}
}

describe('embudo en la compra', () => {
	it('transferencia: anota «orden» con el medio, sin datos de la persona', async () => {
		const r = await buy({ type: 'general', method: 'transferencia' });
		expect(r.redirect).toMatch(/\/estado$/);
		expect(points.map((p) => p.blobs)).toEqual([
			['funnel', '', '', '', '', 'fiesta-rara', 'orden', 'transferencia']
		]);
		const stored = JSON.stringify(points);
		for (const bad of [EMAIL, 'Persona', '30111222', '203.0.113.7', r.redirect.split('/')[2]]) {
			expect(stored).not.toContain(bad);
		}
	});

	it('gratis: anota «orden» y «aprobada»', async () => {
		const r = await buy({ type: 'libre', amount: '0', method: 'mercadopago' });
		expect(r.redirect).toMatch(/\/estado$/);
		expect(points.map((p) => p.blobs.slice(5))).toEqual([
			['fiesta-rara', 'orden', 'gratis'],
			['fiesta-rara', 'aprobada', 'gratis']
		]);
	});

	it('si la compra no sale (datos mal), no anota nada', async () => {
		const r = await buy({ type: 'general', method: 'transferencia', email: 'no-es-mail' });
		expect(r.status).toBe(400);
		expect(points).toEqual([]);
	});
});

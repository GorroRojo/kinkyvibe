/**
 * El porcentaje del Fondo (D1 + fondo.kinkyvibe.ar) solo se busca para los eventos que venden
 * entradas y usan el Fondo: la página de cualquier evento llama a `getTicketsView`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const common = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'con-fondo': { ...common, tags: ['KinkyVibe'] },
		'sin-fondo': { ...common, tags: ['AMBA'] }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug] ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { eventTicketsWithFondo, getTicketsView } from './checkout.js';
import { resetFondoMemo } from './fondo.js';

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
	resetFondoMemo();
});

/** fetch simulado de fondo.kinkyvibe.ar (30 %), para contar los pedidos. */
const fondoFetch = () =>
	vi.fn(
		async () =>
			new Response(JSON.stringify({ percent: 30 }), {
				headers: { 'content-type': 'application/json' }
			})
	);

describe('eventTicketsWithFondo', () => {
	it('no pide el porcentaje para un evento sin entradas', async () => {
		const fetch = fondoFetch();
		expect(await eventTicketsWithFondo(t.db, 'no-existe', /** @type {any} */ (fetch))).toBeNull();
		expect(await getTicketsView(t.db, 'no-existe', /** @type {any} */ (fetch))).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('no pide el porcentaje para un evento con entradas que no usa el Fondo', async () => {
		const fetch = fondoFetch();
		const config = await eventTicketsWithFondo(t.db, 'sin-fondo', /** @type {any} */ (fetch));
		expect(config?.fondoEnabled).toBe(false);
		expect(config?.types[0].fondo).toBe(0);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('aplica el porcentaje vigente a un evento de KinkyVibe', async () => {
		const fetch = fondoFetch();
		const config = await eventTicketsWithFondo(t.db, 'con-fondo', /** @type {any} */ (fetch));
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(config?.fondoPercent).toBe(30);
		expect(config?.types[0].fondo).toBe(3000);
	});
});

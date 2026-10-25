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
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		payment_methods: ['mercadopago', 'transferencia'],
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
		// Como el de verdad: con `fondo`, lo llama con la configuración sin porcentaje y usa lo que
		// devuelve (si no devuelve nada, sin porcentaje).
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts = {}) => {
			const meta = metas[slug];
			if (!meta) return null;
			const { fondo, ...rest } = opts;
			if (!fondo) return parseTicketConfig(meta, rest);
			const fondoPercent = await fondo(parseTicketConfig(meta, rest));
			return parseTicketConfig(meta, fondoPercent === undefined ? rest : { ...rest, fondoPercent });
		},
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	buyAction,
	eventTicketsWithFondo,
	fondoChangedMessage,
	getTicketsView
} from './checkout.js';
import { resetFondoMemo } from './fondo.js';
import { getOrder } from './orders.js';

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

describe('compra (?/buy): el porcentaje del Fondo que se cobra es el que se vio', () => {
	/** Porcentaje que contesta fondo.kinkyvibe.ar (se cambia en cada prueba). */
	let live = 20;
	const liveFetch = /** @type {any} */ (
		async () =>
			new Response(JSON.stringify({ percent: live }), {
				headers: { 'content-type': 'application/json' }
			})
	);
	/** El porcentaje cambia en fondo.kinkyvibe.ar y la memoria del isolate ya no lo tiene. */
	const fondoChangesTo = (/** @type {number} */ percent) => {
		live = percent;
		resetFondoMemo();
	};

	beforeEach(async () => {
		live = 20;
		// Datos para transferir inventados (así se ofrece la transferencia).
		await t.db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
				VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
			)
			.run();
	});

	let n = 0;
	/**
	 * @param {string} slug
	 * @param {Record<string, string>} [fields]
	 */
	async function buy(slug, fields = {}) {
		const body = new FormData();
		const all = {
			type: 'general',
			quantity: '1',
			name: 'Persona Prueba',
			pronouns: 'elle',
			email: `fondo${++n}@example.com`,
			dni: '30111222',
			method: 'transferencia',
			option: 'fondo',
			accept: 'on',
			holder_name_0: 'Persona Prueba',
			holder_pronouns_0: 'elle',
			...fields
		};
		for (const [k, v] of Object.entries(all)) body.set(k, v);
		/** @type {any} */
		const event = {
			params: { event: slug },
			platform: { ...t.platform, ctx: { waitUntil: () => {} } },
			request: new Request('http://localhost/x', { method: 'POST', body }),
			url: new URL(`http://localhost/calendario/${slug}/entradas`),
			fetch: liveFetch,
			cookies: { get: () => undefined, set: () => {}, delete: () => {} },
			getClientAddress: () => `198.51.100.${n % 250}`
		};
		try {
			return /** @type {any} */ (await buyAction(event));
		} catch (e) {
			const r = /** @type {any} */ (e);
			if (r?.status === 303) return { redirect: r.location };
			throw e;
		}
	}

	/** @param {{ redirect?: string }} r */
	const orderOf = async (r) => {
		const id = String(r.redirect).split('/')[2];
		return /** @type {import('./orders.js').Order} */ (await getOrder(t.db, id));
	};

	const orderCount = async () =>
		(await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n;

	it('si cambió entre la página y la compra, no cobra sin avisar; confirmar de nuevo cobra el nuevo', async () => {
		const page = await getTicketsView(t.db, 'con-fondo', liveFetch);
		expect(page?.fondoPercent).toBe(20);
		expect(page?.types[0]).toMatchObject({ price: 10000, fondo: 2000 });

		fondoChangesTo(10);
		const r = await buy('con-fondo', { fondo_percent: '20' });
		expect(r.status).toBe(409);
		expect(r.data.buy.error).toBe(fondoChangedMessage(10));
		expect(r.data.buy.errors.option).toBe(fondoChangedMessage(10));
		// La respuesta trae el porcentaje de ahora, para que el formulario muestre esos precios.
		expect(r.data.buy.fondoPercent).toBe(10);
		expect(await orderCount()).toBe(0);

		const ok = await buy('con-fondo', { fondo_percent: '10' });
		expect(ok.redirect).toMatch(/\/estado$/);
		expect(await orderOf(ok)).toMatchObject({
			fondo_percent: 10,
			fondo_option: 'fondo',
			unit_price: 10000,
			fondo_amount: 1000,
			total: 9000
		});
	});

	it('sin el campo (formulario viejo) compra como siempre, con el porcentaje de ahora', async () => {
		fondoChangesTo(10);
		const r = await buy('con-fondo');
		expect(r.redirect).toMatch(/\/estado$/);
		expect(await orderOf(r)).toMatchObject({ fondo_percent: 10, total: 9000 });
		const empty = await buy('con-fondo', { fondo_percent: '' });
		expect(empty.redirect).toMatch(/\/estado$/);
	});

	it('con el mismo porcentaje, compra', async () => {
		const r = await buy('con-fondo', { fondo_percent: '20' });
		expect(await orderOf(r)).toMatchObject({ fondo_percent: 20, fondo_amount: 2000, total: 8000 });
	});

	it('la página del evento (staleOk) no espera a la API; la compra sí, y avisa si cambió', async () => {
		// Se vio 20 % (queda guardado en D1); después fondo.kinkyvibe.ar pasa a 10 %, lento.
		await getTicketsView(t.db, 'con-fondo', liveFetch);
		fondoChangesTo(10);
		/** @type {() => void} */
		let release = () => {};
		const gate = new Promise((r) => (release = () => r(undefined)));
		const slow = vi.fn(async () => {
			await gate;
			return liveFetch();
		});
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		const waitUntil = (/** @type {Promise<unknown>} */ p) => void tasks.push(p);
		const view = await getTicketsView(t.db, 'con-fondo', /** @type {any} */ (slow), {
			fondo: { staleOk: true, waitUntil }
		});
		// Contestó sin esperar: el último porcentaje conocido.
		expect(view?.fondoPercent).toBe(20);
		expect(slow).toHaveBeenCalledTimes(1);
		release();
		await Promise.all(tasks);

		// Guardado ahora: 10 %. La API pasa a 15 %: la compra espera el valor de ahora (aunque la
		// plataforma tenga waitUntil), no usa el guardado, y avisa.
		fondoChangesTo(15);
		const r = await buy('con-fondo', { fondo_percent: '10' });
		expect(r.status).toBe(409);
		expect(r.data.buy.error).toBe(fondoChangedMessage(15));
		expect(r.data.buy.fondoPercent).toBe(15);
		expect(await orderCount()).toBe(0);
	});

	it('un evento sin Fondo no mira el campo', async () => {
		const r = await buy('sin-fondo', { option: 'completo', fondo_percent: '' });
		expect(await orderOf(r)).toMatchObject({ fondo_percent: null, total: 10000 });
		const forged = await buy('sin-fondo', { fondo_percent: '20' });
		expect(forged.redirect).toMatch(/\/estado$/);
		// Sin Fondo, las respuestas con error no traen porcentaje.
		const bad = await buy('sin-fondo', { name: '' });
		expect(bad.status).toBe(400);
		expect(bad.data.buy).not.toHaveProperty('fondoPercent');
	});
});

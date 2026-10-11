/**
 * El estado de una compra (/entradas/<orden>/estado) de un taller en varias partes con una sola
 * entrada (docs/talleres-partes.md): lista la fecha de cada parte, no solo la del taller. Un
 * evento suelto (o con «Entradas por parte») no la muestra. Datos inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { setContentDB } from '$lib/server/contenido/repo.js';
import { setPerPartTickets, setWorkshopParts } from '$lib/server/eventos/partes.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { load } from './+page.server.js';
import Page from './+page.svelte';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	// La ficha de cada evento (título, lugar) sale de la base del contenido.
	setContentDB(t.db);
});
afterAll(async () => {
	setContentDB(null);
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

const BY = 'admin-de-prueba';

/** @param {string} slug @param {string} start @param {string} place */
const event = (slug, start, place) =>
	saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: `Evento ${slug}`,
			data: { start, location_name: place },
			visibility: 'public'
		},
		{ actor: BY }
	);

/**
 * Una compra de prueba del evento, aprobada si `approve`.
 * @param {string} eventSlug
 * @param {{ approve?: boolean }} [options]
 */
async function orderFor(eventSlug, { approve = true } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: {
				name: 'Persona de Prueba',
				pronouns: 'elle',
				email: 'p@example.com',
				dni: '30111222'
			}
		})
	);
	if (approve) {
		await applyPayment(t.db, {
			id: 1,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 8000,
			currency_id: 'ARS'
		});
	}
	return /** @type {string} */ (r.order.id);
}

/** @param {string} id */
async function page(id) {
	const data = /** @type {any} */ (
		await load(
			/** @type {any} */ ({
				params: { order: id },
				platform: t.platform,
				locals: {},
				url: new URL(`http://localhost/entradas/${id}/estado`),
				fetch: () => {
					throw new Error('no debería llamar afuera');
				},
				// La cookie de las compras de este navegador: esta compra es de quien mira.
				cookies: { get: () => id }
			})
		)
	);
	const { body } = render(Page, { props: { data } });
	return { data, body };
}

async function workshop() {
	await event('taller-inventado', '2026-10-02T22:00-03:00', 'Espacio Inventado');
	await event('taller-inventado-parte-2', '2026-10-09T22:00-03:00', 'Otro Lugar Inventado');
	await event('taller-inventado-parte-3', '2026-10-16T19:30-03:00', 'Espacio Inventado');
	expect(
		await setWorkshopParts(t.db, {
			eventSlug: 'taller-inventado',
			partSlugs: ['taller-inventado-parte-2', 'taller-inventado-parte-3'],
			by: BY
		})
	).toEqual({ ok: true });
}

const LINES = [
	'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado',
	'Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado',
	'Parte 3 · vie 16 oct · 19:30 · Espacio Inventado'
];

describe('/entradas/<orden>/estado: las partes del taller', () => {
	it('compra aprobada de un taller con una sola entrada: la fecha de cada parte', async () => {
		await workshop();
		const { data, body } = await page(await orderFor('taller-inventado'));
		expect(data.order.status).toBe('approved');
		expect(data.event.parts).toEqual({ title: 'Las 3 partes del taller', lines: LINES });
		expect(body).toMatch(/<dt[^>]*>Partes<\/dt>/);
		for (const line of LINES) expect(body).toContain(`>${line}</li>`);
	});

	it('también mientras se espera el pago (con el lugar que se ve en el sitio)', async () => {
		await workshop();
		const { data, body } = await page(await orderFor('taller-inventado', { approve: false }));
		expect(data.order.status).toBe('pending');
		expect(data.event.parts?.lines).toEqual(LINES);
		expect(body).toContain('>Parte 3 · vie 16 oct · 19:30 · Espacio Inventado</li>');
	});

	it('«Entradas por parte» o evento suelto: sin lista', async () => {
		await workshop();
		await event('evento-suelto', '2026-10-20T21:00-03:00', 'Espacio Inventado');
		const suelto = await page(await orderFor('evento-suelto'));
		expect(suelto.data.event.parts).toBeNull();
		expect(suelto.body).not.toMatch(/<dt[^>]*>Partes<\/dt>/);

		expect(
			await setPerPartTickets(t.db, { eventSlug: 'taller-inventado', perPart: true, by: BY })
		).toEqual({ ok: true });
		const porParte = await page(await orderFor('taller-inventado'));
		expect(porParte.data.event.parts).toBeNull();
		expect(porParte.body).not.toMatch(/<dt[^>]*>Partes<\/dt>/);
	});
});

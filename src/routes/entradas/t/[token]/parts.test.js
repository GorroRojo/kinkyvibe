/**
 * La página de una entrada de un taller en varias partes con una sola entrada
 * (docs/talleres-partes.md): muestra «Las N partes del taller», una línea por parte con su fecha
 * y su lugar. Un evento suelto (o con «Entradas por parte») no la muestra. Datos inventados; D1
 * de miniflare.
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

/** @param {string} eventSlug */
async function ticketFor(eventSlug) {
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
	const { tickets } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return tickets[0];
}

/** @param {string} token */
async function page(token) {
	const data = /** @type {any} */ (
		await load(
			/** @type {any} */ ({
				params: { token },
				platform: t.platform,
				locals: {},
				url: new URL(`http://localhost/entradas/t/${token}`)
			})
		)
	);
	const { body } = render(Page, { props: { data, form: null } });
	return { data, body };
}

async function workshop() {
	await event('taller-inventado', '2026-10-02T22:00-03:00', 'Espacio Inventado');
	await event('taller-inventado-parte-2', '2026-10-09T22:00-03:00', 'Otro Lugar Inventado');
	expect(
		await setWorkshopParts(t.db, {
			eventSlug: 'taller-inventado',
			partSlugs: ['taller-inventado-parte-2'],
			by: BY
		})
	).toEqual({ ok: true });
}

describe('/entradas/t/<token>: las partes del taller', () => {
	it('taller con una sola entrada: «Las 2 partes del taller» con fecha y lugar de cada una', async () => {
		await workshop();
		const ticket = await ticketFor('taller-inventado');
		const { data, body } = await page(ticket.token);
		expect(data.event.parts).toEqual({
			title: 'Las 2 partes del taller',
			lines: [
				'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado',
				'Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado'
			]
		});
		expect(body).toMatch(/<h2[^>]*>Las 2 partes del taller<\/h2>/);
		expect(body).toMatch(/<li[^>]*>Parte 1 · vie 2 oct · 22:00 · Espacio Inventado<\/li>/);
		expect(body).toMatch(/<li[^>]*>Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado<\/li>/);
		expect(body).not.toMatch(/Parte \d[^<]*\bhs\b/);
	});

	it('«Entradas por parte» o evento suelto: sin lista', async () => {
		await workshop();
		await event('evento-suelto', '2026-10-20T21:00-03:00', 'Espacio Inventado');
		const suelto = await page((await ticketFor('evento-suelto')).token);
		expect(suelto.data.event.parts).toBeNull();
		expect(suelto.body).not.toContain('partes del taller');

		expect(
			await setPerPartTickets(t.db, { eventSlug: 'taller-inventado', perPart: true, by: BY })
		).toEqual({ ok: true });
		const porParte = await page((await ticketFor('taller-inventado')).token);
		expect(porParte.data.event.parts).toBeNull();
		expect(porParte.body).not.toContain('partes del taller');
	});
});

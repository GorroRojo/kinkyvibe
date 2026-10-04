/**
 * Ficha del evento, pestañas Órdenes y Transferencias: el DNI de quien compra no va a la página
 * (solo los últimos 3 dígitos). «Mostrar» lo pide de a una orden y queda en el registro de
 * actividad (sin el DNI); el buscador encuentra órdenes por DNI en el servidor.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	getEventTickets: async () => ({
		title: 'Fiesta de prueba',
		types: [{ id: 'general', name: 'General', price: 5000, capacity: 20 }]
	})
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { TRANSFER_HOLD_MS, reserveOrder } from '$lib/server/tickets/orders.js';
import { dniQueryDigits } from '$lib/admin/orderFormat.js';
import { actions, load } from './+page.server.js';
import Page from './+page.svelte';
import {
	actions as transferActions,
	load as transferLoad
} from '../transferencias/+page.server.js';
import TransferPage from '../transferencias/+page.svelte';

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

const SLUG = 'fiesta-de-prueba';
const OTHER = 'otra-fiesta-de-prueba';
// DNIs inventados.
const DNI_A = '30111957';
const DNI_B = '40222333';
const DNI_C = '30111444';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/**
 * @param {{ slug?: string, dni: string, email: string, method?: 'transferencia' | 'mercadopago' }} o
 */
async function reserve({ slug = SLUG, dni, email, method = 'mercadopago' }) {
	return /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 5000, capacity: 20 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: { name: 'Persona de Prueba', email, dni },
			method,
			holdMs: TRANSFER_HOLD_MS
		})
	).order;
}

/** Tres órdenes del evento y una de otro evento, todas con DNI. */
async function seed() {
	const a = await reserve({ dni: DNI_A, email: 'a@example.com' });
	const b = await reserve({ dni: DNI_B, email: 'b@example.com', method: 'transferencia' });
	const other = await reserve({ slug: OTHER, dni: DNI_C, email: 'c@example.com' });
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?").bind(a.id).run();
	return { a, b, other };
}

/** @param {string} tab */
const pageUrl = (tab) => new URL(`http://localhost/admin/eventos/${SLUG}/${tab}`);

/**
 * @param {any} loader
 * @param {string} tab
 */
async function loadAs(loader, tab) {
	return /** @type {any} */ (
		await loader(
			/** @type {any} */ ({
				locals: admin,
				url: pageUrl(tab),
				params: { slug: SLUG },
				platform: t.platform,
				setHeaders: () => {}
			})
		)
	);
}

/**
 * @param {any} list
 * @param {string} name
 * @param {Record<string, string>} fields
 * @param {any} [locals]
 * @param {string} [tab]
 */
async function act(list, name, fields, locals = admin, tab = 'ordenes') {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		locals,
		platform: t.platform,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: pageUrl(tab),
		fetch: async () => new Response('{}', { status: 503 })
	};
	try {
		return /** @type {any} */ (await list[name](event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

/** Ninguna forma del DNI completo (con o sin puntos). @param {string} text */
function expectNoFullDni(text) {
	for (const dni of [DNI_A, DNI_B, DNI_C]) {
		expect(text).not.toContain(dni);
		expect(text).not.toContain(Number(dni).toLocaleString('es-AR'));
	}
}

const event = { slug: SLUG, title: 'Fiesta de prueba' };

describe('Órdenes: el DNI completo no va a la página', () => {
	it('los datos de la página solo traen los últimos 3 dígitos', async () => {
		const { a, b } = await seed();
		const data = await loadAs(load, 'ordenes');
		expect(data.orders).toHaveLength(2);
		expectNoFullDni(JSON.stringify(data));
		const byId = Object.fromEntries(data.orders.map((/** @type {any} */ o) => [o.id, o]));
		expect(byId[a.id].dniTail).toBe('957');
		expect(byId[b.id].dniTail).toBe('333');
		expect(byId[a.id]).not.toHaveProperty('dni');
	});

	it('el HTML muestra «DNI •••.957» y «Mostrar», nunca el DNI completo', async () => {
		await seed();
		const data = await loadAs(load, 'ordenes');
		const { body } = render(Page, { props: { data: { ...data, event }, form: null } });
		expectNoFullDni(body);
		// La lista arranca en «Aprobadas»: la transferencia pendiente (•••.333) no se dibuja.
		expect(body).toContain('DNI •••.957');
		expect(body).toContain('Mostrar');
		expect(body).toContain('action="?/dni"');
	});

	it('sin JavaScript, después de «Mostrar» se ve ese DNI y ningún otro', async () => {
		const { a } = await seed();
		const data = await loadAs(load, 'ordenes');
		const form = await act(actions, 'dni', { orden: a.id });
		const { body } = render(Page, { props: { data: { ...data, event }, form } });
		expect(body).toContain('DNI 30.111.957');
		expect(body).not.toContain(DNI_B);
		expect(body).not.toContain('40.222.333');
	});
});

describe('Órdenes: «Mostrar» el DNI', () => {
	it('devuelve el DNI de esa orden y queda en el registro, sin el DNI', async () => {
		const { a } = await seed();
		const r = await act(actions, 'dni', { orden: a.id });
		expect(r).toEqual({ dni: { ok: true, key: `orden:${a.id}`, value: DNI_A } });
		const entries = await listAudit(t.db);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			action: 'person.dni.reveal',
			targetType: 'order',
			targetId: a.id,
			actorLogin: ADMINS[0].login
		});
		expect(entries[0].summary).toMatch(/^Miró el DNI de la compra KV-/);
		expectNoFullDni(JSON.stringify(entries));
	});

	it('una orden de otro evento: no la muestra ni la registra', async () => {
		const { other } = await seed();
		const r = await act(actions, 'dni', { orden: other.id });
		expect(r.status).toBe(404);
		expect(r.data.dni.ok).toBe(false);
		expectNoFullDni(JSON.stringify(r));
		expect(await listAudit(t.db)).toEqual([]);
	});

	it('una orden que no existe o sin orden: no muestra nada', async () => {
		await seed();
		expect((await act(actions, 'dni', { orden: 'no-existe' })).status).toBe(404);
		expect((await act(actions, 'dni', {})).status).toBe(400);
		expect(await listAudit(t.db)).toEqual([]);
	});

	it('no admin: 403, sin DNI ni registro', async () => {
		const { a } = await seed();
		expect(await act(actions, 'dni', { orden: a.id }, notAdmin)).toEqual({ thrown: 403 });
		expect(await listAudit(t.db)).toEqual([]);
	});
});

describe('Órdenes: buscar por DNI (en el servidor)', () => {
	it('DNI completo o el principio, con o sin puntos: los ids de las órdenes, sin el DNI', async () => {
		const { a, b } = await seed();
		for (const q of [DNI_A, '30111', '30.111.957', '301']) {
			const r = await act(actions, 'dniSearch', { q });
			expect(r.dniSearch.ids).toEqual([a.id]);
			expectNoFullDni(JSON.stringify(r));
		}
		expect((await act(actions, 'dniSearch', { q: '40222' })).dniSearch.ids).toEqual([b.id]);
	});

	it('no encuentra órdenes de otro evento, ni por el final, ni con letras o menos de 3 dígitos', async () => {
		await seed();
		for (const q of ['30111444', '957', 'persona', '30', '']) {
			expect((await act(actions, 'dniSearch', { q })).dniSearch.ids).toEqual([]);
		}
	});

	it('no admin: 403', async () => {
		await seed();
		expect(await act(actions, 'dniSearch', { q: '30111' }, notAdmin)).toEqual({ thrown: 403 });
	});

	it('qué cuenta como búsqueda por DNI', () => {
		expect(dniQueryDigits('30.111.957')).toBe('30111957');
		expect(dniQueryDigits(' 301 ')).toBe('301');
		expect(dniQueryDigits('30')).toBe('');
		expect(dniQueryDigits('kv-30111')).toBe('');
		expect(dniQueryDigits('1'.repeat(21))).toBe('');
	});
});

describe('Transferencias: lo mismo', () => {
	it('los datos y el HTML solo traen los últimos 3 dígitos; «Mostrar» anda y queda registrado', async () => {
		const { b } = await seed();
		const data = await loadAs(transferLoad, 'transferencias');
		expect(data.transfers.map((/** @type {any} */ o) => o.id)).toEqual([b.id]);
		expectNoFullDni(JSON.stringify(data));
		const { body } = render(TransferPage, { props: { data: { ...data, event }, form: null } });
		expectNoFullDni(body);
		expect(body).toContain('DNI •••.333');

		const r = await act(transferActions, 'dni', { orden: b.id }, admin, 'transferencias');
		expect(r.dni).toMatchObject({ ok: true, value: DNI_B });
		expect((await listAudit(t.db)).map((e) => e.action)).toEqual(['person.dni.reveal']);
	});
});

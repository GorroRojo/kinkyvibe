/**
 * Datos guardados de la cuenta para la compra (savedBuyer.js): guardar y sacar según las casillas
 * al comprar (`?/buy` de verdad), lo que se completa en la página, que nunca se loguea el DNI y
 * que borrar la cuenta los borra. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['transferencia'],
		tickets: [{ id: 'general', name: 'General', price: 10000 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === 'evento-prueba' ? parseTicketConfig(meta, opts) : null,
		getEventInfo: async () => null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { buyAction } from '$lib/server/tickets/checkout.js';
import { getAccount, upsertVerifiedAccount } from './accounts.js';
import { closeAccount } from './index.js';
import { getSavedBuyer, purchaseAccount, saveAfterPurchase, setSavedBuyer } from './savedBuyer.js';

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
	// Datos para transferir inventados (así se ofrece la transferencia).
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
});

const EMAIL = 'persona.prueba@example.com';
const DNI = '30111222';
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));

let n = 0;
/**
 * Llama a `?/buy` como SvelteKit, con o sin cuenta. Devuelve el `fail` o `{ redirect }`.
 * @param {Record<string, string>} fields
 * @param {{ id: string, email: string }} [member]
 */
async function buy(fields, member) {
	const body = new FormData();
	const all = {
		type: 'general',
		quantity: '1',
		name: 'Persona Prueba',
		pronouns: 'elle',
		// Otro mail en cada compra (los topes por mail se prueban en safeguards.test.js).
		email: `compra${n + 1}@example.com`,
		dni: '30.111.222',
		method: 'transferencia',
		accept: 'on',
		holder_name_0: 'Persona Prueba',
		holder_pronouns_0: 'elle',
		...fields
	};
	for (const [k, v] of Object.entries(all)) body.set(k, String(v));
	n++;
	/** @type {any} */
	const event = {
		params: { event: 'evento-prueba' },
		platform: t.platform,
		locals: { member },
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL('http://localhost/calendario/evento-prueba/entradas'),
		fetch: noFetch,
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

async function member() {
	const account = await upsertVerifiedAccount(t.db, EMAIL);
	return { account, member: { id: account.id, email: account.email } };
}

/** Las casillas tal como las manda el formulario con cuenta. */
const BOXES = { datos_cuenta: '1', guardar_datos: '1', recordar_dni: '1' };

describe('al comprar con cuenta', () => {
	it('con las dos casillas guarda nombre, pronombres y DNI (solo números)', async () => {
		const { account, member: m } = await member();
		expect(await buy(BOXES, m)).toMatchObject({ redirect: expect.stringMatching(/^\/entradas\//) });
		expect(await getSavedBuyer(t.db, account.id)).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle',
			dni: DNI
		});
	});

	it('sin «Recordar mi DNI» no guarda el DNI', async () => {
		const { account, member: m } = await member();
		await buy({ datos_cuenta: '1', guardar_datos: '1' }, m);
		expect(await getSavedBuyer(t.db, account.id)).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle'
		});
	});

	it('desmarcar una casilla en una compra posterior saca ese dato', async () => {
		const { account, member: m } = await member();
		await buy(BOXES, m);
		await buy({ datos_cuenta: '1', guardar_datos: '1', name: 'Otro Nombre' }, m);
		expect(await getSavedBuyer(t.db, account.id)).toEqual({
			name: 'Otro Nombre',
			pronouns: 'elle'
		});
		expect(await buy({ datos_cuenta: '1' }, m)).toMatchObject({ redirect: expect.any(String) });
		expect(await getSavedBuyer(t.db, account.id)).toEqual({});
		// No queda ni la clave.
		const row = await t.db
			.prepare('SELECT preferences FROM accounts WHERE id = ?1')
			.bind(account.id)
			.first();
		expect(row?.preferences).toBe('{}');
	});

	it('un formulario sin las casillas (abierto antes de ingresar) no toca lo guardado', async () => {
		const { account, member: m } = await member();
		await setSavedBuyer(t.db, account.id, { name: 'Persona Prueba', dni: DNI });
		await buy({ name: 'Otro Nombre' }, m);
		expect(await getSavedBuyer(t.db, account.id)).toEqual({ name: 'Persona Prueba', dni: DNI });
	});

	it('si la compra no sale (datos inválidos), no se guarda nada', async () => {
		const { account, member: m } = await member();
		const r = await buy({ ...BOXES, dni: '12' }, m);
		expect(r).toMatchObject({ status: 400 });
		expect(r.data.buy.errors.dni).toBeTruthy();
		// Las casillas vuelven como estaban, para no perderlas.
		expect(r.data.buy.values).toMatchObject({
			accountForm: true,
			remember: true,
			rememberDni: true
		});
		expect(await getSavedBuyer(t.db, account.id)).toEqual({});
	});

	it('sin cuenta, las casillas no hacen nada y la compra sale igual', async () => {
		const { account } = await member();
		expect(await buy(BOXES)).toMatchObject({ redirect: expect.stringMatching(/^\/entradas\//) });
		expect(await getSavedBuyer(t.db, account.id)).toEqual({});
	});
});

describe('purchaseAccount (lo que completa la página de compra)', () => {
	it('sin cuenta (o con el interruptor apagado: sin locals.member), nada', async () => {
		expect(await purchaseAccount(t.db, undefined)).toBeNull();
		expect(await purchaseAccount(null, { id: 'x', email: EMAIL })).toBeNull();
	});

	it('con cuenta: lo guardado, el mail de la cuenta y las casillas', async () => {
		const { account, member: m } = await member();
		expect(await purchaseAccount(t.db, m)).toEqual({
			name: '',
			pronouns: '',
			email: EMAIL,
			dni: '',
			remember: true,
			rememberDni: false
		});
		await setSavedBuyer(t.db, account.id, { name: 'Persona Prueba', pronouns: 'elle', dni: DNI });
		expect(await purchaseAccount(t.db, m)).toMatchObject({ dni: DNI, rememberDni: true });
	});

	it('solo los datos de esa cuenta', async () => {
		const { account } = await member();
		await setSavedBuyer(t.db, account.id, { name: 'Persona Prueba', dni: DNI });
		const other = await upsertVerifiedAccount(t.db, 'otra.persona@example.com');
		expect(await purchaseAccount(t.db, { id: other.id, email: other.email })).toMatchObject({
			name: '',
			dni: ''
		});
	});
});

describe('privacidad', () => {
	it('si la base falla, ni el DNI ni el error van al log, y la compra no se frena', async () => {
		const leaky = /** @type {any} */ ({
			prepare: () => {
				throw new Error(`falla con ${DNI}`);
			}
		});
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(
				saveAfterPurchase(
					leaky,
					'id',
					{ name: 'Persona Prueba', pronouns: 'elle', dni: DNI },
					{ remember: true, rememberDni: true }
				)
			).resolves.toBeUndefined();
			expect(await purchaseAccount(leaky, { id: 'id', email: EMAIL })).toBeNull();
			const logged = JSON.stringify(spy.mock.calls.map((c) => c.map(String)));
			expect(spy).toHaveBeenCalled();
			expect(logged).not.toContain(DNI);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('borrar la cuenta', () => {
	it('se van los datos guardados (preferences queda vacío)', async () => {
		const { account } = await member();
		await setSavedBuyer(t.db, account.id, { name: 'Persona Prueba', pronouns: 'elle', dni: DNI });
		expect(await closeAccount(t.db, account.id)).toBe(true);
		expect(await getAccount(t.db, account.id)).toBeNull();
		const row = await t.db
			.prepare('SELECT preferences FROM accounts WHERE id = ?1')
			.bind(account.id)
			.first();
		expect(row?.preferences).toBe('{}');
		expect(JSON.stringify(row)).not.toContain(DNI);
	});
});

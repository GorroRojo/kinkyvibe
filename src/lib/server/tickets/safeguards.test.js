/**
 * Resguardos de la compra: límites por cliente, por email y de reservas abiertas, códigos de
 * descuento en `?/buy`, mails por dirección y nombres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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
		isTestEventSlug: (/** @type {string} */ s) => s.startsWith('prueba-entradas'),
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts),
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { CHECKOUT_RATE_LIMITS, buyAction, discountAction } from './checkout.js';
import { validateBuyer, validateHolder } from './config.js';
import { createDiscountCode } from './discounts.js';
import { HOLD_LIMITS, getCounts, reserveOrder } from './orders.js';
import { clientHash, clientNetwork } from './safeguards.js';

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

const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));

/**
 * Llama a una form action como SvelteKit. Devuelve el `fail` o, si redirige, `{ redirect }`.
 * @param {(event: any) => Promise<any>} action
 * @param {Record<string, string>} fields
 * @param {string} [ip]
 */
async function post(action, fields, ip = '203.0.113.7') {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { event: 'evento' },
		platform: t.platform,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL('http://localhost/calendario/evento/entradas'),
		fetch: noFetch,
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => ip
	};
	try {
		return /** @type {any} */ (await action(event));
	} catch (e) {
		const r = /** @type {any} */ (e);
		if (r?.status === 303) return { redirect: r.location };
		throw e;
	}
}

let n = 0;
/** @param {Record<string, string>} [o] */
function order(o = {}) {
	n++;
	return {
		type: 'general',
		quantity: '1',
		name: 'Persona Prueba',
		pronouns: 'elle',
		email: `persona${n}@example.com`,
		dni: '30111222',
		method: 'transferencia',
		accept: 'on',
		holder_name_0: 'Persona Prueba',
		holder_pronouns_0: 'elle',
		...o
	};
}

describe('clientHash', () => {
	it('no guarda la IP: hash corto, estable en el día y distinto al día siguiente', async () => {
		const now = Date.UTC(2026, 9, 1, 12);
		const h = await clientHash('203.0.113.7', now);
		expect(h).toMatch(/^[0-9a-f]{32}$/);
		expect(h).not.toContain('203');
		expect(await clientHash('203.0.113.7', now + 3600_000)).toBe(h);
		expect(await clientHash('203.0.113.8', now)).not.toBe(h);
		expect(await clientHash('203.0.113.7', now + 24 * 3600_000)).not.toBe(h);
	});

	it('IPv6: toda una red /64 es la misma conexión; otra /64, otra', async () => {
		const now = Date.UTC(2026, 9, 1, 12);
		const h = await clientHash('2001:db8:1:2::1', now);
		expect(await clientHash('2001:db8:1:2::2', now)).toBe(h);
		expect(await clientHash('2001:0db8:0001:0002:ffff:aaaa:bbbb:cccc', now)).toBe(h);
		expect(await clientHash('2001:DB8:1:2:0:0:0:99', now)).toBe(h);
		expect(await clientHash('2001:db8:1:3::1', now)).not.toBe(h);
	});

	it('clientNetwork: IPv4 tal cual, IPv6 por /64, IPv4 dentro de IPv6 como IPv4', () => {
		expect(clientNetwork('203.0.113.7')).toBe('203.0.113.7');
		expect(clientNetwork('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
		expect(clientNetwork('2001:db8::1')).toBe('2001:db8:0:0::/64');
		expect(clientNetwork('::1')).toBe('0:0:0:0::/64');
		expect(clientNetwork('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
		expect(clientNetwork('::ffff:203.0.113.7')).toBe('203.0.113.7');
		expect(clientNetwork('64:ff9b::203.0.113.7')).toBe('64:ff9b:0:0::/64');
		// Lo que no es una IP válida queda igual (y cuenta aparte).
		expect(clientNetwork('unknown')).toBe('unknown');
		expect(clientNetwork('1:2:3')).toBe('1:2:3');
		expect(clientNetwork('1::2::3')).toBe('1::2::3');
	});
});

describe('topes de reservas abiertas (reserveOrder)', () => {
	const type = { id: 'general', price: 10000, capacity: 500 };
	/** @param {number} quantity @param {Record<string, any>} [o] */
	const reserve = (quantity, o = {}) =>
		reserveOrder(t.db, {
			eventSlug: 'evento',
			type,
			quantity,
			holders: Array.from({ length: quantity }, (_, i) => ({ name: `P ${i}`, pronouns: 'elle' })),
			buyer: { name: 'Persona', email: 'misma@example.com', dni: '30111222' },
			method: 'transferencia',
			now: 1000,
			...o
		});

	it('por email: como mucho 2 reservas abiertas y 20 entradas en el evento', async () => {
		expect(HOLD_LIMITS).toMatchObject({ perEmailOrders: 2, perEmailQuantity: 20 });
		expect((await reserve(2)).ok).toBe(true);
		expect((await reserve(2)).ok).toBe(true);
		const third = /** @type {any} */ (await reserve(1));
		expect(third).toMatchObject({ ok: false, reason: 'limit' });
		expect(third.message).toMatch(/reservas sin pagar/);
		// Otro email sí puede.
		expect(
			(await reserve(1, { buyer: { name: 'Otra', email: 'otra@example.com', dni: '30111223' } })).ok
		).toBe(true);
		// En otro evento, el mismo email también.
		expect((await reserve(1, { eventSlug: 'otro' })).ok).toBe(true);
	});

	it('por email: 20 entradas en total entre sus reservas abiertas', async () => {
		expect((await reserve(15)).ok).toBe(true);
		expect(await reserve(6)).toMatchObject({ ok: false, reason: 'limit' });
		expect((await reserve(5)).ok).toBe(true);
	});

	it('lo vencido o pagado no cuenta', async () => {
		expect((await reserve(20)).ok).toBe(true);
		// Pasada la reserva (2 h por defecto para transferencia), se puede de nuevo.
		expect((await reserve(20, { now: 1000 + 2 * 3600_000 + 1 })).ok).toBe(true);
	});

	it('por cliente: como mucho 40 entradas reservadas a la vez, con emails distintos', async () => {
		/** @param {number} i */
		const buyer = (i) => ({ name: 'P', email: `p${i}@example.com`, dni: '30111222' });
		expect((await reserve(20, { clientHash: 'abc', buyer: buyer(1) })).ok).toBe(true);
		expect((await reserve(20, { clientHash: 'abc', buyer: buyer(2) })).ok).toBe(true);
		const r = /** @type {any} */ (await reserve(1, { clientHash: 'abc', buyer: buyer(3) }));
		expect(r).toMatchObject({ ok: false, reason: 'limit' });
		expect(r.message).toMatch(/desde esta conexión/);
		// Otro cliente, sin problema.
		expect((await reserve(20, { clientHash: 'def', buyer: buyer(4) })).ok).toBe(true);
	});
});

describe('?/buy', () => {
	it(
		'muchas reservas desde un mismo cliente con emails distintos no se quedan con el cupo',
		{ timeout: 30000 },
		async () => {
			const results = [];
			for (let i = 0; i < 5; i++) {
				const holders = Object.fromEntries(
					Array.from({ length: 20 }, (_, j) => [
						[`holder_name_${j}`, `Persona ${j}`],
						[`holder_pronouns_${j}`, 'elle']
					]).flat()
				);
				results.push(await post(buyAction, order({ quantity: '20', ...holders })));
			}
			expect(results.filter((r) => r.redirect)).toHaveLength(2);
			expect(results.at(-1).status).toBe(429);
			expect((await getCounts(t.db, 'evento')).get('general')).toMatchObject({ held: 40 });
			// Otra persona (otra conexión) sigue pudiendo comprar.
			expect((await post(buyAction, order(), '198.51.100.9')).redirect).toMatch(/\/estado$/);
		}
	);

	it('la reserva por transferencia arranca corta (se extiende al confirmarla desde el mail)', async () => {
		const r = await post(buyAction, order());
		const id = r.redirect.split('/')[2];
		const row = /** @type {any} */ (
			await t.db
				.prepare('SELECT created_at, expires_at, client_hash FROM orders WHERE id = ?1')
				.bind(id)
				.first()
		);
		expect(row.expires_at - row.created_at).toBe(2 * 3600_000);
		// Se guarda el hash del cliente, nunca la IP.
		expect(row.client_hash).toMatch(/^[0-9a-f]{32}$/);
		const all = JSON.stringify(await t.db.prepare('SELECT * FROM orders').all());
		expect(all).not.toContain('203.0.113.7');
	});

	it(
		'límite de intentos por cliente, antes de validar nada; no afecta a otros clientes',
		{ timeout: 60000 },
		async () => {
			// Reloj fijo en la mitad de una ventana: si el loop cruzara un borde de la ventana
			// (p. ej. las 02:00:00), el contador arrancaría de cero y nunca llegaría al 429.
			const now = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1, 12, 5, 0));
			try {
				const { limit } = CHECKOUT_RATE_LIMITS.client;
				for (let i = 0; i < limit; i++) {
					const r = await post(buyAction, order({ email: 'no-es-mail' }));
					expect(r.status).toBe(400);
				}
				expect((await post(buyAction, order())).status).toBe(429);
				expect((await post(buyAction, order(), '198.51.100.9')).redirect).toBeTruthy();
			} finally {
				now.mockRestore();
			}
		}
	);

	it(
		'el techo por evento es holgado: muchos clientes distintos compran sin 429',
		{ timeout: 60000 },
		async () => {
			for (let i = 0; i < 40; i++) {
				const r = await post(buyAction, order({ method: 'transferencia' }), `198.51.100.${i}`);
				expect(r.redirect).toBeTruthy();
			}
		}
	);

	it(
		'los códigos de descuento que se prueban en ?/buy cuentan para el mismo límite que ?/discount',
		{ timeout: 30000 },
		async () => {
			// Reloj fijo: la ventana del límite de códigos es de 10 min (fija, alineada a :00, :10…).
			// Con el reloj real, si el loop cruzaba un borde el contador volvía a cero y el
			// REAL10 de abajo compraba (redirect, `status` undefined) en vez de dar 429.
			const now = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1, 12, 5, 0));
			try {
				await createDiscountCode(
					t.db,
					{
						code: 'REAL10',
						kind: 'percent',
						value: 10,
						event_slug: null,
						starts_at: null,
						ends_at: null,
						max_uses: null
					},
					{ by: 'admin' }
				);
				const { limit } = CHECKOUT_RATE_LIMITS.code;
				// Mitad con "Aplicar", mitad comprando: el contador es uno solo.
				for (let i = 0; i < limit; i++) {
					const action = i % 2 ? discountAction : buyAction;
					const r = await post(action, order({ code: `MAL${i}`, email: 'no-es-mail' }));
					expect(r.status).toBe(400);
				}
				const blocked = await post(buyAction, order({ code: 'REAL10' }));
				expect(blocked.status).toBe(429);
				expect(blocked.data.buy.errors.code).toMatch(/Demasiados intentos/);
				expect((await post(discountAction, order({ code: 'REAL10' }))).status).toBe(429);
				// Desde otra conexión el código válido anda.
				const ok = await post(discountAction, order({ code: 'REAL10' }), '198.51.100.9');
				expect(ok.buy.discount).toMatchObject({ code: 'REAL10' });
			} finally {
				now.mockRestore();
			}
		}
	);

	it('mails a una misma dirección: como mucho 3 por hora', { timeout: 30000 }, async () => {
		// Reloj fijo: el límite de mails usa ventanas de una hora en punto; si el loop cruzaba
		// una hora (p. ej. las 13:00:00), el contador volvía a cero y salían más de 3 mails.
		const now = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1, 12, 5, 0));
		onTestFinished(() => now.mockRestore());
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const mails = () =>
			spy.mock.calls.filter((c) =>
				/email simulado\] para u\*\*\*@example\.com · "Tus entradas/.test(String(c[0]))
			).length;
		/** @param {number} i */
		const free = (i) =>
			order({
				type: 'libre',
				amount: '0',
				email: 'una@example.com',
				method: '',
				dni: `3011122${i}`
			});
		// Entradas gratis (se emiten al toque): distintas órdenes, misma dirección.
		for (let i = 0; i < 5; i++) {
			const r = await post(buyAction, free(i), `198.51.100.${i}`);
			expect(r.redirect).toBeTruthy();
		}
		await new Promise((r) => setTimeout(r, 50));
		expect(mails()).toBe(CHECKOUT_RATE_LIMITS.mail.limit);
		spy.mockRestore();
		warn.mockRestore();
	});
});

describe('nombres', () => {
	it.each(['Mirá https://phish.example', 'www.algo.com', 'Ale <b>', 'visitá sitio.com'])(
		'rechaza links en el nombre: %j',
		(name) => {
			expect(validateHolder({ name, pronouns: 'elle' }).ok).toBe(false);
			expect(
				validateBuyer({ name, pronouns: 'elle', email: 'a@example.com', dni: '30111222' }).ok
			).toBe(false);
		}
	);

	it('saca caracteres de control e invisibles, y respeta el largo', () => {
		const r = /** @type {any} */ (validateHolder({ name: 'Ale‮\u0000 Prueba​', pronouns: 'elle' }));
		expect(r.holder.name).toBe('Ale Prueba');
		expect(validateHolder({ name: 'x'.repeat(81), pronouns: 'elle' }).ok).toBe(false);
		expect(validateHolder({ name: 'María José Ñandú', pronouns: 'ella' }).ok).toBe(true);
	});
});

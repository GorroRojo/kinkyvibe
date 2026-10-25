/**
 * Resguardos de la compra: límites por cliente, por email y de reservas abiertas, códigos de
 * descuento en `?/buy`, mails por dirección y nombres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

/** El comienzo del evento de prueba (un test lo acerca para ver el tope de la reserva). */
const eventStart = vi.hoisted(() => ({ value: '2099-12-01T20:00-03:00' }));

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
			parseTicketConfig({ ...meta, start: eventStart.value }, opts),
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { CHECKOUT_RATE_LIMITS, FREE_ONCE_MESSAGE, buyAction, discountAction } from './checkout.js';
import {
	UNCONFIRMED_MAIL_CAP,
	optOutUrl,
	suppressByToken
} from '$lib/server/email/suppressions.js';
import { validateBuyer, validateHolder } from './config.js';
import { createDiscountCode } from './discounts.js';
import { HOLD_LIMITS, getCounts, reserveOrder } from './orders.js';
import { clientHash, clientNetwork } from './safeguards.js';
import { transferDeadline } from '$lib/utils/transferDeadline.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { ordersForAccount, unconfirmedFreeOrders } from '$lib/server/cuentas/orders.js';

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
 * @param {string} [slug] el evento (todos con la misma configuración de prueba)
 * @param {{ id: string, email: string }} [member] la cuenta con sesión
 */
async function post(action, fields, ip = '203.0.113.7', slug = 'evento', member) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { event: slug },
		platform: t.platform,
		locals: member ? { member } : {},
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
		// Pasada la reserva (por defecto, la de los días hábiles para transferencia), se puede de nuevo.
		expect((await reserve(20, { now: transferDeadline(1000) - 1 })).ok).toBe(false);
		expect((await reserve(20, { now: transferDeadline(1000) })).ok).toBe(true);
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

	it('la reserva por transferencia dura de entrada hasta las 20:00 del segundo día hábil (sin paso de confirmar)', async () => {
		const r = await post(buyAction, order());
		const id = r.redirect.split('/')[2];
		const row = /** @type {any} */ (
			await t.db
				.prepare('SELECT created_at, expires_at, client_hash FROM orders WHERE id = ?1')
				.bind(id)
				.first()
		);
		expect(row.expires_at).toBe(transferDeadline(row.created_at));
		// Se guarda el hash del cliente, nunca la IP.
		expect(row.client_hash).toMatch(/^[0-9a-f]{32}$/);
		const all = JSON.stringify(await t.db.prepare('SELECT * FROM orders').all());
		expect(all).not.toContain('203.0.113.7');
	});

	it('si el evento empieza antes de ese vencimiento, la reserva por transferencia dura hasta que empieza', async () => {
		const soon = new Date(Date.now() + 3 * 3600_000);
		soon.setUTCSeconds(0, 0);
		eventStart.value = soon.toISOString();
		onTestFinished(() => {
			eventStart.value = '2099-12-01T20:00-03:00';
		});
		const r = await post(buyAction, order());
		const id = r.redirect.split('/')[2];
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT created_at, expires_at FROM orders WHERE id = ?1').bind(id).first()
		);
		expect(row.expires_at).toBe(Math.min(soon.getTime(), transferDeadline(row.created_at)));
		expect(row.expires_at).toBe(soon.getTime());
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
		// Entradas gratis (se emiten al toque): distintas órdenes, misma dirección. Cada una en otro
		// evento: con un mail sin cuenta, una orden gratis por mail y evento (ver más abajo).
		for (let i = 0; i < 5; i++) {
			const r = await post(buyAction, free(i), `198.51.100.${i}`, `evento-${i}`);
			expect(r.redirect).toBeTruthy();
		}
		await new Promise((r) => setTimeout(r, 50));
		expect(mails()).toBe(CHECKOUT_RATE_LIMITS.mail.limit);
		spy.mockRestore();
		warn.mockRestore();
	});
});

describe('entradas gratis y mails a direcciones sin confirmar', () => {
	/** @param {string} email @param {Record<string, string>} [o] */
	const free = (email, o = {}) => order({ type: 'libre', amount: '0', email, method: '', ...o });

	/** Los mails «simulados» (dev, sin RESEND_API_KEY) de entradas a `masked` en esta prueba. */
	function mailLog() {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		onTestFinished(() => {
			log.mockRestore();
			warn.mockRestore();
		});
		/** @param {string} masked @param {string} [subject] */
		return (masked, subject = 'Tus entradas') =>
			log.mock.calls.filter((c) =>
				String(c[0]).includes(`email simulado] para ${masked} · "${subject}`)
			).length;
	}

	/** @param {string} redirect */
	const orderOf = async (redirect) =>
		/** @type {any} */ (
			await t.db
				.prepare('SELECT status, payment_method FROM orders WHERE id = ?1')
				.bind(redirect.split('/')[2])
				.first()
		);

	it('una orden gratis por mail y evento; con la cuenta de ese mail, más', async () => {
		const first = await post(buyAction, free('dos.veces@example.com'), '198.51.100.1');
		expect(first.redirect).toMatch(/\/estado$/);
		// Mismo mail (con otras mayúsculas), mismo evento, otra conexión: no.
		const again = await post(buyAction, free('Dos.Veces@example.com'), '198.51.100.2');
		expect(again.status).toBe(409);
		expect(again.data.buy.error).toBe(FREE_ONCE_MESSAGE);
		// Otro evento, sí.
		const other = await post(buyAction, free('dos.veces@example.com'), '198.51.100.3', 'otro');
		expect(other.redirect).toMatch(/\/estado$/);
		// Con la sesión de la cuenta de ese mail, sí.
		const member = { id: 'cuenta-de-prueba', email: 'dos.veces@example.com' };
		const mine = await post(
			buyAction,
			free('dos.veces@example.com'),
			'198.51.100.4',
			'evento',
			member
		);
		expect(mine.redirect).toMatch(/\/estado$/);
		// Una cuenta con otro mail no sirve.
		const otherMember = { id: 'otra-cuenta', email: 'otra.cuenta@example.com' };
		const notMine = await post(
			buyAction,
			free('dos.veces@example.com'),
			'198.51.100.5',
			'evento',
			otherMember
		);
		expect(notMine.status).toBe(409);
		// (Más intentos con este mail chocarían con el límite de órdenes por mail cada 10 minutos.)
	});

	it('Mi rincón: la gratis pedida con la sesión de esa cuenta va a la lista; sin sesión, a «¿Son tuyas?»', async () => {
		// Desde cuándo se pregunta (lo escribe la migración 0061): antes de estas órdenes.
		await t.db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
				VALUES ('free_order_choices_since', ?1, 1, 'test')`
			)
			.bind(String(Date.now() - 1000))
			.run();
		const account = await upsertVerifiedAccount(t.db, 'con.cuenta@example.com', {
			now: Date.now()
		});
		const member = { id: account.id, email: account.email };
		const withSession = await post(
			buyAction,
			free('con.cuenta@example.com'),
			'198.51.100.21',
			'evento',
			member
		);
		const without = await post(buyAction, free('con.cuenta@example.com'), '198.51.100.22', 'otro');
		/** @param {string} redirect */
		const idOf = (redirect) => redirect.split('/')[2];
		expect((await ordersForAccount(t.db, account.id)).map((o) => o.id)).toEqual([
			idOf(withSession.redirect)
		]);
		expect((await unconfirmedFreeOrders(t.db, account.id)).map((o) => o.id)).toEqual([
			idOf(without.redirect)
		]);
	});

	it('«No fui yo»: la orden gratis se crea y aprueba, pero no sale el mail', async () => {
		const mails = mailLog();
		const url = await optOutUrl(t.db, 'http://localhost', 'no.fui@example.com');
		expect(await suppressByToken(t.db, String(url).split('/').pop())).toBe(true);
		const r = await post(buyAction, free('No.Fui@example.com'), '198.51.100.7');
		expect(r.redirect).toMatch(/\/estado$/);
		expect(await orderOf(r.redirect)).toMatchObject({
			status: 'approved',
			payment_method: 'gratis'
		});
		// Otra dirección, sin «No fui yo», sí recibe el suyo.
		const ok = await post(buyAction, free('si.llega@example.com'), '198.51.100.8');
		expect(ok.redirect).toMatch(/\/estado$/);
		await new Promise((res) => setTimeout(res, 50));
		expect(mails('n***@example.com')).toBe(0);
		expect(mails('s***@example.com')).toBe(1);
	});

	it('«No fui yo»: la reserva por transferencia se crea, sin el mail de los datos', async () => {
		const mails = mailLog();
		const url = await optOutUrl(t.db, 'http://localhost', 'no.reserve@example.com');
		await suppressByToken(t.db, String(url).split('/').pop());
		const r = await post(buyAction, order({ email: 'no.reserve@example.com' }), '198.51.100.9');
		expect(r.redirect).toMatch(/\/estado$/);
		expect(await orderOf(r.redirect)).toMatchObject({ payment_method: 'transferencia' });
		await new Promise((res) => setTimeout(res, 50));
		expect(mails('n***@example.com', 'Datos para transferir')).toBe(0);
	});

	it(
		'tope por día de mails a una dirección sin confirmar, sumando entradas gratis y reservas',
		{ timeout: 30000 },
		async () => {
			const mails = mailLog();
			let clock = Date.UTC(2026, 9, 1, 3, 5, 0);
			const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);
			onTestFinished(() => now.mockRestore());
			// Una por hora (así no cuenta el límite de 3 por hora), cada una en otro evento.
			for (let i = 0; i < UNCONFIRMED_MAIL_CAP.limit + 2; i++) {
				clock += 60 * 60 * 1000;
				const fields =
					i % 2
						? order({ email: 'tope@example.com', dni: `3011122${i}` })
						: free('tope@example.com', { dni: `3011122${i}` });
				const r = await post(buyAction, fields, `198.51.100.${20 + i}`, `evento-tope-${i}`);
				expect(r.redirect).toBeTruthy();
			}
			await new Promise((res) => setTimeout(res, 50));
			expect(mails('t***@example.com') + mails('t***@example.com', 'Datos para transferir')).toBe(
				UNCONFIRMED_MAIL_CAP.limit
			);
			// Con la cuenta de ese mail no cuenta el tope (sí el de 3 por hora).
			clock += 60 * 60 * 1000;
			const member = { id: 'cuenta-tope', email: 'tope@example.com' };
			const r = await post(
				buyAction,
				free('tope@example.com'),
				'198.51.100.40',
				'evento-tope-cuenta',
				member
			);
			expect(r.redirect).toBeTruthy();
			await new Promise((res) => setTimeout(res, 50));
			expect(mails('t***@example.com') + mails('t***@example.com', 'Datos para transferir')).toBe(
				UNCONFIRMED_MAIL_CAP.limit + 1
			);
		}
	);
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

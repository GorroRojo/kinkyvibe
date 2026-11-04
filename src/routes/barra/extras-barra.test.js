/**
 * Extras de la compra y link de barra (docs/tickets.md, «Extras» y «Link de barra»; decisión 0056),
 * como los llama SvelteKit y contra el D1 de miniflare:
 *
 * - la reserva guarda los extras en la misma tanda que la orden, con su tope (aprobadas + reservas
 *   vigentes): si no alcanza no se crea nada; el pago de MP tiene que ser entradas + extras;
 * - la compra pública con extras (transferencia) y el CSV con sus dos columnas (solo prendido);
 * - «Entregar 1» en la puerta: nunca más que lo comprado, queda en Actividad;
 * - el link de barra: abre solo /barra/<evento> (un link de puerta no la abre, y uno de barra no
 *   abre la puerta), de la persona solo el nombre de la entrada, entrega y queda como
 *   `barra:<id>`; con el interruptor apagado, 404.
 *
 * Eventos, personas y mails inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const SLUG = 'fiesta-de-prueba';
const OTHER = 'otra-fiesta-de-prueba';

/** @type {Record<string, Record<string, any>>} */
const metas = {};
function resetMetas() {
	for (const k of Object.keys(metas)) delete metas[k];
	for (const [slug, title] of [
		[SLUG, 'Fiesta de prueba'],
		[OTHER, 'Otra fiesta de prueba']
	]) {
		metas[slug] = {
			title,
			start: '2099-12-01T20:00-03:00',
			status: 'abierto',
			location: 'Lugar de prueba',
			payment_methods: ['mercadopago', 'transferencia'],
			puerta: true,
			tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 20 }],
			extras: [
				{ id: 'trago', name: 'Trago', price: 3000, capacity: 3, per_order: 2 },
				{ id: 'remera', name: 'Remera', price: 15000 }
			]
		};
	}
}
resetMetas();

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		isValidEventSlug: () => true,
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug] ? parseTicketConfig(metas[slug], opts) : null
	};
});

// Los mails: no salen.
vi.mock('$lib/server/tickets/index.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	sendOrderEmail: async () => true,
	sendTransferEmail: async () => true
}));

// Sin serie (leer las publicaciones compila todo el repo).
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async () => []
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { deliverExtra } from '$lib/server/tickets/extras.js';
import {
	BAR_LINK_COOKIE,
	DOOR_LINK_COOKIE,
	createDoorLink,
	findDoorLink
} from '$lib/server/tickets/doorLinks.js';
import { buyAction } from '$lib/server/tickets/checkout.js';
import * as barEntry from './+page.server.js';
import * as bar from './[slug]/+page.server.js';
import * as doorEntry from '../puerta/+page.server.js';
import * as linkDoor from '../puerta/[slug]/+page.server.js';
import * as adminDoor from '../(authed)/admin/eventos/[slug]/ingreso/+page.server.js';
import * as ordersCsv from '../(authed)/admin/eventos/[slug]/ordenes.csv/+server.js';

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
	resetMetas();
	clearFlagCache();
	await setFlag(t.db, 'extras', true, { by: 'test' });
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const HOUR = 60 * 60 * 1000;
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));

/** @param {Record<string, string>} [initial] */
function jar(initial = {}) {
	const values = { ...initial };
	return {
		values,
		cookies: {
			get: (/** @type {string} */ n) => values[n],
			getAll: () => Object.entries(values).map(([name, value]) => ({ name, value })),
			set: (/** @type {string} */ name, /** @type {string} */ value) => {
				values[name] = value;
			},
			delete: (/** @type {string} */ name) => {
				delete values[name];
			},
			serialize: () => ''
		}
	};
}

/**
 * @param {(event: any) => any} handler
 * @param {{ slug?: string, path?: string, fields?: Record<string, string>, locals?: any,
 *   cookies?: any }} [opts]
 */
async function call(handler, opts = {}) {
	const slug = opts.slug ?? SLUG;
	const url = new URL(`http://localhost${opts.path ?? `/barra/${slug}`}`);
	/** @type {RequestInit} */
	let init = { method: 'GET' };
	if (opts.fields) {
		const body = new FormData();
		for (const [k, v] of Object.entries(opts.fields)) body.set(k, v);
		init = { method: 'POST', body };
	}
	/** @type {any} */
	const event = {
		params: { slug, event: slug },
		platform: t.platform,
		locals: opts.locals ?? {},
		request: new Request(url, init),
		url,
		fetch: noFetch,
		cookies: opts.cookies ?? jar().cookies,
		getClientAddress: () => '203.0.113.9',
		setHeaders: () => {},
		parent: async () => ({})
	};
	try {
		const r = await handler(event);
		return r instanceof Response ? { status: r.status, text: await r.text() } : r;
	} catch (e) {
		const err = /** @type {any} */ (e);
		return { thrown: err.status, message: err.body?.message, location: err.location };
	}
}

const BUYER = {
	name: 'Persona Inventada',
	pronouns: 'elle',
	email: 'persona@example.com',
	dni: '30111222'
};
const TRAGO = { id: 'trago', name: 'Trago', price: 3000, capacity: 3 };

/**
 * Una orden con extras (MP, pendiente) y, con `approve`, pagada.
 * @param {{ slug?: string, tragos?: number, approve?: boolean, now?: number }} [o]
 */
async function orderWithExtras({ slug = SLUG, tragos = 2, approve = true, now } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 8000, capacity: 20 },
			quantity: 1,
			holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
			buyer: BUYER,
			extras: [{ ...TRAGO, quantity: tragos }],
			...(now ? { now } : {})
		})
	);
	if (!r.ok) return r;
	if (!approve) return { ...r, tickets: [] };
	const paid = await applyPayment(t.db, {
		id: Math.floor(Math.random() * 1e9),
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: r.order.total + r.order.extras_amount,
		currency_id: 'ARS'
	});
	return { ...r, tickets: paid.tickets };
}

/** @param {string} slug @param {'puerta' | 'barra'} scope */
async function makeLink(slug = SLUG, scope = /** @type {'puerta' | 'barra'} */ ('barra')) {
	const r = await createDoorLink(t.db, {
		eventSlug: slug,
		label: scope === 'barra' ? 'barra 1' : 'puerta 1',
		createdBy: ADMINS[0].login,
		expiresAt: Date.now() + 6 * HOUR,
		scope
	});
	if (!r.ok) throw new Error('no se creó el link');
	const cookie = scope === 'barra' ? BAR_LINK_COOKIE : DOOR_LINK_COOKIE;
	return { token: r.token, link: r.link, jar: jar({ [cookie]: r.token }) };
}

describe('reserva con extras', () => {
	it('guarda los extras en la misma tanda; el total de la orden sigue siendo el de las entradas', async () => {
		const r = await orderWithExtras({ approve: false });
		expect(r.ok).toBe(true);
		expect(r.order.total).toBe(8000);
		expect(r.order.extras_amount).toBe(6000);
		const { results } = await t.db
			.prepare('SELECT extra_id, name, unit_price, quantity, delivered FROM order_extras')
			.all();
		expect(results).toEqual([
			{ extra_id: 'trago', name: 'Trago', unit_price: 3000, quantity: 2, delivered: 0 }
		]);
	});

	it('el pago de MP tiene que ser entradas + extras', async () => {
		const r = await orderWithExtras({ approve: false });
		const short = await applyPayment(t.db, {
			id: 1,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: r.order.total,
			currency_id: 'ARS'
		});
		expect(short.outcome).toBe('mismatch');
		const ok = await applyPayment(t.db, {
			id: 2,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 14000,
			currency_id: 'ARS'
		});
		expect(ok.outcome).toBe('updated');
	});

	it('el tope cuenta aprobadas y reservas vigentes; si no alcanza no se crea nada', async () => {
		await orderWithExtras({ tragos: 2 });
		const before = await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first();
		const r = await orderWithExtras({ tragos: 2, approve: false });
		expect(r).toEqual({ ok: false, reason: 'extras' });
		// Ni la orden ni sus extras.
		expect(await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).toEqual(before);
		// Queda 1: entra.
		expect((await orderWithExtras({ tragos: 1, approve: false })).ok).toBe(true);
		expect((await orderWithExtras({ tragos: 1, approve: false })).reason).toBe('extras');
	});

	it('una reserva vencida devuelve su parte del tope', async () => {
		const old = Date.now() - 2 * HOUR;
		await orderWithExtras({ tragos: 2, approve: false, now: old });
		expect((await orderWithExtras({ tragos: 2, approve: false })).ok).toBe(true);
	});
});

describe('entregar', () => {
	it('de a uno y nunca más que lo comprado; solo en compras aprobadas de ese evento', async () => {
		const r = await orderWithExtras({ tragos: 2 });
		const ticketId = r.tickets[0].id;
		const one = await deliverExtra(t.db, { eventSlug: SLUG, ticketId, extraId: 'trago' });
		expect(one).toMatchObject({ ok: true, extra: { quantity: 2, delivered: 1 } });
		await deliverExtra(t.db, { eventSlug: SLUG, ticketId, extraId: 'trago' });
		expect(await deliverExtra(t.db, { eventSlug: SLUG, ticketId, extraId: 'trago' })).toEqual({
			ok: false,
			reason: 'none-left'
		});
		expect(await deliverExtra(t.db, { eventSlug: OTHER, ticketId, extraId: 'trago' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
		// Reembolsada: no se entrega.
		const other = await orderWithExtras({ tragos: 1 });
		await t.db
			.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?1")
			.bind(other.order.id)
			.run();
		expect(
			await deliverExtra(t.db, {
				eventSlug: SLUG,
				ticketId: other.tickets[0].id,
				extraId: 'trago'
			})
		).toEqual({ ok: false, reason: 'not-found' });
	});

	it('en la puerta: el escaneo muestra los extras y «Entregar 1» queda en Actividad', async () => {
		const r = await orderWithExtras({ tragos: 1 });
		const path = `/admin/eventos/${SLUG}/ingreso`;
		const scan = /** @type {any} */ (
			await call(adminDoor.actions.checkin, {
				path,
				locals: admin,
				fields: { token: r.tickets[0].token }
			})
		);
		expect(scan.checkin.card.extras).toEqual([
			{ id: 'trago', name: 'Trago', price: 3000, quantity: 1, delivered: 0 }
		]);
		const ok = /** @type {any} */ (
			await call(adminDoor.actions.entregar, {
				path,
				locals: admin,
				fields: { ticket: r.tickets[0].id, extra: 'trago' }
			})
		);
		expect(ok.deliver.extras[0].delivered).toBe(1);
		const again = /** @type {any} */ (
			await call(adminDoor.actions.entregar, {
				path,
				locals: admin,
				fields: { ticket: r.tickets[0].id, extra: 'trago' }
			})
		);
		expect(again.status).toBe(409);
		const log = await t.db
			.prepare("SELECT actor_login, summary FROM admin_audit WHERE action = 'extras.deliver'")
			.all();
		expect(log.results).toHaveLength(1);
		expect(log.results[0].actor_login).toBe(ADMINS[0].login);
	});
});

describe('link de barra', () => {
	it('entrar: un link de barra abre /barra; uno de puerta no (y al revés)', async () => {
		const barLink = await makeLink(SLUG, 'barra');
		const doorLink = await makeLink(SLUG, 'puerta');
		// Ni siquiera se encuentra con el otro alcance (el hash lleva un prefijo por alcance).
		expect(await findDoorLink(t.db, barLink.token)).toEqual({ ok: false, reason: 'unknown' });
		expect(await findDoorLink(t.db, doorLink.token, Date.now(), 'barra')).toEqual({
			ok: false,
			reason: 'unknown'
		});
		const c = jar();
		const ok = /** @type {any} */ (
			await call(barEntry.actions.entrar, {
				path: '/barra',
				cookies: c.cookies,
				fields: { token: barLink.token }
			})
		);
		expect(ok).toEqual({ slug: SLUG });
		expect(c.values[BAR_LINK_COOKIE]).toBe(barLink.token);
		const wrong = /** @type {any} */ (
			await call(barEntry.actions.entrar, { path: '/barra', fields: { token: doorLink.token } })
		);
		expect(wrong.status).toBe(403);
		const viaDoor = /** @type {any} */ (
			await call(doorEntry.actions.entrar, { path: '/puerta', fields: { token: barLink.token } })
		);
		expect(viaDoor.status).toBe(403);
		// La puerta con la cookie de un link de barra (bajo el nombre de la de puerta): 403.
		const door = await call(linkDoor.load, {
			path: `/puerta/${SLUG}`,
			cookies: jar({ [DOOR_LINK_COOKIE]: barLink.token }).cookies
		});
		expect(door).toMatchObject({ thrown: 403 });
		// La barra con un link de puerta: 403.
		const barWithDoor = await call(bar.load, {
			cookies: jar({ [BAR_LINK_COOKIE]: doorLink.token }).cookies
		});
		expect(barWithDoor).toMatchObject({ thrown: 403 });
	});

	it('ver: solo el nombre de la entrada y sus extras; entregar queda como barra:<id>', async () => {
		const r = await orderWithExtras({ tragos: 2 });
		const { link, jar: j } = await makeLink();
		const page = /** @type {any} */ (await call(bar.load, { cookies: j.cookies }));
		expect(page.summary).toEqual([
			{ id: 'trago', name: 'Trago', sold: 2, delivered: 0, amount: 6000 }
		]);
		const seen = /** @type {any} */ (
			await call(bar.actions.ver, { cookies: j.cookies, fields: { token: r.tickets[0].code } })
		);
		expect(seen.ver.ticket).toEqual({
			ticketId: r.tickets[0].id,
			holder: 'Persona Inventada',
			approved: true,
			extras: [{ id: 'trago', name: 'Trago', price: 3000, quantity: 2, delivered: 0 }]
		});
		expect(JSON.stringify(seen)).not.toContain('persona@example.com');
		expect(JSON.stringify(seen)).not.toContain('30111222');
		const found = /** @type {any} */ (
			await call(bar.actions.buscar, { cookies: j.cookies, fields: { q: 'inventada' } })
		);
		expect(found.buscar.results).toEqual([
			{ ticketId: r.tickets[0].id, holder: 'Persona Inventada' }
		]);
		const given = /** @type {any} */ (
			await call(bar.actions.entregar, {
				cookies: j.cookies,
				fields: { ticket: r.tickets[0].id, extra: 'trago' }
			})
		);
		expect(given.deliver.extras[0].delivered).toBe(1);
		expect(given.summary[0]).toMatchObject({ sold: 2, delivered: 1 });
		const log = await t.db
			.prepare("SELECT actor_login, detail FROM admin_audit WHERE action = 'extras.deliver'")
			.first();
		expect(log?.actor_login).toBe(`barra:${link.id}`);
		expect(String(log?.detail)).not.toContain(j.values[BAR_LINK_COOKIE]);
	});

	it('una entrada de otro evento no aparece; el link de otro evento no abre esta barra', async () => {
		const other = await orderWithExtras({ slug: OTHER, tragos: 1 });
		const { jar: j } = await makeLink();
		const seen = /** @type {any} */ (
			await call(bar.actions.ver, { cookies: j.cookies, fields: { token: other.tickets[0].code } })
		);
		expect(seen.status).toBe(404);
		const notHere = /** @type {any} */ (
			await call(bar.actions.entregar, {
				cookies: j.cookies,
				fields: { ticket: other.tickets[0].id, extra: 'trago' }
			})
		);
		expect(notHere.status).toBe(404);
		const otherLink = await makeLink(OTHER);
		expect(await call(bar.load, { cookies: otherLink.jar.cookies })).toMatchObject({
			thrown: 403
		});
	});

	it('revocado o vencido: 403; con el interruptor apagado: 404', async () => {
		const { link, jar: j } = await makeLink();
		await t.db.prepare('UPDATE door_links SET revoked_at = 1 WHERE id = ?1').bind(link.id).run();
		expect(await call(bar.load, { cookies: j.cookies })).toMatchObject({ thrown: 403 });
		await setFlag(t.db, 'extras', false, { by: 'test' });
		const fresh = await makeLink();
		expect(await call(bar.load, { cookies: fresh.jar.cookies })).toMatchObject({ thrown: 404 });
		expect(await call(barEntry.load, { path: '/barra' })).toMatchObject({ thrown: 404 });
	});
});

describe('compra pública y CSV', () => {
	const buyBody = {
		type: 'general',
		quantity: '1',
		name: 'Persona Inventada',
		pronouns: 'elle',
		email: 'compra@example.com',
		dni: '30111222',
		method: 'transferencia',
		accept: 'on',
		holder_name_0: 'Persona Inventada',
		holder_pronouns_0: 'elle'
	};
	const transferInfo = () =>
		t.db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
				VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
			)
			.run();
	const buy = (/** @type {Record<string, string>} */ extra) =>
		call(buyAction, { path: `/calendario/${SLUG}/entradas`, fields: { ...buyBody, ...extra } });

	it('los extras se suman (sin código ni Fondo) y el CSV los muestra solo prendido', async () => {
		await transferInfo();
		const tooMany = /** @type {any} */ (await buy({ extra_trago: '3' }));
		expect(tooMany.status).toBe(400);
		expect(tooMany.data.buy.errors.extra_trago).toMatch(/hasta 2/);
		const ok = /** @type {any} */ (await buy({ extra_trago: '2', extra_remera: '1' }));
		expect(ok.thrown).toBe(303);
		const order = await t.db.prepare('SELECT * FROM orders').first();
		expect(order).toMatchObject({ total: 8000, extras_amount: 21000, status: 'awaiting_transfer' });

		const csv = /** @type {any} */ (
			await call(ordersCsv.GET, { path: `/admin/eventos/${SLUG}/ordenes.csv`, locals: admin })
		);
		const [header, row] = csv.text.split(/\r?\n/);
		const cols = header.split(',');
		expect(cols.slice(cols.indexOf('total'), cols.indexOf('total') + 3)).toEqual([
			'total',
			'extras',
			'monto_extras'
		]);
		expect(row).toContain('2 × Trago, 1 × Remera');
		expect(row).toContain(',21000,');

		await setFlag(t.db, 'extras', false, { by: 'test' });
		const off = /** @type {any} */ (
			await call(ordersCsv.GET, { path: `/admin/eventos/${SLUG}/ordenes.csv`, locals: admin })
		);
		expect(off.text.split(/\r?\n/)[0]).not.toContain('extras');
	});

	it('apagado, los extras del formulario se ignoran', async () => {
		await transferInfo();
		await setFlag(t.db, 'extras', false, { by: 'test' });
		const ok = /** @type {any} */ (await buy({ extra_trago: '2' }));
		expect(ok.thrown).toBe(303);
		const order = await t.db.prepare('SELECT total, extras_amount FROM orders').first();
		expect(order).toEqual({ total: 8000, extras_amount: 0 });
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM order_extras').first())?.n).toBe(0);
	});
});

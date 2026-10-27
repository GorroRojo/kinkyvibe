/**
 * Links de puerta (docs/tickets.md, «Link de puerta»): un link por evento que abre **solo** el modo
 * puerta de ese evento, sin cuenta. Se prueba como lo llama SvelteKit (load, form actions y GET):
 *
 * - el token: al azar, en la base solo su hash, nunca en el registro;
 * - entrar (`/puerta?/entrar`): la cookie (solo /puerta, httpOnly, Strict, vence con el link) y el
 *   tope de intentos;
 * - la puerta con link: anda en su evento; 403 vencido, revocado, de otro evento, sin cookie o con
 *   un token cambiado; las acciones de la puerta quedan en el registro con el id del link; sin DNI
 *   completo y sin pasar límites;
 * - el resto del panel no la reconoce (ni la puerta del panel, ni órdenes, ni exportar, ni
 *   reembolsar, ni mails), y solo une admin crea y revoca links.
 *
 * D1 de miniflare. Eventos, personas, mails y DNI inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const SLUG = 'fiesta-de-prueba';
const OTHER = 'otra-fiesta-de-prueba';

/** Frontmatter de los eventos de prueba, por slug. */
const metas = /** @type {Record<string, Record<string, any>>} */ ({});
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
			tickets: [{ id: 'general', name: 'General', price: 8000, door_price: 10000, capacity: 20 }]
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

// Sin serie (leer las publicaciones compila todo el repo).
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async () => []
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import {
	DOOR_LINK_COOKIE,
	DOOR_LINK_ENTER_LIMIT,
	createDoorLink,
	defaultDoorLinkExpiry,
	findDoorLink,
	hashDoorToken,
	isDoorTokenShape,
	newDoorToken,
	parseDoorLinkForm
} from '$lib/server/tickets/doorLinks.js';
import * as entry from './+page.server.js';
import * as linkDoor from './[slug]/+page.server.js';
import * as linkSearch from './[slug]/buscar/+server.js';
import * as linkPurchase from './[slug]/compra/+server.js';
import * as linkList from './[slug]/lista/+server.js';
import * as adminDoor from '../(authed)/admin/eventos/[slug]/ingreso/+page.server.js';
import * as adminSearch from '../(authed)/admin/eventos/[slug]/ingreso/buscar/+server.js';
import * as adminPurchase from '../(authed)/admin/eventos/[slug]/ingreso/compra/+server.js';
import * as adminList from '../(authed)/admin/eventos/[slug]/ingreso/lista/+server.js';
import * as eventPage from '../(authed)/admin/eventos/[slug]/+page.server.js';
import * as ordersPage from '../(authed)/admin/eventos/[slug]/ordenes/+page.server.js';
import * as ordersCsv from '../(authed)/admin/eventos/[slug]/ordenes.csv/+server.js';
import * as mailPage from '../(authed)/admin/eventos/[slug]/mail/+page.server.js';
import * as authedLayout from '../(authed)/+layout.server.js';

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
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));
const HOUR = 60 * 60 * 1000;

/** Una cookie de prueba: lo que se guardó y con qué opciones. */
function jar(/** @type {Record<string, string>} */ initial = {}) {
	const values = { ...initial };
	/** @type {{ name: string, value: string, opts: any }[]} */
	const sets = [];
	/** @type {string[]} */
	const deleted = [];
	return {
		values,
		sets,
		deleted,
		cookies: {
			get: (/** @type {string} */ n) => values[n],
			getAll: () => Object.entries(values).map(([name, value]) => ({ name, value })),
			set: (/** @type {string} */ name, /** @type {string} */ value, /** @type {any} */ opts) => {
				values[name] = value;
				sets.push({ name, value, opts });
			},
			delete: (/** @type {string} */ name) => {
				delete values[name];
				deleted.push(name);
			},
			serialize: () => ''
		}
	};
}

/**
 * Un evento de SvelteKit de prueba. Si el handler tira (redirect / error), devuelve `{ thrown }`.
 *
 * @param {(event: any) => any} handler
 * @param {{ slug?: string, path?: string, fields?: Record<string, string>, query?: string,
 *   locals?: any, cookies?: any, ip?: string }} [opts]
 */
async function call(handler, opts = {}) {
	const slug = opts.slug ?? SLUG;
	const url = new URL(`http://localhost${opts.path ?? `/puerta/${slug}`}${opts.query ?? ''}`);
	/** @type {RequestInit} */
	let init = { method: 'GET' };
	if (opts.fields) {
		const body = new FormData();
		for (const [k, v] of Object.entries(opts.fields)) body.set(k, v);
		init = { method: 'POST', body };
	}
	/** @type {any} */
	const event = {
		params: { slug },
		platform: t.platform,
		locals: opts.locals ?? {},
		request: new Request(url, init),
		url,
		fetch: noFetch,
		cookies: opts.cookies ?? jar().cookies,
		getClientAddress: () => opts.ip ?? '203.0.113.9',
		setHeaders: () => {},
		parent: async () => ({})
	};
	try {
		const r = await handler(event);
		return r instanceof Response ? { status: r.status, body: await r.json() } : r;
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status, message: /** @type {any} */ (e).body?.message };
	}
}

/** Un link vivo de `slug` (vence en 6 horas) y una cookie con su token. */
async function makeLink(slug = SLUG, label = 'voluntarie 1') {
	const r = await createDoorLink(t.db, {
		eventSlug: slug,
		label,
		createdBy: ADMINS[0].login,
		expiresAt: Date.now() + 6 * HOUR
	});
	if (!r.ok) throw new Error('no se creó el link');
	return { token: r.token, link: r.link, jar: jar({ [DOOR_LINK_COOKIE]: r.token }) };
}

/** Una entrada aprobada de `slug`, sin ingresar. */
async function ticketFor(slug = SLUG) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 8000, capacity: 20 },
			quantity: 1,
			holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
			buyer: {
				name: 'Persona Inventada',
				pronouns: 'elle',
				email: 'persona@example.com',
				dni: '30111222'
			}
		})
	);
	const { tickets } = await applyPayment(t.db, {
		id: Math.floor(Math.random() * 1e9),
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return /** @type {{ id: string, token: string, code: string, order_id: string }} */ (tickets[0]);
}

/** Todo el registro de actividad como texto (para buscar un token). */
async function auditText() {
	const { results } = await t.db.prepare('SELECT * FROM admin_audit').all();
	return JSON.stringify(results);
}

describe('el token del link', () => {
	it('es al azar, con forma fija, y en la base queda solo su hash', async () => {
		const a = newDoorToken();
		expect(isDoorTokenShape(a)).toBe(true);
		expect(a).not.toBe(newDoorToken());
		const { token, link } = await makeLink();
		const { results } = await t.db.prepare('SELECT * FROM door_links').all();
		expect(results).toHaveLength(1);
		expect(JSON.stringify(results)).not.toContain(token);
		expect(results[0].token_hash).toBe(await hashDoorToken(token));
		expect(results[0].id).toBe(link.id);
	});

	it('findDoorLink: vivo, cambiado, cortado, de otro tipo, vencido y revocado', async () => {
		const { token, link } = await makeLink();
		expect(await findDoorLink(t.db, token)).toMatchObject({ ok: true, link: { id: link.id } });
		const flipped = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
		expect(await findDoorLink(t.db, flipped)).toEqual({ ok: false, reason: 'unknown' });
		for (const bad of [
			token.slice(1),
			`${token}x`,
			`${token.slice(1)}=`,
			'',
			null,
			42,
			undefined
		]) {
			expect(await findDoorLink(t.db, bad)).toEqual({ ok: false, reason: 'malformed' });
		}
		expect(await findDoorLink(t.db, token, Date.now() + 7 * HOUR)).toEqual({
			ok: false,
			reason: 'expired'
		});
		await t.db.prepare('UPDATE door_links SET revoked_at = 1 WHERE id = ?1').bind(link.id).run();
		expect(await findDoorLink(t.db, token)).toEqual({ ok: false, reason: 'revoked' });
	});
});

describe('vencimiento', () => {
	it('por defecto: el fin del día del evento (Argentina) más 6 horas', () => {
		expect(defaultDoorLinkExpiry({ start: '2099-12-01T20:00-03:00' })).toBe(
			Date.parse('2099-12-02T05:59:59.999-03:00')
		);
		// Un evento que termina después de la medianoche: el día en que termina.
		expect(
			defaultDoorLinkExpiry({ start: '2099-12-01T23:00-03:00', end: '2099-12-02T06:00-03:00' })
		).toBe(Date.parse('2099-12-03T05:59:59.999-03:00'));
	});

	it('lo elige une admin, entre 10 minutos y 7 días desde ahora', () => {
		const now = Date.parse('2099-11-30T12:00-03:00');
		const config = { start: '2099-12-01T20:00-03:00' };
		expect(parseDoorLinkForm({ label: ' Puerta\u0000 1 ', expires: '' }, config, now)).toEqual({
			ok: true,
			label: 'Puerta 1',
			expiresAt: Date.parse('2099-12-02T05:59:59.999-03:00')
		});
		expect(parseDoorLinkForm({ expires: '2099-12-01T23:30' }, config, now)).toMatchObject({
			ok: true,
			expiresAt: Date.parse('2099-12-01T23:30:00-03:00')
		});
		for (const expires of ['2099-11-30T12:05', '2099-11-29T12:00', '2099-12-08T12:01', 'mañana']) {
			expect(parseDoorLinkForm({ expires }, config, now).ok, expires).toBe(false);
		}
		// El evento ya pasó: sin fecha elegida no se crea.
		expect(parseDoorLinkForm({}, config, Date.parse('2099-12-03T12:00-03:00')).ok).toBe(false);
	});
});

describe('entrar con el link (/puerta?/entrar)', () => {
	it('con un token vivo deja la cookie (solo /puerta, httpOnly, Strict, vence con el link)', async () => {
		const { token, link } = await makeLink();
		const j = jar();
		const r = await call(entry.actions.entrar, {
			path: '/puerta',
			fields: { token },
			cookies: j.cookies
		});
		expect(r).toEqual({ slug: SLUG });
		expect(j.sets).toHaveLength(1);
		const [set] = j.sets;
		expect(set.name).toBe(DOOR_LINK_COOKIE);
		expect(set.value).toBe(token);
		expect(set.opts).toMatchObject({ path: '/puerta', httpOnly: true, sameSite: 'strict' });
		expect(set.opts.maxAge).toBeGreaterThan(5 * 60 * 60);
		expect(set.opts.maxAge).toBeLessThanOrEqual(6 * 60 * 60);
		const row = await t.db
			.prepare('SELECT last_used_at FROM door_links WHERE id = ?1')
			.bind(link.id)
			.first();
		expect(row?.last_used_at).toBeGreaterThan(0);
	});

	it('con un token cambiado, vencido o revocado no deja cookie', async () => {
		const { token, link } = await makeLink();
		const j = jar();
		const flipped = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
		for (const bad of [flipped, token.slice(2), 'x']) {
			const r = await call(entry.actions.entrar, {
				path: '/puerta',
				fields: { token: bad },
				cookies: j.cookies
			});
			expect(r.status).toBe(403);
		}
		await t.db.prepare('UPDATE door_links SET revoked_at = 1 WHERE id = ?1').bind(link.id).run();
		expect(
			(await call(entry.actions.entrar, { path: '/puerta', fields: { token }, cookies: j.cookies }))
				.status
		).toBe(403);
		expect(j.sets).toEqual([]);
	});

	it('tiene tope de intentos por conexión', async () => {
		const { token } = await makeLink();
		for (let i = 0; i < DOOR_LINK_ENTER_LIMIT.limit; i++) {
			await call(entry.actions.entrar, {
				path: '/puerta',
				fields: { token: 'x' },
				ip: '198.51.100.7'
			});
		}
		const r = await call(entry.actions.entrar, {
			path: '/puerta',
			fields: { token },
			ip: '198.51.100.7'
		});
		expect(r.status).toBe(429);
		// Desde otra conexión, sí.
		expect(
			await call(entry.actions.entrar, { path: '/puerta', fields: { token }, ip: '198.51.100.8' })
		).toEqual({ slug: SLUG });
	});

	it('salir borra la cookie', async () => {
		const { jar: j } = await makeLink();
		await call(entry.actions.salir, { path: '/puerta', fields: {}, cookies: j.cookies });
		expect(j.values[DOOR_LINK_COOKIE]).toBeUndefined();
	});
});

describe('la puerta con link (/puerta/<slug>)', () => {
	it('abre la puerta de su evento, sin nada del panel', async () => {
		const { jar: j } = await makeLink();
		const r = await call(linkDoor.load, { cookies: j.cookies });
		expect(r).toMatchObject({
			bare: true,
			slug: SLUG,
			title: 'Fiesta de prueba',
			doorBase: `/puerta/${SLUG}`,
			doorLink: { label: 'voluntarie 1' },
			login: 'puerta: voluntarie 1',
			autoOpened: false
		});
	});

	it('403: sin cookie, de otro evento, con un token cambiado, revocado o vencido', async () => {
		const { token, link, jar: j } = await makeLink();
		expect(await call(linkDoor.load)).toMatchObject({ thrown: 403 });
		expect(await call(linkDoor.load, { slug: OTHER, cookies: j.cookies })).toMatchObject({
			thrown: 403
		});
		const flipped = jar({ [DOOR_LINK_COOKIE]: (token[0] === 'A' ? 'B' : 'A') + token.slice(1) });
		expect(await call(linkDoor.load, { cookies: flipped.cookies })).toMatchObject({ thrown: 403 });
		// La cookie que no sirve se borra.
		expect(flipped.deleted).toContain(DOOR_LINK_COOKIE);

		await t.db
			.prepare('UPDATE door_links SET expires_at = ?2 WHERE id = ?1')
			.bind(link.id, Date.now() - 1000)
			.run();
		expect(
			await call(linkDoor.load, { cookies: jar({ [DOOR_LINK_COOKIE]: token }).cookies })
		).toMatchObject({
			thrown: 403
		});

		const live = await makeLink(SLUG, 'voluntarie 2');
		await t.db
			.prepare('UPDATE door_links SET revoked_at = 1 WHERE id = ?1')
			.bind(live.link.id)
			.run();
		expect(await call(linkDoor.load, { cookies: live.jar.cookies })).toMatchObject({ thrown: 403 });
	});

	it('cada acción y cada GET vuelve a mirar el link: de otro evento o revocado, 403', async () => {
		const own = await makeLink(SLUG);
		const other = await makeLink(OTHER, 'de la otra');
		const ticket = await ticketFor(SLUG);
		const handlers = [
			[linkDoor.actions.checkin, { fields: { token: ticket.code } }],
			[linkDoor.actions.undo, { fields: { ticket: ticket.id } }],
			[linkDoor.actions.reveal, { fields: { ticket: ticket.id } }],
			[
				linkDoor.actions.sell,
				{ fields: { type: 'general', quantity: '1', method: 'efectivo', name: 'Alguien' } }
			],
			[linkDoor.actions.sync, { fields: { queue: '[]' } }],
			[linkDoor.actions.syncSales, { fields: { sales: '[]' } }],
			[linkSearch.GET, { query: '?q=persona' }],
			[linkPurchase.GET, { query: `?ticket=${ticket.id}` }],
			[linkList.GET, {}]
		];
		for (const [handler, opts] of /** @type {any[]} */ (handlers)) {
			// El link de la otra fiesta no sirve en esta.
			expect(await call(handler, { ...opts, cookies: other.jar.cookies })).toMatchObject({
				thrown: 403
			});
			// Sin cookie, tampoco.
			expect(await call(handler, opts)).toMatchObject({ thrown: 403 });
		}
		await t.db
			.prepare('UPDATE door_links SET revoked_at = 1 WHERE id = ?1')
			.bind(own.link.id)
			.run();
		for (const [handler, opts] of /** @type {any[]} */ (handlers)) {
			expect(await call(handler, { ...opts, cookies: own.jar.cookies })).toMatchObject({
				thrown: 403
			});
		}
		// Nada cambió: la entrada sigue sin ingresar y no se vendió nada.
		const row = await t.db
			.prepare('SELECT checked_in_at FROM tickets WHERE id = ?1')
			.bind(ticket.id)
			.first();
		expect(row?.checked_in_at).toBeNull();
		const orders = await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first();
		expect(orders?.n).toBe(1);
	});

	it('marca el ingreso a nombre del link y lo anota en el registro con su id (sin el token)', async () => {
		const { token, link, jar: j } = await makeLink();
		const ticket = await ticketFor();
		const r = await call(linkDoor.actions.checkin, {
			fields: { token: ticket.code },
			cookies: j.cookies
		});
		expect(r.checkin.result).toBe('ok');
		expect(r.checkin.card).toMatchObject({ holder: 'Persona Inventada', dniTail: '222' });
		// La tarjeta trae lo mismo que la del panel, sin el DNI completo.
		expect(JSON.stringify(r)).not.toContain('30111222');
		const row = await t.db
			.prepare('SELECT checked_in_by FROM tickets WHERE id = ?1')
			.bind(ticket.id)
			.first();
		expect(row?.checked_in_by).toBe('puerta: voluntarie 1');
		const entryRow = (await listAudit(t.db)).find((e) => e.action === 'checkin.door_link');
		expect(entryRow).toMatchObject({ actorLogin: `puerta:${link.id}`, actorId: null });
		expect(entryRow?.detail).toMatchObject({ doorLink: link.id, event: SLUG, ticket: ticket.id });

		const undo = await call(linkDoor.actions.undo, {
			fields: { ticket: ticket.id },
			cookies: j.cookies
		});
		expect(undo.undo.ok).toBe(true);
		const undone = (await listAudit(t.db)).find((e) => e.action === 'checkin.undo');
		expect(undone).toMatchObject({ actorLogin: `puerta:${link.id}` });
		expect(undone?.detail).toMatchObject({ doorLink: link.id });

		expect(await auditText()).not.toContain(token);
	});

	it('una entrada de otro evento: «De otro evento», sin decir cuál', async () => {
		const { jar: j } = await makeLink();
		const ticket = await ticketFor(OTHER);
		const r = await call(linkDoor.actions.checkin, {
			fields: { token: ticket.code },
			cookies: j.cookies
		});
		expect(r.checkin).toMatchObject({ result: 'wrong-event', card: null, otherEvent: null });
		// No la marca en la otra fiesta.
		const row = await t.db
			.prepare('SELECT checked_in_at FROM tickets WHERE id = ?1')
			.bind(ticket.id)
			.first();
		expect(row?.checked_in_at).toBeNull();
	});

	it('no ve el DNI completo (reveal: 403) y no queda registrado como vista del DNI', async () => {
		const { jar: j } = await makeLink();
		const ticket = await ticketFor();
		expect(
			await call(linkDoor.actions.reveal, { fields: { ticket: ticket.id }, cookies: j.cookies })
		).toMatchObject({ thrown: 403 });
		expect((await listAudit(t.db)).some((e) => e.action === 'order.reveal_dni')).toBe(false);
	});

	it('buscar, ver la compra y la lista: lo de la puerta, sin el DNI completo; ver la compra queda anotado', async () => {
		const { link, jar: j } = await makeLink();
		const ticket = await ticketFor();
		const s = await call(linkSearch.GET, { query: '?q=inventada', cookies: j.cookies });
		expect(s.status).toBe(200);
		expect(s.body.results).toHaveLength(1);
		const byDni = await call(linkSearch.GET, { query: '?q=30111222', cookies: j.cookies });
		expect(byDni.body.results).toHaveLength(1);
		// (Buscar por el DNI completo anda, pero la respuesta no lo trae: solo la consulta repetida.)
		expect(JSON.stringify(s.body.results) + JSON.stringify(byDni.body.results)).not.toContain(
			'30111222'
		);

		const p = await call(linkPurchase.GET, { query: `?ticket=${ticket.id}`, cookies: j.cookies });
		expect(p.status).toBe(200);
		expect(p.body).toMatchObject({ buyer: 'Persona Inventada', dniTail: '222' });
		expect(JSON.stringify(p.body)).not.toContain('30111222');
		const viewed = (await listAudit(t.db)).find((e) => e.action === 'order.door_view');
		expect(viewed).toMatchObject({ actorLogin: `puerta:${link.id}`, targetId: ticket.order_id });

		const l = await call(linkList.GET, { cookies: j.cookies });
		expect(l.status).toBe(200);
		expect(l.body.tickets).toHaveLength(1);
		expect(JSON.stringify(l.body)).not.toContain('30111222');
		expect(JSON.stringify(l.body)).not.toContain(ticket.token);

		// La compra de una entrada de otro evento no se ve desde esta puerta.
		const foreign = await ticketFor(OTHER);
		expect(
			await call(linkPurchase.GET, { query: `?ticket=${foreign.id}`, cookies: j.cookies })
		).toMatchObject({ thrown: 404 });
	});

	it('vende en la puerta dentro de los límites, a nombre del link y con su id en el registro', async () => {
		const { link, jar: j } = await makeLink();
		const r = await call(linkDoor.actions.sell, {
			fields: { type: 'general', quantity: '2', method: 'efectivo', name: 'Persona Inventada' },
			cookies: j.cookies
		});
		expect(r.sale).toMatchObject({ ok: true, total: 20000 });
		const order = await t.db.prepare('SELECT confirmed_by, channel FROM orders').first();
		expect(order).toMatchObject({ confirmed_by: 'puerta: voluntarie 1', channel: 'puerta' });
		const sale = (await listAudit(t.db)).find((e) => e.action === 'order.door_sale');
		expect(sale).toMatchObject({ actorLogin: `puerta:${link.id}` });
		expect(sale?.detail).toMatchObject({ doorLink: link.id });
	});

	it('no pasa límites: ni pidiendo confirmar ni mandando una clave de override', async () => {
		const { jar: j } = await makeLink();
		const fields = { type: 'general', quantity: '11', method: 'efectivo', name: 'Alguien' };
		// Une admin recibe el pedido de confirmar, con la clave.
		const asAdmin = await call(adminDoor.actions.sell, {
			path: `/admin/eventos/${SLUG}/ingreso`,
			fields,
			locals: admin
		});
		expect(asAdmin.status).toBe(409);
		const key = asAdmin.data.sale.needsConfirmation.key;
		expect(key).toBeTruthy();
		// El link no: un mensaje, sin diálogo, y la clave no le sirve.
		for (const extra of [{}, { override: key }]) {
			const r = await call(linkDoor.actions.sell, {
				fields: { ...fields, ...extra },
				cookies: j.cookies
			});
			expect(r.status).toBe(409);
			expect(r.data.sale.needsConfirmation).toBeUndefined();
			expect(r.data.sale.message).toMatch(/une admin/);
		}
		const orders = await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first();
		expect(orders?.n).toBe(0);
	});
});

describe('el resto del panel no reconoce el link', () => {
	/** Una cookie de link vivo, sin sesión de GitHub (como un celu que solo tiene el link). */
	async function linkOnly() {
		const { jar: j } = await makeLink();
		return { cookies: j.cookies, locals: {} };
	}

	it('la puerta del panel, la ficha, órdenes, exportar, reembolsar y mails: al login (303)', async () => {
		const ctx = await linkOnly();
		const ticket = await ticketFor();
		const base = `/admin/eventos/${SLUG}`;
		const cases = [
			[authedLayout.load, { path: `${base}/ingreso` }],
			[adminDoor.load, { path: `${base}/ingreso` }],
			[adminDoor.actions.checkin, { path: `${base}/ingreso`, fields: { token: ticket.code } }],
			[adminDoor.actions.reveal, { path: `${base}/ingreso`, fields: { ticket: ticket.id } }],
			[adminSearch.GET, { path: `${base}/ingreso/buscar`, query: '?q=persona' }],
			[adminPurchase.GET, { path: `${base}/ingreso/compra`, query: `?ticket=${ticket.id}` }],
			[adminList.GET, { path: `${base}/ingreso/lista` }],
			[eventPage.load, { path: base }],
			[eventPage.actions.crearLinkPuerta, { path: base, fields: { label: 'x' } }],
			[ordersPage.load, { path: `${base}/ordenes` }],
			[ordersPage.actions.refund, { path: `${base}/ordenes`, fields: { order: ticket.order_id } }],
			[ordersPage.actions.dni, { path: `${base}/ordenes`, fields: { order: ticket.order_id } }],
			[ordersCsv.GET, { path: `${base}/ordenes.csv` }],
			[mailPage.actions.send, { path: `${base}/mail`, fields: { subject: 'x', body: 'x' } }]
		];
		for (const [handler, opts] of /** @type {any[]} */ (cases)) {
			const r = await call(handler, { ...opts, ...ctx });
			expect(r?.thrown, opts.path).toBe(303);
		}
		// Nada cambió.
		const row = await t.db
			.prepare('SELECT checked_in_at FROM tickets WHERE id = ?1')
			.bind(ticket.id)
			.first();
		expect(row?.checked_in_at).toBeNull();
	});

	it('la cookie del link solo la leen doorLinks.js y las rutas de /puerta', () => {
		const roots = [path.resolve('src')];
		/** @type {string[]} */
		const hits = [];
		const walk = (/** @type {string} */ dir) => {
			for (const name of fs.readdirSync(dir)) {
				const full = path.join(dir, name);
				if (fs.statSync(full).isDirectory()) walk(full);
				else if (/\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name)) {
					const src = fs.readFileSync(full, 'utf8');
					if (src.includes('DOOR_LINK_COOKIE') || src.includes("'kv_puerta'")) {
						hits.push(path.relative(path.resolve('.'), full));
					}
				}
			}
		};
		roots.forEach(walk);
		expect(hits.sort()).toEqual([
			'src/lib/server/tickets/doorLinks.js',
			'src/routes/puerta/+page.server.js'
		]);
	});

	it('cada ruta de /puerta/<slug> pasa por requireDoorLink', () => {
		const dir = path.resolve('src/routes/puerta/[slug]');
		/** @type {string[]} */
		const files = [];
		const walk = (/** @type {string} */ d) => {
			for (const name of fs.readdirSync(d)) {
				const full = path.join(d, name);
				if (fs.statSync(full).isDirectory()) walk(full);
				else if (/^\+(page\.server|server|layout\.server|page|layout)\.js$/.test(name))
					files.push(full);
			}
		};
		walk(dir);
		expect(files.length).toBe(4);
		for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).toContain('requireDoorLink(');
	});
});

describe('solo une admin crea y revoca links', () => {
	it('crear: no admin 403, sin sesión al login; une admin recibe el link una vez y el registro no lo guarda', async () => {
		const base = `/admin/eventos/${SLUG}`;
		expect(
			await call(eventPage.actions.crearLinkPuerta, { path: base, fields: {}, locals: notAdmin })
		).toMatchObject({ thrown: 403 });
		expect(await call(eventPage.actions.crearLinkPuerta, { path: base, fields: {} })).toMatchObject(
			{ thrown: 303 }
		);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM door_links').first())?.n).toBe(0);

		// Un evento que todavía no pasó y que no está a más de 7 días (el de por defecto es 2099).
		const tooFar = await call(eventPage.actions.crearLinkPuerta, {
			path: base,
			fields: {},
			locals: admin
		});
		expect(tooFar.status).toBe(400);
		metas[SLUG].start = new Date(Date.now() + 24 * HOUR).toISOString();
		const r = await call(eventPage.actions.crearLinkPuerta, {
			path: base,
			fields: { label: 'Puerta 1' },
			locals: admin
		});
		expect(r.doorLink, JSON.stringify(r)).toMatchObject({ ok: true, label: 'Puerta 1' });
		const token = r.doorLink.url.split('#')[1];
		expect(r.doorLink.url).toBe(`http://localhost/puerta#${token}`);
		expect(isDoorTokenShape(token)).toBe(true);
		expect(await findDoorLink(t.db, token)).toMatchObject({ ok: true, link: { event_slug: SLUG } });
		const created = (await listAudit(t.db)).find((e) => e.action === 'door_link.create');
		expect(created).toMatchObject({ actorLogin: ADMINS[0].login, targetId: SLUG });
		expect(await auditText()).not.toContain(token);
	});

	it('un evento online no tiene links de puerta', async () => {
		metas[SLUG].online = true;
		metas[SLUG].stream = true;
		const r = await call(eventPage.actions.crearLinkPuerta, {
			path: `/admin/eventos/${SLUG}`,
			fields: {},
			locals: admin
		});
		expect(r.status).toBe(400);
	});

	it('revocar: solo admin y solo los de este evento; corta al toque', async () => {
		const own = await makeLink(SLUG);
		const other = await makeLink(OTHER, 'de la otra');
		const base = `/admin/eventos/${SLUG}`;
		expect(
			await call(eventPage.actions.revocarLinkPuerta, {
				path: base,
				fields: { id: own.link.id },
				locals: notAdmin
			})
		).toMatchObject({ thrown: 403 });
		// El id de un link de otro evento, desde la ficha de este: no hace nada.
		const wrong = await call(eventPage.actions.revocarLinkPuerta, {
			path: base,
			fields: { id: other.link.id },
			locals: admin
		});
		expect(wrong.status).toBe(404);
		expect((await findDoorLink(t.db, other.token)).ok).toBe(true);

		expect(await call(linkDoor.load, { cookies: own.jar.cookies })).toMatchObject({ slug: SLUG });
		const r = await call(eventPage.actions.revocarLinkPuerta, {
			path: base,
			fields: { id: own.link.id },
			locals: admin
		});
		expect(r.doorLink.ok).toBe(true);
		expect(await call(linkDoor.load, { cookies: own.jar.cookies })).toMatchObject({ thrown: 403 });
		const revoked = (await listAudit(t.db)).find((e) => e.action === 'door_link.revoke');
		expect(revoked?.detail).toMatchObject({ doorLink: own.link.id });
	});
});

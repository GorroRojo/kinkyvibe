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

// Los mails de compra: se cuentan, no se mandan.
const mails = vi.hoisted(() => ({ sent: 0 }));
vi.mock('$lib/server/tickets/index.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	sendOrderEmail: async () => {
		mails.sent++;
		return true;
	}
}));

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
	parseDoorLinkForm,
	DOOR_LINK_EMAIL_LIMIT,
	DOOR_LINK_TICKETS_LIMIT
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
	mails.sent = 0;
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
		for (const extra of /** @type {Record<string, string>[]} */ ([{}, { override: key }])) {
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

/** Una venta hecha sin conexión, como la manda el celu. */
function queued(
	/** @type {Record<string, string>} */ fields,
	id = `venta-${Math.random().toString(36).slice(2, 12)}`
) {
	return {
		id,
		at: Date.now() - 60_000,
		fields: {
			type: 'general',
			quantity: '1',
			method: 'efectivo',
			name: 'Persona Inventada',
			...fields
		}
	};
}

/** Sincroniza ventas sin conexión con un link o como admin. */
async function syncSales(/** @type {any[]} */ sales, /** @type {any} */ who) {
	const sync = who.cookies ? linkDoor.actions.syncSales : adminDoor.actions.syncSales;
	return call(sync, {
		...(who.cookies
			? { cookies: who.cookies }
			: { path: `/admin/eventos/${SLUG}/ingreso`, locals: admin }),
		fields: { sales: JSON.stringify(sales) }
	});
}

/** Llena el tope de un link hasta `hits` en esta hora. */
async function fillQuota(
	/** @type {string} */ bucket,
	/** @type {number} */ hits,
	windowSeconds = 3600
) {
	const nowSeconds = Math.floor(Date.now() / 1000);
	await t.db
		.prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, ?3)')
		.bind(bucket, nowSeconds - (nowSeconds % windowSeconds), hits)
		.run();
}

describe('límites del link de puerta del lado del servidor', () => {
	it('sin conexión: más de 10, sin venta en la puerta o cancelado vuelven rechazadas; el cupo va a revisar', async () => {
		const { link, jar: j } = await makeLink();
		const r = await syncSales([queued({ quantity: '11' })], j);
		expect(r.syncSales.results[0]).toMatchObject({ result: 'rejected' });
		expect(r.syncSales.results[0].message).toMatch(/hasta 10/);

		// Pasa el cupo (20): se guarda y queda para revisar, con el link en el registro.
		const many = Array.from({ length: 3 }, () => queued({ quantity: '8' }));
		const r2 = await syncSales(many, j);
		expect(r2.syncSales.results.map((/** @type {any} */ x) => x.result)).toEqual([
			'ok',
			'ok',
			'ok'
		]);
		expect(r2.syncSales.results[2].review.length).toBe(1);
		const reviewed = await t.db
			.prepare('SELECT offline_review FROM orders WHERE offline_review IS NOT NULL')
			.all();
		expect(reviewed.results).toHaveLength(1);
		expect(JSON.parse(String(reviewed.results[0].offline_review))).toEqual([
			expect.objectContaining({ kind: 'capacity' })
		]);
		const logged = (await listAudit(t.db)).filter((e) => e.action === 'order.door_sale');
		expect(logged).toHaveLength(3);
		for (const e of logged) {
			expect(e.summary).toMatch(/con un link de puerta/);
			expect(e.detail).toMatchObject({ doorLink: link.id, offline: true });
		}

		metas[SLUG].puerta = false;
		const off = await syncSales([queued({})], j);
		expect(off.syncSales.results[0]).toMatchObject({ result: 'rejected' });
		metas[SLUG].puerta = true;
		metas[SLUG].status = 'cancelado';
		const cancelled = await syncSales([queued({})], j);
		expect(cancelled.syncSales.results[0]).toMatchObject({ result: 'rejected' });
		const n = await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first();
		expect(n?.n).toBe(3);
	});

	it('sin conexión: $ 0 u otro precio en un tipo con precio, rechazadas; el de la puerta, sí', async () => {
		const { jar: j } = await makeLink();
		const r = await syncSales(
			[
				queued({ amount: '0' }),
				queued({ amount: '5000' }),
				queued({ amount: '10000' }),
				queued({})
			],
			j
		);
		expect(r.syncSales.results.map((/** @type {any} */ x) => x.result)).toEqual([
			'rejected',
			'rejected',
			'ok',
			'ok'
		]);
		const totals = await t.db
			.prepare('SELECT total, channel FROM orders ORDER BY created_at')
			.all();
		expect(totals.results).toEqual([
			{ total: 10000, channel: 'puerta' },
			{ total: 10000, channel: 'puerta' }
		]);
	});

	it('a la gorra: cualquier monto desde el mínimo, con y sin conexión', async () => {
		metas[SLUG].tickets = [
			{
				id: 'gorra',
				name: 'A la gorra',
				a_la_gorra: { minimo: 1000, sugerido: 2000 },
				capacity: 20
			}
		];
		const { jar: j } = await makeLink();
		const fields = { type: 'gorra', quantity: '1', method: 'efectivo', name: 'Alguien' };
		const ok = await call(linkDoor.actions.sell, {
			fields: { ...fields, amount: '1500' },
			cookies: j.cookies
		});
		expect(ok.sale).toMatchObject({ ok: true, total: 1500 });
		const low = await call(linkDoor.actions.sell, {
			fields: { ...fields, amount: '500' },
			cookies: j.cookies
		});
		expect(low.status).toBe(400);
		const r = await syncSales([queued({ ...fields, amount: '3000' })], j);
		expect(r.syncSales.results[0]).toMatchObject({ result: 'ok', total: 3000 });
	});

	it('con conexión: otro precio o $ 0 en un tipo con precio, no; une admin, sí', async () => {
		const { jar: j } = await makeLink();
		const fields = { type: 'general', quantity: '1', method: 'efectivo', name: 'Alguien' };
		for (const amount of ['0', '5000', '12000']) {
			const r = await call(linkDoor.actions.sell, {
				fields: { ...fields, amount },
				cookies: j.cookies
			});
			expect(r.status, amount).toBe(400);
			expect(r.data.sale.message).toMatch(/une admin/);
		}
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n).toBe(0);
		const same = await call(linkDoor.actions.sell, {
			fields: { ...fields, amount: '10000' },
			cookies: j.cookies
		});
		expect(same.sale).toMatchObject({ ok: true, total: 10000 });
		// La puerta del panel sigue igual: otro precio, con nota.
		const asAdmin = await call(adminDoor.actions.sell, {
			path: `/admin/eventos/${SLUG}/ingreso`,
			fields: { ...fields, amount: '5000', note: 'nota interna de prueba' },
			locals: admin
		});
		expect(asAdmin.sale).toMatchObject({ ok: true, total: 5000, note: 'nota interna de prueba' });
	});

	it('la puerta del panel sin conexión sigue igual: todo se guarda y los límites van a revisar', async () => {
		metas[SLUG].puerta = false;
		const r = await syncSales([queued({ quantity: '11' }), queued({ amount: '0' })], {});
		expect(r.syncSales.results.map((/** @type {any} */ x) => x.result)).toEqual(['ok', 'ok']);
		expect(r.syncSales.results[0].review.length).toBeGreaterThan(0);
		const logged = (await listAudit(t.db)).filter((e) => e.action === 'order.door_sale');
		expect(logged).toHaveLength(2);
		for (const e of logged) {
			expect(e.summary).not.toMatch(/link/);
			expect(e.detail).not.toHaveProperty('doorLink');
		}
	});

	it('tope de entradas vendidas por hora por link (con y sin conexión)', async () => {
		const { link, jar: j } = await makeLink();
		await fillQuota(`puerta:link-tickets:${link.id}`, DOOR_LINK_TICKETS_LIMIT.limit - 1);
		const fields = { type: 'general', quantity: '2', method: 'efectivo', name: 'Alguien' };
		const r = await call(linkDoor.actions.sell, { fields, cookies: j.cookies });
		expect(r.status).toBe(429);
		const off = await syncSales([queued({ quantity: '2' })], j);
		expect(off.syncSales.results[0]).toMatchObject({ result: 'rejected' });
		const one = await call(linkDoor.actions.sell, {
			fields: { ...fields, quantity: '1' },
			cookies: j.cookies
		});
		expect(one.sale.ok).toBe(true);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n).toBe(1);
		// Otro link tiene su propio tope.
		const other = await makeLink(SLUG, 'voluntarie 2');
		const r2 = await call(linkDoor.actions.sell, { fields, cookies: other.jar.cookies });
		expect(r2.sale.ok).toBe(true);
	});

	it('mails de compra: con tope por hora por link, y nunca al sincronizar con un link', async () => {
		const { link, jar: j } = await makeLink();
		const fields = {
			type: 'general',
			quantity: '1',
			method: 'efectivo',
			name: 'Alguien',
			email: 'alguien@example.com',
			send_email: 'on'
		};
		const first = await call(linkDoor.actions.sell, { fields, cookies: j.cookies });
		expect(first.sale.ok).toBe(true);
		expect(mails.sent).toBe(1);

		await t.db
			.prepare('DELETE FROM rate_limits WHERE bucket = ?1')
			.bind(`puerta:link-mail:${link.id}`)
			.run();
		await fillQuota(`puerta:link-mail:${link.id}`, DOOR_LINK_EMAIL_LIMIT.limit);
		const capped = await call(linkDoor.actions.sell, { fields, cookies: j.cookies });
		expect(capped.sale.ok).toBe(true);
		expect(capped.sale.message).toMatch(/No se mandó el mail/);
		expect(mails.sent).toBe(1);

		const off = await syncSales([queued(fields)], {
			cookies: (await makeLink(SLUG, 'otro')).jar.cookies
		});
		expect(off.syncSales.results[0].result).toBe('ok');
		expect(mails.sent).toBe(1);
		// Une admin al sincronizar, sí.
		await syncSales([queued(fields)], {});
		expect(mails.sent).toBe(2);
	});

	it('«Ver compra» y la venta: sin nota interna, quién confirmó, descuento ni reembolso; une admin, todo', async () => {
		const asAdmin = await call(adminDoor.actions.sell, {
			path: `/admin/eventos/${SLUG}/ingreso`,
			fields: {
				type: 'general',
				quantity: '1',
				method: 'efectivo',
				name: 'Persona Inventada',
				note: 'nota interna de prueba'
			},
			locals: admin
		});
		const ticketId = asAdmin.sale.tickets[0].ticketId;
		const { jar: j } = await makeLink();
		const p = await call(linkPurchase.GET, { query: `?ticket=${ticketId}`, cookies: j.cookies });
		expect(p.status).toBe(200);
		for (const k of ['note', 'confirmedBy', 'discountCode', 'refundedAt']) {
			expect(p.body, k).not.toHaveProperty(k);
		}
		expect(JSON.stringify(p.body)).not.toContain('nota interna de prueba');
		expect(JSON.stringify(p.body)).not.toContain(ADMINS[0].login);
		// Quién marcó el ingreso (une admin, al vender): sin su login.
		expect(p.body.tickets[0].by).toBe('une admin');

		const full = await call(adminPurchase.GET, {
			path: `/admin/eventos/${SLUG}/ingreso/compra`,
			query: `?ticket=${ticketId}`,
			locals: admin
		});
		expect(full.body).toMatchObject({
			note: 'nota interna de prueba',
			confirmedBy: ADMINS[0].login
		});
		expect(full.body.tickets[0].by).toBe(ADMINS[0].login);

		const sold = await call(linkDoor.actions.sell, {
			fields: {
				type: 'general',
				quantity: '1',
				method: 'efectivo',
				name: 'Alguien',
				note: 'otra nota'
			},
			cookies: j.cookies
		});
		expect(sold.sale.ok).toBe(true);
		expect(sold.sale).not.toHaveProperty('note');
	});

	it('el buscador no trae el token ni busca por su comienzo; marcar desde una sugerencia anda', async () => {
		const { jar: j } = await makeLink();
		const ticket = await ticketFor();
		const s = await call(linkSearch.GET, { query: '?q=inventada', cookies: j.cookies });
		expect(s.body.results).toHaveLength(1);
		expect(s.body.results[0]).not.toHaveProperty('token');
		expect(JSON.stringify(s.body)).not.toContain(ticket.token);
		const byToken = await call(linkSearch.GET, {
			query: `?q=${encodeURIComponent(ticket.token.slice(0, 12))}`,
			cookies: j.cookies
		});
		expect(byToken.body.results).toEqual([]);
		// La puerta del panel sigue igual.
		const adminS = await call(adminSearch.GET, {
			path: `/admin/eventos/${SLUG}/ingreso/buscar`,
			query: `?q=${encodeURIComponent(ticket.token.slice(0, 12))}`,
			locals: admin
		});
		expect(adminS.body.results[0]).toMatchObject({ token: ticket.token });

		// Desde la sugerencia: por el id de la entrada (de este evento).
		const r = await call(linkDoor.actions.checkin, {
			fields: { token: `ticket:${s.body.results[0].id}` },
			cookies: j.cookies
		});
		expect(r.checkin.result).toBe('ok');
		// Una entrada de otro evento por su id: no.
		const foreign = await ticketFor(OTHER);
		const r2 = await call(linkDoor.actions.checkin, {
			fields: { token: `ticket:${foreign.id}` },
			cookies: j.cookies
		});
		expect(r2.checkin.result).toBe('invalid');
	});

	it('no manda logins de GitHub de admins: buscar, lista, escanear', async () => {
		const ticket = await ticketFor();
		await call(adminDoor.actions.checkin, {
			path: `/admin/eventos/${SLUG}/ingreso`,
			fields: { token: ticket.code },
			locals: admin
		});
		const { jar: j } = await makeLink();
		const s = await call(linkSearch.GET, { query: '?q=inventada', cookies: j.cookies });
		expect(s.body.results[0].checkedInBy).toBe('une admin');
		const l = await call(linkList.GET, { cookies: j.cookies });
		expect(l.body.tickets[0].by).toBe('une admin');
		const again = await call(linkDoor.actions.checkin, {
			fields: { token: ticket.code },
			cookies: j.cookies
		});
		expect(again.checkin.result).toBe('already');
		expect(again.checkin.card.by).toBe('une admin');
		for (const body of [s.body, l.body, again]) {
			expect(JSON.stringify(body)).not.toContain(ADMINS[0].login);
		}
		// La puerta del panel sigue viendo quién fue.
		const adminL = await call(adminList.GET, {
			path: `/admin/eventos/${SLUG}/ingreso/lista`,
			locals: admin
		});
		expect(adminL.body.tickets[0].by).toBe(ADMINS[0].login);
	});

	it('ventas sin mandar de un link revocado: no se pierden; un link nuevo del evento las registra una vez', async () => {
		const old = await makeLink(SLUG, 'voluntarie viejo');
		const sale = queued({}, 'venta-que-quedo-1');
		await t.db
			.prepare('UPDATE door_links SET revoked_at = 1 WHERE id = ?1')
			.bind(old.link.id)
			.run();
		// El link revocado: 403 (el celu borra la lista pero conserva la venta).
		expect(await syncSales([sale], old.jar)).toMatchObject({ thrown: 403 });
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n).toBe(0);
		// Con un link nuevo del mismo evento en ese celu, la venta se manda; un reintento no duplica.
		const fresh = await makeLink(SLUG, 'voluntarie nuevo');
		const r = await syncSales([sale], fresh.jar);
		expect(r.syncSales.results[0]).toMatchObject({ id: sale.id, result: 'ok' });
		const again = await syncSales([sale], fresh.jar);
		expect(again.syncSales.results[0]).toMatchObject({ id: sale.id, result: 'duplicate' });
		// Une admin también la ve como ya registrada (la puede cargar desde el panel sin duplicar).
		const asAdmin = await syncSales([sale], {});
		expect(asAdmin.syncSales.results[0]).toMatchObject({ result: 'duplicate' });
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n).toBe(1);
	});
});

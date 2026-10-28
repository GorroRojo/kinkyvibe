/**
 * Avisos de puerta en la página de una entrada (decisión 0053): cuando une admin escanea el QR con
 * la cámara del celu, en un evento de Kinky Vibe, el bloque de admin muestra solo «Avisá a la
 * organización antes de dejar pasar» (también en la respuesta de «Marcar ingreso»). Quien compró
 * y cualquiera con el link reciben la página de siempre: sin el campo, sin el texto y sin la
 * consulta de los avisos. D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { edgeCacheKey } from '$lib/server/edgeCache.js';
import { sellAtDoor } from '$lib/server/tickets/door.js';
import { addDoorNotice } from '$lib/server/tickets/doorNotices.js';
import { DOOR_NOTICE_TEXT } from '$lib/utils/doorNotices.js';
import { load as layoutLoad } from '../../+layout.server.js';
import { actions, load } from './+page.server.js';
import Page from './+page.svelte';

/** Si el evento es de Kinky Vibe (la etiqueta KinkyVibe: `fondoEnabled`). */
let kinkyVibe = true;
vi.mock('$lib/server/tickets/events.js', () => ({
	getEventTickets: async (/** @type {string} */ slug) => ({
		slug,
		title: 'Fiesta de prueba',
		start: '2026-10-03T23:00:00-03:00',
		online: false,
		types: [{ id: 'general', name: 'General' }],
		fondoEnabled: kinkyVibe
	})
}));

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
	kinkyVibe = true;
});

const MAIL = 'persona.avisada@example.com';
const ADMIN = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };
const BUYER = { login: 'quien-compro-inventade', name: null, avatar_url: '' };
const adminLocals = { user: /** @type {any} */ (ADMIN), user_token: 'x' };
const buyerLocals = { user: /** @type {any} */ (BUYER), user_token: 'x' };

/** Una entrada vendida con ese mail. */
async function ticketFor(email = MAIL) {
	const r = await sellAtDoor(t.db, {
		eventSlug: 'fiesta-de-prueba',
		type: { id: 'general', name: 'General', price: 8000, fondo: 0, capacity: 50, gorra: null },
		quantity: 1,
		holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
		buyer: { name: 'Persona Inventada', email, dni: '30123456' },
		method: 'efectivo',
		by: 'admin-de-prueba'
	});
	if (!r.ok) throw new Error('no se vendió');
	return r.tickets[0];
}

async function flag() {
	const added = await addDoorNotice(
		t.db,
		/** @type {any} */ ({ user: { login: 'admin-de-prueba' } }),
		{ email: MAIL, expiry: '6m', reason: 'Motivo inventado' }
	);
	if (!added.ok) throw new Error('no se cargó');
}

/**
 * El evento de SvelteKit, con una base que anota cada consulta.
 * @param {string} token @param {Partial<App.Locals>} locals
 */
function event(token, locals) {
	/** @type {string[]} */
	const queries = [];
	const db = new Proxy(t.db, {
		get(target, prop) {
			if (prop === 'prepare') {
				return (/** @type {string} */ sql) => {
					queries.push(sql);
					return target.prepare(sql);
				};
			}
			const value = Reflect.get(target, prop);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
	const ev = /** @type {any} */ ({
		params: { token },
		platform: { ...t.platform, env: { ...t.platform.env, DB: db } },
		locals,
		url: new URL(`https://kinkyvibe.ar/entradas/t/${token}`),
		request: new Request(`https://kinkyvibe.ar/entradas/t/${token}?/checkin`, { method: 'POST' })
	});
	return { ev, queries };
}

const touchesNotices = (/** @type {string[]} */ queries) =>
	queries.some((q) => q.includes('door_notices'));

describe('página de la entrada: avisos de puerta', () => {
	it('admin en un evento de Kinky Vibe: ve el aviso en su bloque y en «Marcar ingreso»', async () => {
		await flag();
		const ticket = await ticketFor();
		const { ev, queries } = event(ticket.token, adminLocals);
		const data = /** @type {any} */ (await load(ev));
		expect(data.adminNotice).toBe(DOOR_NOTICE_TEXT);
		// (La base anotada sí ve la consulta de los avisos: el chequeo de abajo sirve.)
		expect(touchesNotices(queries)).toBe(true);
		const html = render(Page, { props: { data, form: null } }).body;
		expect(html).toContain(DOOR_NOTICE_TEXT);
		// Solo el texto genérico: nada del motivo.
		expect(html).not.toContain('Motivo inventado');
		expect(JSON.stringify(data)).not.toContain('Motivo inventado');

		const r = /** @type {any} */ (await actions.checkin(event(ticket.token, adminLocals).ev));
		// Vendida en la puerta: ya figura adentro («Ya ingresó»), y el aviso se ve igual.
		expect(r.checkin).toMatchObject({ result: 'already', notice: DOOR_NOTICE_TEXT });
		const after = render(Page, { props: { data: { ...data, adminNotice: null }, form: r } }).body;
		expect(after).toContain(DOOR_NOTICE_TEXT);
	});

	it('admin, entrada sin aviso: nada', async () => {
		await flag();
		const ticket = await ticketFor('otra.persona@example.com');
		const data = /** @type {any} */ (await load(event(ticket.token, adminLocals).ev));
		expect(data.adminNotice).toBeNull();
		expect(render(Page, { props: { data, form: null } }).body).not.toContain(DOOR_NOTICE_TEXT);
		const r = /** @type {any} */ (await actions.checkin(event(ticket.token, adminLocals).ev));
		expect(r.checkin.notice).toBeNull();
	});

	it('admin en un evento que no es de Kinky Vibe: nada, y ni consulta los avisos', async () => {
		await flag();
		kinkyVibe = false;
		const ticket = await ticketFor();
		const { ev, queries } = event(ticket.token, adminLocals);
		const data = /** @type {any} */ (await load(ev));
		expect(data.adminNotice).toBeNull();
		expect(touchesNotices(queries)).toBe(false);
		const r = /** @type {any} */ (await actions.checkin(event(ticket.token, adminLocals).ev));
		expect(r.checkin.notice).toBeNull();
	});

	it('quien compró y cualquiera con el link: la respuesta de siempre, sin consulta de avisos', async () => {
		await flag();
		const ticket = await ticketFor();
		/** @type {unknown[]} */
		const responses = [];
		for (const locals of [{}, buyerLocals]) {
			const { ev, queries } = event(ticket.token, locals);
			const data = /** @type {any} */ (await load(ev));
			expect(data.isAdmin).toBe(false);
			expect('adminNotice' in data).toBe(false);
			expect(touchesNotices(queries)).toBe(false);
			const text = JSON.stringify(data);
			expect(text).not.toContain(DOOR_NOTICE_TEXT);
			expect(text.toLowerCase()).not.toContain('notice');
			expect(text).not.toContain('Motivo inventado');
			const html = render(Page, { props: { data, form: null } }).body;
			expect(html).not.toContain(DOOR_NOTICE_TEXT);
			expect(html).not.toContain('Avisá a la organización');
			responses.push(data);
		}
		// Sin sesión y con la sesión de quien compró, la misma respuesta. Y con un aviso o sin él,
		// también la misma: no se nota si la persona tiene aviso.
		expect(responses[0]).toEqual(responses[1]);
		await t.db.prepare('DELETE FROM door_notices').run();
		expect(await load(event(ticket.token, {}).ev)).toEqual(responses[0]);
	});

	it('la página no queda en cachés compartidas (tampoco la de une admin)', () => {
		/** @type {Record<string, string>} */
		const headers = {};
		layoutLoad(
			/** @type {any} */ ({ setHeaders: (/** @type {any} */ h) => Object.assign(headers, h) })
		);
		expect(headers['cache-control']).toBe('private, no-store');
		const accept = 'text/html';
		for (const cookie of [undefined, 'kv_session=algo-inventado']) {
			const req = new Request('https://kinkyvibe.ar/entradas/t/token-inventado', {
				headers: cookie ? { accept, cookie } : { accept }
			});
			expect(edgeCacheKey(req, { version: '1700000000000' })).toBeNull();
		}
	});
});

/**
 * Lista de espera de punta a punta por las rutas: `?/waitlist` en la página de compra, el mail
 * (por `deliver()`, con un Resend de mentira), confirmar, salir y volver a anotarse con los links
 * (GET solo muestra el botón, POST hace el cambio), el interruptor apagado y el filtro de
 * EMAIL_ALLOWLIST de los previews. D1 de miniflare; eventos y mails inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { fakeRequestEvent, insertOrder, linkIn, thrown } from '$lib/server/series/fixtures.js';
import { clearFlagCache } from '$lib/server/flags.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
	clearFlagCache();
});
afterEach(() => {
	for (const m of [
		'$env/dynamic/private',
		'$lib/server/deploy.js',
		'$lib/server/tickets/events.js',
		'$lib/server/contenido/posts.js',
		'$lib/server/tickets/checkout.js'
	])
		vi.doUnmock(m);
	vi.resetModules();
	vi.restoreAllMocks();
});

const SLUG = 'fiesta-de-prueba';
const EMAIL = 'persona@example.com';
const META = {
	title: 'Fiesta de prueba',
	start: '2099-12-01T22:00:00-03:00',
	status: 'abierto',
	payment_methods: ['mercadopago'],
	tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 2 }],
	lista_espera: 'evento'
};

/** Resend de mentira: guarda cada mail. */
function resend() {
	/** @type {any[]} */
	const sent = [];
	/** @type {typeof fetch} */
	const fetchFn = async (input, init) => {
		const url = new URL(String(input));
		if (url.host !== 'api.resend.com') throw new Error(`fetch inesperado a ${url.host}`);
		sent.push(JSON.parse(String(init?.body)));
		return new Response(JSON.stringify({ id: 'resend-id' }), { status: 200 });
	};
	return { fetchFn, sent };
}

/**
 * Las rutas con el interruptor como se pida y un evento inventado.
 * @param {{ flag?: string, env?: Record<string, string>, preview?: boolean,
 *   meta?: Record<string, unknown> }} [o]
 */
async function modules({ flag = '1', env = {}, preview = false, meta = META } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { LISTA_ESPERA_ENABLED: flag, RESEND_API_KEY: 're_inventada', ...env }
	}));
	if (preview) {
		vi.doMock('$lib/server/deploy.js', async (orig) => ({
			.../** @type {object} */ (await orig()),
			isPreviewDeploy: () => true
		}));
	}
	vi.doMock('$lib/server/tickets/events.js', async (orig) => {
		const actual = /** @type {any} */ (await orig());
		const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
		return {
			...actual,
			isValidEventSlug: () => true,
			getEventTickets: async (/** @type {string} */ slug) =>
				slug === SLUG ? parseTicketConfig(meta) : null,
			getEventInfo: async (/** @type {string} */ slug) =>
				slug === SLUG ? { title: META.title, start: META.start, tags: [] } : null
		};
	});
	vi.doMock('$lib/server/contenido/posts.js', async (orig) => ({
		.../** @type {object} */ (await orig()),
		siteEvent: async () => ({ meta: { ...META, postID: SLUG }, path: `/calendario/${SLUG}` })
	}));
	vi.doMock('$lib/server/tickets/checkout.js', async (orig) => ({
		.../** @type {object} */ (await orig()),
		getTicketsView: async () => ({ open: false, reason: 'soldout', types: [] })
	}));
	return {
		entradas: await import('../calendario/[event]/entradas/+page.server.js'),
		confirmar: await import('./confirmar/[token]/+page.server.js'),
		salir: await import('./salir/[token]/+page.server.js'),
		volver: await import('./volver/[token]/+page.server.js'),
		mail: await import('$lib/server/tickets/waitlistMail.js')
	};
}

/**
 * @param {Parameters<typeof fakeRequestEvent>[0] extends infer O ? Omit<O, 'platform'> : never} o
 * @param {typeof fetch} [fetchFn]
 */
const ev = (o, fetchFn) => {
	const e = fakeRequestEvent({ platform: t.platform, ...o });
	if (fetchFn) e.fetch = fetchFn;
	return e;
};

/**
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {Record<string, string>} form
 * @param {typeof fetch} fetchFn
 * @param {any} [member]
 */
const join = (m, form, fetchFn, member) =>
	m.entradas.actions.waitlist(
		ev({ path: `/calendario/${SLUG}/entradas`, params: { event: SLUG }, form, member }, fetchFn)
	);

async function soldOut() {
	for (let i = 0; i < 2; i++)
		await insertOrder(t.db, { email: `compra${i}@example.com`, slug: SLUG, now: Date.now() });
}

async function rows() {
	const { results } = await t.db
		.prepare('SELECT id, status, end_reason FROM waitlist_entries ORDER BY created_at, id')
		.all();
	return results;
}

describe('interruptor apagado', () => {
	it('?/waitlist, confirmar y volver dan 404; la página no muestra el formulario; salir anda igual', async () => {
		const m = await modules({ flag: '0' });
		await soldOut();
		const r = resend();
		expect(await thrown(() => join(m, { email: EMAIL }, r.fetchFn))).toMatchObject({ status: 404 });
		expect(await thrown(() => m.confirmar.load(ev({ params: { token: 'x' } })))).toMatchObject({
			status: 404
		});
		expect(
			await thrown(() => m.confirmar.actions.default(ev({ params: { token: 'x' }, form: {} })))
		).toMatchObject({ status: 404 });
		expect(await thrown(() => m.volver.load(ev({ params: { token: 'x' } })))).toMatchObject({
			status: 404
		});
		expect(await m.salir.load(ev({ params: { token: 'x' } }))).toEqual({
			valid: false,
			event: null,
			live: false
		});
		const page = /** @type {any} */ (
			await m.entradas.load(ev({ path: `/calendario/${SLUG}/entradas`, params: { event: SLUG } }))
		);
		expect(page.waitlist).toBeNull();
		expect(r.sent).toHaveLength(0);
		expect(await rows()).toEqual([]);
	});
});

describe('prendido', () => {
	it('la página agotada muestra el formulario (con el mail de la cuenta, si hay sesión)', async () => {
		const m = await modules();
		await soldOut();
		const path = `/calendario/${SLUG}/entradas`;
		const anon = /** @type {any} */ (await m.entradas.load(ev({ path, params: { event: SLUG } })));
		expect(anon.waitlist).toEqual({ scope: 'event', types: [], email: '' });
		const member = { id: 'cuenta-de-prueba', email: EMAIL };
		const mine = /** @type {any} */ (
			await m.entradas.load(ev({ path, params: { event: SLUG }, member }))
		);
		expect(mine.waitlist.email).toBe(EMAIL);
	});

	it('anotarse → mail → confirmar (solo con el botón) → salir con el link del mail', async () => {
		const m = await modules();
		await soldOut();
		const r = resend();
		expect(await join(m, { email: EMAIL }, r.fetchFn)).toEqual({
			waitlist: { ok: true, status: 'pending', tipo: '' }
		});
		expect(r.sent).toHaveLength(1);
		expect(r.sent[0].to).toEqual([EMAIL]);
		expect(r.sent[0].subject).toBe('Confirmá tu lugar en la lista de espera · Fiesta de prueba');
		const text = String(r.sent[0].text);
		const token = String(linkIn(text, '/lista-de-espera/confirmar/')).split('/').pop() ?? '';
		const leave = String(linkIn(text, '/lista-de-espera/salir/')).split('/').pop() ?? '';

		// GET solo muestra el botón: los antivirus del correo abren los links solos.
		expect(await m.confirmar.load(ev({ params: { token } }))).toEqual({});
		expect((await rows()).map((x) => x.status)).toEqual(['pending_confirmation']);
		expect(await m.confirmar.actions.default(ev({ params: { token }, form: {} }))).toEqual({
			ok: true,
			event: { name: 'Fiesta de prueba', path: `/calendario/${SLUG}` }
		});
		expect((await rows()).map((x) => x.status)).toEqual(['waiting']);
		const again = /** @type {any} */ (
			await m.confirmar.actions.default(ev({ params: { token }, form: {} }))
		);
		expect(again.status).toBe(400);
		expect(again.data.error).toMatch(/venció o ya se usó/);

		// Salir: GET muestra el botón y el evento; POST saca de la fila.
		expect(await m.salir.load(ev({ params: { token: leave } }))).toEqual({
			valid: true,
			event: { name: 'Fiesta de prueba', path: `/calendario/${SLUG}` },
			live: true
		});
		expect((await rows()).map((x) => x.status)).toEqual(['waiting']);
		expect(await m.salir.actions.default(ev({ params: { token: leave }, form: {} }))).toMatchObject(
			{
				ok: true,
				left: true
			}
		);
		expect(await rows()).toEqual([
			expect.objectContaining({ status: 'cancelled', end_reason: 'left' })
		]);
		expect(await m.salir.load(ev({ params: { token: leave } }))).toMatchObject({ live: false });
		// Una firma inventada no saca a nadie.
		const forged = /** @type {any} */ (
			await m.salir.actions.default(
				ev({ params: { token: `${leave.split('.')[0]}.${'z'.repeat(32)}` }, form: {} })
			)
		);
		expect(forged.status).toBe(400);
	});

	it('la misma respuesta si el mail ya está en la fila (y no se le manda otro mail)', async () => {
		const m = await modules();
		await soldOut();
		const r = resend();
		const first = await join(m, { email: EMAIL }, r.fetchFn);
		const token = String(linkIn(String(r.sent[0].text), '/lista-de-espera/confirmar/'))
			.split('/')
			.pop();
		await m.confirmar.actions.default(ev({ params: { token: token ?? '' }, form: {} }));
		expect(await join(m, { email: EMAIL }, r.fetchFn)).toEqual(first);
		expect(r.sent).toHaveLength(1);
	});

	it('con cuenta y su mail: directo a la fila, sin mail', async () => {
		const m = await modules();
		await soldOut();
		const account = await upsertVerifiedAccount(t.db, EMAIL);
		const r = resend();
		expect(await join(m, { email: EMAIL }, r.fetchFn, { id: account.id, email: EMAIL })).toEqual({
			waitlist: { ok: true, status: 'waiting', tipo: '' }
		});
		expect(r.sent).toHaveLength(0);
		expect((await rows()).map((x) => x.status)).toEqual(['waiting']);
	});

	it('con entradas todavía: no anota y lo dice', async () => {
		const m = await modules();
		const r = resend();
		const res = /** @type {any} */ (await join(m, { email: EMAIL }, r.fetchFn));
		expect(res.status).toBe(409);
		expect(res.data.waitlist).toEqual({
			error: 'Todavía quedan entradas: podés comprarlas ahora.',
			email: EMAIL,
			tipo: ''
		});
		expect(await rows()).toEqual([]);
	});

	it('volver a anotarse con el link del mail de «se venció tu lugar»', async () => {
		const m = await modules();
		await soldOut();
		const id = '00000000-0000-4000-8000-0000000000aa';
		const now = Date.now();
		await t.db
			.prepare(
				`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at, offer_count,
					offered_at, hold_until, ended_at, end_reason, created_at, updated_at)
				VALUES (?1, ?2, ?3, 'expired', ?4, 1, ?4, ?4, ?4, 'hold_expired', ?4, ?4)`
			)
			.bind(id, SLUG, EMAIL, now - 1000)
			.run();
		const url = await m.mail.waitlistRejoinUrl(t.db, 'https://kinkyvibe.ar', id);
		const token = url.split('/').pop() ?? '';
		expect(await m.volver.load(ev({ params: { token } }))).toEqual({
			valid: true,
			event: { name: 'Fiesta de prueba', path: `/calendario/${SLUG}` }
		});
		expect((await rows()).length).toBe(1);
		expect(await m.volver.actions.default(ev({ params: { token }, form: {} }))).toMatchObject({
			ok: true,
			status: 'waiting'
		});
		expect((await rows()).map((x) => x.status)).toEqual(['expired', 'waiting']);
		const bad = /** @type {any} */ (
			await m.volver.actions.default(ev({ params: { token: `${id}.${'q'.repeat(32)}` }, form: {} }))
		);
		expect(bad.status).toBe(400);
		expect(await m.volver.load(ev({ params: { token: `${id}.${'q'.repeat(32)}` } }))).toEqual({
			valid: false,
			event: null
		});
	});

	it('en un preview, el mail pasa por el filtro de EMAIL_ALLOWLIST (y sin lista no sale)', async () => {
		const m = await modules({ preview: true, env: { EMAIL_ALLOWLIST: 'equipo@example.org' } });
		await soldOut();
		const r = resend();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await join(m, { email: EMAIL }, r.fetchFn)).toMatchObject({ waitlist: { ok: true } });
		expect(r.sent).toHaveLength(1);
		expect(r.sent[0].to).toEqual(['equipo@example.org']);
		expect(r.sent[0].subject).toBe(
			`[DEMO] para ${EMAIL} · Confirmá tu lugar en la lista de espera · Fiesta de prueba`
		);

		await resetDB(t.db);
		const closed = await modules({ preview: true });
		await soldOut();
		const r2 = resend();
		expect(await join(closed, { email: EMAIL }, r2.fetchFn)).toMatchObject({
			waitlist: { ok: true, status: 'pending' }
		});
		expect(r2.sent).toHaveLength(0);
	});
});

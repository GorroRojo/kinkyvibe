/**
 * Pestaña «Lista de espera» de la ficha del evento, su CSV y Ajustes → Lista de espera: solo
 * admins (cada load, cada acción y el CSV), las acciones (terminar la reserva y pasar a la
 * siguiente, sacar, ofrecer ahora, cerrar, volver a probar los mails), el registro de actividad
 * sin mails y el CSV a salvo de fórmulas. D1 de miniflare; personas inventadas (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: true }));
const meta = vi.hoisted(() => /** @type {Record<string, any>} */ ({}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listaEsperaEnabled: async () => flag.on,
	isFlagOn: async (/** @type {any} */ _db, /** @type {string} */ key) =>
		key === 'lista_espera' ? flag.on : false
}));
vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === 'fiesta-de-prueba' ? parseTicketConfig(meta, opts) : null
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { advanceWaitlist } from '$lib/server/tickets/waitlistEngine.js';
import * as tab from './+page.server.js';
import * as csv from '../lista-espera.csv/+server.js';
import * as ajustes from '../../../ajustes/lista-espera/+page.server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

const SLUG = 'fiesta-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));

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
	flag.on = true;
	for (const k of Object.keys(meta)) delete meta[k];
	Object.assign(meta, {
		title: 'Fiesta de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Lugar de prueba',
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 1 }]
	});
});

/**
 * Un evento de SvelteKit para un load, una acción o el CSV.
 * @param {Record<string, string>} fields
 * @param {any} locals
 * @param {string} path
 */
function requestEvent(fields, locals, path) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return /** @type {any} */ ({
		params: { slug: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost${path}`),
		fetch: noFetch,
		setHeaders: () => {}
	});
}

/**
 * Corre `fn` y devuelve lo que devuelve, o `{ thrown: status }` si tira (redirect / error).
 * @param {() => any} fn
 */
async function run(fn) {
	try {
		return /** @type {any} */ (await fn());
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const TAB = `/admin/eventos/${SLUG}/lista-espera`;
/** @param {keyof typeof tab.actions} name @param {Record<string, string>} [fields] @param {any} [locals] */
const act = (name, fields = {}, locals = admin) =>
	run(() => tab.actions[name](requestEvent(fields, locals, TAB)));

let n = 0;
/**
 * Una anotación confirmada (o sin confirmar) en la fila, sin pasar por el mail.
 * @param {{ status?: string, email?: string, slug?: string, at?: number }} [o]
 */
async function entry({ status = 'waiting', email, slug = SLUG, at } = {}) {
	n++;
	const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
	const when = at ?? Date.now() - 60_000 * (100 - n);
	const pending = status === 'pending_confirmation';
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (id, event_slug, email, status, confirm_hash,
				confirm_expires_at, confirmed_at, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
		)
		.bind(
			id,
			slug,
			email ?? `persona${n}@example.com`,
			status,
			pending ? 'a'.repeat(64 - String(n).length) + n : null,
			pending ? Date.now() + 86_400_000 : null,
			pending ? null : when,
			when
		)
		.run();
	return id;
}

/** @param {string} id */
const statusOf = async (id) =>
	(await t.db
		.prepare('SELECT status, end_reason FROM waitlist_entries WHERE id = ?1')
		.bind(id)
		.first()) ?? null;

describe('solo admins', () => {
	const cases = /** @type {const} */ (['terminar', 'sacar', 'ofrecer', 'cerrar', 'reintentar']);

	it('el load de la pestaña, el CSV y Ajustes: sin sesión al login, sin permiso 403', async () => {
		for (const [locals, status] of /** @type {const} */ ([
			[{}, 303],
			[notAdmin, 403]
		])) {
			expect(await run(() => tab.load(requestEvent({}, locals, TAB)))).toEqual({ thrown: status });
			expect(await run(() => csv.GET(requestEvent({}, locals, `${TAB}.csv`)))).toEqual({
				thrown: status
			});
			expect(
				await run(() => ajustes.load(requestEvent({}, locals, '/admin/ajustes/lista-espera')))
			).toEqual({ thrown: status });
			expect(
				await run(() =>
					ajustes.actions.save(requestEvent({}, locals, '/admin/ajustes/lista-espera'))
				)
			).toEqual({ thrown: status });
		}
	});

	it.each(cases)('la acción %s no cambia nada sin permiso', async (name) => {
		const id = await entry();
		expect(await act(name, { id }, notAdmin)).toEqual({ thrown: 403 });
		expect(await act(name, { id }, {})).toEqual({ thrown: 303 });
		expect(await statusOf(id)).toMatchObject({ status: 'waiting' });
		expect(await listAudit(t.db)).toEqual([]);
	});
});

describe('la pestaña', () => {
	it('muestra las cuentas y la fila en orden (con su lugar)', async () => {
		const a = await entry();
		const b = await entry();
		await entry({ status: 'pending_confirmation' });
		const data = /** @type {any} */ (await tab.load(requestEvent({}, admin, TAB)));
		expect(data.enabled).toBe(true);
		expect(data.list).toEqual({ scope: 'event', allAtOnce: false });
		expect(data.scopes).toHaveLength(1);
		expect(data.scopes[0]).toMatchObject({ key: '', counts: { waiting: 2, pending: 1 } });
		const waiting = data.entries.filter((/** @type {any} */ e) => e.status === 'waiting');
		expect(waiting.map((/** @type {any} */ e) => [e.id, e.position])).toEqual([
			[a, 1],
			[b, 2]
		]);
	});

	it('un evento sin venta de entradas da 404', async () => {
		meta.tickets = undefined;
		expect(await run(() => tab.load(requestEvent({}, admin, TAB)))).toEqual({ thrown: 404 });
	});
});

describe('las acciones', () => {
	it('«Terminar la reserva y pasar a la siguiente»: termina la oferta y le ofrece a la próxima', async () => {
		const first = await entry({ email: 'primera@example.com' });
		const second = await entry({ email: 'segunda@example.com' });
		// El cupo es 1 y no se vendió nada: hay lugar, se le ofrece a la primera.
		expect((await advanceWaitlist(t.db, { eventSlug: SLUG })).offered).toBe(1);
		expect(await statusOf(first)).toMatchObject({ status: 'offered' });

		const r = await act('terminar', { id: first });
		expect(r.action).toMatchObject({ ok: true });
		expect(r.action.message).toContain('Le ofrecimos el lugar a la próxima persona');
		expect(await statusOf(first)).toEqual({ status: 'expired', end_reason: 'admin' });
		expect(await statusOf(second)).toMatchObject({ status: 'offered' });

		// Ya no tiene oferta: otra vez da 409.
		expect(await act('terminar', { id: first })).toMatchObject({ status: 409 });
	});

	it('«Sacar de la lista»: cancelled (o borrada si no confirmó)', async () => {
		const w = await entry();
		const p = await entry({ status: 'pending_confirmation' });
		expect((await act('sacar', { id: w })).action.ok).toBe(true);
		expect(await statusOf(w)).toEqual({ status: 'cancelled', end_reason: 'admin' });
		expect((await act('sacar', { id: p })).action.ok).toBe(true);
		expect(await statusOf(p)).toBe(null);
	});

	it('no toca la anotación de otro evento', async () => {
		const other = await entry({ slug: 'otro-evento' });
		const r = await act('sacar', { id: other });
		expect(r).toMatchObject({ status: 404 });
		expect(await statusOf(other)).toMatchObject({ status: 'waiting' });
	});

	it('«Ofrecer ahora»: avanza ya; con el interruptor apagado, no', async () => {
		const id = await entry();
		flag.on = false;
		expect(await act('ofrecer')).toMatchObject({ status: 409 });
		expect(await statusOf(id)).toMatchObject({ status: 'waiting' });
		flag.on = true;
		expect((await act('ofrecer')).action).toMatchObject({
			ok: true,
			message: 'Le ofrecimos el lugar a la próxima persona.'
		});
		expect(await statusOf(id)).toMatchObject({ status: 'offered' });
	});

	it('«Cerrar la lista»: quien espera termina (closed), sin confirmar se borra, quien compró no cambia', async () => {
		const w = await entry();
		const p = await entry({ status: 'pending_confirmation' });
		const r = await act('cerrar');
		expect(r.action.ok).toBe(true);
		expect(await statusOf(w)).toEqual({ status: 'expired', end_reason: 'closed' });
		expect(await statusOf(p)).toBe(null);
	});

	it('«Volver a probar»: borra las marcas de los mails que no salieron de este evento', async () => {
		const id = await entry();
		const other = await entry({ slug: 'otro-evento' });
		for (const e of [id, other]) {
			await t.db
				.prepare(
					`INSERT INTO waitlist_sends (entry_id, kind, round, status, attempts, sent_at)
					VALUES (?1, 'closed', 0, 'failed', 3, ?2)`
				)
				.bind(e, Date.now())
				.run();
		}
		expect((await act('reintentar')).action.ok).toBe(true);
		const left = await t.db.prepare('SELECT entry_id FROM waitlist_sends').all();
		expect(left.results.map((r) => r.entry_id)).toEqual([other]);
	});

	it('el registro de actividad nunca lleva mails', async () => {
		const a = await entry({ email: 'secreta-uno@example.com' });
		const b = await entry({ email: 'secreta-dos@example.com' });
		await advanceWaitlist(t.db, { eventSlug: SLUG });
		await act('terminar', { id: a });
		await act('sacar', { id: b });
		await act('ofrecer');
		await act('cerrar');
		await act('reintentar');
		const log = await listAudit(t.db);
		expect(log.map((e) => e.action).sort()).toEqual([
			'waitlist.advance',
			'waitlist.close',
			'waitlist.end',
			'waitlist.remove',
			'waitlist.retry_mails'
		]);
		expect(JSON.stringify(log)).not.toMatch(/@|secreta/);
	});
});

describe('CSV', () => {
	it('una fila por anotación, con las celdas a salvo de fórmulas y comas', async () => {
		await entry({ email: '=hyperlink("x")@example.com' });
		await entry({ email: 'con,coma@example.com' });
		const res = await csv.GET(requestEvent({}, admin, `${TAB}.csv`));
		expect(res.headers.get('content-type')).toContain('text/csv');
		const text = (await res.text()).replace(/^\uFEFF/, '');
		const lines = text.split('\r\n');
		expect(lines[0]).toBe(
			'alcance,email,estado,lugar_en_la_fila,anotade,confirmo,ofertas,ultima_oferta,lugar_guardado_hasta,orden,estado_orden,termino,motivo,por,mails_que_no_salieron'
		);
		expect(lines[1]).toMatch(/^evento,"'=hyperlink\(""x""\)@example\.com",Esperando,1,/);
		expect(lines[2]).toMatch(/^evento,"con,coma@example\.com",Esperando,2,/);
	});
});

describe('Ajustes → Lista de espera', () => {
	const PATH = '/admin/ajustes/lista-espera';
	/** @param {Record<string, string>} fields */
	const save = (fields) => run(() => ajustes.actions.save(requestEvent(fields, admin, PATH)));
	const base = {
		mode: 'one',
		broadcast_under: '6',
		end_before: '30',
		tier_over_0: '168',
		tier_hold_0: '24',
		tier_over_1: '48',
		tier_hold_1: '12',
		tier_over_2: '6',
		tier_hold_2: '2',
		tier_over_3: '',
		tier_hold_3: ''
	};

	it('guarda los ajustes; iguales a los de por defecto, vacío', async () => {
		expect(await save({ ...base, mode: 'all', tier_hold_0: '36' })).toMatchObject({ ok: true });
		const stored = JSON.parse((await getSalesSettings(t.db)).waitlist);
		expect(stored).toEqual({
			mode: 'all',
			tiers: [
				{ overHours: 168, holdHours: 36 },
				{ overHours: 48, holdHours: 12 },
				{ overHours: 6, holdHours: 2 }
			],
			broadcastUnderHours: 6,
			endBeforeStartMinutes: 30
		});
		const data = /** @type {any} */ (await ajustes.load(requestEvent({}, admin, PATH)));
		expect(data.current.mode).toBe('all');
		expect(data.isDefault).toBe(false);

		expect(await save(base)).toMatchObject({ ok: true });
		expect((await getSalesSettings(t.db)).waitlist).toBe('');
		expect(await save({ ...base, mode: 'all', defaults: '1' })).toMatchObject({ ok: true });
		expect((await getSalesSettings(t.db)).waitlist).toBe('');
		expect((await listAudit(t.db)).map((e) => e.action)).toEqual([
			'settings.save',
			'settings.save',
			'settings.save'
		]);
	});

	it('no guarda tramos que no se entienden', async () => {
		const r = await save({ ...base, tier_hold_1: '0' });
		expect(r).toMatchObject({ status: 400 });
		expect(r.data.error).toContain('Revisá los tiempos de reserva');
		expect(await save({ ...base, tier_over_1: '168' })).toMatchObject({ status: 400 });
		expect(await save({ ...base, end_before: 'muchos' })).toMatchObject({ status: 400 });
		expect((await getSalesSettings(t.db)).waitlist).toBe('');
	});
});

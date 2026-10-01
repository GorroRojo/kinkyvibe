/**
 * Preguntas de inscripción, edición y alcance (migración 0026), por las rutas del panel y la
 * compra pública:
 * - editar una pregunta (solo admins; queda en Actividad); las respuestas ya guardadas quedan
 *   como se respondieron;
 * - una pregunta acotada a un tipo de entrada solo se pide al comprar ese tipo;
 * - una pregunta "una vez por entrada" se responde una vez por cada entrada, se guarda con su
 *   entrada y en el CSV de Órdenes va junta («Entrada 1: … | Entrada 2: …»);
 * - una general se acota por evento al elegirla.
 * D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Frontmatter del evento de prueba. */
const meta = {
	title: 'Taller de prueba',
	start: '2099-12-01T20:00-03:00',
	status: 'abierto',
	location: 'Lugar de prueba',
	payment_methods: ['transferencia'],
	tickets: [
		{ id: 'general', name: 'General', price: 8000, capacity: 10 },
		{ id: 'vip', name: 'VIP', price: 12000, capacity: 10 }
	]
};

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		isValidEventSlug: () => true,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === SLUG ? parseTicketConfig(meta, opts) : null
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { buyAction } from '$lib/server/tickets/checkout.js';
import { fieldInputName } from '$lib/utils/signupFields.js';
import * as ajustes from './+page.server.js';
import * as preguntas from '../../eventos/[slug]/preguntas/+page.server.js';
import * as csv from '../../eventos/[slug]/ordenes.csv/+server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SLUG = 'taller-de-prueba';

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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const notAdmin = { id: 1, login: 'no-admin' };

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, form?: Record<string, string | string[]>, user?: any }} [o]
 */
function fakeEvent({ path = '/admin/ajustes/personas', form, user = admin } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const body = new FormData();
	for (const [k, v] of Object.entries(form ?? {})) {
		for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
	}
	/** @type {any} */
	const event = {
		url,
		params: { slug: SLUG, event: SLUG },
		platform: t.platform,
		locals: { user, user_token: user ? 'token-de-prueba' : null },
		setHeaders: () => {},
		fetch: async () => new Response('{}', { status: 503 }),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.9',
		request: new Request(url, { method: form ? 'POST' : 'GET', body: form ? body : undefined })
	};
	return event;
}

/**
 * Lo que tira (error o redirect de SvelteKit), o `null`.
 * @param {() => unknown} fn
 * @returns {Promise<any>}
 */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

const on = () => setFlag(t.db, 'personas_eventos', true, { by: 'admin-de-prueba' });

/** @param {string} action */
const audit = async (action) =>
	(
		await t.db
			.prepare('SELECT actor_login, summary FROM admin_audit WHERE action = ?1 ORDER BY id')
			.bind(action)
			.all()
	).results;

const path = `/admin/eventos/${SLUG}/preguntas`;
const buyPath = `/calendario/${SLUG}/entradas`;
const buyBody = {
	type: 'general',
	quantity: '2',
	name: 'Persona de Prueba',
	pronouns: 'elle',
	email: 'compra@example.com',
	dni: '30111222',
	method: 'transferencia',
	accept: 'on',
	holder_name_0: 'Persona de Prueba',
	holder_pronouns_0: 'elle',
	holder_name_1: 'Otra Persona',
	holder_pronouns_1: 'ella'
};
const transferInfo = () =>
	t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
const csvText = async () =>
	(await csv.GET(fakeEvent({ path: `/admin/eventos/${SLUG}/ordenes.csv` }))).text();

/** @param {Record<string, string | string[]>} form */
async function create(form) {
	return /** @type {any} */ (await preguntas.actions.createField(fakeEvent({ path, form })));
}
async function own() {
	return /** @type {any} */ (await preguntas.load(fakeEvent({ path }))).own;
}

describe('editar una pregunta', () => {
	it('solo admins (403) y con el interruptor (404)', async () => {
		const noUser = await thrown(() =>
			preguntas.actions.updateField(
				fakeEvent({ path, user: notAdmin, form: { id: '1', label: 'Otra', kind: 'text' } })
			)
		);
		expect(noUser?.status).toBe(403);
		const off = await thrown(() =>
			ajustes.actions.updateField(fakeEvent({ form: { id: '1', label: 'Otra', kind: 'text' } }))
		);
		expect(off?.status).toBe(404);
	});

	it('cambia texto, tipo, opciones, obligatoria y alcance; queda en Actividad; las respuestas viejas no cambian', async () => {
		await on();
		await transferInfo();
		await create({ label: '¿Alguna restricción alimentaria?', kind: 'text' });
		const [field] = await own();
		// Una compra responde la pregunta como estaba.
		const bought = await thrown(() =>
			buyAction(
				fakeEvent({
					path: buyPath,
					form: { ...buyBody, quantity: '1', [fieldInputName(field.id)]: 'Sin gluten' }
				})
			)
		);
		expect(bought?.status).toBe(303);

		const bad = /** @type {any} */ (
			await preguntas.actions.updateField(
				fakeEvent({
					path,
					form: { id: String(field.id), label: 'Menú', kind: 'choice', options: 'una sola' }
				})
			)
		);
		expect(bad.status).toBe(400);
		expect(bad.data.field).toMatchObject({
			editing: field.id,
			errors: { options: expect.any(String) }
		});

		const r = /** @type {any} */ (
			await preguntas.actions.updateField(
				fakeEvent({
					path,
					form: {
						id: String(field.id),
						label: 'Elegí tu menú',
						kind: 'choice',
						options: 'Vegano\nComún',
						required: 'on',
						per_ticket: 'on',
						scope: 'some',
						ticket_types: ['vip']
					}
				})
			)
		);
		expect(r.field.ok).toBe(true);
		expect((await own())[0]).toMatchObject({
			label: 'Elegí tu menú',
			kind: 'choice',
			options: ['Vegano', 'Común'],
			required: true,
			perTicket: true,
			ticketTypes: ['vip']
		});
		expect((await audit('signup_field.update'))[0].summary).toBe(
			'Editó la pregunta «Elegí tu menú» (antes «¿Alguna restricción alimentaria?»)'
		);
		// El CSV muestra la respuesta como se dio (la columna lleva el texto de hoy).
		const lines = (await csvText()).split('\r\n');
		expect(lines[0].endsWith('"Elegí tu menú"')).toBe(true);
		expect(lines[1].endsWith(',"Sin gluten"')).toBe(true);
		const stored = await t.db.prepare('SELECT answers FROM order_answers').first();
		expect(JSON.parse(String(stored?.answers))).toEqual([
			{ id: field.id, label: '¿Alguna restricción alimentaria?', value: 'Sin gluten' }
		]);
	});

	it('elegir algunos tipos sin marcar ninguno: error, no cambia nada', async () => {
		await on();
		await create({ label: 'Talle de remera', kind: 'text' });
		const [field] = await own();
		const r = /** @type {any} */ (
			await preguntas.actions.updateField(
				fakeEvent({
					path,
					form: { id: String(field.id), label: 'Talle', kind: 'text', scope: 'some' }
				})
			)
		);
		expect(r.status).toBe(400);
		expect(r.data.field.errors.ticketTypes).toBe('Elegí al menos un tipo de entrada.');
		expect((await own())[0].label).toBe('Talle de remera');
	});
});

describe('alcance en la compra, Órdenes y su CSV', () => {
	it('por entrada: una respuesta por entrada, guardada con su entrada y junta en el CSV', async () => {
		await on();
		await transferInfo();
		await create({
			label: '¿Alguna restricción alimentaria?',
			kind: 'text',
			required: 'on',
			per_ticket: 'on'
		});
		await create({
			label: 'Talle de remera',
			kind: 'text',
			required: 'on',
			scope: 'some',
			ticket_types: ['vip']
		});
		const [perTicket, vipOnly] = await own();
		expect(vipOnly.ticketTypes).toEqual(['vip']);

		// Falta la de la entrada 2 (el talle no se pide: es General).
		const missing = /** @type {any} */ (
			await buyAction(
				fakeEvent({
					path: buyPath,
					form: { ...buyBody, [fieldInputName(perTicket.id, 0)]: 'Vegana' }
				})
			)
		);
		expect(missing.status).toBe(400);
		expect(missing.data.buy.errors).toEqual({
			[fieldInputName(perTicket.id, 1)]: 'Completá esta respuesta.'
		});

		const ok = await thrown(() =>
			buyAction(
				fakeEvent({
					path: buyPath,
					form: {
						...buyBody,
						[fieldInputName(perTicket.id, 0)]: 'Vegana',
						[fieldInputName(perTicket.id, 1)]: 'Sin TACC'
					}
				})
			)
		);
		expect(ok?.status).toBe(303);
		const stored = await t.db.prepare('SELECT answers FROM order_answers').first();
		expect(JSON.parse(String(stored?.answers))).toEqual([
			{ id: perTicket.id, label: '¿Alguna restricción alimentaria?', value: 'Vegana', ticket: 1 },
			{ id: perTicket.id, label: '¿Alguna restricción alimentaria?', value: 'Sin TACC', ticket: 2 }
		]);
		const lines = (await csvText()).split('\r\n');
		expect(
			lines[0].endsWith('"confirmo","¿Alguna restricción alimentaria?","Talle de remera"')
		).toBe(true);
		expect(lines[1].endsWith(',"Entrada 1: Vegana | Entrada 2: Sin TACC",""')).toBe(true);
	});

	it('VIP: también pide la acotada a VIP', async () => {
		await on();
		await transferInfo();
		await create({
			label: 'Talle de remera',
			kind: 'text',
			required: 'on',
			scope: 'some',
			ticket_types: ['vip']
		});
		const [vipOnly] = await own();
		const missing = /** @type {any} */ (
			await buyAction(fakeEvent({ path: buyPath, form: { ...buyBody, type: 'vip' } }))
		);
		expect(missing.status).toBe(400);
		expect(missing.data.buy.errors[fieldInputName(vipOnly.id)]).toBe('Completá esta respuesta.');
	});

	it('una general se acota a algunos tipos en este evento', async () => {
		await on();
		await ajustes.actions.createField(
			fakeEvent({ form: { label: 'Quiero recibir novedades', kind: 'checkbox', per_ticket: 'on' } })
		);
		const loaded = /** @type {any} */ (await preguntas.load(fakeEvent({ path })));
		expect(loaded.types).toEqual([
			{ id: 'general', name: 'General' },
			{ id: 'vip', name: 'VIP' }
		]);
		const id = String(loaded.general[0].id);
		expect(loaded.general[0].perTicket).toBe(true);
		const none = /** @type {any} */ (
			await preguntas.actions.setGeneral(
				fakeEvent({ path, form: { general: [id], [`scope_${id}`]: 'some' } })
			)
		);
		expect(none.status).toBe(400);
		await preguntas.actions.setGeneral(
			fakeEvent({
				path,
				form: { general: [id], [`scope_${id}`]: 'some', [`ticket_types_${id}`]: ['vip'] }
			})
		);
		const after = /** @type {any} */ (await preguntas.load(fakeEvent({ path })));
		expect(after.chosen).toEqual([{ id: Number(id), ticketTypes: ['vip'] }]);
	});
});

/**
 * Las preguntas de inscripción con todos los tipos de los formularios (menos «Foto»), por las rutas
 * del panel y la compra pública sin JavaScript (un POST común, como manda el navegador):
 * - «Preguntas generales» (Eventos › Roles y preguntas) y la pestaña Preguntas de un evento
 *   guardan texto corto, número (con mínimo y máximo), fecha, varias opciones, lista desplegable y
 *   puntaje, con su ayuda; «Foto» no;
 * - la compra valida cada tipo en el servidor (las casillas de «Varias opciones» repiten el `name`)
 *   y guarda lo respondido con el tipo;
 * - el CSV de Órdenes lleva lo guardado; en «Varias opciones» por entrada, las entradas van con « · ».
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
import { clearFlagCache } from '$lib/server/flags.js';
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

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, form?: Record<string, string | string[]>, user?: any }} [o]
 */
function fakeEvent({ path = '/admin/eventos/roles', form, user = admin } = {}) {
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

/** @param {string} action */
const audit = async (action) =>
	(
		await t.db
			.prepare('SELECT actor_login, summary FROM admin_audit WHERE action = ?1 ORDER BY id')
			.bind(action)
			.all()
	).results;

/*
 * Las preguntas se editan con el editor de preguntas (el de los formularios, siempre prendido):
 * `?/saveFields` guarda la lista entera. Estas ayudas arman esa lista como lo haría el editor: la
 * de hoy (de `load`), más, menos o con una pregunta cambiada.
 */
/** @param {any} f una pregunta guardada (`load`) */
const asItem = (f) => ({
	id: f.id,
	label: f.label,
	kind: f.kind,
	required: f.required,
	options: f.options,
	perTicket: Boolean(f.perTicket),
	scope: f.ticketTypes?.length ? 'some' : 'all',
	ticketTypes: f.ticketTypes ?? [],
	help: f.help ?? '',
	low: f.low ?? '',
	high: f.high ?? '',
	min: f.min ?? '',
	max: f.max ?? ''
});
/**
 * Guarda la lista de preguntas de un evento (`at`: el path de su pestaña Preguntas) o las
 * generales (`at` null), cambiada por `change`.
 * @param {string | null} at
 * @param {(list: any[]) => any[]} change
 * @param {any} [user]
 */
async function saveFieldList(at, change, user = admin) {
	const current = at
		? /** @type {any} */ (await preguntas.load(fakeEvent({ path: at }))).own
		: /** @type {any} */ (await ajustes.load(fakeEvent())).fields;
	const questions = JSON.stringify(change(current.map(asItem)));
	return /** @type {any} */ (
		at
			? await preguntas.actions.saveFields(fakeEvent({ path: at, user, form: { questions } }))
			: await ajustes.actions.saveFields(fakeEvent({ user, form: { questions } }))
	);
}

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

async function own() {
	return /** @type {any} */ (await preguntas.load(fakeEvent({ path }))).own;
}

/** Las preguntas de todos los tipos nuevos, como las manda el editor. */
const NEW_KINDS = [
	{ label: 'Tu apodo', kind: 'short', required: true, options: [], help: 'Como te dicen' },
	{
		label: '¿Cuántos años tenés?',
		kind: 'number',
		required: true,
		options: [],
		min: '18',
		max: '99'
	},
	{ label: '¿Desde cuándo venís?', kind: 'date', required: false, options: [] },
	{
		label: '¿Qué te interesa?',
		kind: 'multi',
		required: true,
		options: ['Sogas', 'Látex', 'Impacto'],
		perTicket: true
	},
	{ label: 'Talle de remera', kind: 'select', required: true, options: ['S', 'M', 'L'] },
	{
		label: '¿Cómo la pasaste la última vez?',
		kind: 'rating',
		required: false,
		options: [],
		low: 'Mal',
		high: 'Bárbaro'
	}
];

describe('tipos de pregunta en las preguntas de inscripción', () => {
	it('las generales guardan todos los tipos (con su ayuda, mínimo, máximo y extremos); «Foto» no', async () => {
		const photo = await saveFieldList(null, () => [
			{ label: 'Tu cara', kind: 'photo', required: false, options: [] }
		]);
		expect(photo.status).toBe(400);
		expect(photo.data.fields.errors[0]).toMatchObject({ kind: 'Elegí el tipo de pregunta.' });

		const r = await saveFieldList(null, () => NEW_KINDS);
		expect(r.fields.ok).toBe(true);
		const fields = /** @type {any} */ (await ajustes.load(fakeEvent())).fields;
		expect(fields.map((/** @type {any} */ f) => f.kind)).toEqual([
			'short',
			'number',
			'date',
			'multi',
			'select',
			'rating'
		]);
		expect(fields[0]).toMatchObject({ help: 'Como te dicen' });
		expect(fields[1]).toMatchObject({ min: 18, max: 99 });
		expect(fields[3]).toMatchObject({ options: ['Sogas', 'Látex', 'Impacto'] });
		expect(fields[5]).toMatchObject({ low: 'Mal', high: 'Bárbaro' });
		// Guardar igual no cambia nada (lo propio del tipo se compara también).
		const again = await saveFieldList(null, (l) => l);
		expect(again.fields.message).toBe('Preguntas guardadas.');
		expect((await audit('signup_field.save')).at(-1)?.summary).toBe(
			'Guardó las preguntas generales (orden)'
		);
	});

	it('la compra sin JavaScript valida cada tipo y guarda lo respondido; el CSV lleva lo guardado', async () => {
		await transferInfo();
		const saved = await saveFieldList(path, () => NEW_KINDS);
		expect(saved.fields.ok).toBe(true);
		const [short, number, date, multi, select, rating] = await own();
		const n = fieldInputName;

		const bad = /** @type {any} */ (
			await buyAction(
				fakeEvent({
					path: buyPath,
					form: {
						...buyBody,
						[n(number.id)]: '12',
						[n(date.id)]: '2026-02-30',
						[n(multi.id, 0)]: ['Sogas', 'Cuero'],
						[n(select.id)]: 'XXL',
						[n(rating.id)]: '7'
					}
				})
			)
		);
		expect(bad.status).toBe(400);
		expect(bad.data.buy.errors).toEqual({
			[n(short.id)]: 'Completá esta respuesta.',
			[n(number.id)]: 'Tiene que ser entre 18 y 99.',
			[n(date.id)]: 'Elegí una fecha válida.',
			[n(multi.id, 0)]: 'Elegí entre las opciones de la lista.',
			[n(multi.id, 1)]: 'Elegí al menos una opción.',
			[n(select.id)]: 'Elegí una de las opciones.',
			[n(rating.id)]: 'Elegí un puntaje de 1 a 5.'
		});
		// Lo que se mandó vuelve para rellenar el formulario (las de «Varias opciones», como lista).
		expect(bad.data.buy.values.answers[n(multi.id, 0)]).toEqual(['Sogas', 'Cuero']);

		const ok = await thrown(() =>
			buyAction(
				fakeEvent({
					path: buyPath,
					form: {
						...buyBody,
						[n(short.id)]: '  Gatite  ',
						[n(number.id)]: '30,5',
						[n(date.id)]: '2024-03-09',
						[n(multi.id, 0)]: ['Impacto', 'Sogas'],
						[n(multi.id, 1)]: 'Látex',
						[n(select.id)]: 'M',
						[n(rating.id)]: '5'
					}
				})
			)
		);
		expect(ok?.status).toBe(303);
		const stored = await t.db.prepare('SELECT answers FROM order_answers').first();
		expect(JSON.parse(String(stored?.answers))).toEqual([
			{ id: short.id, label: 'Tu apodo', value: 'Gatite', kind: 'short' },
			{ id: number.id, label: '¿Cuántos años tenés?', value: '30.5', kind: 'number' },
			{ id: date.id, label: '¿Desde cuándo venís?', value: '2024-03-09', kind: 'date' },
			{
				id: multi.id,
				label: '¿Qué te interesa?',
				value: 'Sogas | Impacto',
				ticket: 1,
				kind: 'multi'
			},
			{ id: multi.id, label: '¿Qué te interesa?', value: 'Látex', ticket: 2, kind: 'multi' },
			{ id: select.id, label: 'Talle de remera', value: 'M', kind: 'select' },
			{ id: rating.id, label: '¿Cómo la pasaste la última vez?', value: '5', kind: 'rating' }
		]);
		const lines = (await csvText()).split('\r\n');
		expect(
			lines[0].endsWith(
				',Tu apodo,¿Cuántos años tenés?,¿Desde cuándo venís?,¿Qué te interesa?,Talle de remera,¿Cómo la pasaste la última vez?'
			)
		).toBe(true);
		expect(
			lines[1].endsWith(',Gatite,30.5,2024-03-09,Entrada 1: Sogas | Impacto · Entrada 2: Látex,M,5')
		).toBe(true);
	});
});

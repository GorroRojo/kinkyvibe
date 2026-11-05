/**
 * Las páginas públicas de los formularios (docs/formularios.md): /formularios/<dirección> y la
 * encuesta de un evento en /calendario/<evento>/encuesta. Interruptor apagado → 404; con nombre
 * pide nombre y mail; anónimo y «Que cada persona elija» con la casilla marcada no guardan
 * identidad (aunque se manden nombre y mail); la trampa no guarda nada; el límite por persona;
 * con cuenta; cerrado; y la encuesta con el link personal: sin clave, inválida, una sola vez.
 * D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'fiesta-de-prueba';
const meta = {
	title: 'Fiesta de prueba',
	start: '2099-12-01T20:00-03:00',
	end: '2099-12-02T02:00-03:00',
	status: 'abierto',
	location: 'Lugar de prueba',
	payment_methods: ['transferencia'],
	tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
};

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		isValidEventSlug: () => true,
		getEventMeta: async (/** @type {string} */ slug) => (slug === SLUG ? meta : null),
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === SLUG ? parseTicketConfig(meta, opts) : null,
		listTicketedEvents: async () => [{ slug: SLUG, config: parseTicketConfig(meta, {}) }]
	};
});
const env = vi.hoisted(() => ({ value: /** @type {Record<string, string>} */ ({}) }));
vi.mock('$env/dynamic/private', () => ({ env: env.value }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache } from '$lib/server/flags.js';
import {
	createForm,
	ensureEventSurvey,
	getForm,
	saveForm,
	setFormOpen
} from '$lib/server/formularios/store.js';
import { inviteToken } from '$lib/server/formularios/invite.js';
import { FORM_RATE_LIMIT } from '$lib/server/formularios/public.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import * as page from './[slug]/+page.server.js';
import * as survey from '../calendario/[event]/encuesta/+page.server.js';

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
	env.value.FORMULARIOS_ENABLED = '1';
	env.value.TICKETS_DEV_RELAX_LIMITS = '';
	clearFlagCache();
});

const QUESTIONS = [
	{ id: 'p1', kind: 'text', label: 'Contanos', required: true, options: [] },
	{ id: 'p2', kind: 'rating', label: 'Puntaje', required: false, options: [] }
];

/**
 * @param {{ path: string, params: Record<string, string>, form?: Record<string, string>,
 *   member?: any, ip?: string }} o
 */
function fakeEvent({ path, params, form, member, ip = '203.0.113.9' }) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const body = new FormData();
	for (const [k, v] of Object.entries(form ?? {})) body.append(k, v);
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => ip,
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? body : undefined,
			headers: { 'cf-connecting-ip': ip }
		})
	};
	return event;
}

/** Un formulario abierto con esta privacidad y acceso. @param {Record<string, any>} over */
async function openForm(over = {}) {
	const id = await createForm(t.db, { title: 'Formulario de prueba' }, { by: 'x' });
	const form = /** @type {any} */ (await getForm(t.db, id));
	await saveForm(
		t.db,
		id,
		{ ...form, questions: QUESTIONS, privacy: 'named', access: 'link', ...over },
		{ by: 'x' }
	);
	await setFormOpen(t.db, id, true, { by: 'x' });
	return /** @type {any} */ (await getForm(t.db, id));
}

/** @param {any} form @param {Record<string, string>} values @param {any} [o] */
const submit = (form, values, o = {}) =>
	page.actions.send(
		fakeEvent({
			path: `/formularios/${form.slug}`,
			params: { slug: form.slug },
			form: values,
			...o
		})
	);

async function rows() {
	return (
		await t.db
			.prepare(
				'SELECT anonymous, name, email, account_id, order_id, created_at, answers FROM form_responses ORDER BY id'
			)
			.all()
	).results;
}

/** @param {() => unknown} fn @returns {Promise<any>} */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

describe('acciones', () => {
	it('todas con nombre (SvelteKit no deja mezclar `default` con acciones con nombre)', () => {
		for (const actions of [page.actions, survey.actions]) {
			expect(Object.keys(actions).sort()).toEqual(['check', 'send']);
		}
	});
});

describe('formulario abierto a cualquiera', () => {
	it('con el interruptor apagado, 404', async () => {
		const form = await openForm();
		env.value.FORMULARIOS_ENABLED = '0';
		clearFlagCache();
		const e = await thrown(() =>
			page.load(fakeEvent({ path: `/formularios/${form.slug}`, params: { slug: form.slug } }))
		);
		expect(e?.status).toBe(404);
	});

	it('la página no trae nada de otras personas y no existe para las plantillas', async () => {
		const form = await openForm();
		const data = /** @type {any} */ (
			await page.load(fakeEvent({ path: `/formularios/${form.slug}`, params: { slug: form.slug } }))
		);
		expect(data.form).toMatchObject({
			title: form.title,
			open: true
		});
		expect(data.form).not.toHaveProperty('responses');
		const e = await thrown(() =>
			page.load(
				fakeEvent({ path: '/formularios/plantilla-beca', params: { slug: 'plantilla-beca' } })
			)
		);
		expect(e?.status).toBe(404);
	});

	it('con nombre: pide nombre y mail, y los guarda', async () => {
		const form = await openForm();
		const bad = /** @type {any} */ (await submit(form, { p_p1: 'Hola' }));
		expect(bad.status).toBe(400);
		expect(Object.keys(bad.data.errors)).toEqual(['nombre', 'mail']);
		expect(
			await submit(form, { p_p1: 'Hola', nombre: 'Persona Demo', mail: 'Demo@Example.com' })
		).toEqual({
			sent: true
		});
		expect(await rows()).toMatchObject([
			{ anonymous: 0, name: 'Persona Demo', email: 'demo@example.com' }
		]);
	});

	it('anónimo: no guarda identidad aunque la manden', async () => {
		const form = await openForm({ privacy: 'anonymous' });
		await submit(form, { p_p1: 'Hola', nombre: 'Persona Demo', mail: 'demo@example.com' });
		expect(await rows()).toMatchObject([
			{ anonymous: 1, name: null, email: null, account_id: null, order_id: null, created_at: null }
		]);
	});

	it('«Que cada persona elija» con «Responder anónimamente» marcada: anónima', async () => {
		const form = await openForm({ privacy: 'choose' });
		await submit(form, {
			p_p1: 'Uno',
			anonima: 'on',
			nombre: 'Persona Demo',
			mail: 'demo@example.com'
		});
		await submit(form, { p_p1: 'Dos', nombre: 'Persona Demo', mail: 'demo@example.com' });
		const r = await rows();
		expect(r[0]).toMatchObject({ anonymous: 1, name: null, email: null, created_at: null });
		expect(r[1]).toMatchObject({ anonymous: 0, name: 'Persona Demo' });
	});

	it('la trampa invisible: contesta «gracias» y no guarda nada', async () => {
		const form = await openForm();
		expect(
			await submit(form, { p_p1: 'spam', nombre: 'Robot', mail: 'r@example.com', sitio_web: 'x' })
		).toEqual({ sent: true });
		expect(await rows()).toHaveLength(0);
	});

	it(`límite por persona: ${FORM_RATE_LIMIT.limit} por hora`, async () => {
		const form = await openForm({ privacy: 'anonymous' });
		for (let i = 0; i < FORM_RATE_LIMIT.limit; i++) {
			expect(await submit(form, { p_p1: `r${i}` })).toEqual({ sent: true });
		}
		const over = /** @type {any} */ (await submit(form, { p_p1: 'una más' }));
		expect(over.status).toBe(429);
		// Otra conexión, sí.
		expect(await submit(form, { p_p1: 'otra' }, { ip: '198.51.100.4' })).toEqual({ sent: true });
	});

	it('con cuenta: sin sesión no; con sesión guarda la cuenta', async () => {
		const form = await openForm({ access: 'account' });
		const no = /** @type {any} */ (await submit(form, { p_p1: 'Hola' }));
		expect(no.status).toBe(401);
		await submit(
			form,
			{ p_p1: 'Hola' },
			{ member: { id: 'acc_prueba', email: 'socia@example.com' } }
		);
		expect(await rows()).toMatchObject([
			{ anonymous: 0, account_id: 'acc_prueba', email: 'socia@example.com' }
		]);
	});

	it('cerrado: no recibe', async () => {
		const form = await openForm();
		await setFormOpen(t.db, form.id, false, { by: 'x' });
		const r = /** @type {any} */ (await submit(form, { p_p1: 'Hola' }));
		expect(r.status).toBe(409);
	});
});

let payment = 1;
async function approvedOrder(email = 'a@example.com') {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	await applyPayment(t.db, {
		id: payment++,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return /** @type {string} */ (r.order.id);
}

describe('encuesta del evento con link personal', () => {
	const path = `/calendario/${SLUG}/encuesta`;
	/** @param {Record<string, string>} values */
	const send = (values) =>
		survey.actions.send(fakeEvent({ path, params: { event: SLUG }, form: values }));
	/** @param {string} clave */
	const check = async (clave) =>
		/** @type {any} */ (
			await survey.actions.check(fakeEvent({ path, params: { event: SLUG }, form: { clave } }))
		).check.state;

	it('sin encuesta, 404; con encuesta, la página muestra el título del evento', async () => {
		expect(
			(await thrown(() => survey.load(fakeEvent({ path, params: { event: SLUG } }))))?.status
		).toBe(404);
		await ensureEventSurvey(t.db, SLUG, { by: 'x' });
		const data = /** @type {any} */ (
			await survey.load(fakeEvent({ path, params: { event: SLUG } }))
		);
		expect(data.form).toMatchObject({
			kind: 'survey',
			eventTitle: 'Fiesta de prueba',
			access: 'ticket'
		});
	});

	it('la clave sirve una sola vez y la respuesta es anónima', async () => {
		const s = /** @type {any} */ (await ensureEventSurvey(t.db, SLUG, { by: 'x' }));
		const orderId = await approvedOrder();
		await t.db
			.prepare(
				"INSERT INTO form_sends (order_id, form_id, sent_at, status, attempts) VALUES (?1, ?2, 1, 'sent', 1)"
			)
			.bind(orderId, s.id)
			.run();
		const clave = await inviteToken(t.db, s.id, orderId);
		expect(await check('')).toBe('invalid');
		expect(await check(`${orderId}.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy`)).toBe('invalid');
		expect(await check(clave)).toBe('ok');
		// Sin clave no se guarda.
		expect(/** @type {any} */ (await send({ p_p1: '5' })).status).toBe(400);
		expect(await send({ clave, p_p1: '5', p_p2: 'Todo bien' })).toEqual({ sent: true });
		expect(await check(clave)).toBe('used');
		expect(await send({ clave, p_p1: '4' })).toEqual({ sent: true, repeated: true });
		const r = await rows();
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ anonymous: 1, order_id: null, email: null, created_at: null });
	});

	it('la clave de otro formulario no sirve', async () => {
		const s = /** @type {any} */ (await ensureEventSurvey(t.db, SLUG, { by: 'x' }));
		const orderId = await approvedOrder();
		await t.db
			.prepare(
				"INSERT INTO form_sends (order_id, form_id, sent_at, status, attempts) VALUES (?1, ?2, 1, 'sent', 1)"
			)
			.bind(orderId, s.id)
			.run();
		expect(await check(await inviteToken(t.db, s.id + 1000, orderId))).toBe('invalid');
	});
});

/**
 * Comunidad › Formularios por las rutas del panel (docs/formularios.md): solo admins y solo con el
 * interruptor (si no, 404); crear y copiar una plantilla; guardar (dirección única, preguntas en
 * su orden, evento que exista); pasar un formulario con nombre a anónimo esconde los nombres de lo
 * que ya llegó (página y CSV); todo queda en Actividad; la encuesta de un evento se apaga desde su
 * ficha. D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const meta = {
	title: 'Fiesta de prueba',
	start: '2099-12-01T20:00-03:00',
	status: 'abierto',
	location: 'Lugar de prueba',
	payment_methods: ['transferencia'],
	tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
};
const SLUG = 'fiesta-de-prueba';

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
import { ADMINS } from '$lib/server/auth.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { getForm, listForms, saveResponse } from '$lib/server/formularios/store.js';
import * as list from './+page.server.js';
import * as editor from './[id]/+page.server.js';
import * as respuestas from './[id]/respuestas/+page.server.js';
import * as csv from './[id]/respuestas/respuestas.csv/+server.js';
import * as encuesta from '../../eventos/[slug]/encuesta/+page.server.js';

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
	clearFlagCache();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>,
 *   user?: any }} [o]
 */
function fakeEvent({
	path = '/admin/comunidad/formularios',
	params = {},
	form,
	user = admin
} = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const body = new FormData();
	for (const [k, v] of Object.entries(form ?? {})) body.append(k, v);
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: { user, user_token: user ? 'token-de-prueba' : null },
		setHeaders: () => {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.9',
		request: new Request(url, { method: form ? 'POST' : 'GET', body: form ? body : undefined })
	};
	return event;
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

/** Crea un formulario por la acción y devuelve su id. @param {string} title */
async function create(title) {
	const r = await thrown(() => list.actions.create(fakeEvent({ form: { title } })));
	expect(r?.status).toBe(303);
	return Number(String(r.location).split('/').pop());
}

/** @param {number} id @param {Record<string, string>} values */
function save(id, values) {
	return editor.actions.save(
		fakeEvent({
			params: { id: String(id) },
			form: {
				title: 'Pedido de beca',
				slug: 'beca',
				intro: '',
				access: 'link',
				privacy: 'named',
				audience: 'admins',
				eventSlug: '',
				questions: JSON.stringify([
					{ id: 'p1', kind: 'text', label: '¿Para qué evento?', required: true, options: [] },
					{ kind: 'rating', label: '¿Cuánto te sirve?', required: false, options: [] }
				]),
				...values
			}
		})
	);
}

describe('permisos', () => {
	it('sin interruptor, 404 (también en las acciones y el CSV)', async () => {
		env.value.FORMULARIOS_ENABLED = '0';
		clearFlagCache();
		expect((await thrown(() => list.load(fakeEvent())))?.status).toBe(404);
		expect(
			(await thrown(() => list.actions.create(fakeEvent({ form: { title: 'x' } }))))?.status
		).toBe(404);
		expect((await thrown(() => csv.GET(fakeEvent({ params: { id: '1' } }))))?.status).toBe(404);
		expect((await thrown(() => encuesta.load(fakeEvent({ params: { slug: SLUG } }))))?.status).toBe(
			404
		);
	});

	it('solo admins', async () => {
		const notAdmin = { id: 1, login: 'no-admin' };
		expect((await thrown(() => list.load(fakeEvent({ user: notAdmin }))))?.status).toBe(403);
		expect(
			(
				await thrown(() =>
					editor.actions.save(fakeEvent({ params: { id: '1' }, form: {}, user: notAdmin }))
				)
			)?.status
		).toBe(403);
		expect((await thrown(() => list.load(fakeEvent({ user: null }))))?.status).toBe(303);
	});
});

describe('lista, crear y copiar', () => {
	it('la lista trae las plantillas; «Usar esta plantilla» hace una copia cerrada', async () => {
		const data = /** @type {any} */ (await list.load(fakeEvent()));
		expect(data.templates.map((/** @type {any} */ f) => f.title)).toEqual(
			expect.arrayContaining(['Pedido de beca', 'Proponé un taller o una colaboración'])
		);
		const beca = data.templates.find((/** @type {any} */ f) => f.title === 'Pedido de beca');
		const r = await thrown(() => list.actions.copy(fakeEvent({ form: { id: String(beca.id) } })));
		expect(r?.status).toBe(303);
		const id = Number(String(r.location).split('/').pop());
		expect(await getForm(t.db, id)).toMatchObject({
			kind: 'form',
			open: false,
			slug: 'pedido-de-beca'
		});
	});
});

describe('guardar', () => {
	it('guarda lo general y las preguntas en su orden; la dirección no se repite', async () => {
		const a = await create('Uno');
		const b = await create('Dos');
		expect(await save(a, {})).toMatchObject({ save: { ok: true } });
		const form = await getForm(t.db, a);
		expect(form).toMatchObject({ slug: 'beca', title: 'Pedido de beca', privacy: 'named' });
		expect(form?.questions.map((q) => q.label)).toEqual(['¿Para qué evento?', '¿Cuánto te sirve?']);
		expect(form?.questions[1]).toMatchObject({ kind: 'rating', low: 'Mal', high: 'Re bien' });
		const dup = /** @type {any} */ (await save(b, {}));
		expect(dup.status).toBe(400);
		expect(dup.data.save.errors.slug).toMatch(/ya la usa otro/);
	});

	it('«quienes tenían entrada» pide un evento que venda entradas', async () => {
		const a = await create('Uno');
		const r = /** @type {any} */ (await save(a, { access: 'ticket', eventSlug: 'no-existe' }));
		expect(r.data.save.errors.eventSlug).toBeTruthy();
		expect(await save(a, { access: 'ticket', eventSlug: SLUG })).toMatchObject({
			save: { ok: true }
		});
	});

	it('queda en Actividad, con el cambio de privacidad', async () => {
		const a = await create('Uno');
		await save(a, {});
		await save(a, { privacy: 'anonymous' });
		const { results } = await t.db
			.prepare("SELECT action, summary FROM admin_audit WHERE action LIKE 'form.%' ORDER BY id")
			.all();
		expect(results.map((r) => r.action)).toEqual(['form.create', 'form.save', 'form.save']);
		expect(results[2].summary).toMatch(/Con nombre → Anónimo/);
	});
});

describe('pasar a anónimo esconde los nombres de lo que ya llegó', () => {
	it('en la página y en el CSV; volver a «Con nombre» los muestra', async () => {
		const id = await create('Uno');
		await save(id, {});
		for (const name of ['Persona Uno', 'Persona Dos']) {
			await saveResponse(t.db, {
				formId: id,
				answers: [
					{ id: 'p1', label: '¿Para qué evento?', value: `Respuesta ${name.length}${name.at(-1)}` }
				],
				identity: { name, email: `${name.split(' ')[1].toLowerCase()}@example.com` }
			});
		}
		const named = /** @type {any} */ (
			await respuestas.load(fakeEvent({ params: { id: String(id) } }))
		);
		expect(named.responses.map((/** @type {any} */ r) => r.name).sort()).toEqual([
			'Persona Dos',
			'Persona Uno'
		]);
		await save(id, { privacy: 'anonymous' });
		const anon = /** @type {any} */ (
			await respuestas.load(fakeEvent({ params: { id: String(id) } }))
		);
		expect(anon.total).toBe(2);
		expect(anon.shuffled).toBe(true);
		expect(
			anon.responses.every((/** @type {any} */ r) => r.name === null && r.email === null)
		).toBe(true);
		const text = await (await csv.GET(fakeEvent({ params: { id: String(id) } }))).text();
		expect(text).not.toContain('Persona');
		expect(text).not.toContain('example.com');
		expect(text).toContain('Respuesta 11o');
		await save(id, { privacy: 'named' });
		const again = /** @type {any} */ (
			await respuestas.load(fakeEvent({ params: { id: String(id) } }))
		);
		expect(again.responses.some((/** @type {any} */ r) => r.name === 'Persona Uno')).toBe(true);
	});
});

describe('encuesta del evento (ficha › Mails › Encuesta)', () => {
	it('el load no crea nada; apagarla la crea cerrada y el cron ya no la manda', async () => {
		const data = /** @type {any} */ (await encuesta.load(fakeEvent({ params: { slug: SLUG } })));
		expect(data.survey).toBeNull();
		expect(data.on).toBe(true);
		expect(data.mail.subject).toBe('¿Cómo la pasaste? Contanos en un minuto');
		expect((await listForms(t.db)).filter((f) => f.kind === 'survey')).toHaveLength(0);
		await encuesta.actions.setOpen(fakeEvent({ params: { slug: SLUG }, form: { other: '1' } }));
		const surveys = (await listForms(t.db)).filter((f) => f.kind === 'survey');
		expect(surveys).toHaveLength(1);
		expect(surveys[0]).toMatchObject({ open: false, eventSlug: SLUG, privacy: 'anonymous' });
		await encuesta.actions.setOpen(fakeEvent({ params: { slug: SLUG }, form: { open: 'on' } }));
		expect((await getForm(t.db, surveys[0].id))?.open).toBe(true);
	});
});

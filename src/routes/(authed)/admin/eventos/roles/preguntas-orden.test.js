/**
 * Preguntas de inscripción con el editor compartido (interruptor `formularios`,
 * docs/formularios.md): `?/saveFields` guarda la lista entera en su orden. Las que ya había
 * conservan su orden y su id (las respuestas siguen atadas), se pueden reordenar, editar, agregar
 * y sacar (borrado suave, se recupera); la compra pregunta en el orden nuevo. Solo admins.
 * D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
	createField,
	eventSignupFields,
	listGeneralFields,
	listOwnFields
} from '$lib/server/tickets/signupFields.js';
import * as roles from './+page.server.js';
import * as preguntas from '../../eventos/[slug]/preguntas/+page.server.js';

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
 * @param {{ path?: string, questions?: unknown, user?: any }} [o]
 */
function fakeEvent({ path = `/admin/eventos/${SLUG}/preguntas`, questions, user = admin } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const body = new FormData();
	if (questions !== undefined) body.append('questions', JSON.stringify(questions));
	/** @type {any} */
	const event = {
		url,
		params: { slug: SLUG },
		platform: t.platform,
		locals: { user, user_token: user ? 'token-de-prueba' : null },
		setHeaders: () => {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.9',
		request: new Request(url, { method: 'POST', body })
	};
	return event;
}

const by = { by: 'admin-de-prueba' };
const field = (/** @type {string} */ label, extra = {}) => ({
	label,
	kind: /** @type {const} */ ('text'),
	required: false,
	options: [],
	...extra
});
/** Lo que manda el editor por cada pregunta guardada. @param {any} f */
const asPayload = (f) => ({
	id: f.id,
	kind: f.kind,
	label: f.label,
	required: f.required,
	options: f.options,
	perTicket: Boolean(f.perTicket),
	scope: f.ticketTypes?.length ? 'some' : 'all',
	ticketTypes: f.ticketTypes ?? []
});

describe('?/saveFields de un evento', () => {
	it('las preguntas que ya había conservan su orden al abrir el editor', async () => {
		await createField(t.db, SLUG, field('Primera'), by);
		await createField(t.db, SLUG, field('Segunda'), by);
		await createField(t.db, SLUG, field('Tercera'), by);
		const own = await listOwnFields(t.db, SLUG);
		expect(own.map((f) => f.label)).toEqual(['Primera', 'Segunda', 'Tercera']);
		// Guardar sin cambios no cambia nada.
		const r = /** @type {any} */ (
			await preguntas.actions.saveFields(fakeEvent({ questions: own.map(asPayload) }))
		);
		expect(r.fields.ok).toBe(true);
		expect((await listOwnFields(t.db, SLUG)).map((f) => [f.id, f.label])).toEqual(
			own.map((f) => [f.id, f.label])
		);
	});

	it('reordena, edita, agrega y saca; la compra pregunta en el orden nuevo', async () => {
		await createField(t.db, SLUG, field('Primera'), by);
		await createField(t.db, SLUG, field('Segunda'), by);
		await createField(t.db, SLUG, field('Tercera'), by);
		const [a, b, c] = await listOwnFields(t.db, SLUG);
		const r = /** @type {any} */ (
			await preguntas.actions.saveFields(
				fakeEvent({
					questions: [
						asPayload(c),
						{ ...asPayload(a), label: 'Primera editada', required: true },
						{
							id: null,
							kind: 'choice',
							label: 'Nueva',
							required: false,
							options: ['Sí', 'No'],
							perTicket: true,
							scope: 'some',
							ticketTypes: ['vip']
						}
					]
				})
			)
		);
		expect(r.fields.ok).toBe(true);
		const own = await listOwnFields(t.db, SLUG);
		expect(own.map((f) => f.label)).toEqual(['Tercera', 'Primera editada', 'Nueva']);
		expect(own[0].id).toBe(c.id);
		expect(own[1]).toMatchObject({ id: a.id, required: true });
		expect(own[2]).toMatchObject({ kind: 'choice', perTicket: true, ticketTypes: ['vip'] });
		// La sacada queda borrada (suave) y se puede recuperar.
		const gone = await t.db
			.prepare('SELECT deleted_at FROM signup_fields WHERE id = ?1')
			.bind(b.id)
			.first();
		expect(gone?.deleted_at).not.toBeNull();
		const recover = await t.db
			.prepare('SELECT COUNT(*) AS n FROM panel_deletions WHERE title = ?1')
			.bind('Segunda')
			.first();
		expect(Number(recover?.n)).toBe(1);
		// Lo que pregunta la compra, en el orden nuevo.
		expect((await eventSignupFields(t.db, SLUG)).map((f) => f.label)).toEqual([
			'Tercera',
			'Primera editada',
			'Nueva'
		]);
		const log = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'signup_field.save'")
			.first();
		expect(log?.summary).toBe('Guardó las preguntas (1 nueva, 1 cambiada, 1 borrada)');
	});

	it('valida cada pregunta y no guarda nada si alguna está mal', async () => {
		await createField(t.db, SLUG, field('Primera'), by);
		const r = /** @type {any} */ (
			await preguntas.actions.saveFields(
				fakeEvent({
					questions: [
						{ id: null, kind: 'choice', label: 'Sin opciones', options: ['Sola'] },
						{ id: null, kind: 'rating', label: 'Puntaje no va en inscripción' }
					]
				})
			)
		);
		expect(r.status).toBe(400);
		expect(Object.keys(r.data.fields.errors)).toEqual(['0', '1']);
		expect((await listOwnFields(t.db, SLUG)).map((f) => f.label)).toEqual(['Primera']);
	});

	it('solo admins', async () => {
		/** @type {any} */
		let err = null;
		try {
			await preguntas.actions.saveFields(fakeEvent({ questions: [], user: { id: 1, login: 'x' } }));
		} catch (e) {
			err = e;
		}
		expect(err?.status).toBe(403);
	});
});

describe('?/saveFields de las generales', () => {
	it('ordena las generales', async () => {
		await createField(t.db, null, field('Una'), by);
		await createField(t.db, null, field('Dos'), by);
		const [one, two] = await listGeneralFields(t.db);
		const r = /** @type {any} */ (
			await roles.actions.saveFields(
				fakeEvent({ path: '/admin/eventos/roles', questions: [asPayload(two), asPayload(one)] })
			)
		);
		expect(r.fields.ok).toBe(true);
		expect((await listGeneralFields(t.db)).map((f) => f.label)).toEqual(['Dos', 'Una']);
	});
});

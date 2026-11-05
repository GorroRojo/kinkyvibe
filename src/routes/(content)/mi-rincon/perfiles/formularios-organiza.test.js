/**
 * Las respuestas de los formularios de un evento para les organizadores (Mi rincón → el perfil →
 * Respuestas del evento → el formulario; docs/formularios.md): quien gestiona un perfil con el rol
 * «Organiza» en ESE evento ve todas las respuestas (sin mails, con nombre solo si la privacidad lo
 * deja ver) y baja el CSV; quien facilita, quien gestiona otro perfil, un formulario «Solo admins»
 * o de otro evento, o el interruptor apagado → 404. Queda registrado. D1 de miniflare; datos
 * inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'taller-de-prueba';
const NOW = Date.UTC(2099, 0, 10, 15, 0, 0);
const meta = {
	title: 'Taller de prueba',
	start: '2099-12-01T20:00-03:00',
	status: 'abierto',
	payment_methods: ['transferencia'],
	tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }],
	personas: [
		{ perfil: 'colectivo-organiza', rol: 'Organiza' },
		{ perfil: 'persona-facilita', rol: 'Facilita' }
	]
};

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		getEventMeta: async (/** @type {string} */ slug) => (slug === SLUG ? meta : null),
		listEventMetas: async () => [{ slug: SLUG, meta }],
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === SLUG ? parseTicketConfig(meta, opts) : null
	};
});
const env = vi.hoisted(() => ({ value: /** @type {Record<string, string>} */ ({}) }));
vi.mock('$env/dynamic/private', () => ({ env: env.value }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { createProfile } from '$lib/server/cuentas/perfiles.js';
import {
	createForm,
	ensureEventSurvey,
	getForm,
	saveForm,
	saveResponse
} from '$lib/server/formularios/store.js';
import * as eventPage from './[slug]/respuestas/[event]/+page.server.js';
import * as formPage from './[slug]/respuestas/[event]/formularios/[id]/+page.server.js';
import * as formCsv from './[slug]/respuestas/[event]/formularios/[id]/respuestas.csv/+server.js';

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

/**
 * @param {{ profile?: string, id: number | string, member?: any, csv?: boolean }} o
 */
function fakeEvent({ profile = 'colectivo-organiza', id, member, csv = false }) {
	const base = `/mi-rincon/perfiles/${profile}/respuestas/${SLUG}`;
	const url = new URL(
		id === '' ? base : `${base}/formularios/${id}${csv ? '/respuestas.csv' : ''}`,
		'https://kinkyvibe.ar'
	);
	/** @type {any} */
	const e = {
		url,
		params: { slug: profile, event: SLUG, id: String(id) },
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		request: new Request(url),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return e;
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

/** @param {string} name @param {string} title @param {'persona' | 'proyecto'} kind */
async function managerOf(name, title, kind = 'proyecto') {
	const a = await upsertVerifiedAccount(t.db, `${name}@example.com`);
	await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	const r = /** @type {any} */ (await createProfile(t.db, a.id, { kind, title }, { now: NOW }));
	expect(r.ok).toBe(true);
	return { id: a.id, email: a.email };
}

async function seed() {
	const organizer = await managerOf('organiza-prueba', 'Colectivo Organiza');
	const facilitator = await managerOf('facilita-prueba', 'Persona Facilita', 'persona');
	const survey = /** @type {any} */ (await ensureEventSurvey(t.db, SLUG, { by: 'x' }));
	await saveResponse(t.db, {
		formId: survey.id,
		answers: [{ id: 'p1', label: '¿Cómo la pasaste?', value: '5' }],
		identity: null
	});
	// Un formulario con nombre del evento (para organizadores) y uno «Solo admins».
	const namedId = await createForm(t.db, { title: 'Música' }, { by: 'x' });
	const named = /** @type {any} */ (await getForm(t.db, namedId));
	await saveForm(
		t.db,
		namedId,
		{ ...named, audience: 'organizers', eventSlug: SLUG, questions: [] },
		{ by: 'x' }
	);
	await saveResponse(t.db, {
		formId: namedId,
		answers: [{ id: 'p1', label: '¿Qué música?', value: 'Cumbia' }],
		identity: { name: 'Persona Demo', email: 'demo@example.com' }
	});
	const adminsId = await createForm(t.db, { title: 'Beca' }, { by: 'x' });
	const admins = /** @type {any} */ (await getForm(t.db, adminsId));
	await saveForm(
		t.db,
		adminsId,
		{ ...admins, audience: 'admins', eventSlug: SLUG, questions: [] },
		{ by: 'x' }
	);
	return { organizer, facilitator, survey, namedId, adminsId };
}

describe('respuestas de formularios para les organizadores', () => {
	it('ve la lista de formularios de su evento y cada una (sin mails); queda registrado', async () => {
		const { organizer, survey, namedId, adminsId } = await seed();
		const list = /** @type {any} */ (
			await eventPage.load(fakeEvent({ id: '', member: organizer }))
		);
		expect(list.forms.map((/** @type {any} */ f) => f.id).sort()).toEqual(
			[survey.id, namedId].sort()
		);
		expect(list.forms.map((/** @type {any} */ f) => f.id)).not.toContain(adminsId);

		const s = /** @type {any} */ (
			await formPage.load(fakeEvent({ id: survey.id, member: organizer }))
		);
		expect(s.total).toBe(1);
		expect(s.responses[0]).toMatchObject({ hidden: true, name: null });

		const n = /** @type {any} */ (
			await formPage.load(fakeEvent({ id: namedId, member: organizer }))
		);
		expect(n.responses[0]).toMatchObject({ name: 'Persona Demo', email: null });
		expect(JSON.stringify(n)).not.toContain('example.com');

		const res = await formCsv.GET(fakeEvent({ id: namedId, member: organizer, csv: true }));
		const text = await res.text();
		expect(text).toContain('Persona Demo');
		expect(text).not.toContain('example.com');
		expect(text.split('\r\n')[0]).toBe('día,nombre,¿Qué música?');

		const { results } = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'form_responses.view' ORDER BY id")
			.all();
		expect(results.map((r) => r.summary)).toEqual([
			'«Colectivo Organiza» vio las respuestas de «¿Cómo la pasaste?»',
			'«Colectivo Organiza» vio las respuestas de «Música»',
			'«Colectivo Organiza» bajó en CSV las respuestas de «Música»'
		]);
	});

	it('404: quien facilita, un formulario solo para admins, el interruptor apagado', async () => {
		const { organizer, facilitator, survey, adminsId } = await seed();
		expect(
			(
				await thrown(() =>
					formPage.load(
						fakeEvent({ profile: 'persona-facilita', id: survey.id, member: facilitator })
					)
				)
			)?.status
		).toBe(404);
		expect(
			(await thrown(() => formPage.load(fakeEvent({ id: adminsId, member: organizer }))))?.status
		).toBe(404);
		expect(
			(await thrown(() => formPage.load(fakeEvent({ id: 999999, member: organizer }))))?.status
		).toBe(404);
		env.value.FORMULARIOS_ENABLED = '0';
		clearFlagCache();
		expect(
			(await thrown(() => formPage.load(fakeEvent({ id: survey.id, member: organizer }))))?.status
		).toBe(404);
		const list = /** @type {any} */ (
			await eventPage.load(fakeEvent({ id: '', member: organizer }))
		);
		expect(list.forms).toEqual([]);
	});
});

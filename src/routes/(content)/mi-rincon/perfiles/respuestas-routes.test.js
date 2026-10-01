/**
 * Respuestas de inscripción para les organizadores (Mi rincón → el perfil → Respuestas de
 * inscripción): quien gestiona un perfil con el rol «Organiza» en el evento ve las respuestas y
 * baja el CSV; cualquier otre recibe 404; sin sesión, a /ingresar; con el interruptor apagado,
 * 404; les admins siguen viéndolas en Órdenes. D1 de miniflare; datos inventados (example.com).
 * Sin relojes: todo lo que depende de la hora recibe `now` explícito.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'taller-de-prueba';
const NOW = Date.UTC(2099, 0, 10, 15, 0, 0);

/** Frontmatter del evento de prueba: un perfil organiza, otro facilita. */
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

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';

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
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/**
 * Módulos con los interruptores por variable (`cuentas` siempre prendido).
 * @param {{ personas?: '1' | '0' }} [o]
 */
async function modules({ personas = '1' } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { CUENTAS_ENABLED: '1', PERSONAS_EVENTOS_ENABLED: personas }
	}));
	return {
		page: await import('./[slug]/respuestas/[event]/+page.server.js'),
		csv: await import('./[slug]/respuestas/[event]/respuestas.csv/+server.js'),
		profilePage: await import('./[slug]/+page.server.js'),
		ordenes: await import('../../../(authed)/admin/eventos/[slug]/ordenes/+page.server.js'),
		organiza: await import('$lib/server/personas/organiza.js'),
		accounts: await import('$lib/server/cuentas/accounts.js'),
		perfiles: await import('$lib/server/cuentas/perfiles.js'),
		orders: await import('$lib/server/tickets/orders.js'),
		signup: await import('$lib/server/tickets/signupFields.js'),
		config: await import('$lib/server/tickets/config.js')
	};
}

/**
 * Evento de SvelteKit de mentira.
 * @param {{ profile?: string, event?: string, member?: { id: string, email: string }, user?: any, path?: string }} [o]
 */
function fakeEvent({ profile = 'colectivo-organiza', event = SLUG, member, user, path } = {}) {
	const url = new URL(
		path ?? `/mi-rincon/perfiles/${profile}/respuestas/${event}`,
		'https://kinkyvibe.ar'
	);
	/** @type {any} */
	const e = {
		url,
		params: { slug: profile, event },
		platform: t.platform,
		locals: { user, user_token: user ? 'token-de-prueba' : '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch,
		request: new Request(url),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return e;
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

/**
 * Una cuenta con sesión y permiso de perfiles.
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {string} name
 */
async function member(m, name) {
	const a = await m.accounts.upsertVerifiedAccount(t.db, `${name}@example.com`);
	await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	return { id: a.id, email: a.email };
}

/**
 * Un perfil (nace sin revisar por admins) que gestiona `who`.
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {{ id: string }} who
 * @param {string} title
 * @param {'persona' | 'grupo'} kind
 */
async function profile(m, who, title, kind = 'grupo') {
	const r = /** @type {any} */ (
		await m.perfiles.createProfile(t.db, who.id, { kind, title }, { now: NOW })
	);
	expect(r.ok).toBe(true);
	return r;
}

/**
 * Lo de siempre: une organizadore (colectivo-organiza), une facilitadore (persona-facilita),
 * alguien que gestiona un perfil ajeno al evento, una pregunta y dos órdenes con respuestas
 * (una confirmada y una sin pagar, que no se muestra).
 * @param {Awaited<ReturnType<typeof modules>>} m
 */
async function seed(m) {
	const organizer = await member(m, 'organiza-prueba');
	const facilitator = await member(m, 'facilita-prueba');
	const unrelated = await member(m, 'ajene-prueba');
	await profile(m, organizer, 'Colectivo Organiza');
	await profile(m, facilitator, 'Persona Facilita', 'persona');
	await profile(m, unrelated, 'Perfil Ajeno');
	const field = await m.signup.createField(
		t.db,
		SLUG,
		{ label: '¿Alguna alergia?', kind: 'text', required: false, options: [] },
		{ by: 'admin-de-prueba', now: NOW }
	);
	expect(field.ok).toBe(true);
	const fieldId = /** @type {any} */ (field).id;
	const config = /** @type {any} */ (m.config.parseTicketConfig(meta));
	/** @param {string} name @param {string} value */
	const buy = async (name, value) => {
		const r = await m.orders.reserveOrder(t.db, {
			eventSlug: SLUG,
			type: config.types[0],
			quantity: 1,
			holders: [{ name, pronouns: 'elle' }],
			buyer: {
				name,
				email: `${name.toLowerCase().replace(' ', '-')}@example.com`,
				dni: '30000000'
			},
			option: 'completo',
			method: 'transferencia',
			now: NOW,
			answers: [{ id: fieldId, label: '¿Alguna alergia?', value }]
		});
		expect(r.ok).toBe(true);
		return /** @type {any} */ (r).order.id;
	};
	const paid = await buy('Compradore Uno', 'Al maní');
	await buy('Compradore Dos', 'Sin pagar todavía');
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(paid).run();
	return { organizer, facilitator, unrelated };
}

describe('quién ve las respuestas', () => {
	it('une organizadore ve las respuestas de su evento (sin mail) y baja el CSV; queda registrado', async () => {
		const m = await modules();
		const { organizer } = await seed(m);
		const data = /** @type {any} */ (await m.page.load(fakeEvent({ member: organizer })));
		expect(data.event).toMatchObject({ slug: SLUG, title: 'Taller de prueba' });
		expect(data.columns).toEqual([{ id: expect.any(Number), label: '¿Alguna alergia?' }]);
		// Solo la orden confirmada; nada de mails, teléfonos ni DNI.
		expect(data.rows).toEqual([{ name: 'Compradore Uno', values: ['Al maní'] }]);
		expect(JSON.stringify(data)).not.toMatch(/@example\.com|30000000/);

		const res = await m.csv.GET(fakeEvent({ member: organizer }));
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		// (res.text() ya saca el BOM del principio.)
		const text = await res.text();
		expect(text).toBe('nombre,¿Alguna alergia?\r\nCompradore Uno,Al maní\r\n');

		const { results } = await t.db
			.prepare(
				"SELECT summary, detail FROM admin_audit WHERE action = 'signup_answers.view' ORDER BY id"
			)
			.all();
		expect(results.map((r) => r.summary)).toEqual([
			'«Colectivo Organiza» vio las respuestas de inscripción de «Taller de prueba»',
			'«Colectivo Organiza» bajó en CSV las respuestas de inscripción de «Taller de prueba»'
		]);
		expect(String(results[0].detail)).not.toMatch(/maní|example\.com/);
	});

	it('la página del perfil lista los eventos que organiza (y nada para otros perfiles)', async () => {
		const m = await modules();
		const { organizer, facilitator } = await seed(m);
		const mine = /** @type {any} */ (
			await m.profilePage.load(
				fakeEvent({
					member: organizer,
					path: '/mi-rincon/perfiles/colectivo-organiza'
				})
			)
		);
		expect(mine.organizes).toEqual([
			{ slug: SLUG, title: 'Taller de prueba', start: '2099-12-01T20:00-03:00' }
		]);
		const theirs = /** @type {any} */ (
			await m.profilePage.load(
				fakeEvent({
					member: facilitator,
					profile: 'persona-facilita',
					path: '/mi-rincon/perfiles/persona-facilita'
				})
			)
		);
		expect(theirs.organizes).toEqual([]);
	});

	it('quien gestiona un perfil con otro rol (Facilita) recibe 404, en la página y en el CSV', async () => {
		const m = await modules();
		const { facilitator } = await seed(m);
		const e = () => fakeEvent({ member: facilitator, profile: 'persona-facilita' });
		expect((await thrown(() => m.page.load(e())))?.status).toBe(404);
		expect((await thrown(() => m.csv.GET(e())))?.status).toBe(404);
	});

	it('quien gestiona un perfil ajeno al evento recibe 404 (con su perfil o con el de otre)', async () => {
		const m = await modules();
		const { unrelated, organizer } = await seed(m);
		for (const profileSlug of ['perfil-ajeno', 'colectivo-organiza']) {
			const e = () => fakeEvent({ member: unrelated, profile: profileSlug });
			expect((await thrown(() => m.page.load(e())))?.status).toBe(404);
			expect((await thrown(() => m.csv.GET(e())))?.status).toBe(404);
		}
		// Un evento que no existe da lo mismo que uno sin permiso.
		expect(
			(await thrown(() => m.page.load(fakeEvent({ member: organizer, event: 'no-existe' }))))
				?.status
		).toBe(404);
	});

	it('sin sesión lleva a /ingresar y vuelve a la misma página', async () => {
		const m = await modules();
		await seed(m);
		const r = await thrown(() => m.page.load(fakeEvent()));
		expect(r).toMatchObject({
			status: 303,
			location: `/ingresar?next=${encodeURIComponent(`/mi-rincon/perfiles/colectivo-organiza/respuestas/${SLUG}`)}`
		});
		expect((await thrown(() => m.csv.GET(fakeEvent())))?.status).toBe(303);
	});

	it('les admins siguen viéndolas en Órdenes (todas, con el mail)', async () => {
		const m = await modules();
		await seed(m);
		const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
		const data = /** @type {any} */ (
			await m.ordenes.load(
				fakeEvent({ user: admin, profile: SLUG, path: `/admin/eventos/${SLUG}/ordenes` })
			)
		);
		const byName = Object.fromEntries(data.orders.map((/** @type {any} */ o) => [o.name, o]));
		expect(byName['Compradore Uno'].answers).toEqual([
			{ id: expect.any(Number), label: '¿Alguna alergia?', value: 'Al maní' }
		]);
		expect(byName['Compradore Dos'].answers[0].value).toBe('Sin pagar todavía');
		expect(byName['Compradore Uno'].email).toBe('compradore-uno@example.com');
	});

	it('un perfil oculto y sin aprobar sigue organizando: quien lo gestiona entra igual', async () => {
		const m = await modules();
		const { organizer } = await seed(m);
		await t.db
			.prepare(
				`UPDATE objects SET visibility = 'hidden', version = version + 1
				WHERE slug = 'colectivo-organiza'`
			)
			.run();
		const data = /** @type {any} */ (await m.page.load(fakeEvent({ member: organizer })));
		expect(data.rows).toHaveLength(1);
	});

	it('con el interruptor personas_eventos apagado: 404, y la página del perfil no lista nada', async () => {
		const m = await modules({ personas: '0' });
		const { organizer } = await seed(m);
		expect((await thrown(() => m.page.load(fakeEvent({ member: organizer }))))?.status).toBe(404);
		expect((await thrown(() => m.csv.GET(fakeEvent({ member: organizer }))))?.status).toBe(404);
		const mine = /** @type {any} */ (
			await m.profilePage.load(
				fakeEvent({
					member: organizer,
					path: '/mi-rincon/perfiles/colectivo-organiza'
				})
			)
		);
		expect(mine.organizes).toEqual([]);
	});
});

describe('límite del CSV', () => {
	it('hasta 10 por hora por cuenta (con la hora fija)', async () => {
		const m = await modules();
		const { limit, windowSeconds } = m.organiza.ORGANIZER_CSV_RATE_LIMIT;
		for (let i = 0; i < limit; i++) {
			expect((await m.organiza.organizerCsvAllowed(t.db, 'cuenta-a', NOW)).allowed).toBe(true);
		}
		expect((await m.organiza.organizerCsvAllowed(t.db, 'cuenta-a', NOW)).allowed).toBe(false);
		// Otra cuenta no comparte el límite; la ventana siguiente arranca de cero.
		expect((await m.organiza.organizerCsvAllowed(t.db, 'cuenta-b', NOW)).allowed).toBe(true);
		const next = NOW + windowSeconds * 1000;
		expect((await m.organiza.organizerCsvAllowed(t.db, 'cuenta-a', next)).allowed).toBe(true);
	});

	it('pasado el límite, el CSV responde 429 (y a quien no organiza, 404 igual)', async () => {
		const m = await modules();
		const { organizer, unrelated } = await seed(m);
		// El endpoint usa la hora de ahora: se la fija (solo `Date`; D1 sigue con sus timers).
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		try {
			const { limit } = m.organiza.ORGANIZER_CSV_RATE_LIMIT;
			for (let i = 0; i < limit; i++) {
				expect((await m.csv.GET(fakeEvent({ member: organizer }))).status).toBe(200);
			}
			expect((await thrown(() => m.csv.GET(fakeEvent({ member: organizer }))))?.status).toBe(429);
			expect(
				(await thrown(() => m.csv.GET(fakeEvent({ member: unrelated, profile: 'perfil-ajeno' }))))
					?.status
			).toBe(404);
		} finally {
			vi.useRealTimers();
		}
	});
});

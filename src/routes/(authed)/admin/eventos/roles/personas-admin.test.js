/**
 * Panel de personas en eventos y preguntas de inscripción (interruptor `personas_eventos`):
 * - Eventos › Roles y preguntas y la pestaña Preguntas: solo admins (sin sesión, 303 al
 *   login; sin permiso, 403) y, con el interruptor apagado, 404 (como si no existieran);
 * - roles y preguntas se guardan y quedan en Actividad;
 * - la compra pública pregunta, valida en el servidor y guarda las respuestas con la orden;
 * - las respuestas aparecen en el CSV de Órdenes; sin preguntas ni respuestas, el CSV es el de
 *   siempre.
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
	tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
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
import { listRoles } from '$lib/server/personas/roles.js';
import { ADD_ROLE_ACTION } from '$lib/utils/personasPicker.js';
import * as preguntas from '../[slug]/preguntas/+page.server.js';
import * as csv from '../[slug]/ordenes.csv/+server.js';

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

const on = () => setFlag(t.db, 'personas_eventos', true, { by: 'admin-de-prueba' });

/** @param {string} action */
const audit = async (action) =>
	(
		await t.db
			.prepare('SELECT actor_login, summary FROM admin_audit WHERE action = ?1 ORDER BY id')
			.bind(action)
			.all()
	).results;

const ROUTES = /** @type {const} */ ([
	['ajustes', ajustes, '/admin/eventos/roles'],
	['preguntas', preguntas, `/admin/eventos/${SLUG}/preguntas`]
]);

describe('solo admins, y solo con el interruptor', () => {
	it('sin sesión: 303 al login; sin permiso: 403 (load y cada action), y no cambia nada', async () => {
		await on();
		for (const [name, mod, path] of ROUTES) {
			const anon = await thrown(() => mod.load(fakeEvent({ path, user: null })));
			expect(anon?.status, name).toBe(303);
			expect(anon?.location, name).toContain('/login');
			expect((await thrown(() => mod.load(fakeEvent({ path, user: notAdmin }))))?.status).toBe(403);
			for (const [action, fn] of Object.entries(/** @type {any} */ (mod).actions)) {
				const form = { name: 'Rol de prueba', label: 'Pregunta de prueba', kind: 'text', id: '1' };
				const a = await thrown(() => fn(fakeEvent({ path, form, user: null })));
				expect(a?.status, `${name} ?/${action}`).toBe(303);
				const b = await thrown(() => fn(fakeEvent({ path, form, user: notAdmin })));
				expect(b?.status, `${name} ?/${action}`).toBe(403);
			}
		}
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM persona_roles').first())?.n).toBe(0);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM signup_fields').first())?.n).toBe(0);
	});

	it('apagado: 404 para admins también', async () => {
		for (const [name, mod, path] of ROUTES) {
			expect((await thrown(() => mod.load(fakeEvent({ path }))))?.status, name).toBe(404);
			for (const [action, fn] of Object.entries(/** @type {any} */ (mod).actions)) {
				const e = await thrown(() =>
					fn(fakeEvent({ path, form: { name: 'Rol de prueba', label: 'Pregunta', kind: 'text' } }))
				);
				expect(e?.status, `${name} ?/${action}`).toBe(404);
			}
		}
	});
});

describe('Eventos › Roles y preguntas', () => {
	it('agregar y sacar roles (los fijos no), con registro', async () => {
		await on();
		const added = await ajustes.actions.addRole(fakeEvent({ form: { name: 'Cuida la puerta' } }));
		expect(added).toEqual({
			role: { ok: true, name: 'Cuida la puerta', message: 'Rol «Cuida la puerta» agregado.' }
		});
		const dup = /** @type {any} */ (
			await ajustes.actions.addRole(fakeEvent({ form: { name: 'organiza' } }))
		);
		expect(dup.status).toBe(409);
		const data = /** @type {any} */ (await ajustes.load(fakeEvent()));
		expect(data.roles.at(-1)).toMatchObject({ name: 'Cuida la puerta', fixed: false });
		expect(data.roles.filter((/** @type {any} */ r) => r.fixed)).toHaveLength(9);
		const fixed = /** @type {any} */ (
			await ajustes.actions.removeRole(fakeEvent({ form: { name: 'Organiza' } }))
		);
		expect(fixed.status).toBe(400);
		await ajustes.actions.removeRole(fakeEvent({ form: { name: 'Cuida la puerta' } }));
		expect((await audit('persona_role.add'))[0]).toMatchObject({
			actor_login: admin.login,
			summary: 'Agregó el rol «Cuida la puerta»'
		});
		expect(await audit('persona_role.remove')).toHaveLength(1);
	});

	// «+ Nuevo rol…» de la sección Personas de los formularios llama a esta misma acción (con
	// fetch, `x-sveltekit-action`): mismos permisos, misma validación y mismo registro.
	it('crear un rol desde el formulario: queda elegible, en la página de Roles y en Actividad', async () => {
		await on();
		expect(ADD_ROLE_ACTION).toBe('/admin/eventos/roles?/addRole');
		const url = new URL(ADD_ROLE_ACTION, 'https://kinkyvibe.ar');
		expect(url.pathname).toBe('/admin/eventos/roles');
		expect(url.search.slice(2)).toBe('addRole');
		expect(typeof ajustes.actions[url.search.slice(2)]).toBe('function');

		const created = /** @type {any} */ (
			await ajustes.actions.addRole(fakeEvent({ form: { name: '  Cuida   la puerta ' } }))
		);
		// El formulario usa `name` para elegirlo en esa fila.
		expect(created.role).toMatchObject({ ok: true, name: 'Cuida la puerta' });
		const data = /** @type {any} */ (await ajustes.load(fakeEvent()));
		expect(data.roles.map((/** @type {any} */ r) => r.name)).toContain('Cuida la puerta');
		expect(await listRoles(t.db)).toContain('Cuida la puerta');
		expect((await audit('persona_role.add')).at(-1)).toMatchObject({
			actor_login: admin.login,
			summary: 'Agregó el rol «Cuida la puerta»'
		});

		// Repetido (sin importar mayúsculas), o uno fijo: 409 con el mensaje en voseo, sin registro.
		for (const name of ['cuida la puerta', 'ORGANIZA']) {
			const dup = /** @type {any} */ (await ajustes.actions.addRole(fakeEvent({ form: { name } })));
			expect(dup.status).toBe(409);
			expect(dup.data.role.ok).toBe(false);
			expect(dup.data.role.message).toMatch(/^«.+» ya está en la lista: elegilo de ahí\.$/);
		}
		const bad = /** @type {any} */ (
			await ajustes.actions.addRole(fakeEvent({ form: { name: '!' } }))
		);
		expect(bad.status).toBe(400);
		expect(bad.data.role.message).toBe(
			'Escribí un rol de 2 a 40 letras (letras, números, espacios y guiones).'
		);
		expect(await audit('persona_role.add')).toHaveLength(1);

		// Sin ser admin, nada (403), como cualquier acción del panel.
		const denied = await thrown(() =>
			ajustes.actions.addRole(fakeEvent({ form: { name: 'Otro rol' }, user: notAdmin }))
		);
		expect(denied?.status).toBe(403);
		expect(await listRoles(t.db)).not.toContain('Otro rol');
	});

	it('preguntas generales: se validan, se guardan y se borran', async () => {
		await on();
		const bad = /** @type {any} */ (
			await ajustes.actions.createField(fakeEvent({ form: { label: 'x', kind: 'choice' } }))
		);
		expect(bad.status).toBe(400);
		expect(Object.keys(bad.data.field.errors).sort()).toEqual(['label', 'options']);
		await ajustes.actions.createField(
			fakeEvent({
				form: {
					label: '¿Cómo te enteraste?',
					kind: 'choice',
					options: 'Instagram\nUna amistad',
					required: 'on'
				}
			})
		);
		const data = /** @type {any} */ (await ajustes.load(fakeEvent()));
		expect(data.fields).toHaveLength(1);
		expect(data.fields[0]).toMatchObject({
			kind: 'choice',
			required: true,
			options: ['Instagram', 'Una amistad']
		});
		await ajustes.actions.deleteField(fakeEvent({ form: { id: String(data.fields[0].id) } }));
		expect(/** @type {any} */ (await ajustes.load(fakeEvent())).fields).toEqual([]);
		expect((await audit('signup_field.delete'))[0].summary).toBe(
			'Borró la pregunta «¿Cómo te enteraste?» (general)'
		);
	});
});

describe('compra con preguntas, Órdenes y su CSV', () => {
	const path = `/admin/eventos/${SLUG}/preguntas`;
	const buyBody = {
		type: 'general',
		quantity: '1',
		name: 'Persona de Prueba',
		pronouns: 'elle',
		email: 'compra@example.com',
		dni: '30111222',
		method: 'transferencia',
		accept: 'on',
		holder_name_0: 'Persona de Prueba',
		holder_pronouns_0: 'elle'
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

	it('apagado: la compra no pregunta y el CSV queda como siempre', async () => {
		await transferInfo();
		const before = (await csvText()).split('\r\n')[0];
		const r = await thrown(() =>
			buyAction(fakeEvent({ path: `/calendario/${SLUG}/entradas`, form: buyBody }))
		);
		expect(r?.status).toBe(303);
		const header = (await csvText()).split('\r\n')[0];
		expect(header).toBe(before);
		expect(header.split(',').at(-1)).toBe('"confirmo"');
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM order_answers').first())?.n).toBe(0);
	});

	it('prendido: valida, guarda las respuestas con la orden y las muestra en el CSV', async () => {
		await on();
		await transferInfo();
		await preguntas.actions.createField(
			fakeEvent({
				path,
				form: { label: '¿Alguna restricción alimentaria?', kind: 'text', required: 'on' }
			})
		);
		await ajustes.actions.createField(
			fakeEvent({ form: { label: 'Quiero recibir novedades', kind: 'checkbox' } })
		);
		const loaded = /** @type {any} */ (await preguntas.load(fakeEvent({ path })));
		expect(loaded.own).toHaveLength(1);
		expect(loaded.general).toHaveLength(1);
		await preguntas.actions.setGeneral(
			fakeEvent({ path, form: { general: [String(loaded.general[0].id)] } })
		);
		const own = loaded.own[0].id;
		const general = loaded.general[0].id;

		// Falta la obligatoria: no se reserva nada.
		const missing = /** @type {any} */ (
			await buyAction(fakeEvent({ path: `/calendario/${SLUG}/entradas`, form: buyBody }))
		);
		expect(missing.status).toBe(400);
		expect(missing.data.buy.errors[fieldInputName(own)]).toBe('Completá esta respuesta.');
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n).toBe(0);

		const ok = await thrown(() =>
			buyAction(
				fakeEvent({
					path: `/calendario/${SLUG}/entradas`,
					form: { ...buyBody, [fieldInputName(own)]: 'Sin gluten', [fieldInputName(general)]: 'on' }
				})
			)
		);
		expect(ok?.status).toBe(303);
		const lines = (await csvText()).split('\r\n');
		expect(
			lines[0].endsWith('"confirmo","Quiero recibir novedades","¿Alguna restricción alimentaria?"')
		).toBe(true);
		expect(lines[1].endsWith(',"Sí","Sin gluten"')).toBe(true);
	});
});

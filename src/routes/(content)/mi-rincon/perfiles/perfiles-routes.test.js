/**
 * Páginas de perfiles (/mi-rincon/perfiles y /mi-rincon/perfiles/[slug]) con el interruptor
 * `cuentas` apagado y prendido. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

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

/** Módulos con la variable CUENTAS_ENABLED que se pida ('' = lo que diga la base). */
async function modules(flag = '') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CUENTAS_ENABLED: flag } }));
	return {
		list: await import('./+page.server.js'),
		edit: await import('./[slug]/+page.server.js'),
		accounts: await import('$lib/server/cuentas/accounts.js'),
		perfiles: await import('$lib/server/cuentas/perfiles.js')
	};
}

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, member?: { id: string, email: string } }} [o]
 */
function fakeEvent({ path = '/mi-rincon/perfiles', params = {}, form, member } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch,
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		}),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return event;
}

/**
 * Lo que tira (error o redirect de SvelteKit) una función, o `null` si no tira.
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

/** @param {Awaited<ReturnType<typeof modules>>} m @param {string} name */
async function member(m, name) {
	const a = await m.accounts.upsertVerifiedAccount(t.db, `${name}@example.com`);
	return { id: a.id, email: a.email };
}

describe('interruptor apagado', () => {
	it('las páginas de perfiles y sus actions dan 404 y no escriben nada', async () => {
		const m = await modules('');
		const me = await member(m, 'persona-prueba');
		expect((await thrown(() => m.list.load(fakeEvent({ member: me }))))?.status).toBe(404);
		const create = fakeEvent({ member: me, form: { kind: 'persona', title: 'Nombre Inventado' } });
		expect((await thrown(() => m.list.actions.crear(create)))?.status).toBe(404);
		const edit = fakeEvent({ member: me, params: { slug: 'nombre-inventado' } });
		expect((await thrown(() => m.edit.load(edit)))?.status).toBe(404);
		const save = fakeEvent({
			member: me,
			params: { slug: 'nombre-inventado' },
			form: { title: 'x', version: '1' }
		});
		expect((await thrown(() => m.edit.actions.guardar(save)))?.status).toBe(404);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM objects').first())?.n).toBe(0);
	});
});

describe('interruptor prendido', () => {
	it('sin sesión lleva a /ingresar y vuelve a la misma página', async () => {
		const m = await modules('1');
		const r = await thrown(() =>
			m.edit.load(fakeEvent({ path: '/mi-rincon/perfiles/algo', params: { slug: 'algo' } }))
		);
		expect(r).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fperfiles%2Falgo'
		});
	});

	it('crear, listar y editar; otra cuenta recibe 404 (como si no existiera)', async () => {
		const m = await modules('1');
		const me = await member(m, 'persona-prueba');
		const other = await member(m, 'otre-prueba');
		const r = await thrown(() =>
			m.list.actions.crear(
				fakeEvent({ member: me, form: { kind: 'persona', title: 'Nombre Inventado' } })
			)
		);
		expect(r).toMatchObject({
			status: 303,
			location: '/mi-rincon/perfiles/nombre-inventado?nuevo=1'
		});
		const list = /** @type {any} */ (await m.list.load(fakeEvent({ member: me })));
		expect(list.profiles).toEqual([
			{
				slug: 'nombre-inventado',
				title: 'Nombre Inventado',
				kind: 'persona',
				visibility: 'public',
				role: 'owner'
			}
		]);
		// Lo que va a la página no lleva ids de cuenta.
		expect(JSON.stringify(list)).not.toContain(me.id);

		const params = { slug: 'nombre-inventado' };
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(page.profile).toMatchObject({ title: 'Nombre Inventado', version: 1, kind: 'persona' });
		expect((await thrown(() => m.edit.load(fakeEvent({ member: other, params }))))?.status).toBe(
			404
		);
		const intruder = await thrown(() =>
			m.edit.actions.guardar(
				fakeEvent({ member: other, params, form: { title: 'Pisado', version: '1' } })
			)
		);
		expect(intruder?.status).toBe(404);

		const saved = await m.edit.actions.guardar(
			fakeEvent({ member: me, params, form: { title: 'Nombre Nuevo', version: '1', bio: 'Hola' } })
		);
		expect(saved).toEqual({ action: 'guardar', message: 'Guardado.' });
	});

	it('conflicto de versión: 409 con el aviso y lo que la persona escribió', async () => {
		const m = await modules('1');
		const me = await member(m, 'persona-prueba');
		const created = await m.perfiles.createProfile(t.db, me.id, {
			kind: 'grupo',
			title: 'Grupo Inventado'
		});
		expect(created.ok).toBe(true);
		const params = { slug: 'grupo-inventado' };
		await m.edit.actions.guardar(
			fakeEvent({ member: me, params, form: { title: 'Primero', version: '1' } })
		);
		const late = /** @type {any} */ (
			await m.edit.actions.guardar(
				fakeEvent({
					member: me,
					params,
					form: { title: 'Segundo', version: '1', bio: 'lo mío', show_members: 'on' }
				})
			)
		);
		expect(late.status).toBe(409);
		expect(late.data).toMatchObject({
			action: 'guardar',
			error: m.perfiles.MESSAGES.conflict,
			conflict: true,
			draft: { title: 'Segundo', bio: 'lo mío', show_members: true }
		});
		expect(late.data.error).toMatch(/^Alguien lo cambió mientras tanto/);
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(page.profile).toMatchObject({ title: 'Primero', version: 2 });
	});

	it('invitar: la misma respuesta haya o no cuenta; el aviso va a waitUntil, después de responder', async () => {
		const m = await modules('1');
		const me = await member(m, 'dueñe-prueba');
		const other = await member(m, 'gestora-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'grupo', title: 'Grupo Inventado' });
		const params = { slug: 'grupo-inventado' };
		/** @type {Promise<unknown>[]} */
		const background = [];
		const invite = async (/** @type {string} */ email) => {
			const event = fakeEvent({ member: me, params, form: { email } });
			event.platform = {
				...t.platform,
				ctx: { waitUntil: (/** @type {Promise<unknown>} */ p) => background.push(p) }
			};
			return m.edit.actions.invitar(event);
		};
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const withAccount = await invite(other.email);
		const without = await invite('nadie@example.com');
		expect(withAccount).toEqual({ action: 'invitar', message: m.perfiles.MESSAGES.invited });
		expect(without).toEqual(withAccount);
		expect(background).toHaveLength(2);
		// Sin RESEND_API_KEY (y en dev) el mail se simula; sin cuenta ni se intenta.
		expect(await Promise.all(background)).toEqual(['simulated', 'skipped']);
		log.mockRestore();
	});

	it('integrantes: el grupo suma, la persona lo ve en Perfiles y sale con un clic; no la vuelven a sumar', async () => {
		const m = await modules('1');
		const me = await member(m, 'dueñe-prueba');
		const person = await member(m, 'persona-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'grupo', title: 'Grupo Inventado' });
		await m.perfiles.createProfile(t.db, person.id, {
			kind: 'persona',
			title: 'Persona Inventada'
		});
		const params = { slug: 'grupo-inventado' };
		const add = () =>
			m.edit.actions.sumarIntegrante(
				fakeEvent({ member: me, params, form: { persona: 'persona-inventada' } })
			);
		expect(await add()).toMatchObject({ action: 'integrantes' });
		// Alguien que no gestiona el grupo: 404, como si no existiera.
		const intruder = await thrown(() =>
			m.edit.actions.sumarIntegrante(
				fakeEvent({ member: person, params, form: { persona: 'persona-inventada' } })
			)
		);
		expect(intruder?.status).toBe(404);

		const list = /** @type {any} */ (await m.list.load(fakeEvent({ member: person })));
		expect(list.memberships).toEqual([
			{
				groupId: expect.any(Number),
				groupTitle: 'Grupo Inventado',
				personaSlug: 'persona-inventada',
				personaTitle: 'Persona Inventada'
			}
		]);
		const left = await m.list.actions.salirGrupo(
			fakeEvent({
				member: person,
				form: { persona: 'persona-inventada', group: String(list.memberships[0].groupId) }
			})
		);
		expect(left).toEqual({ action: 'grupos', message: 'Listo: ya no sos parte de ese grupo.' });
		const after = /** @type {any} */ (await m.list.load(fakeEvent({ member: person })));
		expect(after.memberships).toEqual([]);
		const again = /** @type {any} */ (await add());
		expect(again.status).toBe(409);
		expect(again.data).toMatchObject({ error: m.perfiles.MESSAGES.recentlyLeft });
	});

	it('borrar pide escribir el nombre en la página', async () => {
		const m = await modules('1');
		const me = await member(m, 'persona-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'persona', title: 'Nombre Inventado' });
		const params = { slug: 'nombre-inventado' };
		const no = /** @type {any} */ (
			await m.edit.actions.borrar(
				fakeEvent({ member: me, params, form: { confirm: 'otra cosa', version: '1' } })
			)
		);
		expect(no.status).toBe(400);
		const yes = await thrown(() =>
			m.edit.actions.borrar(
				fakeEvent({ member: me, params, form: { confirm: ' nombre inventado ', version: '1' } })
			)
		);
		expect(yes).toMatchObject({ status: 303, location: '/mi-rincon/perfiles' });
		expect((await thrown(() => m.edit.load(fakeEvent({ member: me, params }))))?.status).toBe(404);
	});
});

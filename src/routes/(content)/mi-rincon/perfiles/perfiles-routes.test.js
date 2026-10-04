/**
 * Páginas de perfiles (/mi-rincon/perfiles y /mi-rincon/perfiles/[slug]). El interruptor
 * `cuentas` quedó prendido para siempre: se fue el caso «apagado». D1 de miniflare; datos
 * inventados.
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

/** Los módulos, recién cargados (sin variables de entorno). */
async function modules() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	return {
		rincon: await import('../+page.server.js'),
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

/**
 * Una cuenta con sesión. Por defecto con el permiso "puede tener perfiles" (migración 0015);
 * `{ profiles: false }` la deja como nace, sin permiso.
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {string} name
 * @param {{ profiles?: boolean }} [o]
 */
async function member(m, name, { profiles = true } = {}) {
	const a = await m.accounts.upsertVerifiedAccount(t.db, `${name}@example.com`);
	if (profiles) {
		await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	}
	return { id: a.id, email: a.email };
}

describe('perfiles de la cuenta', () => {
	it('sin sesión lleva a /ingresar y vuelve a la misma página', async () => {
		const m = await modules();
		const r = await thrown(() =>
			m.edit.load(fakeEvent({ path: '/mi-rincon/perfiles/algo', params: { slug: 'algo' } }))
		);
		expect(r).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fperfiles%2Falgo'
		});
	});

	it('crear, listar y editar; otra cuenta recibe 404 (como si no existiera)', async () => {
		const m = await modules();
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
				role: 'owner',
				review: 'pending',
				rejectReason: ''
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
		const m = await modules();
		const me = await member(m, 'persona-prueba');
		const created = await m.perfiles.createProfile(t.db, me.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado'
		});
		expect(created.ok).toBe(true);
		const params = { slug: 'proyecto-inventado' };
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
		const m = await modules();
		const me = await member(m, 'dueñe-prueba');
		const other = await member(m, 'gestora-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const params = { slug: 'proyecto-inventado' };
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

	it('integrantes: el proyecto invita, la persona acepta o rechaza en Perfiles y sale con un clic', async () => {
		const m = await modules();
		const me = await member(m, 'dueñe-prueba');
		const person = await member(m, 'persona-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		await m.perfiles.createProfile(t.db, me.id, { kind: 'proyecto', title: 'Otro Proyecto' });
		await m.perfiles.createProfile(t.db, person.id, {
			kind: 'persona',
			title: 'Persona Inventada'
		});
		const params = { slug: 'proyecto-inventado' };
		const invite = (slug = 'proyecto-inventado') =>
			m.edit.actions.invitarIntegrante(
				fakeEvent({ member: me, params: { slug }, form: { persona: 'persona-inventada' } })
			);
		expect(await invite()).toEqual({
			action: 'integrantes',
			message: m.perfiles.MESSAGES.memberInvited
		});
		// Alguien que no gestiona el proyecto: 404, como si no existiera.
		const intruder = await thrown(() =>
			m.edit.actions.invitarIntegrante(
				fakeEvent({ member: person, params, form: { persona: 'persona-inventada' } })
			)
		);
		expect(intruder?.status).toBe(404);
		// Quien gestiona la ve pendiente; todavía no es integrante.
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(page.members).toEqual([]);
		expect(page.pendingMembers.map((/** @type {any} */ p) => p.slug)).toEqual([
			'persona-inventada'
		]);

		const list = /** @type {any} */ (await m.list.load(fakeEvent({ member: person })));
		expect(list.memberships).toEqual([]);
		expect(list.noGroupInvites).toBe(false);
		expect(list.memberInvites).toEqual([
			{
				groupId: expect.any(Number),
				groupTitle: 'Proyecto Inventado',
				personaSlug: 'persona-inventada',
				personaTitle: 'Persona Inventada'
			}
		]);
		const form = { persona: 'persona-inventada', group: String(list.memberInvites[0].groupId) };
		expect(await m.list.actions.aceptarGrupo(fakeEvent({ member: person, form }))).toMatchObject({
			action: 'proyectos'
		});
		const joined = /** @type {any} */ (await m.list.load(fakeEvent({ member: person })));
		expect(joined.memberInvites).toEqual([]);
		expect(joined.memberships).toHaveLength(1);
		const left = await m.list.actions.salirGrupo(fakeEvent({ member: person, form }));
		expect(left).toEqual({
			action: 'proyectos',
			message: 'Listo: ya no sos parte de ese proyecto.'
		});
		const again = /** @type {any} */ (await invite());
		expect(again.status).toBe(409);
		expect(again.data).toMatchObject({ error: m.perfiles.MESSAGES.recentlyLeft });

		// Otro proyecto: rechaza.
		await invite('otro-proyecto');
		const other = /** @type {any} */ (await m.list.load(fakeEvent({ member: person })));
		const rejected = await m.list.actions.rechazarGrupo(
			fakeEvent({
				member: person,
				form: { persona: 'persona-inventada', group: String(other.memberInvites[0].groupId) }
			})
		);
		expect(rejected).toMatchObject({ action: 'proyectos' });
		expect(/** @type {any} */ (await invite('otro-proyecto')).status).toBe(409);
	});

	it('"No recibir invitaciones de proyectos" desde Perfiles', async () => {
		const m = await modules();
		const me = await member(m, 'dueñe-prueba');
		const person = await member(m, 'persona-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		await m.perfiles.createProfile(t.db, person.id, {
			kind: 'persona',
			title: 'Persona Inventada'
		});
		const off = await m.list.actions.invitacionesGrupos(
			fakeEvent({ member: person, form: { recibir: 'no' } })
		);
		expect(off).toMatchObject({ action: 'invitacionesGrupos' });
		const res = await m.edit.actions.invitarIntegrante(
			fakeEvent({
				member: me,
				params: { slug: 'proyecto-inventado' },
				form: { persona: 'persona-inventada' }
			})
		);
		expect(res).toEqual({ action: 'integrantes', message: m.perfiles.MESSAGES.memberInvited });
		const list = /** @type {any} */ (await m.list.load(fakeEvent({ member: person })));
		expect(list).toMatchObject({ noGroupInvites: true, memberInvites: [] });
		await m.list.actions.invitacionesGrupos(fakeEvent({ member: person, form: { recibir: 'si' } }));
		expect(
			/** @type {any} */ (await m.list.load(fakeEvent({ member: person }))).noGroupInvites
		).toBe(false);
	});

	it('acciones de dueñes y borrar un proyecto: piden un código fresco de proyecto', async () => {
		const m = await modules();
		const me = await member(m, 'dueñe-prueba');
		const other = await member(m, 'gestora-prueba');
		const created = await m.perfiles.createProfile(t.db, me.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado'
		});
		if (!created.ok) throw new Error('no se creó');
		const params = { slug: created.profile.slug };
		await m.perfiles.inviteManager(t.db, me.id, params.slug, other.email);
		const [inv] = await m.perfiles.myInvites(t.db, other.id);
		await m.perfiles.answerInvite(t.db, other.id, inv.id, true);
		/** @param {Record<string, string>} form @param {{ id: string, email: string }} [who] */
		const ev = (form, who = me) => fakeEvent({ member: who, params, form });

		/** Pide el código (en tests sale en la consola, como en `vite dev` sin Resend). */
		const askCode = async (donde = 'gestion') => {
			/** @type {string[]} */
			const logged = [];
			const log = vi.spyOn(console, 'log').mockImplementation((...a) => {
				logged.push(a.join(' '));
			});
			let res;
			try {
				res = await m.edit.actions.confirmar(ev({ donde }));
			} finally {
				log.mockRestore();
			}
			expect(res).toEqual({
				action: donde,
				codeSentFor: 'grupo',
				message: 'Te mandamos un código a tu mail para confirmar.'
			});
			return logged.join('\n').match(/Código \(grupo\): (\d{6})/)?.[1] ?? '';
		};

		const role = { account: other.id, role: 'owner' };
		expect(/** @type {any} */ (await m.edit.actions.rol(ev(role))).data).toMatchObject({
			error: m.perfiles.MESSAGES.needsCode
		});
		// Une manager no puede pedir el código.
		expect(
			/** @type {any} */ (await m.edit.actions.confirmar(ev({ donde: 'gestion' }, other))).status
		).toBe(403);
		const code = await askCode();
		expect(code).toMatch(/^\d{6}$/);
		const wrong = /** @type {any} */ (
			await m.edit.actions.rol(ev({ ...role, code: code === '000000' ? '111111' : '000000' }))
		);
		expect(wrong.status).toBe(400);
		expect(wrong.data).toMatchObject({ action: 'gestion', codeSentFor: 'grupo' });
		expect(await m.edit.actions.rol(ev({ ...role, code }))).toEqual({
			action: 'gestion',
			message: 'Listo.'
		});
		expect((await m.perfiles.getManagedProfile(t.db, other.id, params.slug))?.role).toBe('owner');
		// Un solo uso.
		expect(
			/** @type {any} */ (await m.edit.actions.sacar(ev({ account: other.id, code }))).status
		).toBe(400);

		// Borrar el proyecto: nombre y código.
		const version = String(
			(await m.perfiles.getManagedProfile(t.db, me.id, params.slug))?.profile.version
		);
		const noCode = /** @type {any} */ (
			await m.edit.actions.borrar(ev({ confirm: 'Proyecto Inventado', version }))
		);
		expect(noCode.data).toMatchObject({ error: m.perfiles.MESSAGES.needsCode });
		const deleteCode = await askCode('borrar');
		const done = await thrown(() =>
			m.edit.actions.borrar(ev({ confirm: 'proyecto inventado', version, code: deleteCode }))
		);
		expect(done).toMatchObject({ status: 303, location: '/mi-rincon/perfiles' });
	});

	it('borrar pide escribir el nombre en la página', async () => {
		const m = await modules();
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

describe('sin el permiso "puede tener perfiles"', () => {
	/** @param {string} id @param {boolean} on */
	const setPermission = (id, on) =>
		t.db
			.prepare('UPDATE accounts SET can_have_profiles = ?2 WHERE id = ?1')
			.bind(id, on ? 1 : 0)
			.run();

	it('Mi rincón no muestra perfiles; las páginas y todas sus actions dan 404 y no escriben nada', async () => {
		const m = await modules();
		const me = await member(m, 'persona-prueba');
		await m.perfiles.createProfile(t.db, me.id, { kind: 'persona', title: 'Nombre Inventado' });
		await m.perfiles.createProfile(t.db, me.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const withIt = /** @type {any} */ (
			await m.rincon.load(fakeEvent({ path: '/mi-rincon', member: me }))
		);
		expect(withIt.canHaveProfiles).toBe(true);

		await setPermission(me.id, false);
		const rincon = /** @type {any} */ (
			await m.rincon.load(fakeEvent({ path: '/mi-rincon', member: me }))
		);
		expect(rincon.canHaveProfiles).toBe(false);

		const before = await t.db
			.prepare('SELECT id, title, version, visibility, deleted_at FROM objects ORDER BY id')
			.all();
		expect((await thrown(() => m.list.load(fakeEvent({ member: me }))))?.status).toBe(404);
		const form = {
			kind: 'persona',
			title: 'Otro Nombre',
			invite: crypto.randomUUID(),
			persona: 'nombre-inventado',
			group: '1',
			recibir: 'no'
		};
		for (const [name, action] of Object.entries(m.list.actions)) {
			const r = await thrown(() => action(fakeEvent({ member: me, form })));
			expect(r?.status, `?/${name}`).toBe(404);
		}
		for (const slug of ['nombre-inventado', 'proyecto-inventado']) {
			const params = { slug };
			const path = `/mi-rincon/perfiles/${slug}`;
			expect(
				(await thrown(() => m.edit.load(fakeEvent({ path, member: me, params }))))?.status
			).toBe(404);
			const editForm = {
				title: 'Pisado',
				version: '1',
				confirm: slug === 'proyecto-inventado' ? 'Proyecto Inventado' : 'Nombre Inventado',
				email: 'otra-persona@example.com',
				persona: 'nombre-inventado',
				account: me.id,
				role: 'owner',
				group: '1',
				lugar: 'gestion'
			};
			for (const [name, action] of Object.entries(m.edit.actions)) {
				const r = await thrown(() =>
					action(fakeEvent({ path, member: me, params, form: editForm }))
				);
				expect(r?.status, `${slug} ?/${name}`).toBe(404);
			}
		}
		const after = await t.db
			.prepare('SELECT id, title, version, visibility, deleted_at FROM objects ORDER BY id')
			.all();
		expect(after.results).toEqual(before.results);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM profile_invites').first())?.n).toBe(0);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM login_codes').first())?.n).toBe(0);
	});

	it('invitación a gestionar: quien invita recibe lo mismo; la cuenta sin permiso no la ve ni la acepta', async () => {
		const m = await modules();
		const owner = await member(m, 'dueñe-prueba');
		const withIt = await member(m, 'con-permiso-prueba');
		const without = await member(m, 'sin-permiso-prueba', { profiles: false });
		await m.perfiles.createProfile(t.db, owner.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado'
		});
		const params = { slug: 'proyecto-inventado' };
		/** @type {Promise<unknown>[]} */
		const background = [];
		const invite = (/** @type {string} */ email) => {
			const event = fakeEvent({ member: owner, params, form: { email } });
			event.platform = {
				...t.platform,
				ctx: { waitUntil: (/** @type {Promise<unknown>} */ p) => background.push(p) }
			};
			return m.edit.actions.invitar(event);
		};
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const a = await invite(withIt.email);
		const b = await invite(without.email);
		const c = await invite('nadie-prueba@example.com');
		expect(a).toEqual({ action: 'invitar', message: m.perfiles.MESSAGES.invited });
		expect(b).toEqual(a);
		expect(c).toEqual(a);
		// Sin RESEND_API_KEY el mail se simula; a la cuenta sin permiso no se le manda.
		expect(await Promise.all(background)).toEqual(['simulated', 'skipped', 'skipped']);
		log.mockRestore();

		// Quien gestiona ve las tres pendientes, igual que siempre.
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: owner, params })));
		expect(page.invites).toHaveLength(3);

		expect((await thrown(() => m.list.load(fakeEvent({ member: without }))))?.status).toBe(404);
		const hash = await m.accounts.emailHash(without.email);
		const row = await t.db
			.prepare('SELECT id FROM profile_invites WHERE email_hash = ?1')
			.bind(hash)
			.first();
		const accept = await thrown(() =>
			m.list.actions.aceptar(fakeEvent({ member: without, form: { invite: String(row?.id) } }))
		);
		expect(accept?.status).toBe(404);
		expect(
			(
				await t.db
					.prepare('SELECT COUNT(*) AS n FROM profile_managers WHERE account_id = ?1')
					.bind(without.id)
					.first()
			)?.n
		).toBe(0);
	});

	it('invitación a integrante: quien invita recibe lo mismo; sin permiso no se ve ni se acepta', async () => {
		const m = await modules();
		const owner = await member(m, 'dueñe-prueba');
		const keeps = await member(m, 'sigue-prueba');
		const loses = await member(m, 'pierde-prueba');
		await m.perfiles.createProfile(t.db, owner.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado'
		});
		await m.perfiles.createProfile(t.db, keeps.id, { kind: 'persona', title: 'Persona Sigue' });
		await m.perfiles.createProfile(t.db, loses.id, { kind: 'persona', title: 'Persona Pierde' });
		await setPermission(loses.id, false);
		const params = { slug: 'proyecto-inventado' };
		const invite = (/** @type {string} */ persona) =>
			m.edit.actions.invitarIntegrante(fakeEvent({ member: owner, params, form: { persona } }));
		const a = await invite('persona-sigue');
		const b = await invite('persona-pierde');
		expect(a).toEqual({ action: 'integrantes', message: m.perfiles.MESSAGES.memberInvited });
		expect(b).toEqual(a);
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: owner, params })));
		expect(page.pendingMembers.map((/** @type {any} */ p) => p.slug).sort()).toEqual([
			'persona-pierde',
			'persona-sigue'
		]);

		const list = /** @type {any} */ (await m.list.load(fakeEvent({ member: keeps })));
		expect(list.memberInvites.map((/** @type {any} */ i) => i.personaSlug)).toEqual([
			'persona-sigue'
		]);
		expect((await thrown(() => m.list.load(fakeEvent({ member: loses }))))?.status).toBe(404);
		const group = await t.db
			.prepare("SELECT id FROM objects WHERE slug = 'proyecto-inventado'")
			.first();
		const accept = await thrown(() =>
			m.list.actions.aceptarGrupo(
				fakeEvent({ member: loses, form: { persona: 'persona-pierde', group: String(group?.id) } })
			)
		);
		expect(accept?.status).toBe(404);
		expect(
			(
				await t.db
					.prepare("SELECT COUNT(*) AS n FROM edges WHERE kind = 'es_integrante_de'")
					.first()
			)?.n
		).toBe(0);
	});
});

describe('lugares desde Mi rincón (decisión de gorrite, 0022)', () => {
	it('crear un lugar, completar la dirección y ver que espera la aprobación', async () => {
		const m = await modules();
		const me = await member(m, 'carga-lugar');
		const r = await thrown(() =>
			m.list.actions.crear(
				fakeEvent({
					member: me,
					form: { kind: 'lugar', title: 'Sala Inventada', visibility: 'public' }
				})
			)
		);
		expect(r).toMatchObject({
			status: 303,
			location: '/mi-rincon/perfiles/sala-inventada?nuevo=1'
		});
		const params = { slug: 'sala-inventada' };
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(page.pending).toBe(true);
		expect(page.profile).toMatchObject({
			kind: 'lugar',
			venue: { address: '', venue_privacy: '' }
		});
		expect(page.memberships).toEqual([]);

		const saved = /** @type {any} */ (
			await m.edit.actions.guardar(
				fakeEvent({
					member: me,
					params,
					form: {
						title: 'Sala Inventada',
						version: String(page.profile.version),
						visibility: 'public',
						bio: 'Un espacio inventado.',
						links: '',
						pronouns: '',
						address: 'Calle Inventada 123',
						area: 'Barrio Inventado',
						city: 'Ciudad Inventada',
						accessibility: 'Sin escalones',
						how_to_get_there: '',
						venue_privacy: 'area'
					}
				})
			)
		);
		expect(saved).toMatchObject({ action: 'guardar', message: 'Guardado.' });
		const after = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(after.profile.venue).toEqual({
			address: 'Calle Inventada 123',
			area: 'Barrio Inventado',
			city: 'Ciudad Inventada',
			accessibility: 'Sin escalones',
			how_to_get_there: '',
			venue_privacy: 'area',
			// Sin ubicación en el mapa (el formulario no la mandó).
			lat: '',
			lng: ''
		});
		expect(after.pending).toBe(true);
		expect(after.rejection).toBeNull();
	});

	/**
	 * Crea un lugar desde Mi rincón y devuelve lo que hace falta para editarlo.
	 * @param {Awaited<ReturnType<typeof modules>>} m
	 * @param {{ id: string, email: string }} me
	 */
	async function createVenue(m, me) {
		await thrown(() =>
			m.list.actions.crear(
				fakeEvent({ member: me, form: { kind: 'lugar', title: 'Sala Inventada' } })
			)
		);
		const params = { slug: 'sala-inventada' };
		const page = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		return { params, page };
	}

	/**
	 * El formulario de guardar un lugar, con lo que se pida encima.
	 * @param {number} version
	 * @param {Record<string, string>} [extra]
	 */
	const venueForm = (version, extra = {}) => ({
		title: 'Sala Inventada',
		version: String(version),
		visibility: 'public',
		bio: '',
		links: '',
		pronouns: '',
		address: 'Calle Inventada 123',
		area: '',
		city: '',
		accessibility: '',
		how_to_get_there: '',
		venue_privacy: '',
		...extra
	});

	it('la cuenta carga la ubicación en el mapa, con la misma validación que el panel', async () => {
		const m = await modules();
		const me = await member(m, 'carga-lugar');
		const { params, page } = await createVenue(m, me);
		const ok = /** @type {any} */ (
			await m.edit.actions.guardar(
				fakeEvent({
					member: me,
					params,
					form: venueForm(page.profile.version, { lat: '-34,6037', lng: '-58.3816' })
				})
			)
		);
		expect(ok).toMatchObject({ action: 'guardar', message: 'Guardado.' });
		const row = await t.db
			.prepare("SELECT data, version FROM objects WHERE slug = 'sala-inventada'")
			.first();
		// Se guardan como números (coma o punto), igual que desde el editor del panel.
		expect(JSON.parse(String(row?.data))).toMatchObject({ lat: -34.6037, lng: -58.3816 });
		const after = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(after.profile.venue).toMatchObject({ lat: '-34.6037', lng: '-58.3816' });

		// Fuera de rango, una sola, o algo que no es un número: no se guarda y se marca el campo.
		for (const [lat, lng, field] of [
			['-134', '-58.3816', 'lat'],
			['-34.6', '', 'lat'],
			['-34.6', 'lejos', 'lng']
		]) {
			const bad = /** @type {any} */ (
				await m.edit.actions.guardar(
					fakeEvent({ member: me, params, form: venueForm(Number(row?.version), { lat, lng }) })
				)
			);
			expect(bad.status).toBe(400);
			expect(Object.keys(bad.data.errors)).toContain(field);
			// Lo escrito vuelve al formulario.
			expect(bad.data.draft.venue).toMatchObject({ lat, lng });
		}
		const kept = await t.db
			.prepare("SELECT data FROM objects WHERE slug = 'sala-inventada'")
			.first();
		expect(JSON.parse(String(kept?.data))).toMatchObject({ lat: -34.6037, lng: -58.3816 });

		// Vacías: se saca la ubicación.
		const cleared = /** @type {any} */ (
			await m.edit.actions.guardar(
				fakeEvent({
					member: me,
					params,
					form: venueForm(Number(row?.version), { lat: '', lng: '' })
				})
			)
		);
		expect(cleared).toMatchObject({ message: 'Guardado.' });
		const empty = await t.db
			.prepare("SELECT data FROM objects WHERE slug = 'sala-inventada'")
			.first();
		expect(JSON.parse(String(empty?.data))).not.toHaveProperty('lat');
		expect(JSON.parse(String(empty?.data))).not.toHaveProperty('lng');
	});

	it('rechazado: quien lo cargó lo ve con el motivo y, si lo edita, vuelve a esperar', async () => {
		const m = await modules();
		const me = await member(m, 'carga-lugar');
		const other = await member(m, 'otre-prueba');
		const { params, page } = await createVenue(m, me);
		const { rejectPendingVenue, listPendingVenues } =
			await import('$lib/server/amigues/pendingVenues.js');
		const id = Number(
			(await t.db.prepare("SELECT id FROM objects WHERE slug = 'sala-inventada'").first())?.id
		);
		const r = await rejectPendingVenue(t.db, id, {
			by: 'admin-de-prueba',
			reason: 'Falta la dirección completa'
		});
		expect(r.ok).toBe(true);
		expect(await listPendingVenues(t.db)).toEqual([]);

		// En Mi rincón → Perfiles, con el motivo (no se borró).
		const list = /** @type {any} */ (await m.list.load(fakeEvent({ member: me })));
		expect(list.profiles).toEqual([
			expect.objectContaining({
				slug: 'sala-inventada',
				review: 'rejected',
				rejectReason: 'Falta la dirección completa'
			})
		]);
		// Lo que va a la página no dice qué admin lo rechazó.
		expect(JSON.stringify(list)).not.toContain('admin-de-prueba');
		const rejectedPage = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(rejectedPage.pending).toBe(false);
		expect(rejectedPage.rejection).toMatchObject({ reason: 'Falta la dirección completa' });
		expect(JSON.stringify(rejectedPage)).not.toContain('admin-de-prueba');

		// Otra cuenta: ni el lugar ni el motivo existen para ella, y no lo puede editar ni mandar.
		expect((await thrown(() => m.edit.load(fakeEvent({ member: other, params }))))?.status).toBe(
			404
		);
		const intruder = await thrown(() =>
			m.edit.actions.guardar(
				fakeEvent({ member: other, params, form: venueForm(page.profile.version) })
			)
		);
		expect(intruder?.status).toBe(404);
		const intruderResubmit = await thrown(() =>
			m.edit.actions.volverAMandar(fakeEvent({ member: other, params, form: {} }))
		);
		expect(intruderResubmit?.status).toBe(404);
		// Una cuenta sin el permiso de perfiles, tampoco.
		const noPerm = await member(m, 'sin-permiso', { profiles: false });
		expect(
			(
				await thrown(() =>
					m.edit.actions.volverAMandar(fakeEvent({ member: noPerm, params, form: {} }))
				)
			)?.status
		).toBe(404);
		const otherList = /** @type {any} */ (await m.list.load(fakeEvent({ member: other })));
		expect(otherList.profiles).toEqual([]);
		expect(JSON.stringify(otherList)).not.toContain('Falta la dirección');
		expect(await listPendingVenues(t.db)).toEqual([]);

		// Quien lo cargó lo corrige: se guarda, pero sigue rechazado (decisión de gorrite).
		const saved = /** @type {any} */ (
			await m.edit.actions.guardar(
				fakeEvent({ member: me, params, form: venueForm(page.profile.version) })
			)
		);
		expect(saved).toMatchObject({ action: 'guardar', message: 'Guardado.' });
		expect(await listPendingVenues(t.db)).toEqual([]);
		const edited = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(edited.pending).toBe(false);
		expect(edited.rejection).toMatchObject({ reason: 'Falta la dirección completa' });
		const countResubmits = async () =>
			(
				await t.db
					.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'profile.resubmit'")
					.first()
			)?.n;
		expect(await countResubmits()).toBe(0);

		// «Volver a mandar»: vuelve a "Para aprobar" y queda en Actividad.
		const resent = /** @type {any} */ (
			await m.edit.actions.volverAMandar(fakeEvent({ member: me, params, form: {} }))
		);
		expect(resent).toMatchObject({ action: 'revision' });
		expect((await listPendingVenues(t.db)).map((v) => v.id)).toEqual([id]);
		const again = /** @type {any} */ (await m.edit.load(fakeEvent({ member: me, params })));
		expect(again.pending).toBe(true);
		expect(again.rejection).toBeNull();
		const audit = await t.db
			.prepare("SELECT target_id FROM admin_audit WHERE action = 'profile.resubmit'")
			.all();
		expect(audit.results).toEqual([{ target_id: String(id) }]);

		// Otra vez (ya no está rechazado): 409 y no se vuelve a anunciar.
		const twice = /** @type {any} */ (
			await m.edit.actions.volverAMandar(fakeEvent({ member: me, params, form: {} }))
		);
		expect(twice.status).toBe(409);
		expect(await countResubmits()).toBe(1);
	});

	it('«Volver a mandar» es solo para lugares', async () => {
		const m = await modules();
		const me = await member(m, 'persona-prueba');
		await thrown(() =>
			m.list.actions.crear(
				fakeEvent({ member: me, form: { kind: 'persona', title: 'Nombre Inventado' } })
			)
		);
		const res = /** @type {any} */ (
			await m.edit.actions.volverAMandar(
				fakeEvent({ member: me, params: { slug: 'nombre-inventado' }, form: {} })
			)
		);
		expect(res.status).toBe(404);
	});

	it('el formulario de una persona no trae campos de lugar (no se guardan aunque se manden)', async () => {
		const m = await modules();
		const me = await member(m, 'persona-prueba');
		await thrown(() =>
			m.list.actions.crear(
				fakeEvent({ member: me, form: { kind: 'persona', title: 'Nombre Inventado' } })
			)
		);
		const params = { slug: 'nombre-inventado' };
		const saved = /** @type {any} */ (
			await m.edit.actions.guardar(
				fakeEvent({
					member: me,
					params,
					form: {
						title: 'Nombre Inventado',
						version: '1',
						visibility: 'public',
						address: 'Calle Inventada 123',
						venue_privacy: 'public'
					}
				})
			)
		);
		expect(saved).toMatchObject({ action: 'guardar', message: 'Guardado.' });
		const row = await t.db
			.prepare("SELECT data FROM objects WHERE slug = 'nombre-inventado'")
			.first();
		expect(JSON.parse(String(row?.data))).not.toHaveProperty('address');
	});
});

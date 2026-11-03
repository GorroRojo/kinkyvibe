/**
 * Panel → Cuentas (/admin/comunidad/cuentas, su ficha, Comunidad › Perfiles en /admin/comunidad/perfiles y la ficha de
 * cada perfil): solo admins (sin sesión,
 * redirect al login; sin permiso, 403), la búsqueda por mail, el permiso "puede tener perfiles"
 * (cambia y queda en Actividad), suspender una cuenta y levantar la suspensión, ocultar y borrar perfiles por saveObject() (con la versión) y
 * "Para revisar" / la actividad del Inicio. D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS, requireAdmin } from '$lib/server/auth';
import {
	canHaveProfiles,
	deleteAccount,
	emailHash,
	setPassword,
	upsertVerifiedAccount
} from '$lib/server/cuentas/accounts.js';
import { createLoginCode } from '$lib/server/cuentas/codes.js';
import { passwordLogin, verifyCode } from '$lib/server/cuentas/index.js';
import { createSession, getSessionAccount } from '$lib/server/cuentas/session.js';
import { consumeLinkCode, createLinkCode } from '$lib/server/telegram/link.js';
import { chatAccount } from '$lib/server/telegram/seguir.js';
import { sha256Hex } from '$lib/server/hash.js';
import { createProfile } from '$lib/server/cuentas/perfiles.js';
import { saveObject } from '$lib/server/objects/index.js';
import { countProfilesToReview, profilesToReview } from '$lib/server/admin/cuentas.js';
import { recentActivity } from '$lib/server/admin/inicio.js';
import * as list from './+page.server.js';
import * as detail from './[id]/+page.server.js';
import * as profiles from '../perfiles/+page.server.js';
import * as profile from './perfiles/[id]/+page.server.js';
import * as actividad from '../../ajustes/actividad/+page.server.js';

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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, user?: any, token?: string | null }} [o]
 */
function fakeEvent({ path = '/admin/comunidad/cuentas', params = {}, form, user, token } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: {
			user: user === undefined ? admin : user,
			user_token: token === undefined ? 'token-de-prueba' : token
		},
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
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

/** @param {string} name @param {{ profiles?: boolean }} [o] */
async function account(name, { profiles: allowed = false } = {}) {
	const a = await upsertVerifiedAccount(t.db, `${name}@example.com`);
	if (allowed) {
		await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	}
	return a;
}

/** Une cuenta con permiso y un perfil suyo. @param {string} title @param {'persona' | 'proyecto'} [kind] */
async function profileOf(title, kind = 'persona') {
	const a = await account(`cuenta-${title.toLowerCase().replace(/\W+/g, '-')}`, { profiles: true });
	const r = await createProfile(t.db, a.id, { kind, title });
	if (!r.ok) throw new Error(r.message);
	return { account: a, profile: r.profile };
}

/** @param {string} action */
const auditRows = async (action) =>
	(
		await t.db
			.prepare(
				'SELECT actor_login, target_type, target_id, summary, detail FROM admin_audit WHERE action = ?1 ORDER BY id'
			)
			.bind(action)
			.all()
	).results;

describe('solo admins', () => {
	const id = '00000000-0000-4000-8000-000000000000';
	/** @type {{ name: string, mod: any, params: Record<string, string> }[]} */
	const routes = [
		{ name: 'cuentas', mod: list, params: {} },
		{ name: 'ficha de cuenta', mod: detail, params: { id } },
		{ name: 'perfiles (/admin/comunidad/perfiles)', mod: profiles, params: {} },
		{ name: 'ficha de perfil', mod: profile, params: { id: '1' } }
	];

	it('sin sesión, cada load y cada action redirigen al login', async () => {
		for (const r of routes) {
			const e = await thrown(() =>
				r.mod.load(fakeEvent({ params: r.params, user: null, token: null }))
			);
			expect(e?.status, r.name).toBe(303);
			expect(e?.location, r.name).toContain('/login');
			for (const [name, action] of Object.entries(/** @type {any} */ (r.mod).actions ?? {})) {
				const a = await thrown(() =>
					action(fakeEvent({ params: r.params, form: { valor: '1' }, user: null, token: null }))
				);
				expect(a?.status, `${r.name} ?/${name}`).toBe(303);
			}
		}
	});

	it('une usuarie que no es admin recibe 403 en cada load y cada action, y no cambia nada', async () => {
		const a = await account('alguien-inventade');
		const { profile: p } = await profileOf('Perfil Inventado');
		const nope = { id: 1, login: 'no-admin' };
		for (const r of routes) {
			/** @type {Record<string, string>} */
			const params =
				r.mod === detail ? { id: a.id } : r.mod === profile ? { id: String(p.id) } : r.params;
			expect((await thrown(() => r.mod.load(fakeEvent({ params, user: nope }))))?.status).toBe(403);
			for (const [name, action] of Object.entries(/** @type {any} */ (r.mod).actions ?? {})) {
				const e = await thrown(() =>
					action(fakeEvent({ params, form: { valor: '1', version: '1' }, user: nope }))
				);
				expect(e?.status, `${r.name} ?/${name}`).toBe(403);
			}
		}
		expect(await canHaveProfiles(t.db, a.id)).toBe(false);
		const row = await t.db.prepare('SELECT version, visibility, deleted_at FROM objects').first();
		expect(row).toEqual({ version: 1, visibility: 'public', deleted_at: null });
		expect(
			(
				await t.db
					.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE actor_login = 'no-admin'")
					.first()
			)?.n
		).toBe(0);
	});
});

describe('Cuentas', () => {
	it('lista con mail, fechas, verificada, contraseña, perfiles, permiso y borradas; busca por mail', async () => {
		const { account: owner } = await profileOf('Persona Inventada');
		const plain = await account('sin-perfiles-inventade');
		const gone = await account('se-fue-inventade');
		await deleteAccount(t.db, gone.id);
		const data = /** @type {any} */ (await list.load(fakeEvent()));
		expect(data.totals).toEqual({
			total: 3,
			active: 2,
			withProfiles: 1,
			suspended: 0,
			deleted: 1
		});
		const byId = Object.fromEntries(data.accounts.map((/** @type {any} */ a) => [a.id, a]));
		expect(byId[owner.id]).toMatchObject({
			email: owner.email,
			verified: true,
			hasPassword: false,
			canHaveProfiles: true,
			profiles: 1,
			deletedAt: null
		});
		expect(byId[plain.id]).toMatchObject({ canHaveProfiles: false, profiles: 0 });
		expect(byId[gone.id]).toMatchObject({ email: null });
		expect(byId[gone.id].deletedAt).toBeTypeOf('number');

		const found = /** @type {any} */ (
			await list.load(fakeEvent({ path: '/admin/comunidad/cuentas?q=SIN-PERF' }))
		);
		expect(found.accounts.map((/** @type {any} */ a) => a.id)).toEqual([plain.id]);
		// Los comodines de LIKE se buscan como texto.
		const none = /** @type {any} */ (
			await list.load(fakeEvent({ path: '/admin/comunidad/cuentas?q=%25' }))
		);
		expect(none.accounts).toEqual([]);
	});

	it('la ficha muestra sus perfiles; un id inválido o desconocido da 404', async () => {
		const { account: owner, profile: p } = await profileOf('Persona Inventada');
		const data = /** @type {any} */ (await detail.load(fakeEvent({ params: { id: owner.id } })));
		expect(data.account).toMatchObject({ id: owner.id, email: owner.email, canHaveProfiles: true });
		expect(data.profiles).toEqual([
			expect.objectContaining({
				id: p.id,
				title: 'Persona Inventada',
				role: 'owner',
				kind: 'persona'
			})
		]);
		for (const id of ['no-es-un-id', crypto.randomUUID()]) {
			expect((await thrown(() => detail.load(fakeEvent({ params: { id } }))))?.status).toBe(404);
		}
	});

	it('el permiso: por defecto apagado; prenderlo y apagarlo anda y queda en Actividad (sin mail)', async () => {
		const a = await account('nueva-inventade');
		expect(await canHaveProfiles(t.db, a.id)).toBe(false);
		const toggle = (/** @type {string} */ valor) =>
			detail.actions.permiso(fakeEvent({ params: { id: a.id }, form: { valor } }));

		expect(await toggle('1')).toMatchObject({ permiso: { ok: true } });
		expect(await canHaveProfiles(t.db, a.id)).toBe(true);
		// Repetir no cambia nada ni anota de nuevo.
		expect(await toggle('1')).toMatchObject({ permiso: { ok: true } });
		expect(await toggle('0')).toMatchObject({ permiso: { ok: true } });
		expect(await canHaveProfiles(t.db, a.id)).toBe(false);

		const rows = await auditRows('account.profiles_permission');
		expect(rows).toEqual([
			{
				actor_login: admin.login,
				target_type: 'account',
				target_id: a.id,
				summary: 'Le dio a una cuenta el permiso para tener perfiles',
				detail: JSON.stringify({ canHaveProfiles: true })
			},
			{
				actor_login: admin.login,
				target_type: 'account',
				target_id: a.id,
				summary: 'Le sacó a una cuenta el permiso para tener perfiles',
				detail: JSON.stringify({ canHaveProfiles: false })
			}
		]);
		expect(JSON.stringify(rows)).not.toContain('@example.com');

		expect(/** @type {any} */ (await toggle('x')).status).toBe(400);
		await deleteAccount(t.db, a.id);
		expect(/** @type {any} */ (await toggle('1')).status).toBe(404);
		expect(await auditRows('account.profiles_permission')).toHaveLength(2);
	});
});

describe('Suspender una cuenta', () => {
	const SECRET = 'MOTIVO-PRIVADO-INVENTADO';
	/** @param {string} id @param {Record<string, string>} [form] @param {any} [extra] */
	const suspend = (id, form = { motivo: SECRET }, extra = {}) =>
		/** @type {Promise<any>} */ (
			detail.actions.suspender({ ...fakeEvent({ params: { id }, form }), ...extra })
		);
	/** @param {string} id */
	const unsuspend = (id) =>
		/** @type {Promise<any>} */ (
			detail.actions.levantarSuspension(fakeEvent({ params: { id }, form: {} }))
		);
	/** @param {string} table @param {string} id */
	const rowsOf = async (table, id) =>
		Number(
			(
				await t.db
					.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?1`)
					.bind(id)
					.first()
			)?.n
		);
	/** @param {string} id */
	const suspendedAt = async (id) =>
		(await t.db.prepare('SELECT suspended_at FROM accounts WHERE id = ?1').bind(id).first())
			?.suspended_at;
	/** @param {string} accountId @param {string} chatId */
	const linkChat = (accountId, chatId) =>
		t.db
			.prepare(
				'INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at) VALUES (?1, ?2, 1, 0, 1)'
			)
			.bind(accountId, chatId)
			.run();

	it('cierra todas sus sesiones y su Telegram en el momento, sin tocar las de otras cuentas', async () => {
		const a = await account('suspendide-inventade');
		const other = await account('otra-inventade');
		const tokens = [
			await createSession(t.db, a.id, 'code'),
			await createSession(t.db, a.id, 'password')
		];
		const otherToken = await createSession(t.db, other.id, 'code');
		await linkChat(a.id, '111');
		const link = await createLinkCode(t.db, a.id);
		expect(link.ok).toBe(true);

		expect(await suspend(a.id)).toMatchObject({ suspension: { ok: true } });
		for (const token of tokens) expect(await getSessionAccount(t.db, token)).toBeNull();
		expect(await getSessionAccount(t.db, otherToken)).not.toBeNull();
		expect(await rowsOf('account_sessions', a.id)).toBe(0);
		expect(await rowsOf('telegram_chats', a.id)).toBe(0);
		expect(await rowsOf('telegram_link_codes', a.id)).toBe(0);

		// Una sesión que se cruzó (creada después) tampoco vale.
		expect(await getSessionAccount(t.db, await createSession(t.db, a.id, 'code'))).toBeNull();

		// Repetir no anota de nuevo.
		expect(await suspend(a.id)).toMatchObject({
			suspension: { ok: true, message: 'Esta cuenta ya estaba suspendida.' }
		});
		const rows = await auditRows('account.suspend');
		expect(rows).toEqual([
			{
				actor_login: admin.login,
				target_type: 'account',
				target_id: a.id,
				summary: 'Suspendió una cuenta',
				detail: JSON.stringify({ sessionsClosed: 2, telegramUnlinked: true })
			}
		]);
		// El motivo y el mail nunca van a Actividad.
		expect(JSON.stringify(rows)).not.toContain(SECRET);
		expect(JSON.stringify(rows)).not.toContain('@example.com');
	});

	it('no puede entrar por ningún camino (código, contraseña, Telegram) y al levantarla vuelve a entrar', async () => {
		const a = await account('bloqueade-inventade');
		const PW = 'una frase bastante larga';
		expect(await setPassword(t.db, a.id, PW, { iterations: 1000 })).toBeNull();
		await suspend(a.id);

		const code = async () => (await createLoginCode(t.db, await emailHash(a.email))).code;
		const client = 'cliente-de-prueba';
		expect(
			await verifyCode({ db: t.db, email: a.email, code: await code(), client })
		).toMatchObject({ ok: false, status: 403, suspended: true });
		expect(await passwordLogin({ db: t.db, email: a.email, password: PW, client })).toMatchObject({
			ok: false,
			status: 403,
			suspended: true
		});
		// Un código de vincular el bot que quedara vivo no sirve, y un chat vinculado no la reconoce.
		await t.db
			.prepare(
				'INSERT INTO telegram_link_codes (code_hash, account_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)'
			)
			.bind(await sha256Hex('ABCD2345'), a.id, Date.now(), Date.now() + 60_000)
			.run();
		expect(await consumeLinkCode(t.db, 'ABCD-2345', '222')).toEqual({
			ok: false,
			reason: 'invalid'
		});
		await linkChat(a.id, '333');
		expect(await chatAccount(t.db, '333')).toBeNull();

		expect(await unsuspend(a.id)).toMatchObject({ suspension: { ok: true } });
		expect(
			await verifyCode({ db: t.db, email: a.email, code: await code(), client })
		).toMatchObject({ ok: true, account: { id: a.id, suspended: false } });
		expect(await passwordLogin({ db: t.db, email: a.email, password: PW, client })).toMatchObject({
			ok: true
		});
		expect(await chatAccount(t.db, '333')).toBe(a.id);
		// Levantarla dos veces no anota de nuevo; el motivo se borra.
		expect(await unsuspend(a.id)).toMatchObject({
			suspension: { ok: true, message: 'Esta cuenta no estaba suspendida.' }
		});
		expect(await auditRows('account.unsuspend')).toEqual([
			{
				actor_login: admin.login,
				target_type: 'account',
				target_id: a.id,
				summary: 'Levantó la suspensión de una cuenta',
				detail: null
			}
		]);
		const row = await t.db
			.prepare('SELECT suspended_at, suspended_by, suspended_reason FROM accounts WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row).toEqual({ suspended_at: null, suspended_by: null, suspended_reason: null });
	});

	it('la ficha muestra el motivo (solo a admins) y la lista la marca «Suspendida», sin el motivo', async () => {
		const a = await account('marcade-inventade');
		await suspend(a.id);
		const data = /** @type {any} */ (await detail.load(fakeEvent({ params: { id: a.id } })));
		expect(data.account).toMatchObject({ suspendedBy: admin.login, suspendedReason: SECRET });
		expect(data.account.suspendedAt).toBeTypeOf('number');
		const listed = /** @type {any} */ (await list.load(fakeEvent()));
		expect(listed.totals.suspended).toBe(1);
		const row = listed.accounts.find((/** @type {any} */ x) => x.id === a.id);
		expect(row.suspendedAt).toBeTypeOf('number');
		expect(JSON.stringify(listed)).not.toContain(SECRET);
	});

	it('sin motivo también anda; el motivo se recorta', async () => {
		const a = await account('sin-motivo-inventade');
		expect(await suspend(a.id, {})).toMatchObject({ suspension: { ok: true } });
		const b = await account('motivo-largo-inventade');
		await suspend(b.id, { motivo: `  ${'x'.repeat(800)}  ` });
		const reasons = Object.fromEntries(
			(
				await t.db
					.prepare('SELECT id, suspended_reason FROM accounts WHERE id IN (?1, ?2)')
					.bind(a.id, b.id)
					.all()
			).results.map((r) => [r.id, r.suspended_reason])
		);
		expect(reasons[a.id]).toBeNull();
		expect(String(reasons[b.id])).toHaveLength(500);
	});

	it('une no admin no puede suspender ni levantar la suspensión', async () => {
		const a = await account('protegide-inventade');
		const nope = { id: 1, login: 'no-admin' };
		for (const action of [detail.actions.suspender, detail.actions.levantarSuspension]) {
			const e = await thrown(() =>
				action(fakeEvent({ params: { id: a.id }, form: { motivo: SECRET }, user: nope }))
			);
			expect(e?.status).toBe(403);
			const anon = await thrown(() =>
				action(fakeEvent({ params: { id: a.id }, form: {}, user: null, token: null }))
			);
			expect(anon?.status).toBe(303);
		}
		expect(await suspendedAt(a.id)).toBeNull();
		expect(await auditRows('account.suspend')).toEqual([]);
	});

	it('no te podés suspender a vos misme, y suspender cuentas nunca saca a une admin del panel', async () => {
		const a = await account('yo-misme-inventade');
		const locals = { ...fakeEvent().locals, member: { id: a.id, email: a.email } };
		const self = await suspend(a.id, { motivo: '' }, { locals });
		expect(self.status).toBe(400);
		expect(self.data.suspension.ok).toBe(false);
		expect(await suspendedAt(a.id)).toBeNull();
		// Les admins entran con GitHub (ADMINS), aparte de las cuentas del sitio: con cuentas
		// suspendidas, cada admin (también la última) sigue entrando al panel.
		await suspend(a.id);
		for (const adm of ADMINS) {
			const who = requireAdmin(
				/** @type {any} */ ({ user: { id: adm.id, login: adm.login }, user_token: 'x' }),
				new URL('https://kinkyvibe.ar/admin')
			);
			expect(who).toMatchObject({ id: adm.id });
		}
	});

	it('una cuenta borrada no se suspende', async () => {
		const a = await account('borrade-inventade');
		await deleteAccount(t.db, a.id);
		expect((await suspend(a.id)).status).toBe(404);
		expect((await unsuspend(a.id)).status).toBe(404);
	});
});

describe('Perfiles (Comunidad › Perfiles, /admin/comunidad/perfiles)', () => {
	it('lista todos (ocultos y borrados también) con quiénes los gestionan; filtros y búsqueda', async () => {
		const { account: a, profile: p1 } = await profileOf('Persona Inventada');
		const { profile: p2 } = await profileOf('Proyecto Inventado', 'proyecto');
		const { profile: p3 } = await profileOf('Otra Persona');
		await profile.actions.ocultar(
			fakeEvent({ params: { id: String(p2.id) }, form: { version: '1' } })
		);
		await profile.actions.borrar(
			fakeEvent({ params: { id: String(p3.id) }, form: { version: '1' } })
		);

		const all = /** @type {any} */ (
			await profiles.load(fakeEvent({ path: '/admin/comunidad/perfiles' }))
		);
		expect(all.editor).toBe('db');
		expect(all.counts).toEqual({ total: 3, toReview: 1, toApprove: 1, hidden: 1, deleted: 1 });
		const first = all.profiles.find((/** @type {any} */ p) => p.id === p1.id);
		expect(first).toMatchObject({
			title: 'Persona Inventada',
			kind: 'persona',
			visibility: 'public',
			reviewed: false,
			byAccount: true,
			deletedAt: null,
			managers: [{ accountId: a.id, email: a.email, role: 'owner', deleted: false }]
		});
		const ids = async (/** @type {string} */ qs) =>
			/** @type {any} */ (
				await profiles.load(fakeEvent({ path: `/admin/comunidad/perfiles?${qs}` }))
			).profiles.map((/** @type {any} */ p) => p.id);
		// El viejo `?filtro=` de Cuentas › Perfiles sigue filtrando igual.
		expect(await ids('filtro=sin-revisar')).toEqual([p1.id]);
		expect(await ids('filtro=ocultos')).toEqual([p2.id]);
		expect(await ids('filtro=borrados')).toEqual([p3.id]);
		expect(await ids('q=proyecto')).toEqual([p2.id]);
		expect(await ids('filtro=cualquiera')).toHaveLength(3);
		expect(await ids('estado=sin-revisar')).toEqual([p1.id]);
		expect(await ids('estado=oculto')).toEqual([p2.id]);
		expect(await ids('estado=borrado')).toEqual([p3.id]);
		expect(await ids('estado=para-aprobar')).toEqual([p1.id]);
		expect(await ids('estado=cualquiera')).toHaveLength(3);
	});

	it('ocultar va por saveObject: pide la versión que se abrió, sube la versión y queda en Actividad', async () => {
		const { profile: p } = await profileOf('Persona Inventada');
		const params = { id: String(p.id) };
		const stale = /** @type {any} */ (
			await profile.actions.ocultar(fakeEvent({ params, form: { version: '7' } }))
		);
		expect(stale.status).toBe(409);
		expect(await auditRows('profile.hide')).toEqual([]);

		expect(await profile.actions.ocultar(fakeEvent({ params, form: { version: '1' } }))).toEqual({
			perfil: { ok: true, message: 'Listo: el perfil quedó oculto.' }
		});
		const row = await t.db
			.prepare('SELECT visibility, version, updated_by, deleted_at FROM objects WHERE id = ?1')
			.bind(p.id)
			.first();
		// version + 1 y updated_by: lo hizo saveObject (el trigger de la base exige el +1).
		expect(row).toEqual({
			visibility: 'hidden',
			version: 2,
			updated_by: admin.login,
			deleted_at: null
		});
		expect(await auditRows('profile.hide')).toEqual([
			{
				actor_login: admin.login,
				target_type: 'profile',
				target_id: String(p.id),
				summary: 'Ocultó el perfil «Persona Inventada»',
				detail: JSON.stringify({ from: 'public' })
			}
		]);
		// Ya oculto: no guarda de nuevo.
		await profile.actions.ocultar(fakeEvent({ params, form: { version: '2' } }));
		expect((await t.db.prepare('SELECT version FROM objects').first())?.version).toBe(2);
	});

	it('borrar va por saveObject (borrado suave, con la versión) y queda en Actividad', async () => {
		const { account: a, profile: p } = await profileOf('Proyecto Inventado', 'proyecto');
		const params = { id: String(p.id) };
		expect(
			/** @type {any} */ (
				await profile.actions.borrar(fakeEvent({ params, form: { version: '3' } }))
			).status
		).toBe(409);
		const done = /** @type {any} */ (
			await profile.actions.borrar(fakeEvent({ params, form: { version: '1' } }))
		);
		// Ahora también devuelve el borrado, para «Deshacer» (gorrite, 4/10).
		expect(done).toEqual({
			perfil: { ok: true, message: 'Listo: el perfil quedó borrado.' },
			deleted: { id: expect.any(Number), title: 'Proyecto Inventado' }
		});
		const row = await t.db
			.prepare('SELECT version, updated_by, deleted_at FROM objects WHERE id = ?1')
			.bind(p.id)
			.first();
		expect(row?.version).toBe(2);
		expect(row?.updated_by).toBe(admin.login);
		expect(row?.deleted_at).toBeTypeOf('number');
		// La gestión queda (para poder deshacer), como al borrar desde Mi rincón.
		expect(
			(
				await t.db
					.prepare('SELECT COUNT(*) AS n FROM profile_managers WHERE account_id = ?1')
					.bind(a.id)
					.first()
			)?.n
		).toBe(1);
		// El mismo registro que el resto de los borrados del panel (deleteDbProfile).
		expect((await auditRows('profile.delete')).map((r) => r.summary)).toEqual([
			`Borró el perfil «Proyecto Inventado» (amigues/${p.slug}, solo en la base)`
		]);
		const again = /** @type {any} */ (
			await profile.actions.borrar(fakeEvent({ params, form: { version: '2' } }))
		);
		expect(again.status).toBe(409);
		// La ficha sigue abriendo (les admins ven lo borrado).
		const data = /** @type {any} */ (await profile.load(fakeEvent({ params })));
		expect(data.profile.deletedAt).toBeTypeOf('number');
	});

	it('borrar ofrece «Deshacer»: el perfil vuelve, con su gestión, y queda en Actividad', async () => {
		const { account: a, profile: p } = await profileOf('Persona Inventada');
		const params = { id: String(p.id) };
		const done = /** @type {any} */ (
			await profile.actions.borrar(fakeEvent({ params, form: { version: '1' } }))
		);
		const deletion = await t.db
			.prepare('SELECT path, status FROM panel_deletions WHERE id = ?1')
			.bind(done.deleted.id)
			.first();
		expect(deletion).toEqual({ path: `objeto:perfil:${p.id}`, status: 'borrado' });

		const undone = await profile.actions.deshacer(
			fakeEvent({ params, form: { id: String(done.deleted.id) } })
		);
		expect(undone).toEqual({ perfil: { ok: true, message: 'Listo: el perfil volvió.' } });
		const row = await t.db
			.prepare('SELECT deleted_at FROM objects WHERE id = ?1')
			.bind(p.id)
			.first();
		expect(row?.deleted_at).toBeNull();
		expect(
			(
				await t.db
					.prepare('SELECT COUNT(*) AS n FROM profile_managers WHERE account_id = ?1')
					.bind(a.id)
					.first()
			)?.n
		).toBe(1);
		expect((await auditRows('profile.restore')).map((r) => r.summary)).toEqual([
			`Recuperó el perfil «Persona Inventada» (amigues/${p.slug}, solo en la base)`
		]);
		// Dos veces no: ya se recuperó.
		const twice = /** @type {any} */ (
			await profile.actions.deshacer(fakeEvent({ params, form: { id: String(done.deleted.id) } }))
		);
		expect(twice.status).toBe(409);
	});

	it('deshacer solo vale para un borrado de ese mismo perfil', async () => {
		const { profile: p } = await profileOf('Persona Inventada');
		const { profile: other } = await profileOf('Otra Persona');
		const done = /** @type {any} */ (
			await profile.actions.borrar(
				fakeEvent({ params: { id: String(p.id) }, form: { version: '1' } })
			)
		);
		for (const id of [String(done.deleted.id + 1), '0', 'abc']) {
			const r = /** @type {any} */ (
				await profile.actions.deshacer(fakeEvent({ params: { id: String(p.id) }, form: { id } }))
			);
			expect(r.status, id).toBe(404);
		}
		const wrong = /** @type {any} */ (
			await profile.actions.deshacer(
				fakeEvent({ params: { id: String(other.id) }, form: { id: String(done.deleted.id) } })
			)
		);
		expect(wrong.status).toBe(404);
		const row = await t.db
			.prepare('SELECT deleted_at FROM objects WHERE id = ?1')
			.bind(p.id)
			.first();
		expect(row?.deleted_at).toBeTypeOf('number');
		// Sin sesión de admin, no.
		expect(
			(
				await thrown(() =>
					profile.actions.deshacer(
						fakeEvent({
							params: { id: String(p.id) },
							form: { id: String(done.deleted.id) },
							user: null
						})
					)
				)
			)?.status
		).toBeGreaterThanOrEqual(300);
	});

	it('un perfil borrado desde su ficha aparece en «Recuperar» de Actividad y se recupera', async () => {
		const { profile: p } = await profileOf('Persona Inventada');
		const done = /** @type {any} */ (
			await profile.actions.borrar(
				fakeEvent({ params: { id: String(p.id) }, form: { version: '1' } })
			)
		);
		const page = /** @type {any} */ (
			await actividad.load(fakeEvent({ path: '/admin/ajustes/actividad' }))
		);
		expect(page.deletions.map((/** @type {any} */ d) => d.id)).toContain(done.deleted.id);
		const r = /** @type {any} */ (
			await actividad.actions.recuperar(
				fakeEvent({ path: '/admin/ajustes/actividad', form: { id: String(done.deleted.id) } })
			)
		);
		expect(r.undone).toMatchObject({ id: done.deleted.id, mode: 'restored', immediate: true });
		const row = await t.db
			.prepare('SELECT deleted_at FROM objects WHERE id = ?1')
			.bind(p.id)
			.first();
		expect(row?.deleted_at).toBeNull();
	});

	it('la ficha de un perfil: datos, quiénes lo gestionan; un id que no es un perfil da 404', async () => {
		const { account: a, profile: p } = await profileOf('Persona Inventada');
		const data = /** @type {any} */ (
			await profile.load(fakeEvent({ params: { id: String(p.id) } }))
		);
		expect(data.profile).toMatchObject({ id: p.id, title: 'Persona Inventada', version: 1 });
		expect(data.managers).toEqual([
			{ accountId: a.id, email: a.email, role: 'owner', deleted: false }
		]);
		expect(data.review).toBeNull();
		for (const id of ['0', '1.5', 'abc', String(p.id + 100)]) {
			expect((await thrown(() => profile.load(fakeEvent({ params: { id } }))))?.status, id).toBe(
				404
			);
		}
	});
});

describe('Inicio: "Para revisar" y actividad', () => {
	it('los perfiles creados por cuentas quedan para revisar hasta que une admin los revisa, oculta o borra', async () => {
		const { profile: a } = await profileOf('Primero Inventado');
		const { profile: b } = await profileOf('Segundo Inventado');
		const { profile: c } = await profileOf('Tercero Inventado');
		const { profile: d } = await profileOf('Cuarto Inventado');
		// Uno creado por une admin no es "de una cuenta": no va a revisar.
		await saveObject(
			t.db,
			{ type: 'perfil', title: 'De Admin', data: { kind: 'proyecto' } },
			{ actor: admin.login }
		);
		expect((await profilesToReview(t.db)).map((p) => p.id)).toEqual([a.id, b.id, c.id, d.id]);
		expect(await countProfilesToReview(t.db)).toBe(4);

		const review = () =>
			profile.actions.revisado(fakeEvent({ params: { id: String(a.id) }, form: { version: '1' } }));
		expect(await review()).toEqual({
			perfil: { ok: true, message: 'Listo: marcado como revisado.' }
		});
		expect(await review()).toEqual({ perfil: { ok: true, message: 'Ya estaba revisado.' } });
		expect((await auditRows('profile.review')).map((r) => r.summary)).toEqual([
			'Marcó como revisado el perfil «Primero Inventado»'
		]);
		await profile.actions.ocultar(
			fakeEvent({ params: { id: String(b.id) }, form: { version: '1' } })
		);
		await profile.actions.borrar(
			fakeEvent({ params: { id: String(c.id) }, form: { version: '1' } })
		);
		expect((await profilesToReview(t.db)).map((p) => p.id)).toEqual([d.id]);
		expect(await countProfilesToReview(t.db)).toBe(1);
		// Revisar no cambió el perfil.
		const row = await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(a.id).first();
		expect(row?.version).toBe(1);
	});

	it('cuentas y perfiles nuevos aparecen en la actividad, con link a su ficha y sin mails', async () => {
		const { account: acc, profile: p } = await profileOf('Persona Inventada');
		await detail.actions.permiso(fakeEvent({ params: { id: acc.id }, form: { valor: '0' } }));
		const items = await recentActivity(t.db, { limit: 10 });
		const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
		expect(byTitle['Se creó una cuenta nueva']).toMatchObject({
			kind: 'account',
			who: 'Cuenta nueva · Entrar',
			href: `/admin/comunidad/cuentas/${acc.id}`
		});
		expect(byTitle['Se creó el perfil «Persona Inventada» (persona)']).toMatchObject({
			kind: 'account',
			who: 'Perfil nuevo · Mi rincón',
			href: `/admin/comunidad/cuentas/perfiles/${p.id}`
		});
		expect(byTitle['Le sacó a una cuenta el permiso para tener perfiles']).toMatchObject({
			kind: 'audit',
			who: admin.login,
			href: `/admin/comunidad/cuentas/${acc.id}`
		});
		expect(JSON.stringify(items)).not.toContain('@example.com');
	});
});

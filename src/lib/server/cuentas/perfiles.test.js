/**
 * Perfiles contra un D1 de miniflare: la migración 0014 y sus foreign keys, permisos (quién
 * edita, le última dueñe), el aviso de conflicto de versión, invitaciones que no revelan si un
 * mail tiene cuenta, integrantes, y que nada de lo público o de otras cuentas vincula perfiles
 * de una misma cuenta ni muestra quién gestiona. Datos inventados (dominio example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON, getEdges, getObject, searchObjects } from '$lib/server/objects/index.js';
import { deleteAccount, upsertVerifiedAccount } from './accounts.js';
import {
	INVITE_TTL_MS,
	MAX_PROFILES_PER_ACCOUNT,
	MESSAGES,
	accountActor,
	answerInvite,
	answerMember,
	cancelInvite,
	createProfile,
	deleteProfile,
	getManagedProfile,
	getPublicProfile,
	inviteManager,
	leaveMembership,
	leaveProfile,
	listGroupMembers,
	listManagers,
	listMemberships,
	listMyProfiles,
	memberViewer,
	myInvites,
	releaseAccountProfiles,
	removeManager,
	requestMembership,
	setManagerRole,
	updateProfile
} from './perfiles.js';

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

const NOW = Date.parse('2026-10-01T12:00:00Z');
const opts = { now: NOW };

/** @param {string} name */
const account = (name) => upsertVerifiedAccount(t.db, `${name}@example.com`, opts);

/**
 * @template T
 * @param {T} result
 * @returns {Exclude<T, { ok: false }>}
 */
function ok(result) {
	expect(result).toMatchObject({ ok: true });
	return /** @type {any} */ (result);
}

/**
 * @param {string} accountId
 * @param {Record<string, unknown>} input
 */
async function create(accountId, input) {
	return ok(await createProfile(t.db, accountId, /** @type {any} */ (input), opts)).profile;
}

/** @param {string} sql @param {unknown[]} [params] */
async function count(sql, params = []) {
	return Number(
		(
			await t.db
				.prepare(sql)
				.bind(...params)
				.first()
		)?.n
	);
}

describe('migración 0014', () => {
	it('crea las tablas y las foreign keys se llevan las filas al borrar de verdad', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('otre-inventade');
		const group = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		ok(await inviteManager(t.db, a.id, group.slug, 'invitade@example.com', opts));
		ok(await inviteManager(t.db, a.id, group.slug, b.email, opts));
		const [inv] = await myInvites(t.db, b.id, opts);
		ok(await answerInvite(t.db, b.id, inv.id, true, opts));
		expect(await count('SELECT COUNT(*) AS n FROM profile_managers')).toBe(2);
		expect(await count('SELECT COUNT(*) AS n FROM profile_invites')).toBe(1);

		// Una cuenta borrada de verdad (hoy el borrado es suave) se lleva sus filas.
		await t.db.prepare('DELETE FROM account_sessions WHERE account_id = ?1').bind(b.id).run();
		await t.db.prepare('DELETE FROM accounts WHERE id = ?1').bind(b.id).run();
		expect(await count('SELECT COUNT(*) AS n FROM profile_managers')).toBe(1);

		// La purga de un objeto (que todavía no existe en el código) se lleva gestión e invitaciones.
		await t.db.prepare('DELETE FROM objects WHERE id = ?1').bind(group.id).run();
		expect(await count('SELECT COUNT(*) AS n FROM profile_managers')).toBe(0);
		expect(await count('SELECT COUNT(*) AS n FROM profile_invites')).toBe(0);
	});

	it('invited_by queda en NULL si se borra de verdad la cuenta que invitó', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('otre-inventade');
		const group = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		ok(await inviteManager(t.db, a.id, group.slug, b.email, opts));
		const [inv] = await myInvites(t.db, b.id, opts);
		ok(await answerInvite(t.db, b.id, inv.id, true, opts));
		ok(await setManagerRole(t.db, a.id, group.slug, b.id, 'owner'));
		ok(await inviteManager(t.db, a.id, group.slug, 'invitade@example.com', opts));
		await t.db.prepare('DELETE FROM accounts WHERE id = ?1').bind(a.id).run();
		const row = await t.db.prepare('SELECT invited_by FROM profile_invites').first();
		expect(row).toEqual({ invited_by: null });
	});

	it('rechaza filas que apuntan a lo que no existe y roles inventados', async () => {
		const a = await account('dueñe-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		const insert = (/** @type {unknown} */ profile, /** @type {unknown} */ acc, role = 'owner') =>
			t.db
				.prepare(
					'INSERT INTO profile_managers (profile_id, account_id, role, created_at) VALUES (?1, ?2, ?3, 0)'
				)
				.bind(profile, acc, role)
				.run();
		await expect(insert(999999, a.id)).rejects.toThrow(/FOREIGN KEY/);
		await expect(insert(p.id, crypto.randomUUID())).rejects.toThrow(/FOREIGN KEY/);
		const b = await account('otre-inventade');
		await expect(insert(p.id, b.id, 'admin')).rejects.toThrow(/CHECK/);
	});
});

describe('crear y listar', () => {
	it('crea un perfil de persona con su dueñe en la misma tanda', async () => {
		const a = await account('dueñe-inventade');
		const p = await create(a.id, {
			kind: 'persona',
			title: 'Persona Inventada',
			pronouns: 'elle',
			bio: 'Hola',
			links: 'https://ejemplo.test/yo\n\nhttps://ejemplo.test/otra'
		});
		expect(p).toMatchObject({
			type: 'perfil',
			slug: 'persona-inventada',
			visibility: 'public',
			data: {
				kind: 'persona',
				pronouns: 'elle',
				bio: 'Hola',
				links: ['https://ejemplo.test/yo', 'https://ejemplo.test/otra']
			},
			created_by: accountActor(a.id)
		});
		expect(await listMyProfiles(t.db, a.id)).toEqual([
			{
				id: p.id,
				slug: 'persona-inventada',
				title: 'Persona Inventada',
				kind: 'persona',
				visibility: 'public',
				version: 1,
				role: 'owner'
			}
		]);
	});

	it('datos inválidos: no se crea nada (ni el perfil ni la fila de gestión)', async () => {
		const a = await account('dueñe-inventade');
		expect(await createProfile(t.db, a.id, { kind: 'lugar', title: 'X' })).toMatchObject({
			ok: false,
			status: 400,
			message: MESSAGES.badKind
		});
		const bad = await createProfile(t.db, a.id, {
			kind: 'persona',
			title: '',
			links: 'javascript:alert(1)'
		});
		expect(bad).toMatchObject({ ok: false, status: 400 });
		expect(bad.ok === false && Object.keys(bad.errors ?? {}).sort()).toEqual(['links', 'title']);
		expect(await count('SELECT COUNT(*) AS n FROM objects')).toBe(0);
		expect(await count('SELECT COUNT(*) AS n FROM profile_managers')).toBe(0);
	});

	it('si el nombre ya está usado (aunque sea por un perfil oculto ajeno), la dirección cambia sola', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('otre-inventade');
		await create(a.id, { kind: 'persona', title: 'Mismo Nombre', visibility: 'hidden' });
		const second = await create(b.id, { kind: 'persona', title: 'Mismo Nombre' });
		expect(second.slug).toBe('mismo-nombre-2');
	});

	it('mostrar integrantes es solo para grupos', async () => {
		const a = await account('dueñe-inventade');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo', show_members: true });
		expect(g.data.show_members).toBe(true);
		const p = await create(a.id, { kind: 'persona', title: 'Persona', show_members: true });
		expect(p.data.show_members).toBeUndefined();
	});
});

describe('permisos', () => {
	it('quien no gestiona un perfil no lo ve en Mi rincón, no lo edita ni lo borra', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('otre-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		expect(await getManagedProfile(t.db, b.id, p.slug)).toBeNull();
		expect(await listMyProfiles(t.db, b.id)).toEqual([]);
		const edit = await updateProfile(t.db, b.id, p.slug, { version: 1, title: 'Otra cosa' }, opts);
		expect(edit).toEqual({ ok: false, status: 404, message: MESSAGES.notFound });
		expect(await deleteProfile(t.db, b.id, p.slug, 1, opts)).toMatchObject({ status: 404 });
		expect(await inviteManager(t.db, b.id, p.slug, b.email, opts)).toMatchObject({
			status: 404
		});
		const stored = await getObject(t.db, { id: p.id }, { role: 'admin', id: 'admin-inventade' });
		expect(stored).toMatchObject({ title: 'Persona Inventada', version: 1 });
	});

	it('quien gestiona sin ser dueñe edita, pero no borra, no invita ni cambia roles', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		const edited = ok(
			await updateProfile(t.db, b.id, g.slug, { version: 1, title: 'Grupo Renombrado' }, opts)
		);
		expect(edited.profile).toMatchObject({ title: 'Grupo Renombrado', version: 2 });
		expect(await deleteProfile(t.db, b.id, g.slug, 2, opts)).toMatchObject({
			status: 403,
			message: MESSAGES.onlyOwner
		});
		expect(await inviteManager(t.db, b.id, g.slug, 'x@example.com', opts)).toMatchObject({
			status: 403
		});
		expect(await setManagerRole(t.db, b.id, g.slug, b.id, 'owner')).toMatchObject({
			status: 403
		});
		expect(await removeManager(t.db, b.id, g.slug, a.id)).toMatchObject({ status: 403 });
	});

	it('le última dueñe no se puede ir ni perder la propiedad; después de pasarla, sí', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		expect(await leaveProfile(t.db, a.id, g.slug)).toEqual({
			ok: false,
			status: 409,
			message: MESSAGES.lastOwner
		});
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		// Hay otra persona, pero no es dueñe: sigue sin poder irse ni sacarse la propiedad.
		expect(await leaveProfile(t.db, a.id, g.slug)).toMatchObject({ message: MESSAGES.lastOwner });
		expect(await setManagerRole(t.db, a.id, g.slug, a.id, 'manager')).toMatchObject({
			status: 409,
			message: MESSAGES.lastOwnerOther
		});
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner'));
		ok(await leaveProfile(t.db, a.id, g.slug));
		expect(await getManagedProfile(t.db, a.id, g.slug)).toBeNull();
		expect(await leaveProfile(t.db, b.id, g.slug)).toMatchObject({ message: MESSAGES.lastOwner });
		expect((await listManagers(t.db, b.id, g.slug, opts)).ok && true).toBe(true);
	});

	it('una cuenta borrada no cuenta como dueñe', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner'));
		await deleteAccount(t.db, b.id, opts);
		expect(await leaveProfile(t.db, a.id, g.slug)).toMatchObject({ message: MESSAGES.lastOwner });
	});

	it('un perfil de persona no se deja ni suma gente: se borra', async () => {
		const a = await account('dueñe-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		expect(await leaveProfile(t.db, a.id, p.slug)).toMatchObject({
			message: MESSAGES.personaLeave
		});
		expect(await inviteManager(t.db, a.id, p.slug, 'x@example.com', opts)).toMatchObject({
			message: MESSAGES.onlyGroups
		});
		ok(await deleteProfile(t.db, a.id, p.slug, 1, opts));
		expect(await listMyProfiles(t.db, a.id)).toEqual([]);
		expect(await getPublicProfile(t.db, p.slug)).toBeNull();
	});
});

describe('conflicto de versión', () => {
	it('si alguien guardó en el medio, avisa "alguien lo cambió mientras tanto" y no pisa nada', async () => {
		const a = await account('dueñe-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		ok(await updateProfile(t.db, a.id, p.slug, { version: 1, title: 'Primera', bio: 'uno' }, opts));
		const late = await updateProfile(
			t.db,
			a.id,
			p.slug,
			{ version: 1, title: 'Segunda', bio: 'dos' },
			opts
		);
		expect(late).toEqual({ ok: false, status: 409, message: MESSAGES.conflict });
		expect(MESSAGES.conflict).toMatch(/^Alguien lo cambió mientras tanto/);
		const now = await getManagedProfile(t.db, a.id, p.slug);
		expect(now?.profile).toMatchObject({ title: 'Primera', data: { bio: 'uno' }, version: 2 });
	});

	it('el tipo de perfil no cambia al editar', async () => {
		const a = await account('dueñe-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		const r = ok(
			await updateProfile(
				t.db,
				a.id,
				p.slug,
				/** @type {any} */ ({ version: 1, title: 'X', kind: 'grupo', show_members: true }),
				opts
			)
		);
		expect(r.profile.data).toEqual({ kind: 'persona' });
	});
});

describe('invitaciones a gestionar', () => {
	it('responde igual tenga o no cuenta el mail, y solo la cuenta de ese mail la ve', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const c = await account('curiose-inventade');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		const withAccount = await inviteManager(t.db, a.id, g.slug, ` ${b.email.toUpperCase()} `, opts);
		const without = await inviteManager(t.db, a.id, g.slug, 'nadie@example.com', opts);
		const already = await inviteManager(t.db, a.id, g.slug, a.email, opts);
		expect(withAccount).toEqual({ ok: true, message: MESSAGES.invited });
		expect(without).toEqual(withAccount);
		expect(already).toEqual(withAccount);
		// La lista de quien invita tampoco lo revela: tres invitaciones iguales, sin mail.
		const list = ok(await listManagers(t.db, a.id, g.slug, opts));
		expect(list.invites).toHaveLength(3);
		expect(JSON.stringify(list.invites)).not.toMatch(/example\.com/);

		expect(await myInvites(t.db, c.id, opts)).toEqual([]);
		const [inv] = await myInvites(t.db, b.id, opts);
		expect(inv).toMatchObject({ title: 'Grupo Inventado' });
		expect(await answerInvite(t.db, c.id, inv.id, true, opts)).toMatchObject({
			message: MESSAGES.inviteGone
		});
		// Une dueñe no ve su propia invitación (ya gestiona el grupo).
		expect(await myInvites(t.db, a.id, opts)).toEqual([]);
		expect(await answerInvite(t.db, b.id, inv.id, true, opts)).toEqual({ ok: true, slug: g.slug });
		expect((await getManagedProfile(t.db, b.id, g.slug))?.role).toBe('manager');
		expect(await myInvites(t.db, b.id, opts)).toEqual([]);
	});

	it('vencen, se rechazan y se cancelan', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		const later = { now: NOW + INVITE_TTL_MS + 1 };
		expect(await myInvites(t.db, b.id, later)).toEqual([]);
		const [inv] = await myInvites(t.db, b.id, opts);
		expect(await answerInvite(t.db, b.id, inv.id, true, later)).toMatchObject({ ok: false });
		ok(await answerInvite(t.db, b.id, inv.id, false, opts));
		expect(await getManagedProfile(t.db, b.id, g.slug)).toBeNull();

		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		const [again] = await myInvites(t.db, b.id, opts);
		ok(await cancelInvite(t.db, a.id, g.slug, again.id));
		expect(await myInvites(t.db, b.id, opts)).toEqual([]);
	});

	it('un mail inválido se marca; un grupo borrado no se puede aceptar', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		expect(await inviteManager(t.db, a.id, g.slug, 'no-es-un-mail', opts)).toMatchObject({
			status: 400,
			errors: { email: MESSAGES.badEmail }
		});
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		const [inv] = await myInvites(t.db, b.id, opts);
		ok(await deleteProfile(t.db, a.id, g.slug, 1, opts));
		expect(await myInvites(t.db, b.id, opts)).toEqual([]);
		expect(await answerInvite(t.db, b.id, inv.id, true, opts)).toMatchObject({ ok: false });
	});

	it('aceptar respeta el tope de perfiles por cuenta', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		for (let i = 1; i <= MAX_PROFILES_PER_ACCOUNT; i++) {
			await create(b.id, { kind: 'persona', title: `Persona Inventada ${i}` });
		}
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		const [inv] = await myInvites(t.db, b.id, opts);
		expect(await answerInvite(t.db, b.id, inv.id, true, opts)).toMatchObject({
			ok: false,
			message: MESSAGES.tooManyProfiles
		});
		expect(await getManagedProfile(t.db, b.id, g.slug)).toBeNull();
		// La invitación sigue ahí: puede borrar un perfil y aceptarla después.
		expect(await myInvites(t.db, b.id, opts)).toHaveLength(1);
	});
});

describe('integrantes', () => {
	it('la persona pide, el grupo acepta; solo se muestra si el grupo lo elige', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Inventado' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		ok(
			await requestMembership(t.db, b.id, p.slug, `https://kinkyvibe.ar/amigues/${g.slug}/`, opts)
		);
		expect(await listMemberships(t.db, b.id, p.slug)).toEqual([
			{ id: g.id, title: 'Grupo Inventado', accepted: false }
		]);
		expect(await listGroupMembers(t.db, a.id, g.slug)).toEqual([
			{ id: p.id, title: 'Persona Inventada', accepted: false }
		]);
		// Otra cuenta no ve los integrantes de un grupo que no gestiona.
		expect(await listGroupMembers(t.db, b.id, g.slug)).toEqual([]);

		ok(await updateProfile(t.db, a.id, g.slug, { version: 1, title: g.title, show_members: true }));
		// Pendiente: no aparece.
		expect((await getPublicProfile(t.db, g.slug))?.members).toEqual([]);
		ok(await answerMember(t.db, a.id, g.slug, p.id, 'accept', opts));
		expect((await getPublicProfile(t.db, g.slug))?.members).toEqual([
			{ slug: p.slug, title: 'Persona Inventada' }
		]);
		// El grupo elige no mostrar: no aparece nadie.
		const current = await getManagedProfile(t.db, a.id, g.slug);
		ok(
			await updateProfile(t.db, a.id, g.slug, {
				version: /** @type {number} */ (current?.profile.version),
				title: g.title,
				show_members: false
			})
		);
		expect((await getPublicProfile(t.db, g.slug))?.members).toBeNull();

		ok(await leaveMembership(t.db, b.id, p.slug, g.id, opts));
		expect(await listGroupMembers(t.db, a.id, g.slug)).toEqual([]);
	});

	it('un grupo oculto "no existe" para pedir; un perfil de grupo no pide; el grupo puede sacar', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const hidden = await create(a.id, {
			kind: 'grupo',
			title: 'Grupo Oculto',
			visibility: 'hidden'
		});
		const g = await create(a.id, { kind: 'grupo', title: 'Grupo Visible' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		const other = await create(a.id, { kind: 'persona', title: 'Otra Persona' });
		expect(await requestMembership(t.db, b.id, p.slug, hidden.slug, opts)).toMatchObject({
			status: 404,
			message: MESSAGES.groupNotFound
		});
		expect(await requestMembership(t.db, b.id, p.slug, other.slug, opts)).toMatchObject({
			message: MESSAGES.groupNotFound
		});
		expect(await requestMembership(t.db, a.id, g.slug, g.slug, opts)).toMatchObject({
			message: MESSAGES.onlyPersonas
		});
		ok(await requestMembership(t.db, b.id, p.slug, g.slug, opts));
		ok(await answerMember(t.db, a.id, g.slug, p.id, 'remove', opts));
		expect(await listMemberships(t.db, b.id, p.slug)).toEqual([]);
		// Quien no gestiona el grupo no puede aceptar ni sacar.
		ok(await requestMembership(t.db, b.id, p.slug, g.slug, opts));
		expect(await answerMember(t.db, b.id, g.slug, p.id, 'accept', opts)).toMatchObject({
			status: 404
		});
	});
});

describe('privacidad: nada vincula perfiles de una cuenta ni muestra quién gestiona', () => {
	it('lecturas públicas y de otras cuentas: sin autore, sin cuenta, sin mail', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const viewerB = memberViewer(b.id);
		const one = await create(a.id, { kind: 'persona', title: 'Zanahoria Uno', bio: 'zanahoria' });
		const two = await create(a.id, {
			kind: 'persona',
			title: 'Zanahoria Dos',
			bio: 'zanahoria',
			visibility: 'members'
		});
		const g = await create(a.id, { kind: 'grupo', title: 'Zanahoria Grupo', show_members: true });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		for (const p of [one, two]) {
			ok(await requestMembership(t.db, a.id, p.slug, g.slug, opts));
			ok(await answerMember(t.db, a.id, g.slug, p.id, 'accept', opts));
		}

		const secrets = [a.id, b.id, a.email, b.email, 'cuenta:'];
		/** @param {unknown} value */
		const leaks = (value) => secrets.filter((s) => JSON.stringify(value).includes(s));

		for (const viewer of [ANON, viewerB]) {
			const reads = [
				await getPublicProfile(t.db, one.slug, viewer),
				await getPublicProfile(t.db, two.slug, viewer),
				await getPublicProfile(t.db, g.slug, viewer),
				await getObject(t.db, { id: one.id }, viewer),
				await getObject(t.db, { type: 'perfil', slug: two.slug }, viewer),
				await searchObjects(t.db, 'zanahoria', viewer),
				await getEdges(t.db, one.id, viewer),
				await getEdges(t.db, g.id, viewer, { direction: 'in' })
			];
			expect(leaks(reads)).toEqual([]);
			const found = await searchObjects(t.db, 'zanahoria', viewer, { type: 'perfil' });
			expect(found.length).toBeGreaterThan(0);
			for (const o of found) expect([o.created_by, o.updated_by]).toEqual(['', '']);
		}
		// Les dos perfiles de la misma cuenta: lo que se ve de uno no menciona al otro.
		const pub = await getPublicProfile(t.db, one.slug, viewerB);
		expect(JSON.stringify(pub)).not.toContain(two.slug);
		expect(Object.keys(pub ?? {}).sort()).toEqual(
			['avatar', 'bio', 'kind', 'links', 'members', 'pronouns', 'slug', 'title'].sort()
		);
		// El grupo muestra integrantes (lo eligió), nunca a quienes lo gestionan.
		const group = await getPublicProfile(t.db, g.slug, viewerB);
		expect(group?.members?.map((m) => m.slug).sort()).toEqual([one.slug, two.slug].sort());
		expect(leaks(group)).toEqual([]);
		// Anónimes no ven el de "solo con cuenta" tampoco como integrante.
		expect((await getPublicProfile(t.db, g.slug, ANON))?.members).toEqual([
			{ slug: one.slug, title: 'Zanahoria Uno' }
		]);
		// Control: les admins sí ven quién lo creó.
		const admin = await getObject(t.db, { id: one.id }, { role: 'admin', id: 'admin-inventade' });
		expect(admin?.created_by).toBe(accountActor(a.id));
	});

	it('un perfil oculto lo ve quien lo creó; otra cuenta y anónimes no', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('otre-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Oculta', visibility: 'hidden' });
		expect(await getPublicProfile(t.db, p.slug, memberViewer(a.id))).not.toBeNull();
		expect(await getPublicProfile(t.db, p.slug, memberViewer(b.id))).toBeNull();
		expect(await getPublicProfile(t.db, p.slug, ANON)).toBeNull();
	});
});

describe('al borrar una cuenta (todavía sin llamar desde el borrado)', () => {
	it('borra sus personas, pasa los grupos a quien sigue y borra los que quedan sin nadie', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		const shared = await create(a.id, { kind: 'grupo', title: 'Grupo Compartido' });
		const alone = await create(a.id, { kind: 'grupo', title: 'Grupo Solo' });
		ok(await inviteManager(t.db, a.id, shared.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));

		await releaseAccountProfiles(t.db, a.id, opts);
		expect(await listMyProfiles(t.db, a.id)).toEqual([]);
		expect(await getPublicProfile(t.db, p.slug)).toBeNull();
		expect(await getPublicProfile(t.db, alone.slug)).toBeNull();
		expect(await getPublicProfile(t.db, shared.slug)).not.toBeNull();
		expect((await getManagedProfile(t.db, b.id, shared.slug))?.role).toBe('owner');
	});
});

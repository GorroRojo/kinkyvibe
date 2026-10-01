/**
 * Perfiles contra un D1 de miniflare: la migración 0014 y sus foreign keys, permisos (quién
 * edita, le última dueñe), el aviso de conflicto de versión, invitaciones que no revelan si un
 * mail tiene cuenta (tampoco con el aviso por mail), integrantes que suma el proyecto y que la
 * persona deja cuando quiere, y que nada de lo público o de otras cuentas vincula perfiles
 * de una misma cuenta ni muestra quién gestiona. Datos inventados (dominio example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON, getEdges, getObject, searchObjects } from '$lib/server/objects/index.js';
import {
	deleteAccount,
	getNoGroupInvites,
	setNoGroupInvites,
	upsertVerifiedAccount
} from './accounts.js';
import { closeAccount } from './index.js';
import { ACCOUNT_MAIL_CAP, accountMailAllowed } from './mailCap.js';
import {
	DELETED_ACTOR,
	DELETED_TITLE,
	INVITE_RATE_LIMITS,
	INVITE_TTL_MS,
	MAX_PROFILES_PER_ACCOUNT,
	MESSAGES,
	LEAVE_BLOCK_MS,
	SLUG_SUFFIX_LENGTH,
	accountActor,
	answerMemberInvite,
	answerInvite,
	cancelInvite,
	createProfile,
	deleteProfile,
	getManagedProfile,
	getPublicProfile,
	inviteManager,
	inviteMember,
	listGroupMemberInvites,
	listMyMemberInvites,
	MEMBER_INVITE_RATE_LIMITS,
	withdrawMemberInvite,
	leaveMembership,
	leaveProfile,
	listGroupMembers,
	listManagers,
	listMemberships,
	listMyMemberships,
	listMyProfiles,
	memberViewer,
	myInvites,
	releaseAccountProfiles,
	removeManager,
	removeMember,
	setManagerRole,
	updateProfile,
	accountVenueData
} from './perfiles.js';
import { approveProfile } from '$lib/server/amigues/approvals.js';
import { findPublicProfile, listPublicProfiles } from '$lib/server/amigues/profiles.js';
import { listPendingVenues } from '$lib/server/amigues/pendingVenues.js';

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

/**
 * Una cuenta con el permiso "puede tener perfiles" (migración 0015; sin él no hay perfiles, ver
 * el describe «permiso para tener perfiles»). Las pruebas de acá son de cuentas que lo tienen.
 * @param {string} name
 */
const account = async (name) => {
	const a = await upsertVerifiedAccount(t.db, `${name}@example.com`, opts);
	await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	return a;
};

/**
 * Como si se hubiera escrito un código fresco por mail correcto (las acciones de dueñes y borrar
 * un proyecto lo piden; ver el describe «código fresco para acciones de dueñes»).
 */
const withCode = { stepUp: async () => null };

/**
 * El proyecto invita a la persona y ella acepta (lo que antes era "sumar").
 * @param {string} managerId
 * @param {{ id: number, slug: string }} group
 * @param {{ slug: string }} persona
 * @param {string} ownerId la cuenta de la persona
 */
async function join(managerId, group, persona, ownerId) {
	ok(await inviteMember(t.db, managerId, group.slug, persona.slug, opts));
	ok(await answerMemberInvite(t.db, ownerId, persona.slug, group.id, true, opts));
}

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
		const group = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
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
		const group = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		ok(await inviteManager(t.db, a.id, group.slug, b.email, opts));
		const [inv] = await myInvites(t.db, b.id, opts);
		ok(await answerInvite(t.db, b.id, inv.id, true, opts));
		ok(await setManagerRole(t.db, a.id, group.slug, b.id, 'owner', withCode));
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
		// Un tipo inventado (desde #137 una cuenta también puede crear lugares, decisión 0022).
		expect(await createProfile(t.db, a.id, { kind: 'cualquiera', title: 'X' })).toMatchObject({
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
		const third = await create(b.id, { kind: 'persona', title: 'Mismo Nombre' });
		// Un sufijo al azar, no -2, -3…: la dirección no dice cuántos perfiles hay con ese nombre.
		for (const p of [second, third]) {
			expect(p.slug).toMatch(new RegExp(`^mismo-nombre-[a-z0-9]{${SLUG_SUFFIX_LENGTH}}$`));
			expect(p.slug).not.toMatch(/-\d$/);
		}
		expect(third.slug).not.toBe(second.slug);
	});

	it('mostrar integrantes es solo para proyectos', async () => {
		const a = await account('dueñe-inventade');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto', show_members: true });
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
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		const edited = ok(
			await updateProfile(t.db, b.id, g.slug, { version: 1, title: 'Proyecto Renombrado' }, opts)
		);
		expect(edited.profile).toMatchObject({ title: 'Proyecto Renombrado', version: 2 });
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
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
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
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', withCode));
		ok(await leaveProfile(t.db, a.id, g.slug));
		expect(await getManagedProfile(t.db, a.id, g.slug)).toBeNull();
		expect(await leaveProfile(t.db, b.id, g.slug)).toMatchObject({ message: MESSAGES.lastOwner });
		expect((await listManagers(t.db, b.id, g.slug, opts)).ok && true).toBe(true);
	});

	it('una cuenta borrada no cuenta como dueñe', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', withCode));
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
				/** @type {any} */ ({ version: 1, title: 'X', kind: 'proyecto', show_members: true }),
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
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const withAccount = await inviteManager(t.db, a.id, g.slug, ` ${b.email.toUpperCase()} `, opts);
		const without = await inviteManager(t.db, a.id, g.slug, 'nadie@example.com', opts);
		const already = await inviteManager(t.db, a.id, g.slug, a.email, opts);
		expect(withAccount).toEqual({ ok: true, message: MESSAGES.invited });
		expect(without).toEqual(withAccount);
		expect(already).toEqual(withAccount);
		// La lista de quien invita tampoco lo revela: tres invitaciones iguales, sin el mail
		// invitado (solo quién invitó, que es otre dueñe).
		const list = ok(await listManagers(t.db, a.id, g.slug, opts));
		expect(list.invites).toHaveLength(3);
		expect(list.invites.map((i) => i.invitedBy)).toEqual([a.email, a.email, a.email]);
		const listed = JSON.stringify(list.invites);
		for (const email of [b.email, 'nadie@example.com']) expect(listed).not.toContain(email);

		expect(await myInvites(t.db, c.id, opts)).toEqual([]);
		const [inv] = await myInvites(t.db, b.id, opts);
		expect(inv).toMatchObject({ title: 'Proyecto Inventado' });
		expect(await answerInvite(t.db, c.id, inv.id, true, opts)).toMatchObject({
			message: MESSAGES.inviteGone
		});
		// Une dueñe no ve su propia invitación (ya gestiona el proyecto).
		expect(await myInvites(t.db, a.id, opts)).toEqual([]);
		expect(await answerInvite(t.db, b.id, inv.id, true, opts)).toEqual({ ok: true, slug: g.slug });
		expect((await getManagedProfile(t.db, b.id, g.slug))?.role).toBe('manager');
		expect(await myInvites(t.db, b.id, opts)).toEqual([]);
	});

	it('vencen, se rechazan y se cancelan', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
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

	it('un mail inválido se marca; un proyecto borrado no se puede aceptar', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		expect(await inviteManager(t.db, a.id, g.slug, 'no-es-un-mail', opts)).toMatchObject({
			status: 400,
			errors: { email: MESSAGES.badEmail }
		});
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		const [inv] = await myInvites(t.db, b.id, opts);
		ok(await deleteProfile(t.db, a.id, g.slug, 1, { ...opts, ...withCode }));
		expect(await myInvites(t.db, b.id, opts)).toEqual([]);
		expect(await answerInvite(t.db, b.id, inv.id, true, opts)).toMatchObject({ ok: false });
	});

	it('aceptar respeta el tope de perfiles por cuenta', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
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

describe('aviso por mail de las invitaciones', () => {
	/** Un `notice` de mentira: junta los mails y las tareas en segundo plano. */
	function fakeNotice() {
		/** @type {{ to: string, message: { subject: string, html: string, text: string } }[]} */
		const sent = [];
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		return {
			sent,
			/** Espera las tareas en segundo plano y devuelve sus resultados. */
			settle: () => Promise.all(tasks.splice(0)),
			notice: {
				origin: 'https://kinkyvibe.ar',
				/** @type {import('./index.js').SendMail} */
				send: async (to, message) => {
					sent.push({ to, message });
					return /** @type {const} */ ('sent');
				},
				/** @param {Promise<unknown>} task */
				defer: (task) => {
					tasks.push(task);
				}
			}
		};
	}

	it('con cuenta verificada sale un aviso con el nombre del proyecto y el link; sin el mail de quien invita', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto <Inventado>' });
		const fake = fakeNotice();
		const r = await inviteManager(t.db, a.id, g.slug, b.email.toUpperCase(), {
			...opts,
			notice: fake.notice
		});
		expect(r).toEqual({ ok: true, message: MESSAGES.invited });
		expect(await fake.settle()).toEqual(['sent']);
		expect(fake.sent).toHaveLength(1);
		const [{ to, message }] = fake.sent;
		expect(to).toBe(b.email);
		expect(message.subject).toBe('Te invitaron a gestionar un perfil en KinkyVibe');
		expect(message.text).toContain('«Proyecto <Inventado>»');
		expect(message.text).toContain('https://kinkyvibe.ar/mi-rincon/perfiles');
		expect(message.html).toContain('Proyecto &lt;Inventado&gt;');
		expect(message.html).toContain('href="https://kinkyvibe.ar/mi-rincon/perfiles"');
		expect(JSON.stringify(message)).not.toContain(a.email);
		expect(JSON.stringify(message)).not.toContain(a.id);
	});

	it('sin cuenta, con la cuenta borrada o si ya gestiona: no sale ningún mail', async () => {
		const a = await account('dueñe-inventade');
		const gone = await account('borrade-inventade');
		const goneEmail = gone.email;
		await deleteAccount(t.db, gone.id, opts);
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const fake = fakeNotice();
		for (const email of ['nadie@example.com', goneEmail, a.email]) {
			ok(await inviteManager(t.db, a.id, g.slug, email, { ...opts, notice: fake.notice }));
		}
		expect(await fake.settle()).toEqual(['skipped', 'skipped', 'skipped']);
		expect(fake.sent).toEqual([]);
	});

	it('quien invita ve exactamente la misma respuesta, y no espera al mail', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		/** @type {() => void} */
		let release = () => {};
		const gate = new Promise((resolve) => (release = () => resolve(undefined)));
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		const sent = vi.fn(async () => {
			await gate; // un mail que tarda "para siempre"
			return /** @type {const} */ ('sent');
		});
		const notice = {
			origin: 'https://kinkyvibe.ar',
			send: sent,
			defer: (/** @type {Promise<unknown>} */ task) => void tasks.push(task)
		};
		const withAccount = await inviteManager(t.db, a.id, g.slug, b.email, { ...opts, notice });
		const without = await inviteManager(t.db, a.id, g.slug, 'nadie@example.com', {
			...opts,
			notice
		});
		// Las dos respuestas llegaron con el mail todavía sin salir: no dependen de él.
		expect(without).toEqual(withAccount);
		expect(withAccount).toEqual({ ok: true, message: MESSAGES.invited });
		release();
		expect(await Promise.all(tasks)).toEqual(['sent', 'skipped']);
		expect(sent).toHaveBeenCalledTimes(1);
	});

	// Recorre el flujo entero hasta el tope: en la CI tarda más que los 5 s de un test común.
	it('límite por hora por proyecto y por cuenta que invita (se cuenta haya o no cuenta)', async () => {
		const a = await account('dueñe-inventade');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const { limit } = INVITE_RATE_LIMITS.group;
		for (let i = 1; i <= limit; i++) {
			ok(await inviteManager(t.db, a.id, g.slug, `invitade-${i}@example.com`, opts));
		}
		const over = await inviteManager(t.db, a.id, g.slug, 'una-mas@example.com', opts);
		expect(over).toEqual({ ok: false, status: 429, message: MESSAGES.tooManyInviteMails });
		expect(await count('SELECT COUNT(*) AS n FROM profile_invites')).toBe(limit);
		// A la hora siguiente se puede de nuevo.
		ok(
			await inviteManager(t.db, a.id, g.slug, 'una-mas@example.com', {
				now: NOW + 60 * 60 * 1000
			})
		);

		// Por cuenta: repartido entre varios proyectos, igual se topea.
		const b = await account('otre-dueñe-inventade');
		const perAccount = INVITE_RATE_LIMITS.account.limit;
		const groups = [];
		for (let i = 0; i * limit < perAccount + 1; i++) {
			groups.push(await create(b.id, { kind: 'proyecto', title: `Otro Proyecto ${i}` }));
		}
		let sentOk = 0;
		/** @type {unknown} */
		let last = null;
		for (let i = 0; i <= perAccount; i++) {
			const group = groups[Math.floor(i / limit)];
			last = await inviteManager(t.db, b.id, group.slug, `persona-${i}@example.com`, opts);
			if (/** @type {any} */ (last).ok) sentOk++;
		}
		expect(sentOk).toBe(perAccount);
		expect(last).toMatchObject({ status: 429, message: MESSAGES.tooManyInviteMails });
	}, 20_000);

	it('límite de avisos por destinatarie: la invitación se crea igual y la respuesta no cambia', async () => {
		const b = await account('gestora-inventada');
		const fake = fakeNotice();
		const { limit } = INVITE_RATE_LIMITS.recipient;
		for (let i = 0; i <= limit; i++) {
			const owner = await account(`dueñe-${i}`);
			const g = await create(owner.id, { kind: 'proyecto', title: `Proyecto ${i}` });
			expect(
				await inviteManager(t.db, owner.id, g.slug, b.email, { ...opts, notice: fake.notice })
			).toEqual({ ok: true, message: MESSAGES.invited });
		}
		const results = await fake.settle();
		expect(results.filter((r) => r === 'sent')).toHaveLength(limit);
		expect(results.at(-1)).toBe('limited');
		expect(await myInvites(t.db, b.id, opts)).toHaveLength(limit + 1);
	});

	it('con el tope global de mails lleno, el aviso no sale y la invitación queda', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		// El contador global de esta hora arranca lleno (300 llamadas tardan más que el tiempo
		// de un test en la CI). Misma ventana que calcula hitRateLimit.
		const nowSeconds = Math.floor(NOW / 1000);
		const windowStart = nowSeconds - (nowSeconds % ACCOUNT_MAIL_CAP.windowSeconds);
		await t.db
			.prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, ?3)')
			.bind('cuentas:mail:global', windowStart, ACCOUNT_MAIL_CAP.limit)
			.run();
		expect(await accountMailAllowed(t.db, NOW)).toBe(false);
		const fake = fakeNotice();
		expect(
			await inviteManager(t.db, a.id, g.slug, b.email, { ...opts, notice: fake.notice })
		).toEqual({ ok: true, message: MESSAGES.invited });
		expect(await fake.settle()).toEqual(['limited']);
		expect(fake.sent).toEqual([]);
		expect(await myInvites(t.db, b.id, opts)).toHaveLength(1);
	});
});

describe('código fresco para acciones de dueñes', () => {
	/** Un `stepUp` que cuenta las veces que se lo llamó y responde lo que se le pida. */
	function stepUp(
		answer = /** @type {null | { ok: false, status: number, message: string }} */ (null)
	) {
		const fn = vi.fn(async () => answer);
		return { fn, opts: { stepUp: fn } };
	}
	const wrong = {
		ok: /** @type {const} */ (false),
		status: 400,
		message: 'código mal (de prueba)'
	};

	/** Proyecto de `a` con `b` como manager. */
	async function setup() {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		/** @param {string} id */
		const role = async (id) => (await getManagedProfile(t.db, id, g.slug))?.role ?? null;
		return { a, b, g, role };
	}

	it('hacer dueñe, sacar la propiedad o sacar a otre dueñe: sin código no se hace', async () => {
		const { a, b, g, role } = await setup();
		expect(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner')).toEqual({
			ok: false,
			status: 403,
			message: MESSAGES.needsCode
		});
		const bad = stepUp(wrong);
		expect(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', bad.opts)).toEqual(wrong);
		expect(await role(b.id)).toBe('manager');

		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', withCode));
		expect(await role(b.id)).toBe('owner');
		// Ya dueñe: b no puede sacar a a ni sacarle la propiedad sin código.
		expect(await removeManager(t.db, b.id, g.slug, a.id)).toMatchObject({
			status: 403,
			message: MESSAGES.needsCode
		});
		expect(await setManagerRole(t.db, b.id, g.slug, a.id, 'manager', bad.opts)).toEqual(wrong);
		expect(await role(a.id)).toBe('owner');
		ok(await removeManager(t.db, b.id, g.slug, a.id, withCode));
		expect(await role(a.id)).toBeNull();
	});

	it('con solo una sesión ajena (sin el mail) no se puede quedar con un proyecto', async () => {
		const v = await account('victima-inventada');
		const x = await account('otra-cuenta-inventada');
		const g = await create(v.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		// Con la sesión de v: invita a x y x acepta…
		ok(await inviteManager(t.db, v.id, g.slug, x.email, opts));
		ok(await answerInvite(t.db, x.id, (await myInvites(t.db, x.id, opts))[0].id, true, opts));
		// …pero hacerla dueñe pide el código que le llega a v.
		const noMail = stepUp(wrong);
		expect(await setManagerRole(t.db, v.id, g.slug, x.id, 'owner', noMail.opts)).toEqual(wrong);
		expect(await removeManager(t.db, x.id, g.slug, v.id)).toMatchObject({ status: 403 });
		expect((await getManagedProfile(t.db, v.id, g.slug))?.role).toBe('owner');
	});

	it('borrar un proyecto pide código; borrar un perfil de persona, no', async () => {
		const { a, g } = await setup();
		expect(await deleteProfile(t.db, a.id, g.slug, g.version, opts)).toMatchObject({
			status: 403,
			message: MESSAGES.needsCode
		});
		const bad = stepUp(wrong);
		expect(await deleteProfile(t.db, a.id, g.slug, g.version, { ...opts, ...bad.opts })).toEqual(
			wrong
		);
		// Con una versión vieja no se gasta el código.
		const unused = stepUp();
		expect(
			await deleteProfile(t.db, a.id, g.slug, g.version + 5, { ...opts, ...unused.opts })
		).toMatchObject({ status: 409 });
		expect(unused.fn).not.toHaveBeenCalled();
		expect(await getManagedProfile(t.db, a.id, g.slug)).not.toBeNull();
		ok(await deleteProfile(t.db, a.id, g.slug, g.version, { ...opts, ...withCode }));
		expect(await getManagedProfile(t.db, a.id, g.slug)).toBeNull();

		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		const notNeeded = stepUp();
		ok(await deleteProfile(t.db, a.id, p.slug, p.version, { ...opts, ...notNeeded.opts }));
		expect(notNeeded.fn).not.toHaveBeenCalled();
	});

	it('no pide código para lo demás, ni lo gasta si no hay permiso', async () => {
		const { a, b, g, role } = await setup();
		const asked = stepUp();
		// Une manager sin permiso: 403 sin tocar el código.
		expect(await setManagerRole(t.db, b.id, g.slug, b.id, 'owner', asked.opts)).toMatchObject({
			status: 403,
			message: MESSAGES.onlyOwner
		});
		expect(await removeManager(t.db, b.id, g.slug, a.id, asked.opts)).toMatchObject({
			status: 403,
			message: MESSAGES.onlyOwner
		});
		// Sacar a une manager o irse une misme: sin código.
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', withCode));
		ok(await setManagerRole(t.db, a.id, g.slug, a.id, 'manager', asked.opts));
		ok(await removeManager(t.db, b.id, g.slug, a.id, asked.opts));
		expect(await role(a.id)).toBeNull();
		expect(asked.fn).not.toHaveBeenCalled();
	});
});

describe('invitaciones de quien deja de ser dueñe', () => {
	/**
	 * Proyecto de `a` con `b` como dueñe también, y una invitación pendiente de cada une.
	 */
	async function setup() {
		const a = await account('dueñe-inventade');
		const b = await account('otre-dueñe-inventade');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', withCode));
		ok(await inviteManager(t.db, a.id, g.slug, 'de-a@example.com', opts));
		ok(await inviteManager(t.db, b.id, g.slug, 'de-b@example.com', opts));
		/** @param {string} id */
		const pendingBy = (id) =>
			count('SELECT COUNT(*) AS n FROM profile_invites WHERE invited_by = ?1', [id]);
		return { a, b, g, pendingBy };
	}

	it('sacarle la propiedad borra sus invitaciones; las de otres quedan', async () => {
		const { a, b, g, pendingBy } = await setup();
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'manager', withCode));
		expect(await pendingBy(b.id)).toBe(0);
		expect(await pendingBy(a.id)).toBe(1);
	});

	it('sacarle de la gestión borra sus invitaciones', async () => {
		const { a, b, g, pendingBy } = await setup();
		ok(await removeManager(t.db, a.id, g.slug, b.id, withCode));
		expect(await pendingBy(b.id)).toBe(0);
		expect(await pendingBy(a.id)).toBe(1);
	});

	it('si el cambio no se hace (le última dueñe), sus invitaciones quedan', async () => {
		const { a, b, g, pendingBy } = await setup();
		ok(await removeManager(t.db, a.id, g.slug, b.id, withCode));
		expect(await setManagerRole(t.db, a.id, g.slug, a.id, 'manager')).toMatchObject({
			ok: false
		});
		expect(await pendingBy(a.id)).toBe(1);
	});

	it('les dueñes ven quién mandó cada invitación; les managers no ven las invitaciones', async () => {
		const { a, b, g } = await setup();
		const list = ok(await listManagers(t.db, a.id, g.slug, opts));
		expect(list.invites.map((i) => i.invitedBy).sort()).toEqual([a.email, b.email].sort());
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'manager', withCode));
		expect(ok(await listManagers(t.db, b.id, g.slug, opts)).invites).toEqual([]);
	});
});

describe('integrantes (el proyecto invita, la persona acepta)', () => {
	/**
	 * Une gestora (no dueñe) del proyecto `g` de `owner`.
	 * @param {{ id: string, email: string }} owner
	 * @param {{ slug: string }} g
	 * @param {string} name
	 */
	async function manager(owner, g, name) {
		const c = await account(name);
		ok(await inviteManager(t.db, owner.id, g.slug, c.email, opts));
		ok(await answerInvite(t.db, c.id, (await myInvites(t.db, c.id, opts))[0].id, true, opts));
		return c;
	}

	/** @param {number} id */
	const version = async (id) =>
		Number(
			(await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first())?.version
		);

	it('hasta que acepta, la invitación la ven solo ella y quienes gestionan; después es integrante', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const d = await account('mirone-inventade');
		const g = await create(a.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado',
			show_members: true
		});
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		const q = await create(b.id, { kind: 'persona', title: 'Persona Dos', visibility: 'members' });
		expect(
			await inviteMember(t.db, a.id, g.slug, `https://kinkyvibe.ar/amigues/${p.slug}/`, opts)
		).toEqual({ ok: true, message: MESSAGES.memberInvited });
		// Une gestora que no es dueñe también invita. Invitar de nuevo no duplica nada.
		const c = await manager(a, g, 'gestora-inventada');
		ok(await inviteMember(t.db, c.id, g.slug, q.slug, opts));
		ok(await inviteMember(t.db, a.id, g.slug, p.slug, opts));
		expect(await count('SELECT COUNT(*) AS n FROM profile_member_invites')).toBe(2);

		// Pendiente: ningún edge, la versión de la persona no cambió, nadie más la ve.
		expect(await count('SELECT COUNT(*) AS n FROM edges')).toBe(0);
		expect([await version(p.id), await version(q.id)]).toEqual([1, 1]);
		expect(await listGroupMembers(t.db, a.id, g.slug)).toEqual([]);
		expect(await listGroupMemberInvites(t.db, c.id, g.slug, opts)).toEqual([
			{ id: q.id, slug: q.slug, title: 'Persona Dos' },
			{ id: p.id, slug: p.slug, title: 'Persona Inventada' }
		]);
		expect(await listGroupMemberInvites(t.db, d.id, g.slug, opts)).toEqual([]);
		expect(await listMemberships(t.db, b.id, p.slug)).toEqual([]);
		for (const viewer of [ANON, memberViewer(d.id), memberViewer(c.id)]) {
			expect((await getPublicProfile(t.db, g.slug, viewer))?.members).toEqual([]);
			expect(await getEdges(t.db, g.id, viewer, { direction: 'in' })).toEqual([]);
		}
		expect(await listMyMemberInvites(t.db, b.id, opts)).toEqual([
			{
				groupId: g.id,
				groupTitle: 'Proyecto Inventado',
				personaSlug: p.slug,
				personaTitle: 'Persona Inventada'
			},
			{
				groupId: g.id,
				groupTitle: 'Proyecto Inventado',
				personaSlug: q.slug,
				personaTitle: 'Persona Dos'
			}
		]);
		expect(await listMyMemberInvites(t.db, a.id, opts)).toEqual([]);

		// Acepta las dos.
		ok(await answerMemberInvite(t.db, b.id, p.slug, g.id, true, opts));
		ok(await answerMemberInvite(t.db, b.id, q.slug, g.id, true, opts));
		expect(await count('SELECT COUNT(*) AS n FROM profile_member_invites')).toBe(0);
		expect(await listMyMemberInvites(t.db, b.id, opts)).toEqual([]);
		expect(await listMemberships(t.db, b.id, p.slug)).toEqual([
			{ id: g.id, title: 'Proyecto Inventado' }
		]);
		expect(await listMyMemberships(t.db, b.id)).toEqual([
			{
				groupId: g.id,
				groupTitle: 'Proyecto Inventado',
				personaSlug: q.slug,
				personaTitle: 'Persona Dos'
			},
			{
				groupId: g.id,
				groupTitle: 'Proyecto Inventado',
				personaSlug: p.slug,
				personaTitle: 'Persona Inventada'
			}
		]);
		expect(await listGroupMembers(t.db, a.id, g.slug)).toEqual([
			{ id: q.id, slug: q.slug, title: 'Persona Dos' },
			{ id: p.id, slug: p.slug, title: 'Persona Inventada' }
		]);
		expect(await listGroupMembers(t.db, b.id, g.slug)).toEqual([]);
		expect((await getPublicProfile(t.db, g.slug, memberViewer(d.id)))?.members).toEqual([
			{ slug: q.slug, title: 'Persona Dos' },
			{ slug: p.slug, title: 'Persona Inventada' }
		]);
		// Ya es integrante: invitarla de nuevo no hace nada.
		expect(await inviteMember(t.db, a.id, g.slug, p.slug, opts)).toMatchObject({
			status: 409,
			message: MESSAGES.alreadyMember
		});
		// Si el proyecto no elige mostrarlos, no aparece nadie.
		ok(
			await updateProfile(t.db, a.id, g.slug, { version: 1, title: g.title, show_members: false })
		);
		expect((await getPublicProfile(t.db, g.slug))?.members).toBeNull();
	});

	it('quien no gestiona el proyecto no invita ni saca; nadie más responde por la persona', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const x = await account('otre-inventade');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		const other = await create(a.id, { kind: 'persona', title: 'Otra Persona' });
		expect(await inviteMember(t.db, b.id, g.slug, p.slug, opts)).toEqual({
			ok: false,
			status: 404,
			message: MESSAGES.notFound
		});
		expect(await inviteMember(t.db, a.id, other.slug, p.slug, opts)).toMatchObject({
			status: 400,
			message: MESSAGES.onlyGroups
		});
		ok(await inviteMember(t.db, a.id, g.slug, p.slug, opts));
		// Otra cuenta (ni quien invitó) no puede aceptar por ella.
		expect(await answerMemberInvite(t.db, x.id, p.slug, g.id, true, opts)).toMatchObject({
			status: 404
		});
		expect(await answerMemberInvite(t.db, a.id, p.slug, g.id, true, opts)).toMatchObject({
			status: 404
		});
		expect(await withdrawMemberInvite(t.db, b.id, g.slug, p.id)).toMatchObject({ status: 404 });
		expect(await answerMemberInvite(t.db, b.id, p.slug, g.id + 999, true, opts)).toEqual({
			ok: false,
			status: 404,
			message: MESSAGES.memberInviteGone
		});
		ok(await answerMemberInvite(t.db, b.id, p.slug, g.id, true, opts));
		expect(await removeMember(t.db, b.id, g.slug, p.id, opts)).toMatchObject({ status: 404 });
		expect(await listMemberships(t.db, b.id, p.slug)).toHaveLength(1);
	});

	it('no se puede invitar un perfil oculto (ni propio), uno de proyecto, uno borrado o uno que no existe', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const hidden = await create(b.id, {
			kind: 'persona',
			title: 'Persona Oculta',
			visibility: 'hidden'
		});
		const ownHidden = await create(a.id, {
			kind: 'persona',
			title: 'Mía Oculta',
			visibility: 'hidden'
		});
		const otherGroup = await create(b.id, { kind: 'proyecto', title: 'Otro Proyecto' });
		const gone = await create(b.id, { kind: 'persona', title: 'Persona Borrada' });
		ok(await deleteProfile(t.db, b.id, gone.slug, 1, opts));
		const missing = await inviteMember(t.db, a.id, g.slug, 'no-existe', opts);
		expect(missing).toEqual({
			ok: false,
			status: 404,
			message: MESSAGES.personaNotFound,
			errors: { persona: MESSAGES.personaNotFound }
		});
		for (const slug of [hidden.slug, ownHidden.slug, otherGroup.slug, gone.slug, g.slug, '']) {
			// La misma respuesta que si no existiera: no revela nada.
			expect(await inviteMember(t.db, a.id, g.slug, slug, opts)).toEqual(missing);
		}
		expect(await count('SELECT COUNT(*) AS n FROM profile_member_invites')).toBe(0);
		expect(await count('SELECT COUNT(*) AS n FROM edges')).toBe(0);
	});

	it('rechazar o irse bloquea a ese proyecto 30 días; retirar o sacarla, no', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const g2 = await create(a.id, { kind: 'proyecto', title: 'Otro Proyecto' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });

		// Rechaza: ese proyecto no la puede volver a invitar por 30 días; otro proyecto sí.
		ok(await inviteMember(t.db, a.id, g.slug, p.slug, opts));
		ok(await answerMemberInvite(t.db, b.id, p.slug, g.id, false, opts));
		expect(await listMyMemberInvites(t.db, b.id, opts)).toEqual([]);
		expect(await count('SELECT COUNT(*) AS n FROM edges')).toBe(0);
		const blocked = await inviteMember(t.db, a.id, g.slug, p.slug, { now: NOW + 1000 });
		expect(blocked).toMatchObject({ ok: false, status: 409, message: MESSAGES.recentlyLeft });
		expect(
			await inviteMember(t.db, a.id, g.slug, p.slug, { now: NOW + LEAVE_BLOCK_MS - 1 })
		).toMatchObject({ message: MESSAGES.recentlyLeft });
		// Lo que se guarda es mínimo: proyecto, persona y hasta cuándo.
		expect(await t.db.prepare('SELECT * FROM profile_member_blocks').all()).toMatchObject({
			results: [{ group_id: g.id, persona_id: p.id, until: NOW + LEAVE_BLOCK_MS }]
		});
		ok(await inviteMember(t.db, a.id, g.slug, p.slug, { now: NOW + LEAVE_BLOCK_MS }));
		// La fila vencida se borró al invitar.
		expect(await count('SELECT COUNT(*) AS n FROM profile_member_blocks')).toBe(0);

		// Retirar no bloquea.
		ok(await inviteMember(t.db, a.id, g2.slug, p.slug, opts));
		ok(await withdrawMemberInvite(t.db, a.id, g2.slug, p.id));
		expect(await answerMemberInvite(t.db, b.id, p.slug, g2.id, true, opts)).toMatchObject({
			message: MESSAGES.memberInviteGone
		});
		ok(await inviteMember(t.db, a.id, g2.slug, p.slug, opts));
		ok(await answerMemberInvite(t.db, b.id, p.slug, g2.id, true, opts));

		// Se va (aunque el proyecto pase a oculto): bloqueo de 30 días.
		ok(
			await updateProfile(t.db, a.id, g2.slug, {
				version: 1,
				title: g2.title,
				visibility: 'hidden'
			})
		);
		ok(await leaveMembership(t.db, b.id, p.slug, g2.id, opts));
		expect(await listMemberships(t.db, b.id, p.slug)).toEqual([]);
		ok(await leaveMembership(t.db, b.id, p.slug, g2.id, opts)); // irse de nuevo no rompe nada
		expect(await inviteMember(t.db, a.id, g2.slug, p.slug, opts)).toMatchObject({
			message: MESSAGES.recentlyLeft
		});

		// Si el proyecto la saca (no se fue ella), la puede volver a invitar enseguida.
		const g3 = await create(a.id, { kind: 'proyecto', title: 'Tercer Proyecto' });
		ok(await inviteMember(t.db, a.id, g3.slug, p.slug, opts));
		ok(await answerMemberInvite(t.db, b.id, p.slug, g3.id, true, opts));
		ok(await removeMember(t.db, a.id, g3.slug, p.id, opts));
		ok(await inviteMember(t.db, a.id, g3.slug, p.slug, opts));
	});

	it('"No recibir invitaciones de proyectos": no le llega nada y quien invita ve lo mismo de siempre', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		const q = await create(b.id, { kind: 'persona', title: 'Persona Dos' });
		expect(await getNoGroupInvites(t.db, b.id)).toBe(false);
		await setNoGroupInvites(t.db, b.id, true, opts);
		expect(await getNoGroupInvites(t.db, b.id)).toBe(true);
		expect(await inviteMember(t.db, a.id, g.slug, p.slug, opts)).toEqual({
			ok: true,
			message: MESSAGES.memberInvited
		});
		// Para quienes gestionan, una pendiente como cualquiera; ella no ve nada y no puede aceptar.
		expect((await listGroupMemberInvites(t.db, a.id, g.slug, opts)).map((m) => m.slug)).toEqual([
			p.slug
		]);
		expect(await listMyMemberInvites(t.db, b.id, opts)).toEqual([]);
		expect(await answerMemberInvite(t.db, b.id, p.slug, g.id, true, opts)).toMatchObject({
			message: MESSAGES.memberInviteGone
		});
		expect(await count('SELECT COUNT(*) AS n FROM edges')).toBe(0);
		// Lo vuelve a prender: las invitaciones nuevas le llegan (la silenciada sigue sin verse).
		await setNoGroupInvites(t.db, b.id, false, opts);
		const prefs = await t.db
			.prepare('SELECT preferences FROM accounts WHERE id = ?1')
			.bind(b.id)
			.first();
		expect(prefs?.preferences).toBe('{}');
		ok(await inviteMember(t.db, a.id, g.slug, q.slug, opts));
		expect((await listMyMemberInvites(t.db, b.id, opts)).map((i) => i.personaSlug)).toEqual([
			q.slug
		]);
	});

	it('invitar y retirar muchas veces no cambia la versión de la persona (no le hace fallar lo que edita)', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		for (let i = 0; i < 10; i++) {
			ok(await inviteMember(t.db, a.id, g.slug, p.slug, opts));
			ok(await withdrawMemberInvite(t.db, a.id, g.slug, p.id));
		}
		expect(await version(p.id)).toBe(1);
		ok(
			await updateProfile(
				t.db,
				b.id,
				p.slug,
				{ version: p.version, title: p.title, bio: 'hola' },
				opts
			)
		);
	});

	// Recorre el flujo entero hasta el tope: en la CI tarda más que los 5 s de un test común.
	it('límite de invitaciones por hora por proyecto y por cuenta (se cuenta aunque el perfil no exista)', async () => {
		const a = await account('dueñe-inventade');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const { limit } = MEMBER_INVITE_RATE_LIMITS.group;
		for (let i = 0; i < limit; i++) {
			expect(await inviteMember(t.db, a.id, g.slug, `no-existe-${i}`, opts)).toMatchObject({
				status: 404
			});
		}
		expect(await inviteMember(t.db, a.id, g.slug, 'otra', opts)).toEqual({
			ok: false,
			status: 429,
			message: MESSAGES.tooManyMemberInvites
		});
		ok(
			await inviteMember(
				t.db,
				a.id,
				g.slug,
				(await create(a.id, { kind: 'persona', title: 'Una' })).slug,
				{
					now: NOW + 60 * 60 * 1000
				}
			)
		);

		// Por cuenta: repartido entre proyectos, igual se topea.
		const b = await account('otre-dueñe-inventade');
		const perAccount = MEMBER_INVITE_RATE_LIMITS.account.limit;
		const groups = [];
		for (let i = 0; i * limit < perAccount + 1; i++) {
			groups.push(await create(b.id, { kind: 'proyecto', title: `Otro Proyecto ${i}` }));
		}
		/** @type {any} */
		let last = null;
		for (let i = 0; i <= perAccount; i++) {
			last = await inviteMember(t.db, b.id, groups[Math.floor(i / limit)].slug, `x-${i}`, opts);
		}
		expect(last).toMatchObject({ status: 429 });
	}, 20_000);

	it('aceptar e irse guardan sobre la versión de ahora: no fallan ni pisan lo que la persona editó', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await create(a.id, { kind: 'proyecto', title: 'Proyecto Inventado' });
		const p = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		ok(await inviteMember(t.db, a.id, g.slug, p.slug, opts));
		ok(await updateProfile(t.db, b.id, p.slug, { version: 1, title: 'Nombre Nuevo', bio: 'hola' }));
		ok(await answerMemberInvite(t.db, b.id, p.slug, g.id, true, opts));
		ok(await leaveMembership(t.db, b.id, p.slug, g.id, opts));
		const now = await getManagedProfile(t.db, b.id, p.slug);
		expect(now?.profile).toMatchObject({ title: 'Nombre Nuevo', data: { bio: 'hola' } });
	});

	it('los integrantes y las pendientes que se muestran respetan la visibilidad de cada perfil', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const c = await account('otre-inventade');
		const d = await account('mirone-inventade');
		const g = await create(a.id, {
			kind: 'proyecto',
			title: 'Proyecto Inventado',
			show_members: true
		});
		const pub = await create(b.id, { kind: 'persona', title: 'Persona Pública' });
		const mem = await create(c.id, {
			kind: 'persona',
			title: 'Persona Con Cuenta',
			visibility: 'members'
		});
		const later = await create(c.id, { kind: 'persona', title: 'Persona Tarde' });
		await join(a.id, g, pub, b.id);
		await join(a.id, g, mem, c.id);
		ok(await inviteMember(t.db, a.id, g.slug, later.slug, opts));
		expect((await getPublicProfile(t.db, g.slug, ANON))?.members).toEqual([
			{ slug: pub.slug, title: 'Persona Pública' }
		]);
		expect(
			(await getPublicProfile(t.db, g.slug, memberViewer(d.id)))?.members?.map((m) => m.slug)
		).toEqual([mem.slug, pub.slug]);
		// La persona pasa a oculta: deja de aparecer para todes (también para quien gestiona).
		ok(
			await updateProfile(t.db, b.id, pub.slug, {
				version: 2,
				title: pub.title,
				visibility: 'hidden'
			})
		);
		ok(
			await updateProfile(t.db, c.id, later.slug, {
				version: 1,
				title: later.title,
				visibility: 'hidden'
			})
		);
		expect((await getPublicProfile(t.db, g.slug, ANON))?.members).toEqual([]);
		expect((await listGroupMembers(t.db, a.id, g.slug)).map((m) => m.slug)).toEqual([mem.slug]);
		expect(await listGroupMemberInvites(t.db, a.id, g.slug, opts)).toEqual([]);
		// Ella lo sigue viendo en su Mi rincón y se puede ir.
		expect(await listMemberships(t.db, b.id, pub.slug)).toHaveLength(1);
		ok(await leaveMembership(t.db, b.id, pub.slug, g.id, opts));
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
		const g = await create(a.id, {
			kind: 'proyecto',
			title: 'Zanahoria Proyecto',
			show_members: true
		});
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		for (const p of [one, two]) await join(b.id, g, p, a.id);

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
		// El proyecto muestra integrantes (lo eligió), nunca a quienes lo gestionan.
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

	it('un perfil oculto no se ve fuera de Mi rincón (ni para quien lo creó); se gestiona igual', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('otre-inventade');
		const p = await create(a.id, { kind: 'persona', title: 'Oculta', visibility: 'hidden' });
		expect(await getPublicProfile(t.db, p.slug, memberViewer(a.id))).toBeNull();
		expect(await getPublicProfile(t.db, p.slug, memberViewer(b.id))).toBeNull();
		expect(await getPublicProfile(t.db, p.slug, ANON)).toBeNull();
		expect((await getManagedProfile(t.db, a.id, p.slug))?.profile.visibility).toBe('hidden');
		expect(
			await getPublicProfile(t.db, p.slug, { role: 'admin', id: 'admin-inventade' })
		).not.toBeNull();
	});

	it('quien creó un proyecto oculto y ya no lo gestiona deja de verlo', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await create(a.id, {
			kind: 'proyecto',
			title: 'Proyecto Oculto',
			visibility: 'hidden'
		});
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		ok(await setManagerRole(t.db, a.id, g.slug, b.id, 'owner', withCode));
		ok(await leaveProfile(t.db, a.id, g.slug));
		expect(await getPublicProfile(t.db, g.slug, memberViewer(a.id))).toBeNull();
		expect(await getObject(t.db, { type: 'perfil', slug: g.slug }, memberViewer(a.id))).toBeNull();
		expect(await getManagedProfile(t.db, a.id, g.slug)).toBeNull();
		expect(await getManagedProfile(t.db, b.id, g.slug)).not.toBeNull();
	});
});

describe('al borrar una cuenta', () => {
	it('borra sus personas, pasa los proyectos a quien sigue y borra los que quedan sin nadie', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		const shared = await create(a.id, { kind: 'proyecto', title: 'Proyecto Compartido' });
		const alone = await create(a.id, { kind: 'proyecto', title: 'Proyecto Solo' });
		ok(await inviteManager(t.db, a.id, shared.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));

		await releaseAccountProfiles(t.db, a.id, opts);
		expect(await listMyProfiles(t.db, a.id)).toEqual([]);
		expect(await getPublicProfile(t.db, p.slug)).toBeNull();
		expect(await getPublicProfile(t.db, alone.slug)).toBeNull();
		expect(await getPublicProfile(t.db, shared.slug)).not.toBeNull();
		expect((await getManagedProfile(t.db, b.id, shared.slug))?.role).toBe('owner');
	});

	it('closeAccount (lo que usa "Mi rincón") suelta los perfiles y borra la cuenta', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const p = await create(a.id, { kind: 'persona', title: 'Persona Inventada' });
		const shared = await create(a.id, { kind: 'proyecto', title: 'Proyecto Compartido' });
		ok(await inviteManager(t.db, a.id, shared.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));

		expect(await closeAccount(t.db, a.id, opts)).toBe(true);
		expect(await getPublicProfile(t.db, p.slug)).toBeNull();
		expect((await getManagedProfile(t.db, b.id, shared.slug))?.role).toBe('owner');
		const row = await t.db
			.prepare('SELECT email, deleted_at FROM accounts WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row?.email).toBeNull();
		expect(row?.deleted_at).not.toBeNull();
	});

	it('vacía los perfiles de persona (también los ya borrados) y los desvincula de la cuenta', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const p = await create(a.id, { kind: 'persona', title: 'Nombre Inventado' });
		ok(
			await updateProfile(
				t.db,
				a.id,
				p.slug,
				{
					title: 'Nombre Inventado',
					bio: 'presentación zanahoria',
					pronouns: 'elle',
					links: 'https://example.com/inventade',
					version: p.version
				},
				opts
			)
		);
		const before = await create(a.id, { kind: 'persona', title: 'Otro Nombre' });
		ok(
			await updateProfile(
				t.db,
				a.id,
				before.slug,
				{ title: 'Otro Nombre', bio: 'otra zanahoria', version: before.version },
				opts
			)
		);
		ok(await deleteProfile(t.db, a.id, before.slug, before.version + 1, opts));
		// Un proyecto de otra cuenta la sumó y otro proyecto la tiene bloqueada.
		const g = await create(b.id, {
			kind: 'proyecto',
			title: 'Proyecto Ajeno',
			bio: 'datos del proyecto'
		});
		await join(b.id, g, p, a.id);
		const g2 = await create(b.id, { kind: 'proyecto', title: 'Proyecto Dos' });
		await join(b.id, g2, p, a.id);
		ok(await leaveMembership(t.db, a.id, p.slug, g2.id, opts));
		// Y una invitación pendiente de un tercer proyecto.
		const g3 = await create(b.id, { kind: 'proyecto', title: 'Proyecto Tres' });
		ok(await inviteMember(t.db, b.id, g3.slug, p.slug, opts));
		// Un proyecto propio que pasa a b: queda con sus datos.
		const shared = await create(a.id, { kind: 'proyecto', title: 'Proyecto Compartido' });
		ok(
			await updateProfile(
				t.db,
				a.id,
				shared.slug,
				{ title: 'Proyecto Compartido', bio: 'bio del proyecto', version: shared.version },
				opts
			)
		);
		ok(await inviteManager(t.db, a.id, shared.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));
		ok(await inviteManager(t.db, a.id, shared.slug, 'pendiente@example.com', opts));

		expect(await closeAccount(t.db, a.id, opts)).toBe(true);

		for (const id of [p.id, before.id]) {
			const row = await t.db
				.prepare(
					'SELECT slug, title, data, search_text, created_by, updated_by, deleted_at FROM objects WHERE id = ?1'
				)
				.bind(id)
				.first();
			expect(row?.deleted_at).not.toBeNull();
			expect(row?.title).toBe(DELETED_TITLE);
			expect(JSON.parse(String(row?.data))).toEqual({ kind: 'persona' });
			expect(row?.search_text).toBe('');
			expect(row?.created_by).toBe(DELETED_ACTOR);
			expect(row?.updated_by).toBe(DELETED_ACTOR);
			// La dirección queda reservada.
			expect(row?.slug).toBe(id === p.id ? p.slug : before.slug);
		}
		expect(await count('SELECT COUNT(*) AS n FROM edges WHERE from_id = ?1', [p.id])).toBe(0);
		expect(
			await count('SELECT COUNT(*) AS n FROM profile_managers WHERE account_id = ?1', [a.id])
		).toBe(0);
		expect(
			await count('SELECT COUNT(*) AS n FROM profile_member_blocks WHERE persona_id = ?1', [p.id])
		).toBe(0);
		expect(
			await count('SELECT COUNT(*) AS n FROM profile_member_invites WHERE persona_id = ?1', [p.id])
		).toBe(0);
		expect(
			await count('SELECT COUNT(*) AS n FROM profile_invites WHERE invited_by = ?1', [a.id])
		).toBe(0);
		// Nada queda en la búsqueda, ni para admins.
		expect(
			await searchObjects(t.db, 'zanahoria', { role: 'admin', id: 'admin-inventade' })
		).toEqual([]);
		expect(
			await count(`SELECT COUNT(*) AS n FROM objects_fts WHERE objects_fts MATCH '"zanahoria"'`)
		).toBe(0);
		// Los proyectos quedan con sus datos.
		expect((await getPublicProfile(t.db, shared.slug))?.bio).toBe('bio del proyecto');
		expect(await listGroupMembers(t.db, b.id, g.slug)).toEqual([]);

		// Se puede volver a correr sin problema.
		await releaseAccountProfiles(t.db, a.id, opts);
		expect(await closeAccount(t.db, a.id, opts)).toBe(false);
	});
});

describe('valor viejo «grupo» (antes de la migración 0023)', () => {
	/**
	 * Un proyecto guardado como antes del cambio de nombre: `kind: 'grupo'` en la fila.
	 * @param {string} accountId
	 * @param {Record<string, unknown>} [input]
	 */
	async function legacyProject(accountId, input = {}) {
		const p = await create(accountId, { kind: 'proyecto', title: 'Proyecto Viejo', ...input });
		await t.db
			.prepare(
				"UPDATE objects SET data = json_set(data, '$.kind', 'grupo'), version = version + 1 WHERE id = ?1"
			)
			.bind(p.id)
			.run();
		return { ...p, version: p.version + 1 };
	}

	/** @param {number} id */
	async function storedKind(id) {
		const row = await t.db
			.prepare("SELECT json_extract(data, '$.kind') AS kind FROM objects WHERE id = ?1")
			.bind(id)
			.first();
		return row?.kind;
	}

	it('se lee como proyecto en Mi rincón, en público y en las acciones de proyecto', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('persona-inventada');
		const g = await legacyProject(a.id, { show_members: true });
		const persona = await create(b.id, { kind: 'persona', title: 'Persona Inventada' });
		expect(await storedKind(g.id)).toBe('grupo');

		expect((await listMyProfiles(t.db, a.id)).map((p) => p.kind)).toEqual(['proyecto']);
		expect((await getManagedProfile(t.db, a.id, g.slug))?.kind).toBe('proyecto');
		await join(a.id, g, persona, b.id);
		expect(await getPublicProfile(t.db, g.slug)).toMatchObject({
			kind: 'proyecto',
			members: [{ slug: persona.slug, title: 'Persona Inventada' }]
		});
		ok(await inviteManager(t.db, a.id, g.slug, 'invitade@example.com', opts));
	});

	it('editarlo lo guarda como proyecto; borrarlo también funciona', async () => {
		const a = await account('dueñe-inventade');
		const g = await legacyProject(a.id);
		const edited = ok(
			await updateProfile(t.db, a.id, g.slug, { version: g.version, title: 'Proyecto Viejo' }, opts)
		);
		expect(edited.profile.data.kind).toBe('proyecto');
		expect(await storedKind(g.id)).toBe('proyecto');

		const other = await legacyProject(a.id, { title: 'Otro Proyecto Viejo' });
		ok(await deleteProfile(t.db, a.id, other.slug, other.version, { ...opts, ...withCode }));
		expect(await getPublicProfile(t.db, other.slug)).toBeNull();
	});

	it('al borrar la cuenta no se vacía como si fuera una persona: pasa a quien sigue', async () => {
		const a = await account('dueñe-inventade');
		const b = await account('gestora-inventada');
		const g = await legacyProject(a.id, { bio: 'bio del proyecto' });
		ok(await inviteManager(t.db, a.id, g.slug, b.email, opts));
		ok(await answerInvite(t.db, b.id, (await myInvites(t.db, b.id, opts))[0].id, true, opts));

		await releaseAccountProfiles(t.db, a.id, opts);
		expect(await getPublicProfile(t.db, g.slug)).toMatchObject({
			title: 'Proyecto Viejo',
			kind: 'proyecto',
			bio: 'bio del proyecto'
		});
		expect((await getManagedProfile(t.db, b.id, g.slug))?.role).toBe('owner');
	});

	it('crear con «grupo» (un formulario viejo) crea un proyecto; un tipo inventado no', async () => {
		const a = await account('dueñe-inventade');
		const p = await create(a.id, { kind: 'grupo', title: 'Proyecto Nuevo' });
		expect(p.data.kind).toBe('proyecto');
		expect(await storedKind(p.id)).toBe('proyecto');
		expect(
			await createProfile(t.db, a.id, /** @type {any} */ ({ kind: 'Grupo', title: 'X' }), opts)
		).toMatchObject({ ok: false, status: 400, message: MESSAGES.badKind });
	});
});

describe('lugares desde las cuentas (decisión de gorrite, 0022)', () => {
	it('accountVenueData: pone lo escrito, saca lo vacío y deja lo demás como estaba', () => {
		const current = {
			kind: 'lugar',
			address: 'Calle Vieja 1',
			lat: -34.6,
			lng: -58.4,
			bio: 'Hola'
		};
		expect(
			accountVenueData(
				{
					address: ' Calle Inventada 123 ',
					area: 'Barrio Inventado',
					city: '',
					venue_privacy: 'area'
				},
				current
			)
		).toEqual({
			kind: 'lugar',
			address: 'Calle Inventada 123',
			area: 'Barrio Inventado',
			venue_privacy: 'area',
			lat: -34.6,
			lng: -58.4,
			bio: 'Hola'
		});
		// Sin los campos del formulario de lugar, no toca nada.
		expect(accountVenueData(undefined, current)).toEqual(current);
		// Privacidad vacía = sin elegir (la dirección completa, decisión 0021).
		expect(accountVenueData({ venue_privacy: '' }, { venue_privacy: 'hidden' })).toEqual({});
	});

	it('una cuenta crea un lugar: no es público hasta que une admin lo aprueba', async () => {
		const a = await account('carga-lugar');
		const created = await createProfile(
			t.db,
			a.id,
			{ kind: 'lugar', title: 'Sala Inventada', visibility: 'public' },
			opts
		);
		if (!created.ok) throw new Error(created.message);
		const venue = created.profile;
		expect(venue.data.kind).toBe('lugar');
		const saved = await updateProfile(
			t.db,
			a.id,
			venue.slug,
			{
				title: 'Sala Inventada',
				version: venue.version,
				venue: {
					address: 'Calle Inventada 123',
					area: 'Barrio Inventado',
					city: 'Ciudad Inventada',
					accessibility: '',
					how_to_get_there: '',
					venue_privacy: 'name'
				}
			},
			opts
		);
		expect(saved).toMatchObject({ ok: true });
		expect((await getManagedProfile(t.db, a.id, venue.slug))?.profile.data).toMatchObject({
			kind: 'lugar',
			address: 'Calle Inventada 123',
			area: 'Barrio Inventado',
			venue_privacy: 'name'
		});
		// Sin aprobar: no está en /amigues ni se abre para quien no lo gestiona.
		expect(await findPublicProfile(t.db, venue.slug, ANON)).toBeNull();
		expect(await listPublicProfiles(t.db, ANON, { kind: 'lugar' })).toEqual([]);
		expect((await listPendingVenues(t.db)).map((v) => v.title)).toEqual(['Sala Inventada']);
		// Quien lo cargó lo sigue viendo.
		expect(
			await findPublicProfile(t.db, venue.slug, memberViewer(a.id), { accountId: a.id })
		).not.toBeNull();

		await approveProfile(t.db, venue.id, 'admin-de-prueba');
		expect(await findPublicProfile(t.db, venue.slug, ANON)).not.toBeNull();
		expect(await listPendingVenues(t.db)).toEqual([]);
	});

	it('una privacidad inventada no se guarda', async () => {
		const a = await account('carga-lugar');
		const created = await createProfile(t.db, a.id, { kind: 'lugar', title: 'Otro Lugar' }, opts);
		if (!created.ok) throw new Error(created.message);
		const bad = await updateProfile(
			t.db,
			a.id,
			created.profile.slug,
			{ title: 'Otro Lugar', version: 1, venue: { venue_privacy: 'secreta' } },
			opts
		);
		expect(bad).toMatchObject({ ok: false, status: 400 });
		expect(bad.ok === false && Object.keys(bad.errors ?? {})).toContain('venue_privacy');
	});
});

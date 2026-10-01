/**
 * Permiso "puede tener perfiles" (migración 0015) contra un D1 de miniflare: apagado por
 * defecto; sin él, ninguna lectura de gestión devuelve nada, crear y responder invitaciones se
 * rechazan, las invitaciones no se ven ni llegan por mail, y quien invita recibe lo mismo de
 * siempre. También las novedades para el panel ("cuenta creada", "perfil creado"), sin mails.
 * Datos inventados (dominio example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { canHaveProfiles, deleteAccount, emailHash, upsertVerifiedAccount } from './accounts.js';
import {
	MESSAGES,
	answerInvite,
	answerMemberInvite,
	createProfile,
	getManagedProfile,
	inviteManager,
	inviteMember,
	listMyMemberInvites,
	listMyMemberships,
	listMyProfiles,
	myInvites,
	sendInviteNotice,
	updateProfile
} from './perfiles.js';
import { ACCOUNT_EVENT_ACTOR } from '$lib/server/admin/accountEvents.js';

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

/** @param {string} id @param {boolean} on */
const setPermission = (id, on) =>
	t.db
		.prepare('UPDATE accounts SET can_have_profiles = ?2 WHERE id = ?1')
		.bind(id, on ? 1 : 0)
		.run();

/** Cuenta con el permiso. @param {string} name */
async function permitted(name) {
	const a = await account(name);
	await setPermission(a.id, true);
	return a;
}

const count = async (/** @type {string} */ sql) =>
	Number((await t.db.prepare(sql).first())?.n ?? 0);

describe('permiso apagado por defecto', () => {
	it('una cuenta nueva no lo tiene; la columna nace en 0 y solo acepta 0 o 1', async () => {
		const a = await account('nueva-inventada');
		expect(await canHaveProfiles(t.db, a.id)).toBe(false);
		const row = await t.db
			.prepare('SELECT can_have_profiles AS v FROM accounts WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row?.v).toBe(0);
		await expect(
			t.db.prepare('UPDATE accounts SET can_have_profiles = 2 WHERE id = ?1').bind(a.id).run()
		).rejects.toThrow();
		await setPermission(a.id, true);
		expect(await canHaveProfiles(t.db, a.id)).toBe(true);
	});

	it('nunca para una cuenta borrada, un id que no existe o uno inválido', async () => {
		const a = await permitted('se-va-inventada');
		expect(await deleteAccount(t.db, a.id, opts)).toBe(true);
		expect(await canHaveProfiles(t.db, a.id)).toBe(false);
		// Al borrar la cuenta, el permiso también se va.
		const row = await t.db
			.prepare('SELECT can_have_profiles AS v FROM accounts WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row?.v).toBe(0);
		expect(await canHaveProfiles(t.db, crypto.randomUUID())).toBe(false);
		expect(await canHaveProfiles(t.db, '')).toBe(false);
	});
});

describe('sin el permiso', () => {
	it('crear un perfil se rechaza y no se escribe nada', async () => {
		const a = await account('sin-permiso-inventada');
		const r = await createProfile(t.db, a.id, { kind: 'persona', title: 'Nombre Inventado' }, opts);
		expect(r).toMatchObject({ ok: false, status: 404, message: MESSAGES.notFound });
		expect(await count('SELECT COUNT(*) AS n FROM objects')).toBe(0);
		expect(await count('SELECT COUNT(*) AS n FROM profile_managers')).toBe(0);
	});

	it('sus perfiles dejan de existir para ella; vuelven si le dan el permiso de nuevo', async () => {
		const a = await permitted('dueñe-inventade');
		const created = await createProfile(
			t.db,
			a.id,
			{ kind: 'persona', title: 'Persona Inventada' },
			opts
		);
		if (!created.ok) throw new Error(created.message);
		await setPermission(a.id, false);
		expect(await listMyProfiles(t.db, a.id)).toEqual([]);
		expect(await getManagedProfile(t.db, a.id, 'persona-inventada')).toBeNull();
		const edit = await updateProfile(
			t.db,
			a.id,
			'persona-inventada',
			{ title: 'Pisado', version: 1 },
			opts
		);
		expect(edit).toMatchObject({ ok: false, status: 404 });
		// Nada cambió.
		const row = await t.db.prepare('SELECT title, version FROM objects').first();
		expect(row).toEqual({ title: 'Persona Inventada', version: 1 });

		await setPermission(a.id, true);
		expect((await listMyProfiles(t.db, a.id)).map((p) => p.slug)).toEqual(['persona-inventada']);
	});

	it('invitación a gestionar: quien invita ve lo mismo; sin permiso no se ve, no se acepta y no llega el aviso', async () => {
		const owner = await permitted('dueñe-inventade');
		const withPermission = await permitted('con-permiso-inventada');
		const without = await account('sin-permiso-inventada');
		const g = await createProfile(
			t.db,
			owner.id,
			{ kind: 'grupo', title: 'Grupo Inventado' },
			opts
		);
		if (!g.ok) throw new Error(g.message);

		/** @type {Promise<unknown>[]} */
		const tasks = [];
		const send = vi.fn(async () => /** @type {const} */ ('sent'));
		const notice = {
			send,
			origin: 'https://kinkyvibe.ar',
			defer: (/** @type {Promise<unknown>} */ p) => tasks.push(p)
		};
		const answers = [];
		for (const email of [withPermission.email, without.email, 'nadie-inventade@example.com']) {
			answers.push(
				await inviteManager(t.db, owner.id, 'grupo-inventado', email, { ...opts, notice })
			);
		}
		// Misma respuesta en los tres casos: no dice si hay cuenta ni si tiene el permiso.
		expect(answers[0]).toEqual({ ok: true, message: MESSAGES.invited });
		expect(answers[1]).toEqual(answers[0]);
		expect(answers[2]).toEqual(answers[0]);
		// El aviso sale solo para la cuenta con permiso.
		expect(await Promise.all(tasks)).toEqual(['sent', 'skipped', 'skipped']);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]).toContain(withPermission.email);

		// La cuenta sin permiso no la ve y no la puede usar (ni aceptar ni rechazar).
		expect(await myInvites(t.db, without.id, opts)).toEqual([]);
		const invite = await t.db
			.prepare('SELECT id FROM profile_invites WHERE email_hash = ?1')
			.bind(await emailHash(without.email))
			.first();
		const inviteId = String(invite?.id);
		expect(invite).toBeTruthy();
		for (const accept of [true, false]) {
			expect(await answerInvite(t.db, without.id, inviteId, accept, opts)).toMatchObject({
				ok: false,
				status: 404,
				message: MESSAGES.inviteGone
			});
		}
		expect(await count('SELECT COUNT(*) AS n FROM profile_invites')).toBe(3);
		expect(
			await count(`SELECT COUNT(*) AS n FROM profile_managers WHERE account_id = '${without.id}'`)
		).toBe(0);

		// Con el permiso, la misma invitación aparece (estaba guardada, solo no se mostraba).
		await setPermission(without.id, true);
		expect((await myInvites(t.db, without.id, opts)).map((i) => i.title)).toEqual([
			'Grupo Inventado'
		]);
	});

	it('invitación a integrante: quien invita ve lo mismo; sin permiso no se ve ni se acepta', async () => {
		const owner = await permitted('dueñe-inventade');
		const keeps = await permitted('sigue-inventada');
		const loses = await permitted('pierde-inventada');
		for (const [who, title] of /** @type {const} */ ([
			[keeps, 'Persona Que Sigue'],
			[loses, 'Persona Que Pierde']
		])) {
			const r = await createProfile(t.db, who.id, { kind: 'persona', title }, opts);
			if (!r.ok) throw new Error(r.message);
		}
		const g = await createProfile(
			t.db,
			owner.id,
			{ kind: 'grupo', title: 'Grupo Inventado' },
			opts
		);
		if (!g.ok) throw new Error(g.message);
		await setPermission(loses.id, false);

		const a = await inviteMember(t.db, owner.id, 'grupo-inventado', 'persona-que-sigue', opts);
		const b = await inviteMember(t.db, owner.id, 'grupo-inventado', 'persona-que-pierde', opts);
		expect(a).toEqual({ ok: true, message: MESSAGES.memberInvited });
		expect(b).toEqual(a);

		expect((await listMyMemberInvites(t.db, keeps.id, opts)).map((i) => i.groupTitle)).toEqual([
			'Grupo Inventado'
		]);
		expect(await listMyMemberInvites(t.db, loses.id, opts)).toEqual([]);
		const accept = await answerMemberInvite(
			t.db,
			loses.id,
			'persona-que-pierde',
			g.profile.id,
			true,
			opts
		);
		expect(accept).toMatchObject({ ok: false, status: 404 });
		expect(await count("SELECT COUNT(*) AS n FROM edges WHERE kind = 'es_integrante_de'")).toBe(0);
		expect(await listMyMemberships(t.db, loses.id)).toEqual([]);
	});

	it('sendInviteNotice no le escribe a una cuenta sin permiso', async () => {
		const owner = await permitted('dueñe-inventade');
		const without = await account('sin-permiso-inventada');
		const g = await createProfile(
			t.db,
			owner.id,
			{ kind: 'grupo', title: 'Grupo Inventado' },
			opts
		);
		if (!g.ok) throw new Error(g.message);
		const send = vi.fn(async () => /** @type {const} */ ('sent'));
		const r = await sendInviteNotice(t.db, {
			profileId: g.profile.id,
			email: without.email,
			hash: 'a'.repeat(64),
			notice: { send, origin: 'https://kinkyvibe.ar', defer: () => {} },
			now: NOW
		});
		expect(r).toBe('skipped');
		expect(send).not.toHaveBeenCalled();
	});
});

describe('novedades para el panel', () => {
	it('"cuenta creada" se anota una sola vez (no en cada ingreso) y sin el mail', async () => {
		const a = await account('nueva-inventada');
		await upsertVerifiedAccount(t.db, 'nueva-inventada@example.com', { now: NOW + 5000 });
		const { results } = await t.db
			.prepare(
				'SELECT actor_id, actor_login, action, target_type, target_id, summary, detail FROM admin_audit'
			)
			.all();
		expect(results).toEqual([
			{
				actor_id: null,
				actor_login: ACCOUNT_EVENT_ACTOR,
				action: 'account.create',
				target_type: 'account',
				target_id: a.id,
				summary: 'Se creó una cuenta nueva',
				detail: null
			}
		]);
		expect(JSON.stringify(results)).not.toContain('@example.com');
	});

	it('"perfil creado" se anota con el nombre y el tipo, sin datos de la cuenta', async () => {
		const a = await permitted('dueñe-inventade');
		const g = await createProfile(t.db, a.id, { kind: 'grupo', title: 'Grupo Inventado' }, opts);
		if (!g.ok) throw new Error(g.message);
		const row = await t.db
			.prepare("SELECT * FROM admin_audit WHERE action = 'profile.create'")
			.first();
		expect(row).toMatchObject({
			actor_login: ACCOUNT_EVENT_ACTOR,
			target_type: 'profile',
			target_id: String(g.profile.id),
			summary: 'Se creó el perfil «Grupo Inventado» (grupo)'
		});
		expect(JSON.parse(String(row?.detail))).toEqual({ kind: 'grupo', visibility: 'public' });
		expect(JSON.stringify(row)).not.toContain(a.id);
		expect(JSON.stringify(row)).not.toContain('@example.com');
	});
});

/**
 * Quién ve qué en /amigues: visibilidad (pública, solo con cuenta, oculta), aprobación de les
 * admins, "no listado", integrantes de grupos (solo si el proyecto los muestra, solo aceptades y
 * visibles) y que quienes gestionan no aparecen nunca. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON } from '$lib/server/objects/index.js';
import { memberViewer } from '$lib/server/cuentas/perfiles.js';
import { saveObject } from '../objects/save.js';
import { findPublicProfile, groupMembers, listPublicProfiles, publicProfile } from './profiles.js';
import { approveProfile, unapproveProfile } from './approvals.js';
import { addManager, makeAccount, makeProfile } from './testing.js';

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

const ADMIN = /** @type {const} */ ({ role: 'admin', id: 'admin-de-prueba' });

/** @param {import('$lib/server/objects/visibility.js').Viewer} viewer */
async function listed(viewer) {
	return (await listPublicProfiles(t.db, viewer)).map((p) => p.object.title).sort();
}

describe('visibilidad y aprobación', () => {
	it('pública: todes; solo con cuenta: cuentas y admins; oculta: no se lista nunca', async () => {
		await makeProfile(t.db, { title: 'Pública Inventada' });
		await makeProfile(t.db, { title: 'Con Cuenta Inventada', visibility: 'members' });
		const hidden = await makeProfile(t.db, { title: 'Oculta Inventada', visibility: 'hidden' });
		const member = memberViewer((await makeAccount(t.db, 'mira')).id);
		expect(await listed(ANON)).toEqual(['Pública Inventada']);
		expect(await listed(member)).toEqual(['Con Cuenta Inventada', 'Pública Inventada']);
		// Les admins tampoco la ven listada (para eso está el panel)…
		expect(await listed(ADMIN)).toEqual(['Con Cuenta Inventada', 'Pública Inventada']);
		// …pero sí en su página. Para el resto, no existe.
		expect(await findPublicProfile(t.db, hidden.slug, ADMIN)).not.toBeNull();
		expect(await findPublicProfile(t.db, hidden.slug, ANON)).toBeNull();
		expect(await findPublicProfile(t.db, hidden.slug, member)).toBeNull();
		expect(await findPublicProfile(t.db, 'con-cuenta-inventada', ANON)).toBeNull();
		expect(await findPublicProfile(t.db, 'con-cuenta-inventada', member)).not.toBeNull();
	});

	it('un perfil nuevo de una cuenta no aparece hasta que une admin lo aprueba', async () => {
		const owner = await makeAccount(t.db, 'duene');
		const other = await makeAccount(t.db, 'otre');
		const p = await makeProfile(t.db, {
			title: 'Nuevo Sin Aprobar',
			approved: false,
			actor: `cuenta:${owner.id}`
		});
		await addManager(t.db, p.id, owner.id);
		expect(await listed(ANON)).toEqual([]);
		expect(await findPublicProfile(t.db, p.slug, ANON)).toBeNull();
		expect(
			await findPublicProfile(t.db, p.slug, memberViewer(other.id), { accountId: other.id })
		).toBeNull();
		// Quien lo gestiona y les admins lo ven (con el aviso de que falta aprobarlo).
		const mine = await findPublicProfile(t.db, p.slug, memberViewer(owner.id), {
			accountId: owner.id
		});
		expect(mine).toMatchObject({ approved: false, role: 'owner' });
		expect(await findPublicProfile(t.db, p.slug, ADMIN)).toMatchObject({ approved: false });
		// Aprobado: aparece para todes. Sacado de Amigues: vuelve a no existir.
		expect(await approveProfile(t.db, p.id, 'admin-de-prueba')).toBe(true);
		expect(await approveProfile(t.db, p.id, 'admin-de-prueba')).toBe(false);
		expect(await listed(ANON)).toEqual(['Nuevo Sin Aprobar']);
		expect(await findPublicProfile(t.db, p.slug, ANON)).toMatchObject({ approved: true });
		expect(await unapproveProfile(t.db, p.id)).toBe(true);
		expect(await findPublicProfile(t.db, p.slug, ANON)).toBeNull();
	});

	it('una cuenta sin el permiso de perfiles no ve su perfil sin aprobar', async () => {
		const owner = await makeAccount(t.db, 'sin-permiso', { profiles: false });
		const p = await makeProfile(t.db, { title: 'Sin Permiso', approved: false });
		await addManager(t.db, p.id, owner.id);
		expect(
			await findPublicProfile(t.db, p.slug, memberViewer(owner.id), { accountId: owner.id })
		).toBeNull();
	});

	it('"no listado" y borrado: fuera de la lista; borrado, tampoco su página', async () => {
		await makeProfile(t.db, { title: 'No Listado', data: { unlisted: true } });
		const gone = await makeProfile(t.db, { title: 'Borrado' });
		await saveObject(
			t.db,
			{ id: gone.id, type: 'perfil', version: gone.version, deleted: true },
			{ actor: 'admin-de-prueba' }
		);
		expect(await listed(ANON)).toEqual([]);
		expect(await findPublicProfile(t.db, 'no-listado', ANON)).not.toBeNull();
		expect(await findPublicProfile(t.db, 'borrado', ANON)).toBeNull();
		expect(await findPublicProfile(t.db, 'borrado', ADMIN)).toBeNull();
	});

	it('filtra por tipo', async () => {
		await makeProfile(t.db, { title: 'Persona Inventada' });
		await makeProfile(t.db, { title: 'Proyecto Inventado', kind: 'proyecto' });
		await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const kinds = async (/** @type {any} */ kind) =>
			(await listPublicProfiles(t.db, ANON, { kind })).map((p) => p.object.title);
		expect(await kinds('proyecto')).toEqual(['Proyecto Inventado']);
		expect(await kinds('lugar')).toEqual(['Lugar Inventado']);
	});
});

describe('lo que llega a la página (lista blanca)', () => {
	it('con su contacto público; sin cumpleaños, identidad de género, quién lo creó ni campos de lugar', async () => {
		const p = await makeProfile(t.db, {
			title: 'Con Contacto',
			data: {
				email: 'contacto@example.com',
				tel: '+54 11 0000 0000',
				bday: '2000-01-01',
				gender_identity: 'inventada',
				bio: 'Presentación',
				pronouns_url: 'https://pronombr.es/elle'
			}
		});
		const found = await findPublicProfile(t.db, p.slug, ANON);
		expect(found?.object.created_by).toBe('');
		const view = publicProfile(/** @type {any} */ (found).object, { legacySlug: null });
		const json = JSON.stringify(view);
		expect(json).not.toMatch(/2000-01-01|inventada|admin-de-prueba/);
		expect(view).toMatchObject({
			bio: 'Presentación',
			pronounLabel: 'elle',
			kind: 'persona',
			// Decisión de gorrite (docs/decisiones/0023-contacto-publico.md).
			email: 'contacto@example.com',
			tel: '+54 11 0000 0000'
		});
		expect(view).not.toHaveProperty('bday');
		expect(view).not.toHaveProperty('gender_identity');
	});
});

describe('integrantes de un proyecto', () => {
	/** @param {number} personaId @param {number} groupId */
	async function join(personaId, groupId) {
		const row = await t.db
			.prepare('SELECT version FROM objects WHERE id = ?1')
			.bind(personaId)
			.first();
		await saveObject(
			t.db,
			{
				id: personaId,
				type: 'perfil',
				version: Number(row?.version),
				edges: { es_integrante_de: [groupId] }
			},
			{ actor: 'admin-de-prueba' }
		);
	}

	it('solo si el proyecto los muestra, solo personas aprobadas y visibles, nunca quienes gestionan', async () => {
		const group = await makeProfile(t.db, {
			title: 'Proyecto Inventado',
			kind: 'proyecto',
			data: { show_members: true }
		});
		const a = await makeProfile(t.db, { title: 'Ana Inventada' });
		const b = await makeProfile(t.db, { title: 'Bea Oculta', visibility: 'hidden' });
		const c = await makeProfile(t.db, { title: 'Ceci Sin Aprobar', approved: false });
		const d = await makeProfile(t.db, { title: 'Dani Con Cuenta', visibility: 'members' });
		for (const p of [a, b, c, d]) await join(p.id, group.id);
		const manager = await makeAccount(t.db, 'gestiona');
		await addManager(t.db, group.id, manager.id);
		const fresh = /** @type {any} */ (await findPublicProfile(t.db, group.slug, ANON)).object;
		expect(await groupMembers(t.db, fresh, ANON)).toEqual([
			{ slug: a.slug, title: 'Ana Inventada' }
		]);
		const member = memberViewer((await makeAccount(t.db, 'mira')).id);
		expect((await groupMembers(t.db, fresh, member))?.map((m) => m.title)).toEqual([
			'Ana Inventada',
			'Dani Con Cuenta'
		]);
		// Ni les admins ven acá a les ocultes; y quien gestiona no es integrante.
		expect((await groupMembers(t.db, fresh, ADMIN))?.map((m) => m.title)).not.toContain(
			'Bea Oculta'
		);
		const json = JSON.stringify(await groupMembers(t.db, fresh, ADMIN));
		expect(json).not.toMatch(/gestiona@example\.com|cuenta:/);

		// Sin show_members, null (no se muestra la sección).
		await saveObject(
			t.db,
			{
				id: group.id,
				type: 'perfil',
				version: fresh.version,
				data: { kind: 'proyecto', show_members: false }
			},
			{ actor: 'admin-de-prueba' }
		);
		const hiddenMembers = /** @type {any} */ (await findPublicProfile(t.db, group.slug, ANON))
			.object;
		expect(await groupMembers(t.db, hiddenMembers, ANON)).toBeNull();
	});
});

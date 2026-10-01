/**
 * "Es mi perfil": permiso, límites, que no revela pedidos ajenos, un pedido por cuenta y perfil,
 * aprobar (la cuenta pasa a ser dueñe) y rechazar, y los resguardos al aprobar. D1 de miniflare;
 * datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getManagedProfile } from '$lib/server/cuentas/perfiles.js';
import {
	CLAIM_MESSAGES,
	CLAIM_RATE_LIMITS,
	claimState,
	countPendingClaims,
	createClaim,
	decideClaim,
	listClaims
} from './claims.js';
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

/** @param {string} accountId @param {number} profileId @param {string} [connection] */
const claim = (accountId, profileId, connection = 'conexion-a') =>
	createClaim(t.db, { accountId, profileId, message: 'Soy yo, lo juro', connection });

describe('pedir un perfil', () => {
	it('sin el permiso de perfiles, como si no existiera (y no guarda nada)', async () => {
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const a = await makeAccount(t.db, 'sin-permiso', { profiles: false });
		expect(await claim(a.id, p.id)).toMatchObject({ ok: false, status: 404 });
		expect(await countPendingClaims(t.db)).toBe(0);
	});

	it('guarda el pedido; la misma respuesta haya o no pedidos de otras cuentas', async () => {
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const first = await makeAccount(t.db, 'primera');
		const second = await makeAccount(t.db, 'segunda');
		const r1 = await claim(first.id, p.id);
		const r2 = await claim(second.id, p.id, 'conexion-b');
		expect(r1).toEqual({ ok: true, message: CLAIM_MESSAGES.sent });
		expect(r2).toEqual(r1);
		// Cada cuenta ve solo su estado.
		expect(await claimState(t.db, first.id, p.id)).toBe('pending');
		expect(await claimState(t.db, second.id, p.id)).toBe('pending');
		const third = await makeAccount(t.db, 'tercera');
		expect(await claimState(t.db, third.id, p.id)).toBe('none');
		// Pedirlo de nuevo no duplica.
		expect(await claim(first.id, p.id)).toEqual({ ok: true, message: CLAIM_MESSAGES.already });
		expect(await countPendingClaims(t.db)).toBe(2);
	});

	it('no se piden perfiles ocultos, sin aprobar, borrados o inexistentes', async () => {
		const a = await makeAccount(t.db, 'pide');
		const hidden = await makeProfile(t.db, { title: 'Oculto', visibility: 'hidden' });
		const pending = await makeProfile(t.db, { title: 'Sin Aprobar', approved: false });
		for (const id of [hidden.id, pending.id, 999999, 0]) {
			expect((await claim(a.id, id)).ok).toBe(false);
		}
		expect(await countPendingClaims(t.db)).toBe(0);
	});

	it('si ya lo gestiona, lo dice y no guarda un pedido', async () => {
		const p = await makeProfile(t.db, { title: 'Mío' });
		const a = await makeAccount(t.db, 'gestiona');
		await addManager(t.db, p.id, a.id);
		expect(await claim(a.id, p.id)).toEqual({ ok: true, message: CLAIM_MESSAGES.manager });
		expect(await claimState(t.db, a.id, p.id)).toBe('manager');
		expect(await countPendingClaims(t.db)).toBe(0);
	});

	it('límite por cuenta (antes de mirar el perfil)', async () => {
		const a = await makeAccount(t.db, 'insistente');
		const profiles = [];
		for (let i = 0; i < CLAIM_RATE_LIMITS.account.limit + 1; i++) {
			profiles.push(await makeProfile(t.db, { title: `Ficha ${i} Inventada` }));
		}
		for (let i = 0; i < CLAIM_RATE_LIMITS.account.limit; i++) {
			expect((await claim(a.id, profiles[i].id, `c-${i}`)).ok).toBe(true);
		}
		const over = await claim(a.id, profiles[CLAIM_RATE_LIMITS.account.limit].id, 'otra');
		expect(over).toEqual({ ok: false, status: 429, message: CLAIM_MESSAGES.tooMany });
	});

	it('límite por conexión', async () => {
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		for (let i = 0; i < CLAIM_RATE_LIMITS.connection.limit; i++) {
			const a = await makeAccount(t.db, `cuenta-${i}`);
			expect((await claim(a.id, p.id, 'misma-conexion')).ok).toBe(true);
		}
		const extra = await makeAccount(t.db, 'una-mas');
		expect(await claim(extra.id, p.id, 'misma-conexion')).toMatchObject({ status: 429 });
	});
});

describe('resolver un pedido (admins)', () => {
	it('aprobar: la cuenta pasa a ser dueñe y lo ve en Mi rincón', async () => {
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const a = await makeAccount(t.db, 'duena');
		await claim(a.id, p.id);
		const [pending] = await listClaims(t.db);
		expect(pending).toMatchObject({ profileTitle: 'Ficha Inventada', email: 'duena@example.com' });
		const r = await decideClaim(t.db, pending.id, true, { by: 'admin-de-prueba' });
		expect(r).toMatchObject({
			ok: true,
			claim: { status: 'approved', decidedBy: 'admin-de-prueba' }
		});
		expect((await getManagedProfile(t.db, a.id, p.slug))?.role).toBe('owner');
		expect(await countPendingClaims(t.db)).toBe(0);
		// Dos veces no: ya está resuelto.
		expect(await decideClaim(t.db, pending.id, true, { by: 'otre' })).toMatchObject({
			ok: false,
			status: 409
		});
	});

	it('rechazar: no gestiona nada', async () => {
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const a = await makeAccount(t.db, 'rechazada');
		await claim(a.id, p.id);
		const [pending] = await listClaims(t.db);
		expect(await decideClaim(t.db, pending.id, false, { by: 'admin-de-prueba' })).toMatchObject({
			ok: true,
			claim: { status: 'rejected' }
		});
		expect(await getManagedProfile(t.db, a.id, p.slug)).toBeNull();
		expect(await claimState(t.db, a.id, p.id)).toBe('none');
	});

	it('una persona tiene una sola dueñe; un proyecto puede sumar otra', async () => {
		const persona = await makeProfile(t.db, { title: 'Persona Inventada' });
		const grupo = await makeProfile(t.db, { title: 'Proyecto Inventado', kind: 'proyecto' });
		const first = await makeAccount(t.db, 'primera');
		const second = await makeAccount(t.db, 'segunda');
		await addManager(t.db, persona.id, first.id);
		await addManager(t.db, grupo.id, first.id);
		await claim(second.id, persona.id);
		await claim(second.id, grupo.id);
		const claims = await listClaims(t.db);
		const onPersona = claims.find((c) => c.profileId === persona.id);
		const onGrupo = claims.find((c) => c.profileId === grupo.id);
		expect(await decideClaim(t.db, Number(onPersona?.id), true, { by: 'a' })).toMatchObject({
			ok: false,
			status: 409
		});
		expect(await decideClaim(t.db, Number(onGrupo?.id), true, { by: 'a' })).toMatchObject({
			ok: true
		});
		expect((await getManagedProfile(t.db, second.id, grupo.slug))?.role).toBe('owner');
	});

	it('si la cuenta perdió el permiso, no se aprueba (y se avisa)', async () => {
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const a = await makeAccount(t.db, 'perdio');
		await claim(a.id, p.id);
		await t.db.prepare('UPDATE accounts SET can_have_profiles = 0 WHERE id = ?1').bind(a.id).run();
		const [pending] = await listClaims(t.db);
		expect(pending.canHaveProfiles).toBe(false);
		const r = await decideClaim(t.db, pending.id, true, { by: 'admin-de-prueba' });
		expect(r).toMatchObject({ ok: false, status: 409 });
		expect(await claimState(t.db, a.id, p.id)).toBe('pending');
	});

	it('un pedido que no existe', async () => {
		expect(await decideClaim(t.db, 424242, true, { by: 'a' })).toMatchObject({
			ok: false,
			status: 404
		});
	});
});

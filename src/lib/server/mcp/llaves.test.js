/**
 * Llaves para rutinas del conector de Claude (./llaves.js): crear (se ve una vez, se guarda solo su
 * huella), verificar como Bearer en `/mcp`, revocar de a una, todas las de une admin y las de
 * todes, vencer, y los mismos controles que un token de OAuth (sigue en ADMINS, «Cerrar mis
 * conexiones»). En un D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { closeConnections } from './oauth.js';
import {
	LLAVES_MAX,
	LLAVE_TTL_MS,
	cleanLlaveName,
	createLlave,
	listLlaves,
	llaveAdmin,
	mcpAdmin,
	revokeAllLlaves,
	revokeLlave
} from './llaves.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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

const [ana, beto] = ADMINS;
const NOW = Date.UTC(2026, 10, 2, 12);

/** @param {string} token */
const bearer = (token) =>
	new Request('https://ejemplo.test/mcp', { headers: { authorization: `Bearer ${token}` } });

/** @param {{ ok: boolean }} r */
function tokenOf(r) {
	if (!r.ok) throw new Error('no se creó');
	return /** @type {{ token: string }} */ (/** @type {unknown} */ (r)).token;
}

describe('crear', () => {
	it('devuelve la llave una sola vez y guarda solo su huella', async () => {
		const r = await createLlave(t.db, ana, '  Rutinas de la compu ', NOW);
		expect(r.ok).toBe(true);
		const token = tokenOf(r);
		expect(token).toMatch(/^kvc1_[A-Za-z0-9_-]{43}$/);
		const rows = await t.db.prepare('SELECT * FROM mcp_llaves').all();
		expect(rows.results).toHaveLength(1);
		expect(JSON.stringify(rows.results)).not.toContain(token.slice(5));
		expect(rows.results[0].name).toBe('Rutinas de la compu');
		expect(rows.results[0].expires_at).toBe(NOW + LLAVE_TTL_MS);
		const list = await listLlaves(t.db, ana.id);
		expect(list.map((l) => l.name)).toEqual(['Rutinas de la compu']);
		expect(await listLlaves(t.db, beto.id)).toEqual([]);
	});

	it('pide nombre, solo para admins y con un tope de vigentes', async () => {
		expect((await createLlave(t.db, ana, '   ', NOW)).ok).toBe(false);
		expect((await createLlave(t.db, { id: 1, login: 'nadie' }, 'x', NOW)).ok).toBe(false);
		for (let i = 0; i < LLAVES_MAX; i++)
			expect((await createLlave(t.db, ana, `l${i}`, NOW)).ok).toBe(true);
		const over = await createLlave(t.db, ana, 'otra', NOW);
		expect(over.ok).toBe(false);
		if (!over.ok) expect(over.message).toMatch(/revocá una/);
		expect(cleanLlaveName('a\nb\u0000c')).toBe('a b c');
	});
});

describe('verificar', () => {
	it('una llave buena vale como su admin, y anota el último uso', async () => {
		const token = tokenOf(await createLlave(t.db, ana, 'rutinas', NOW));
		expect(await llaveAdmin(t.db, token, NOW + 1000)).toEqual({ id: ana.id, login: ana.login });
		expect((await listLlaves(t.db, ana.id))[0].lastUsedAt).toBe(NOW + 1000);
		expect(await mcpAdmin(t.db, bearer(token), 'https://ejemplo.test', NOW + 2000)).toEqual({
			id: ana.id,
			login: ana.login,
			via: 'llave'
		});
	});

	it('una inventada, tocada o vencida no vale', async () => {
		const token = tokenOf(await createLlave(t.db, ana, 'rutinas', NOW));
		const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
		expect(await llaveAdmin(t.db, flipped, NOW)).toBeNull();
		expect(await llaveAdmin(t.db, 'kvc1_' + 'a'.repeat(43), NOW)).toBeNull();
		expect(await llaveAdmin(t.db, 'otra-cosa', NOW)).toBeNull();
		expect(await llaveAdmin(t.db, token, NOW + LLAVE_TTL_MS + 1)).toBeNull();
		expect(await mcpAdmin(t.db, bearer(flipped), 'https://ejemplo.test', NOW)).toBeNull();
	});

	it('de une admin que ya no está en la lista, no vale', async () => {
		const token = tokenOf(await createLlave(t.db, ana, 'rutinas', NOW));
		await t.db.prepare('UPDATE mcp_llaves SET admin_id = 1').run();
		expect(await llaveAdmin(t.db, token, NOW)).toBeNull();
	});
});

describe('revocar', () => {
	it('de a una, y solo las propias', async () => {
		const a = await createLlave(t.db, ana, 'una', NOW);
		const b = await createLlave(t.db, ana, 'otra', NOW);
		if (!a.ok || !b.ok) throw new Error('no se crearon');
		expect(await revokeLlave(t.db, beto, a.llave.id, NOW)).toBe(false);
		expect(await revokeLlave(t.db, ana, String(a.llave.id), NOW)).toBe(true);
		expect(await revokeLlave(t.db, ana, a.llave.id, NOW)).toBe(false);
		expect(await llaveAdmin(t.db, a.token, NOW + 1)).toBeNull();
		expect(await llaveAdmin(t.db, b.token, NOW + 1)).not.toBeNull();
	});

	it('todas las de une admin, o las de todes', async () => {
		const a = tokenOf(await createLlave(t.db, ana, 'una', NOW));
		const b = tokenOf(await createLlave(t.db, beto, 'otra', NOW));
		expect(await revokeAllLlaves(t.db, ana.id, NOW)).toBe(1);
		expect(await llaveAdmin(t.db, a, NOW + 1)).toBeNull();
		expect(await llaveAdmin(t.db, b, NOW + 1)).not.toBeNull();
		expect(await revokeAllLlaves(t.db, null, NOW)).toBe(1);
		expect(await llaveAdmin(t.db, b, NOW + 1)).toBeNull();
	});

	it('«Cerrar mis conexiones» también corta las llaves creadas antes', async () => {
		const before = tokenOf(await createLlave(t.db, ana, 'vieja', NOW));
		await closeConnections(t.db, ana, NOW + 10);
		const after = tokenOf(await createLlave(t.db, ana, 'nueva', NOW + 20));
		expect(await llaveAdmin(t.db, before, NOW + 30)).toBeNull();
		expect(await llaveAdmin(t.db, after, NOW + 30)).not.toBeNull();
	});
});

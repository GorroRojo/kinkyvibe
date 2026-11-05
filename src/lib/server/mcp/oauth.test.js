/**
 * Los permisos del conector de Claude (./oauth.js): `lectura` y `edicion` (gorrite, 3/11). Lo que
 * se anuncia, lo que se da según lo que pide Claude, que el permiso viaja del código al token y a
 * la renovación, y que `/mcp` sabe si la conexión puede cambiar. En un D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import {
	ALL_SCOPES,
	CLIENT_ID,
	EDIT_SCOPE,
	SCOPE,
	authServerMetadata,
	bearerAdmin,
	grantedScope,
	issueCode,
	issueTokens,
	parseAuthorizeRequest,
	protectedResourceMetadata,
	readToken,
	resourceOf,
	scopeCanEdit,
	wwwAuthenticate
} from './oauth.js';
import { mcpAdmin } from './llaves.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORIGIN = 'https://ejemplo.test';
const [admin] = ADMINS;
const NOW = Date.UTC(2026, 10, 3, 15);

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

/** Un pedido de autorización como el de claude.ai. @param {string | null} scope */
function authorizeParams(scope) {
	const p = new URLSearchParams({
		response_type: 'code',
		client_id: CLIENT_ID,
		redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
		code_challenge: 'a'.repeat(43),
		code_challenge_method: 'S256',
		state: 'estado-inventado'
	});
	if (scope !== null) p.set('scope', scope);
	return p;
}

/** @param {string} token */
const bearer = (token) =>
	new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });

/** El token de acceso de una conexión con ese permiso. @param {string} scope */
async function accessToken(scope) {
	const r = await issueTokens(
		t.db,
		{ sub: admin.id, aud: resourceOf(ORIGIN), auth: NOW, cid: CLIENT_ID, scope },
		NOW
	);
	return r;
}

describe('lo que se anuncia', () => {
	it('los dos permisos, en los metadatos y en el WWW-Authenticate', () => {
		expect(SCOPE).toBe('lectura');
		expect(EDIT_SCOPE).toBe('edicion');
		expect(protectedResourceMetadata(ORIGIN).scopes_supported).toEqual(['lectura', 'edicion']);
		expect(authServerMetadata(ORIGIN).scopes_supported).toEqual(['lectura', 'edicion']);
		expect(wwwAuthenticate(ORIGIN)).toContain('scope="lectura edicion"');
		expect(wwwAuthenticate(ORIGIN, 'invalid_token')).toContain('scope="lectura edicion"');
	});
});

describe('lo que se da', () => {
	it('`edicion` incluye leer; sin `scope`, solo `lectura`; sin ninguno que exista, nada', () => {
		expect(grantedScope(null)).toBe('lectura');
		expect(grantedScope('lectura')).toBe('lectura');
		expect(grantedScope('lectura edicion')).toBe(ALL_SCOPES);
		expect(grantedScope('edicion lectura')).toBe(ALL_SCOPES);
		expect(grantedScope('edicion')).toBe(ALL_SCOPES);
		expect(grantedScope('lectura otra-cosa')).toBe('lectura');
		expect(grantedScope('otra-cosa')).toBeNull();
		expect(grantedScope('')).toBeNull();
		expect(scopeCanEdit('lectura')).toBe(false);
		expect(scopeCanEdit(ALL_SCOPES)).toBe(true);
		expect(scopeCanEdit(undefined)).toBe(false);
	});

	it('el pedido de autorización lleva el permiso; uno desconocido vuelve a Claude con el error', () => {
		const read = parseAuthorizeRequest(authorizeParams('lectura'), ORIGIN);
		expect(read.ok && read.req.scope).toBe('lectura');
		const edit = parseAuthorizeRequest(authorizeParams('lectura edicion'), ORIGIN);
		expect(edit.ok && edit.req.scope).toBe('lectura edicion');
		const none = parseAuthorizeRequest(authorizeParams(null), ORIGIN);
		expect(none.ok && none.req.scope).toBe('lectura');
		const bad = parseAuthorizeRequest(authorizeParams('escritura'), ORIGIN);
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.redirect).toContain('error=invalid_scope');
	});

	it('el permiso pasa del código al token, y se mantiene al renovar', async () => {
		const parsed = parseAuthorizeRequest(authorizeParams('lectura edicion'), ORIGIN);
		if (!parsed.ok) throw new Error('el pedido debería valer');
		const code = await readToken(t.db, await issueCode(t.db, admin, parsed.req, NOW), 'code', NOW);
		expect(code?.scope).toBe('lectura edicion');
		const tokens = await accessToken(/** @type {string} */ (code?.scope));
		expect(tokens.scope).toBe('lectura edicion');
		const refresh = await readToken(t.db, tokens.refresh_token, 'refresh', NOW);
		expect(refresh?.scope).toBe('lectura edicion');
		await expect(
			issueTokens(
				t.db,
				{ sub: admin.id, aud: resourceOf(ORIGIN), auth: NOW, cid: CLIENT_ID, scope: 'escritura' },
				NOW
			)
		).rejects.toThrow();
	});
});

describe('/mcp sabe si la conexión puede cambiar', () => {
	it('con `lectura`, no; con `edicion`, sí; una llave para rutinas, sí', async () => {
		const read = await accessToken('lectura');
		expect(await bearerAdmin(t.db, bearer(read.access_token), ORIGIN, NOW + 1000)).toEqual({
			id: admin.id,
			login: admin.login,
			canEdit: false
		});
		const edit = await accessToken('lectura edicion');
		expect(await mcpAdmin(t.db, bearer(edit.access_token), ORIGIN, NOW + 1000)).toEqual({
			id: admin.id,
			login: admin.login,
			canEdit: true,
			via: 'oauth'
		});
	});
});

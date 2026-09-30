import { describe, expect, it, vi } from 'vitest';
import {
	ADMINS,
	adminByLogin,
	authCookieOptions,
	isAdmin,
	requireAdmin,
	revokeToken,
	safeRedirect
} from './auth.js';

const origin = 'https://kinkyvibe.ar';

describe('safeRedirect', () => {
	it('keeps same-origin relative paths', () => {
		expect(safeRedirect('/admin', origin)).toBe('/admin');
		expect(safeRedirect('/edit/calendario/x?a=1#h', origin)).toBe('/edit/calendario/x?a=1#h');
	});
	it('accepts absolute URLs on the same origin and returns the path', () => {
		expect(safeRedirect('https://kinkyvibe.ar/calendario/x', origin)).toBe('/calendario/x');
	});
	it('rejects other origins and protocol-relative tricks', () => {
		for (const bad of [
			'https://evil.example',
			'https://kinkyvibe.ar.evil.example/',
			'http://kinkyvibe.ar/admin',
			'//evil.example',
			'/\\evil.example',
			'/\t/evil.example',
			'/\n/evil.example',
			'javascript:alert(1)',
			'evil.example',
			'admin'
		]) {
			expect(safeRedirect(bad, origin, '/fallback')).toBe('/fallback');
		}
	});
	it('falls back for missing / non-string values', () => {
		expect(safeRedirect(null, origin)).toBe('/');
		expect(safeRedirect(undefined, origin, '/admin')).toBe('/admin');
		expect(safeRedirect('', origin)).toBe('/');
	});
});

describe('isAdmin', () => {
	it('allows listed numeric GitHub ids', () => {
		expect(isAdmin({ id: 4594048 })).toBe(true);
		expect(isAdmin({ id: 138258106 })).toBe(true);
		expect(isAdmin({ id: 45673502 })).toBe(true);
	});
	it('ignores the login: a listed name with another id is not an admin', () => {
		expect(isAdmin(/** @type {any} */ ({ login: 'GorroRojo' }))).toBe(false);
		expect(isAdmin(/** @type {any} */ ({ login: 'GorroRojo', id: 1 }))).toBe(false);
		expect(isAdmin(/** @type {any} */ ({ login: 'someone-else', id: 4594048 }))).toBe(true);
	});
	it('rejects missing or non-numeric ids', () => {
		expect(isAdmin(/** @type {any} */ ({ id: '4594048' }))).toBe(false);
		expect(isAdmin(/** @type {any} */ ({ id: 4594048.5 }))).toBe(false);
		expect(isAdmin({ id: 0 })).toBe(false);
		expect(isAdmin(undefined)).toBe(false);
		expect(isAdmin(null)).toBe(false);
	});
	it('keeps one entry per id, with a login label', () => {
		expect(new Set(ADMINS.map((a) => a.id)).size).toBe(ADMINS.length);
		for (const a of ADMINS) {
			expect(Number.isSafeInteger(a.id)).toBe(true);
			expect(a.login).toBeTruthy();
		}
		expect(Object.isFrozen(ADMINS)).toBe(true);
	});
	it('adminByLogin finds the entry for the dev-only fake session', () => {
		expect(adminByLogin('GorroRojo')?.id).toBe(4594048);
		expect(adminByLogin('nobody')).toBeUndefined();
	});
});

describe('revokeToken', () => {
	const app = { clientId: 'cid', clientSecret: 'secret' };
	it('sends DELETE /applications/{client_id}/token with basic auth', async () => {
		const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
		expect(await revokeToken('tok', app, /** @type {any} */ (fetchFn))).toBe(true);
		const [url, init] = /** @type {any} */ (fetchFn.mock.calls[0]);
		expect(url).toBe('https://api.github.com/applications/cid/token');
		expect(init.method).toBe('DELETE');
		expect(init.headers.Authorization).toBe('Basic ' + btoa('cid:secret'));
		expect(JSON.parse(init.body)).toEqual({ access_token: 'tok' });
	});
	it('does nothing without a token or app credentials', async () => {
		const fetchFn = vi.fn();
		expect(await revokeToken('', app, fetchFn)).toBe(false);
		expect(await revokeToken('tok', { clientId: 'cid' }, fetchFn)).toBe(false);
		expect(fetchFn).not.toHaveBeenCalled();
	});
	it('never throws', async () => {
		const failing = vi.fn(async () => {
			throw new Error('network');
		});
		expect(await revokeToken('tok', app, /** @type {any} */ (failing))).toBe(false);
		const notFound = vi.fn(async () => new Response(null, { status: 404 }));
		expect(await revokeToken('tok', app, /** @type {any} */ (notFound))).toBe(false);
	});
});

describe('requireAdmin', () => {
	const url = new URL('https://kinkyvibe.ar/edit/calendario/x');
	/**
	 * @param {() => any} fn
	 * @returns {any}
	 */
	function thrown(fn) {
		try {
			fn();
		} catch (e) {
			return e;
		}
	}
	it('redirects anonymous users to login', () => {
		const e = thrown(() => requireAdmin({ user: undefined, user_token: '' }, url));
		expect(e.status).toBe(303);
		expect(e.location).toBe('/login?redirectTo=%2Fedit%2Fcalendario%2Fx');
	});
	it('gives logged-in non-admins a 403 instead of redirecting', () => {
		const e = thrown(() =>
			requireAdmin(
				{ user: { id: 1, login: 'GorroRojo', name: null, avatar_url: '' }, user_token: 't' },
				url
			)
		);
		expect(e.status).toBe(403);
		expect(e.location).toBeUndefined();
		expect(e.body.message).toBeTruthy();
	});
	it('returns the admin user', () => {
		const user = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };
		expect(requireAdmin({ user, user_token: 't' }, url)).toBe(user);
	});
});

describe('authCookieOptions', () => {
	it('is httpOnly, lax, path / and secure in production', () => {
		expect(authCookieOptions(new URL('https://kinkyvibe.ar/'))).toEqual({
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax'
		});
	});
	it('is not secure only on http://localhost', () => {
		expect(authCookieOptions(new URL('http://localhost:5173/'), 600)).toMatchObject({
			secure: false,
			maxAge: 600
		});
	});
});

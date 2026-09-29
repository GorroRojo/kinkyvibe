import { describe, expect, it } from 'vitest';
import { authCookieOptions, isAdmin, requireAdmin, safeRedirect } from './auth.js';

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
	it('only allows listed logins', () => {
		expect(isAdmin({ login: 'GorroRojo' })).toBe(true);
		expect(isAdmin({ login: 'Tallarines333' })).toBe(true);
		expect(isAdmin({ login: 'someone' })).toBe(false);
		expect(isAdmin({ login: '' })).toBe(false);
		expect(isAdmin(undefined)).toBe(false);
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
			requireAdmin({ user: { login: 'x', name: null, avatar_url: '' }, user_token: 't' }, url)
		);
		expect(e.status).toBe(403);
		expect(e.location).toBeUndefined();
		expect(e.body.message).toBeTruthy();
	});
	it('returns the admin user', () => {
		const user = { login: 'GorroRojo', name: null, avatar_url: '' };
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

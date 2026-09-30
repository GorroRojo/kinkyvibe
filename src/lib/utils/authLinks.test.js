import { describe, expect, it } from 'vitest';
import { loginHref, logoutHref, returnPath } from './authLinks.js';
import { logoutRedirectTarget } from '../../routes/logout/logout.js';
import { safeRedirect } from '$lib/server/auth.js';

const origin = 'https://kinkyvibe.ar';

describe('authLinks', () => {
	it('returnPath: ruta + query, sin origen ni hash', () => {
		expect(returnPath(new URL(origin + '/calendario?tags=a&q=b#x'))).toBe('/calendario?tags=a&q=b');
		expect(returnPath(new URL(origin + '/'))).toBe('/');
	});
	it('codifica redirectTo (la query de la página no se mezcla con la de /logout)', () => {
		const url = new URL(origin + '/calendario?tags=a&q=b');
		expect(logoutHref(url)).toBe('/logout?redirectTo=%2Fcalendario%3Ftags%3Da%26q%3Db');
		expect(loginHref(url)).toBe('/login?redirectTo=%2Fcalendario%3Ftags%3Da%26q%3Db');
	});
	it('/logout recupera la página completa y safeRedirect la acepta', () => {
		const href = logoutHref(new URL(origin + '/material?tags=a&q=b'));
		const target = logoutRedirectTarget(new URL(origin + href));
		expect(safeRedirect(target, origin, '/admin')).toBe('/material?tags=a&q=b');
	});
});

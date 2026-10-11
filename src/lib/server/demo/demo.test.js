import { describe, expect, it } from 'vitest';
import { isAdmin, requireAdmin } from '../auth.js';
import { PREVIEW_BUILD, isPreviewDeploy } from '../deploy.js';
import { DEMO_COOKIE, DEMO_TOKEN, demoUser, isDemoUser } from './identity.js';
import { startDemoSession } from './login.js';

describe('demo identity', () => {
	it('is only an admin on preview deploys', () => {
		expect(isAdmin(demoUser(), true)).toBe(true);
		expect(isAdmin(demoUser(), false)).toBe(false);
	});
	it('is refused in this (non-preview) build by default, like production', () => {
		expect(isPreviewDeploy()).toBe(false);
		expect(PREVIEW_BUILD).toBe(false);
		expect(isAdmin(demoUser())).toBe(false);
	});
	it('requireAdmin gives the demo session a 403 outside previews', () => {
		let e;
		try {
			requireAdmin(
				{ user: demoUser(), user_token: DEMO_TOKEN },
				new URL('https://kinkyvibe.ar/admin')
			);
		} catch (err) {
			e = /** @type {any} */ (err);
		}
		expect(e?.status).toBe(403);
	});
	it('only matches the exact demo identity, and never a real admin id', () => {
		expect(isDemoUser(demoUser())).toBe(true);
		expect(isDemoUser({ id: -1, login: 'GorroRojo' })).toBe(false);
		expect(isDemoUser({ id: 4594048, login: 'demo' })).toBe(false);
		// `preview` must be exactly true (a stray truthy argument doesn't count).
		expect(isAdmin(demoUser(), /** @type {any} */ (1))).toBe(false);
		// Real admins are unaffected by the flag.
		expect(isAdmin({ id: 4594048 }, false)).toBe(true);
	});
});

describe('startDemoSession', () => {
	function fakeCookies() {
		/** @type {Map<string, {value: string, opts: any}>} */
		const jar = new Map();
		return {
			jar,
			cookies: /** @type {any} */ ({
				set: (/** @type {string} */ name, /** @type {string} */ value, /** @type {any} */ opts) =>
					jar.set(name, { value, opts })
			})
		};
	}
	const url = new URL('https://demo.kinkyvibe.pages.dev/login/demo');

	it('refuses outside previews and sets no cookie', () => {
		const { jar, cookies } = fakeCookies();
		expect(startDemoSession({ preview: false, cookies, url, redirectTo: '/admin' })).toBeNull();
		expect(jar.size).toBe(0);
	});
	it('on previews sets an httpOnly cookie and redirects same-origin only', () => {
		const { jar, cookies } = fakeCookies();
		expect(startDemoSession({ preview: true, cookies, url, redirectTo: '/admin/ventas' })).toBe(
			'/admin/ventas'
		);
		expect(jar.get(DEMO_COOKIE)?.value).toBe('1');
		expect(jar.get(DEMO_COOKIE)?.opts.httpOnly).toBe(true);
		expect(
			startDemoSession({ preview: true, cookies, url, redirectTo: 'https://evil.example' })
		).toBe('/admin');
	});
});

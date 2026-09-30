import { describe, expect, it } from 'vitest';
import { confirmLogoutPage, isSameOriginNavigation, logoutRedirectTarget } from './logout.js';
import { safeRedirect } from '$lib/server/auth';

const origin = 'https://kinkyvibe.ar';

describe('logoutRedirectTarget', () => {
	it('reads an encoded redirectTo', () => {
		const url = new URL(
			'/logout?redirectTo=' + encodeURIComponent('/calendario?tags=a&q=b'),
			origin
		);
		expect(logoutRedirectTarget(url)).toBe('/calendario?tags=a&q=b');
	});
	it('keeps the whole query of an unencoded redirectTo', () => {
		const url = new URL('/logout?redirectTo=https://kinkyvibe.ar/calendario?tags=a&q=b', origin);
		expect(safeRedirect(logoutRedirectTarget(url), origin)).toBe('/calendario?tags=a&q=b');
	});
	it('still only allows same-origin targets', () => {
		for (const bad of ['https://evil.example/', '//evil.example', '/%0a/evil.example']) {
			const url = new URL('/logout?redirectTo=' + bad, origin);
			expect(safeRedirect(logoutRedirectTarget(url), origin, '/admin')).toBe('/admin');
		}
	});
	it('falls back to searchParams when redirectTo is not first, and to null', () => {
		expect(logoutRedirectTarget(new URL('/logout?x=1&redirectTo=%2Fa', origin))).toBe('/a');
		expect(logoutRedirectTarget(new URL('/logout', origin))).toBeNull();
	});
});

describe('isSameOriginNavigation', () => {
	it('allows same-origin links and typed URLs only', () => {
		const h = (/** @type {string|null} */ v) => new Headers(v ? { 'sec-fetch-site': v } : {});
		expect(isSameOriginNavigation(h('same-origin'))).toBe(true);
		expect(isSameOriginNavigation(h('none'))).toBe(true);
		expect(isSameOriginNavigation(h('cross-site'))).toBe(false);
		expect(isSameOriginNavigation(h('same-site'))).toBe(false);
		expect(isSameOriginNavigation(h(null))).toBe(false);
	});
});

describe('confirmLogoutPage', () => {
	it('is a POST form to /logout with the escaped target', () => {
		const html = confirmLogoutPage('/x?a="><script>');
		expect(html).toContain('<form method="POST" action="/logout">');
		expect(html).toContain('value="/x?a=&quot;&gt;&lt;script&gt;"');
		expect(html).not.toContain('"><script>');
	});
});

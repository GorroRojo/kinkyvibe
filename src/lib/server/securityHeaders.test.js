import { describe, expect, it } from 'vitest';
import { isNoFramePath, withSecurityHeaders } from './securityHeaders.js';

/** @param {string} path @param {ResponseInit} [init] */
const run = (path, init) =>
	withSecurityHeaders(new URL(`https://kinkyvibe.ar${path}`), new Response('ok', init));

describe('withSecurityHeaders', () => {
	it('el panel, el editor y las entradas no se pueden embeber', () => {
		for (const p of [
			'/admin',
			'/admin/eventos/x/ordenes',
			'/edit/material/x',
			'/login',
			'/entradas/t/abc'
		]) {
			const h = run(p).headers;
			expect(h.get('X-Frame-Options')).toBe('DENY');
			expect(h.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
		}
	});
	it('el resto del sitio se puede embeber, pero lleva nosniff y referrer-policy', () => {
		const h = run('/calendario/algo').headers;
		expect(h.get('X-Frame-Options')).toBeNull();
		expect(h.get('Content-Security-Policy')).toBeNull();
		expect(h.get('X-Content-Type-Options')).toBe('nosniff');
		expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});
	it('no confunde prefijos parecidos', () => {
		expect(isNoFramePath('/administracion')).toBe(false);
		expect(isNoFramePath('/editorial')).toBe(false);
		expect(isNoFramePath('/admin')).toBe(true);
	});
	it('suma frame-ancestors a una CSP que ya existe', () => {
		const h = run('/admin', {
			headers: { 'Content-Security-Policy': "default-src 'self'" }
		}).headers;
		expect(h.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'none'");
	});
	it('no rompe con headers inmutables', () => {
		const res = Response.redirect('https://kinkyvibe.ar/', 302);
		expect(() => withSecurityHeaders(new URL('https://kinkyvibe.ar/admin'), res)).not.toThrow();
	});
});

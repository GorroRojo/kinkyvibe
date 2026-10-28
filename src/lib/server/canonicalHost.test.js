import { describe, expect, it } from 'vitest';
import { wwwRedirect, wwwRedirectResponse } from './canonicalHost.js';

describe('wwwRedirect', () => {
	it('www → apex con el mismo camino y la misma query', () => {
		expect(wwwRedirect(new URL('https://www.kinkyvibe.ar/calendario?viewdate=2025-03'))).toBe(
			'https://kinkyvibe.ar/calendario?viewdate=2025-03'
		);
		expect(wwwRedirect(new URL('http://www.kinkyvibe.ar/'))).toBe('https://kinkyvibe.ar/');
		expect(wwwRedirect(new URL('https://WWW.KinkyVibe.ar/wiki/BDSM'))).toBe(
			'https://kinkyvibe.ar/wiki/BDSM'
		);
	});

	it('el apex, los Previews y localhost no se tocan (sin bucles)', () => {
		for (const u of [
			'https://kinkyvibe.ar/calendario',
			'https://rama-kinkyvibe.example.workers.dev/',
			'http://localhost:5173/',
			'https://www.example.com/',
			'https://www.kinkyvibe.ar.example.com/'
		]) {
			expect(wwwRedirect(new URL(u)), u).toBeNull();
		}
		// el destino nunca vuelve a redirigir
		const target = /** @type {string} */ (wwwRedirect(new URL('https://www.kinkyvibe.ar/x')));
		expect(wwwRedirect(new URL(target))).toBeNull();
	});
});

describe('wwwRedirectResponse', () => {
	const url = new URL('https://www.kinkyvibe.ar/material?tags=bondage');
	it('301 para GET y HEAD, 308 para lo demás', () => {
		for (const [method, status] of /** @type {const} */ ([
			['GET', 301],
			['HEAD', 301],
			['POST', 308]
		])) {
			const res = wwwRedirectResponse(new Request(url, { method }), url);
			expect(res?.status).toBe(status);
			expect(res?.headers.get('location')).toBe('https://kinkyvibe.ar/material?tags=bondage');
		}
	});

	it('en el apex, nada', () => {
		const apex = new URL('https://kinkyvibe.ar/');
		expect(wwwRedirectResponse(new Request(apex), apex)).toBeNull();
	});
});

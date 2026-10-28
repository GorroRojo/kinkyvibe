/**
 * La precarga de SvelteKit (hooks.server.js): el JS y el CSS como siempre y, de las letras, solo
 * las dos Lato latin (400 y 700) con el nombre con hash que les pone Vite.
 */
import { describe, expect, it, vi } from 'vitest';
import { preloadFile, withPreload } from './preload.js';

const ASSETS = './_app/immutable/assets';

describe('preloadFile', () => {
	it('el JS y el CSS, como siempre', () => {
		expect(preloadFile({ type: 'js', path: './_app/immutable/chunks/abc.js' })).toBe(true);
		expect(preloadFile({ type: 'css', path: `${ASSETS}/0.abc.css` })).toBe(true);
	});

	it('las Lato latin 400 y 700, y ninguna otra letra', () => {
		expect(
			preloadFile({ type: 'font', path: `${ASSETS}/lato-latin-400-normal.BEhtfm5r.woff2` })
		).toBe(true);
		expect(
			preloadFile({ type: 'font', path: `${ASSETS}/lato-latin-700-normal.BU_g-n4.woff2` })
		).toBe(true);
		for (const path of [
			`${ASSETS}/lato-latin-ext-400-normal.CK4GAP86.woff2`,
			`${ASSETS}/lato-latin-ext-700-normal.C6gwlRgY.woff2`,
			`${ASSETS}/lato-latin-900-normal.abc.woff2`,
			`${ASSETS}/otra-letra-latin-400-normal.abc.woff2`
		])
			expect(preloadFile({ type: 'font', path }), path).toBe(false);
	});

	it('otros archivos (imágenes…), no', () => {
		expect(preloadFile({ type: 'asset', path: `${ASSETS}/logo.abc.png` })).toBe(false);
	});
});

describe('withPreload', () => {
	it('le pasa la precarga a resolve, sin pisar lo que se le pase', async () => {
		const resolve = vi.fn(async () => new Response('ok'));
		const event = /** @type {any} */ ({});
		await withPreload(resolve)(event);
		expect(resolve).toHaveBeenCalledWith(event, { preload: preloadFile });
		const own = () => true;
		await withPreload(resolve)(event, { preload: own });
		expect(resolve).toHaveBeenLastCalledWith(event, { preload: own });
	});
});

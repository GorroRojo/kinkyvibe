import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { skipsBeacon, stripAnalyticsBeacon, withoutBeacon } from './analyticsBeacon.js';

/** La plantilla real del sitio, con el beacon. */
const appHtml = fs.readFileSync(path.resolve('src/app.html'), 'utf8');

/**
 * Lo que devuelve `resolve` con la plantilla, pasando por el `transformPageChunk` que reciba.
 * @param {string} pathname
 */
async function render(pathname) {
	/** @type {any} */
	const resolve = async (/** @type {any} */ _event, /** @type {any} */ opts) => {
		const html = opts?.transformPageChunk
			? await opts.transformPageChunk({ html: appHtml, done: true })
			: appHtml;
		return new Response(html);
	};
	const event = /** @type {any} */ ({ url: new URL(`http://localhost${pathname}`) });
	return (await withoutBeacon(resolve)(event, undefined)).text();
}

describe('beacon de Cloudflare Web Analytics', () => {
	it('la plantilla lo tiene (si no, este test no prueba nada)', () => {
		expect(appHtml).toContain('static.cloudflareinsights.com');
	});

	it('no se carga en la puerta con link (/puerta, /puerta/<slug>)', async () => {
		for (const p of ['/puerta', '/puerta/fiesta-de-prueba', '/puerta/fiesta-de-prueba/lista']) {
			expect(skipsBeacon(p)).toBe(true);
			const html = await render(p);
			expect(html, p).not.toContain('cloudflareinsights');
			expect(html, p).not.toContain('data-cf-beacon');
			// El resto de la página queda.
			expect(html).toContain('%sveltekit.body%');
		}
	});

	it('en el resto del sitio sigue', async () => {
		for (const p of ['/', '/eventos', '/puertas', '/admin/eventos/x/ingreso']) {
			expect(skipsBeacon(p), p).toBe(false);
			expect(await render(p), p).toContain('static.cloudflareinsights.com');
		}
	});

	it('respeta un transformPageChunk que ya venga', async () => {
		/** @type {any} */
		const resolve = async (/** @type {any} */ _e, /** @type {any} */ opts) =>
			new Response(await opts.transformPageChunk({ html: appHtml, done: true }));
		const event = /** @type {any} */ ({ url: new URL('http://localhost/puerta') });
		const html = await (
			await withoutBeacon(resolve)(event, {
				transformPageChunk: ({ html }) => html.replace('<body', '<body data-x="1"')
			})
		).text();
		expect(html).toContain('data-x="1"');
		expect(html).not.toContain('cloudflareinsights');
	});

	it('hooks.server.js pasa cada página por withoutBeacon', () => {
		const hooks = fs.readFileSync(path.resolve('src/hooks.server.js'), 'utf8');
		expect(hooks).toMatch(/const resolve = withoutBeacon\(/);
	});

	it('saca también un <script> del beacon suelto', () => {
		const html =
			'<p>a</p><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{}"></script><p>b</p>';
		expect(stripAnalyticsBeacon(html)).toBe('<p>a</p><p>b</p>');
	});
});

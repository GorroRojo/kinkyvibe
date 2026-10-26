/**
 * `static/site.webmanifest`: el nombre del sitio, el idioma, los íconos (con el `maskable`) y el
 * mismo color que el `theme-color` de las páginas (`hsl(319, 90%, 60%)`, en hex porque los
 * manifests no siempre entienden hsl).
 */
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SITE_NAME } from './seo.js';
import { SITE_TAGLINE } from './previewTexts.js';

const manifest = JSON.parse(
	readFileSync(new URL('../../../static/site.webmanifest', import.meta.url), 'utf8')
);

/** hsl → #rrggbb (h en grados, s y l de 0 a 1). @param {number} h @param {number} s @param {number} l */
function hslToHex(h, s, l) {
	const f = (/** @type {number} */ n) => {
		const k = (n + h / 30) % 12;
		const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(c * 255)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

describe('site.webmanifest', () => {
	it('se llama como el sitio, en español de Argentina, con id y descripción', () => {
		expect(manifest.name).toBe(SITE_NAME);
		expect(manifest.short_name).toBe(SITE_NAME);
		expect(manifest.lang).toBe('es-AR');
		expect(manifest.id).toBe('/');
		expect(manifest.description).toBe(SITE_TAGLINE);
	});

	it('theme_color es el mismo color que el meta theme-color', () => {
		expect(manifest.theme_color).toBe(hslToHex(319, 0.9, 0.6));
	});

	it('tiene los íconos de siempre (`any`) y uno aparte `maskable` de 512 × 512 que existe', async () => {
		/** @type {{ src: string, sizes: string, type: string, purpose?: string }[]} */
		const icons = manifest.icons;
		const plain = icons.filter((i) => (i.purpose ?? 'any') === 'any').map((i) => i.src);
		expect(plain).toEqual(['/android-chrome-192x192.png', '/android-chrome-512x512.png']);

		const maskable = icons.filter((i) => i.purpose === 'maskable');
		expect(maskable).toEqual([
			{ src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		]);
		const file = new URL('../../../static/maskable-512x512.png', import.meta.url);
		expect(existsSync(file)).toBe(true);
		const meta = await sharp(file.pathname).metadata();
		expect([meta.format, meta.width, meta.height]).toEqual(['png', 512, 512]);
		// Sin transparencia: Android rellena lo transparente con su color y se vería un borde.
		expect(meta.hasAlpha).toBe(false);
	});
});

/**
 * `static/site.webmanifest`: el nombre del sitio, el idioma y el mismo color que el `theme-color`
 * de las páginas (`hsl(319, 90%, 60%)`, en hex porque los manifests no siempre entienden hsl).
 */
import { readFileSync } from 'node:fs';
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
});

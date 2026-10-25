/**
 * El logo de arriba de las páginas públicas lleva `width` y `height` (las medidas del PNG): así el
 * navegador le reserva el lugar antes de que llegue y la página no salta. El CSS lo achica con
 * `height: auto`, así que se ve igual que antes. Lee el código y el PNG (no levanta el sitio).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LAYOUT = path.resolve('src/routes/(content)/+layout.svelte');
const LOGO = path.resolve('src/routes/logo.png');

/** Ancho y alto de un PNG (el encabezado IHDR). @param {Buffer} png */
const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe('el logo del layout público', () => {
	const source = fs.readFileSync(LAYOUT, 'utf8');

	it('tiene width y height iguales a las medidas del PNG', () => {
		const img = source.match(/<img src=\{logo\}[^>]*>/)?.[0] ?? '';
		const { width, height } = pngSize(fs.readFileSync(LOGO));
		expect(img).toContain(`width="${width}"`);
		expect(img).toContain(`height="${height}"`);
	});

	it('el CSS lo deja con height: auto (no lo estira)', () => {
		const rule = source.match(/#logo img \{([^}]*)\}/)?.[1] ?? '';
		expect(rule).toMatch(/height:\s*auto/);
		expect(rule).toMatch(/max-width:\s*10vh/);
	});
});

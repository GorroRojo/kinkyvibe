/**
 * La URL de la imagen de una serie: un archivo de src/lib/assets o la imagen de un evento
 * (`calendario:<evento>/<archivo>`), como sale en este deploy. Sobre archivos reales.
 */
import { describe, expect, it } from 'vitest';
import { seriesImageURL } from './index.js';

describe('seriesImageURL', () => {
	it('un archivo de src/lib/assets', async () => {
		expect(await seriesImageURL('picantearla-miniatura.webp')).toMatch(/picantearla-miniatura/);
	});
	it('la imagen de un evento, sin copiarla', async () => {
		expect(await seriesImageURL('calendario:colectiver-2026-08/1.webp')).toMatch(/1\.webp|data:/);
	});
	it('nada, o algo que no existe: undefined', async () => {
		expect(await seriesImageURL(undefined)).toBeUndefined();
		expect(await seriesImageURL('calendario:no-existe-este-evento/1.webp')).toBeUndefined();
		expect(await seriesImageURL('no-existe-esta-imagen.webp')).toBeUndefined();
	});
});

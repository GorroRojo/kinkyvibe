/**
 * La URL de la imagen de una serie: un archivo de src/lib/assets o la imagen de un evento
 * (`calendario:<evento>/<archivo>`), como sale en este deploy. Sobre archivos reales.
 */
import { describe, expect, it } from 'vitest';
import { seriesImageURL } from './index.js';
import { legacyAssetURL, legacyMediaURL } from '$lib/utils/legacyMedia.js';

describe('seriesImageURL', () => {
	// Las imágenes viejas ya no están en el repo: su copia en la biblioteca ($lib/utils/legacyMedia.js).
	it('un archivo de src/lib/assets', async () => {
		const url = await seriesImageURL('picantearla-miniatura.webp');
		expect(url).toMatch(/\/media\/img\/[0-9a-f]{64}\.webp$/);
		expect(url).toBe(legacyAssetURL('picantearla-miniatura.webp'));
	});
	it('la imagen de un evento, sin copiarla', async () => {
		const url = await seriesImageURL('calendario:colectiver-2026-08/1.webp');
		expect(url).toMatch(/\/media\/img\/[0-9a-f]{64}\.webp$/);
		expect(url).toBe(legacyMediaURL('calendario', 'colectiver-2026-08', '1.webp'));
	});
	it('nada, o algo que no existe: undefined', async () => {
		expect(await seriesImageURL(undefined)).toBeUndefined();
		expect(await seriesImageURL('calendario:no-existe-este-evento/1.webp')).toBeUndefined();
		expect(await seriesImageURL('no-existe-esta-imagen.webp')).toBeUndefined();
	});
});

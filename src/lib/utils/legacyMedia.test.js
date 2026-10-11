import { describe, expect, it } from 'vitest';
import map from './legacyMedia.json';
import {
	legacyAssetNames,
	legacyAssetURL,
	legacyMediaFolders,
	legacyMediaURL,
	legacyNumberedURL
} from './legacyMedia.js';

describe('legacyMedia', () => {
	it('cada imagen vieja apunta a una imagen de la biblioteca', () => {
		const entries = Object.entries(map);
		expect(entries.length).toBeGreaterThan(0);
		for (const [path, url] of entries) {
			expect(path).toMatch(/^(?:assets\/[\w.-]+|posts\/[a-z]+\/media\/[\w.-]+\/[\w.-]+)$/);
			expect(url).toMatch(/^\/media\/img\/[0-9a-f]{64}\.(?:webp|png|jpg)$/);
		}
	});

	it('fuera de producción usa la dirección del sitio público', () => {
		// En vitest no hay rama de deploy: no es producción.
		expect(legacyAssetURL('picantearla-miniatura.webp')).toBe(
			`https://kinkyvibe.ar${map['assets/picantearla-miniatura.webp']}`
		);
	});

	it('numerada, por nombre de archivo y de src/lib/assets', () => {
		expect(legacyNumberedURL('material', 'collares-electricos', 2)).toBe(
			legacyMediaURL('material', 'collares-electricos', '2.webp')
		);
		expect(legacyNumberedURL('material', 'collares-electricos', 9)).toBeUndefined();
		expect(legacyNumberedURL('material', 'collares-electricos', 'x')).toBeUndefined();
		expect(legacyMediaURL('amigues', 'AUCH', 'spoiler.webp')).toMatch(/\/media\/img\//);
		expect(legacyMediaURL('amigues', '..', 'spoiler.webp')).toBeUndefined();
		expect(legacyAssetURL('no-existe.webp')).toBeUndefined();
	});

	it('los nombres de src/lib/assets y las carpetas viejas', () => {
		expect(legacyAssetNames()).toContain('picantearla-miniatura.webp');
		expect(legacyMediaFolders('calendario')).toContain('festival-24-7-2023');
		expect(legacyMediaFolders('material')).not.toContain('festival-24-7-2023');
	});
});

import { describe, expect, it } from 'vitest';
import { saveCopy, savedSummary } from './saveCopy.js';

describe('saveCopy', () => {
	it('la base: ningún texto habla de GitHub, PRs, deploys ni de esperar minutos', () => {
		const c = saveCopy(true);
		expect(c.askGorrite).toBe(false);
		expect(c.editHelp).toContain('enseguida');
		expect(c.contentSaved).toBe('Guardado. Ya se ve en el sitio.');
		expect(c.confirmPublish).toBe('Se va a ver en el sitio enseguida.');
		expect(c.pathExists).toBe('Ya existe una publicación con esa dirección. Elegí otra.');
		for (const [key, text] of Object.entries(c)) {
			if (typeof text !== 'string') continue;
			expect(text, key).not.toMatch(/GitHub|commit|\bPR\b|deploy|pruebas automáticas/i);
			// Solo la imagen nueva (que sigue yendo al repo) tarda.
			if (key !== 'contentHelp') expect(text, key).not.toContain('minutos');
		}
	});
});

describe('savedSummary', () => {
	it('en la base: se ve enseguida', () => {
		expect(savedSummary({ savedToDb: true })).toBe('Guardado. Se ve enseguida en el sitio.');
	});
});

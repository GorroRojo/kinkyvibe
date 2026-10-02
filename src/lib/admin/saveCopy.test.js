import { describe, expect, it } from 'vitest';
import { commitSavedToDb, pathExistsMessage, saveCopy, savedSummary } from './saveCopy.js';

describe('saveCopy', () => {
	it('apagado (GitHub): los textos de siempre', () => {
		const c = saveCopy(false);
		expect(c.editHelp).toBe(
			'Al guardar, el cambio pasa por las pruebas automáticas y se publica solo: tarda unos minutos (normalmente menos de 15) en verse.'
		);
		expect(c.askGorrite).toBe(true);
		expect(c.contentHelp).toBe(
			'Los cambios tardan unos minutos (normalmente entre 2 y 5) en verse en el sitio.'
		);
		expect(c.contentSaved).toBe('Guardado. El sitio se actualiza en unos minutos.');
		expect(c.contentCreated).toBe(
			'Se ve en el sitio (y en la lista) cuando termina el deploy, en unos minutos.'
		);
		expect(c.checkingSlug).toBe('Comprobando en GitHub…');
		expect(c.confirmPublish).toBe('Se va a ver en el sitio en unos minutos.');
		expect(c.saving).toBe('Guardando en GitHub…');
		expect(c.filePreview).toBe('Ver el archivo que se va a guardar');
		expect(c.saveFailed).toBe('No se pudo guardar en GitHub: ');
		expect(c.slugCheckFailed).toBe('No pudimos consultar GitHub: ');
	});

	it('sin decir nada (undefined/null) es lo mismo que apagado', () => {
		expect(saveCopy(undefined)).toBe(saveCopy(false));
		expect(saveCopy(null)).toBe(saveCopy(false));
	});

	it('prendido (la base): ningún texto habla de GitHub, PRs, deploys ni de esperar minutos', () => {
		const c = saveCopy(true);
		expect(c.askGorrite).toBe(false);
		expect(c.editHelp).toContain('enseguida');
		expect(c.contentSaved).toBe('Guardado. Ya se ve en el sitio.');
		expect(c.confirmPublish).toBe('Se va a ver en el sitio enseguida.');
		for (const [key, text] of Object.entries(c)) {
			if (typeof text !== 'string') continue;
			expect(text, key).not.toMatch(/GitHub|commit|\bPR\b|deploy|pruebas automáticas/i);
			// Solo la imagen nueva (que sigue yendo al repo) tarda.
			if (key !== 'contentHelp') expect(text, key).not.toContain('minutos');
		}
	});

	it('los dos tienen las mismas claves', () => {
		expect(Object.keys(saveCopy(true)).sort()).toEqual(Object.keys(saveCopy(false)).sort());
	});
});

describe('pathExistsMessage', () => {
	it('con GitHub nombra el archivo; con la base, no', () => {
		expect(pathExistsMessage(false, 'src/lib/posts/material/x.md')).toBe(
			'Ya existe src/lib/posts/material/x.md en GitHub. Elegí otra dirección.'
		);
		expect(pathExistsMessage(true, 'src/lib/posts/material/x.md')).toBe(
			'Ya existe una publicación con esa dirección. Elegí otra.'
		);
	});
});

describe('savedSummary', () => {
	it('en la base: se ve enseguida (y la imagen nueva, si va en un PR, tarda)', () => {
		expect(savedSummary({ savedToDb: true })).toBe('Guardado. Se ve enseguida en el sitio.');
		expect(savedSummary({ savedToDb: true, pr: { state: 'auto' } })).toBe(
			'Guardado. Se ve enseguida en el sitio; la imagen nueva tarda unos minutos.'
		);
	});

	it('con GitHub: según el PR', () => {
		expect(savedSummary({ pr: { state: 'auto' } })).toBe(
			'Guardado. Se publica en unos minutos, cuando pasen las pruebas.'
		);
		expect(savedSummary({ pr: { state: 'open' } })).toContain('no se publica solo');
		expect(savedSummary({ pr: { state: 'merged' } })).toContain('publicado');
	});

	it('sin PR ni base (modo de prueba): solo «Guardado.»', () => {
		expect(savedSummary({ savedToDb: false, pr: null })).toBe('Guardado.');
	});
});

describe('commitSavedToDb', () => {
	it('mira la lista `db` que devuelve el guardado con el interruptor prendido', () => {
		expect(commitSavedToDb({ sha: 'base', url: '/material/x', db: ['material/x'] })).toBe(true);
		expect(commitSavedToDb({ sha: 'abc', url: 'https://x', db: [] })).toBe(false);
		expect(commitSavedToDb({ sha: 'abc', url: 'https://x' })).toBe(false);
		expect(commitSavedToDb(null)).toBe(false);
		expect(commitSavedToDb(undefined)).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { breadcrumbLd, isSectionActive, sectionCrumb } from './navigation.js';

describe('isSectionActive', () => {
	it('la sección y lo que cuelga de ella', () => {
		expect(isSectionActive('/calendario', '/calendario')).toBe(true);
		expect(isSectionActive('/calendario/', '/calendario')).toBe(true);
		expect(isSectionActive('/calendario/un-taller', '/calendario')).toBe(true);
	});

	it('no se prende con la palabra en otra parte de la ruta', () => {
		expect(isSectionActive('/mi-rincon/calendario', '/calendario')).toBe(false);
		expect(isSectionActive('/calendarios', '/calendario')).toBe(false);
		expect(isSectionActive('/material', '/calendario')).toBe(false);
		expect(isSectionActive('/', '/calendario')).toBe(false);
	});

	it('el inicio solo en el inicio', () => {
		expect(isSectionActive('/', '/')).toBe(true);
		expect(isSectionActive('/material', '/')).toBe(false);
	});

	it('los links externos nunca están activos', () => {
		expect(isSectionActive('/', 'https://tienda.kinkyvibe.ar')).toBe(false);
		expect(isSectionActive('/tienda.kinkyvibe.ar', '//tienda.kinkyvibe.ar')).toBe(false);
		expect(isSectionActive('/calendario', '')).toBe(false);
	});
});

describe('sectionCrumb', () => {
	it('nombre y ruta de la sección', () => {
		expect(sectionCrumb('material')).toEqual({ name: 'material', path: '/material' });
		expect(sectionCrumb('wiki')).toEqual({ name: 'Kinkipedia', path: '/wiki' });
	});

	it('sin categoría, nada', () => {
		expect(sectionCrumb(undefined)).toBeNull();
		expect(sectionCrumb('')).toBeNull();
	});
});

describe('breadcrumbLd', () => {
	it('apunta a las URLs reales del sitio', () => {
		expect(breadcrumbLd('calendario', 'https://kinkyvibe.ar')).toEqual({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://kinkyvibe.ar/' },
				{
					'@type': 'ListItem',
					position: 2,
					name: 'calendario',
					item: 'https://kinkyvibe.ar/calendario'
				}
			]
		});
	});

	it('usa el mismo nombre que la miga visible y no duplica barras', () => {
		const ld = /** @type {any} */ (breadcrumbLd('wiki', 'http://localhost:5173/'));
		expect(ld.itemListElement[1]).toMatchObject({
			name: 'Kinkipedia',
			item: 'http://localhost:5173/wiki'
		});
		expect(JSON.stringify(ld)).not.toContain('example.com');
	});

	it('sin categoría, nada', () => {
		expect(breadcrumbLd(undefined, 'https://kinkyvibe.ar')).toBeNull();
	});
});

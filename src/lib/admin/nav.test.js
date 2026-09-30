import { describe, expect, it } from 'vitest';
import {
	EVENT_TABS,
	MOBILE_TABS,
	NAV,
	NAV_GROUPS,
	activeNavItem,
	eventHref,
	eventPanelLink,
	navItem,
	navLink
} from './nav.js';

describe('NAV', () => {
	it('ids y hrefs únicos, todos bajo /admin', () => {
		expect(new Set(NAV.map((i) => i.id)).size).toBe(NAV.length);
		expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
		for (const i of NAV) expect(i.href === '/admin' || i.href.startsWith('/admin/')).toBe(true);
	});
	it('cada ítem es de un grupo conocido (o Inicio)', () => {
		const groups = new Set(NAV_GROUPS.map((g) => g.id));
		for (const i of NAV) expect(i.group === null || groups.has(i.group)).toBe(true);
	});
	it('tiene todas las secciones planeadas para esta noche', () => {
		const hrefs = NAV.map((i) => i.href);
		for (const h of [
			'/admin',
			'/admin/eventos',
			'/admin/eventos/nuevo',
			'/admin/eventos/importar',
			'/admin/eventos/agenda',
			'/admin/checkin',
			'/admin/entradas',
			'/admin/entradas/transferencias',
			'/admin/entradas/codigos',
			'/admin/personas',
			'/admin/estadisticas',
			'/admin/material',
			'/admin/amigues',
			'/admin/etiquetas',
			'/admin/no-listadas',
			'/admin/ajustes/cobros',
			'/admin/ajustes/fondo',
			'/admin/ajustes/mails',
			'/admin/ajustes/admins',
			'/admin/actividad'
		]) {
			expect(hrefs).toContain(h);
		}
	});
	it('la barra del celu usa ítems que existen', () => {
		for (const id of MOBILE_TABS) if (id !== 'mas') expect(navItem(id)).toBeTruthy();
	});
});

describe('navLink', () => {
	it('usa el href si existe, el fallback si no, o null', () => {
		expect(
			navLink({ id: 'a', href: '/admin/a', emoji: '', label: '', group: null, soon: false })
		).toBe('/admin/a');
		expect(
			navLink({
				id: 'a',
				href: '/admin/a',
				emoji: '',
				label: '',
				group: null,
				soon: true,
				fallback: '/admin'
			})
		).toBe('/admin');
		expect(
			navLink({ id: 'a', href: '/admin/a', emoji: '', label: '', group: null, soon: true })
		).toBe(null);
	});
});

describe('activeNavItem', () => {
	it('marca el href más largo que coincide', () => {
		expect(activeNavItem('/admin')?.id).toBe('inicio');
		expect(activeNavItem('/admin/')?.id).toBe('inicio');
		expect(activeNavItem('/admin/entradas/codigos')?.id).toBe('entradas-codigos');
		expect(activeNavItem('/admin/eventos/nuevo')?.id).toBe('eventos-nuevo');
	});
	it('páginas sin ítem propio marcan su sección', () => {
		expect(activeNavItem('/admin/entradas/alguno')?.id).toBe('entradas');
		expect(activeNavItem('/admin/eventos/alguno/ventas')?.id).toBe('eventos');
	});
	it('Inicio no se marca en subpáginas', () => {
		expect(activeNavItem('/admin/otra')).toBeUndefined();
	});
});

describe('links a la ficha del evento', () => {
	it('eventHref arma la URL de cada pestaña', () => {
		expect(eventHref('picantearla-2026-10')).toBe('/admin/eventos/picantearla-2026-10');
		expect(eventHref('x', 'ordenes')).toBe('/admin/eventos/x/ordenes');
	});
	it('eventPanelLink usa la página vieja mientras la ficha no existe', () => {
		const link = eventPanelLink('x', { tickets: true });
		if (EVENT_TABS[0].soon) {
			expect(link).toBe('/admin/entradas/x');
			expect(eventPanelLink('x')).toBe('/admin/eventos/nuevo?desde=x');
		} else {
			expect(link).toBe('/admin/eventos/x');
		}
	});
});

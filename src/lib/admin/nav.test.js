import { describe, expect, it } from 'vitest';
import {
	EVENT_TABS,
	MOBILE_TABS,
	NAV,
	NAV_GROUPS,
	activeNavItem,
	eventHref,
	contentEditLink,
	eventPanelLink,
	navGroupItems,
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
			'/admin/ajustes/interruptores',
			'/admin/actividad',
			'/admin/cuentas',
			'/admin/eventos/lugares'
		]) {
			expect(hrefs).toContain(h);
		}
	});
	it('la barra del celu usa ítems que existen', () => {
		for (const id of MOBILE_TABS) if (id !== 'mas') expect(navItem(id)).toBeTruthy();
	});
	it('"Importar planilla" no está en el menú pero sigue en NAV (buscador) con su página', () => {
		const importar = navItem('eventos-importar');
		expect(importar?.menu).toBe(false);
		expect(importar && navLink(importar)).toBe('/admin/eventos/importar');
		// Lugares (noche 3, bloque A) se sumó a Eventos, antes de Check-in (mapa del panel).
		expect(navGroupItems('eventos').map((i) => i.id)).toEqual([
			'eventos',
			'eventos-nuevo',
			'eventos-agenda',
			'eventos-lugares',
			'checkin'
		]);
		for (const g of [null, ...NAV_GROUPS.map((x) => x.id)])
			for (const i of navGroupItems(g)) expect(i.menu).not.toBe(false);
	});
	it('una sola sección «Perfiles» (decisión de gorrite): /admin/amigues, con el contador', () => {
		const perfiles = NAV.filter((i) => /perfil|amigue/i.test(`${i.id} ${i.label}`));
		expect(perfiles).toHaveLength(1);
		expect(perfiles[0]).toMatchObject({
			id: 'amigues',
			href: '/admin/amigues',
			label: 'Perfiles',
			counter: 'profilesToReview'
		});
		expect(NAV.filter((i) => i.href.startsWith('/admin/cuentas/')).map((i) => i.id)).toEqual([]);
	});
	it('los parent apuntan a ítems que existen y están en el menú', () => {
		for (const i of NAV) if (i.parent) expect(navItem(i.parent)?.menu).not.toBe(false);
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
		expect(activeNavItem('/admin/cuentas')?.id).toBe('cuentas');
		expect(activeNavItem('/admin/cuentas/00000000-0000-4000-8000-000000000000')?.id).toBe(
			'cuentas'
		);
		// La ficha de un perfil es parte de Perfiles (/admin/amigues), no de Cuentas.
		expect(activeNavItem('/admin/cuentas/perfiles/12')?.id).toBe('amigues');
		expect(activeNavItem('/admin/amigues')?.id).toBe('amigues');
		expect(activeNavItem('/admin/amigues/Gorro_Rojo')?.id).toBe('amigues');
	});
	it('páginas sin ítem propio marcan su sección', () => {
		expect(activeNavItem('/admin/entradas/alguno')?.id).toBe('entradas');
		expect(activeNavItem('/admin/eventos/alguno/ventas')?.id).toBe('eventos');
	});
	it('Importar planilla marca la Agenda (o Eventos mientras la Agenda no existe)', () => {
		const agenda = navItem('eventos-agenda');
		expect(activeNavItem('/admin/eventos/importar')?.id).toBe(
			agenda && !agenda.soon ? 'eventos-agenda' : 'eventos'
		);
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
	it('eventPanelLink va a Ventas si el evento vende entradas, si no al Resumen', () => {
		expect(EVENT_TABS[0].soon).toBe(false);
		expect(eventPanelLink('x', { tickets: true })).toBe('/admin/eventos/x/ventas');
		expect(eventPanelLink('x')).toBe('/admin/eventos/x');
	});
	it('contentEditLink: los eventos se editan en la ficha, lo demás en /edit', () => {
		expect(contentEditLink('/calendario/picantearla-2026-10')).toBe(
			'/admin/eventos/picantearla-2026-10/editar'
		);
		expect(contentEditLink('/calendario/picantearla-2026-10/')).toBe(
			'/admin/eventos/picantearla-2026-10/editar'
		);
		expect(contentEditLink('/material/guia')).toBe('/edit/material/guia');
		expect(contentEditLink('/amigues/alguien')).toBe('/edit/amigues/alguien');
		expect(contentEditLink('/calendario')).toBeNull();
		expect(contentEditLink('/calendario/x/compartir')).toBeNull();
		expect(contentEditLink('/wiki/algo')).toBeNull();
	});
	it('la agenda tiene su ítem', () => {
		expect(activeNavItem('/admin/eventos/agenda')?.id).toBe('eventos-agenda');
	});
});

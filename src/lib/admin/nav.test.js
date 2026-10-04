import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import {
	AJUSTES_SUBGROUPS,
	EVENT_TABS,
	MOBILE_TABS,
	NAV,
	NAV_AREAS,
	NAV_GROUPS,
	REVIEW_LINK,
	activeNavItem,
	areaBackLink,
	areaCount,
	eventHref,
	contentEditLink,
	eventPanelLink,
	groupCount,
	navAreaItems,
	navAreaSections,
	navFlagKeys,
	navGroupItems,
	navGroupOf,
	navGroupSections,
	navItem,
	navLink,
	navState,
	reviewCountOf,
	soonItemAt
} from './nav.js';
import { buildCommands, matchCommands } from './commands.js';
import { match as soonMatcher } from '../../params/soon.js';

/** Las rutas con página (`+page.svelte`) de `src/routes/(authed)/admin`, como URLs. */
function adminPages() {
	const root = new URL('../../routes/(authed)/admin/', import.meta.url);
	/** @type {string[]} */
	const out = [];
	/**
	 * @param {URL} dir
	 * @param {string} path
	 */
	const walk = (dir, path) => {
		for (const name of readdirSync(dir)) {
			if (name === '+page.svelte') out.push(path);
			else if (statSync(new URL(name, dir)).isDirectory())
				walk(new URL(name + '/', dir), `${path}/${name}`);
		}
	};
	walk(root, '/admin');
	return out;
}

describe('NAV', () => {
	it('ids y hrefs únicos, todos bajo /admin', () => {
		expect(new Set(NAV.map((i) => i.id)).size).toBe(NAV.length);
		expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
		for (const i of NAV) expect(i.href === '/admin' || i.href.startsWith('/admin/')).toBe(true);
	});
	it('cada ítem es de un área válida (o Inicio, el único sin área)', () => {
		const areas = new Set(NAV_AREAS.map((a) => a.id));
		for (const i of NAV) expect(i.area === null || areas.has(i.area), i.id).toBe(true);
		expect(NAV.filter((i) => i.area === null).map((i) => i.id)).toEqual(['inicio']);
	});
	it('las 7 áreas aprobadas, en orden, con ícono, y Ajustes al pie', () => {
		expect(NAV_AREAS.map((a) => a.label)).toEqual([
			'Eventos',
			'Ventas',
			'Comunidad',
			'Mensajes',
			'Etiquetas',
			'Contenido',
			'Estadísticas',
			'Ajustes'
		]);
		for (const a of NAV_AREAS) expect(a.icon && a.emoji, a.id).toBeTruthy();
		expect(NAV_AREAS.filter((a) => a.foot).map((a) => a.id)).toEqual(['ajustes']);
	});
	it('cada sección de Ajustes tiene su subgrupo (Plata, Comunicación, Equipo, Sistema)', () => {
		const subs = new Set(AJUSTES_SUBGROUPS.map((g) => g.id));
		for (const i of NAV) {
			if (i.area === 'ajustes') expect(subs.has(String(i.sub)), i.id).toBe(true);
			else expect(i.sub, i.id).toBeUndefined();
		}
		expect(navAreaSections('ajustes').map((g) => g.label)).toEqual([
			'Plata',
			'Comunicación',
			'Equipo',
			'Sistema'
		]);
	});
	it('cada próximamente tiene fase y texto; las que existen, no', () => {
		const soon = NAV.filter((i) => i.soon);
		expect(soon.length).toBeGreaterThan(0);
		for (const i of soon) {
			expect(Number.isInteger(i.phase) && Number(i.phase) > 0, i.id).toBe(true);
			expect(i.soonText, i.id).toBeTruthy();
			expect(i.flag, i.id).toBeUndefined();
		}
		for (const i of NAV.filter((x) => !x.soon)) expect(i.phase, i.id).toBeUndefined();
	});
	it('los próximamente no pisan ninguna página que exista, y las demás sí tienen página', () => {
		const pages = new Set(adminPages());
		for (const i of NAV) expect(pages.has(i.href), i.href).toBe(!i.soon);
	});
	it('ninguna página del panel queda sin lugar en el mapa', () => {
		// Cada página está en NAV o es parte de una sección (subpágina), salvo estas dos.
		const outside = [
			'/admin/borrar/[kind]/[slug]', // botón "Borrar" de cada ficha; "Recuperar" está en Actividad
			'/admin/[...section=soon]', // la página "Próximamente"
			'/admin/[...rest]' // el 404 del panel (cualquier dirección que no es de ninguna página)
		];
		for (const page of adminPages()) {
			if (outside.includes(page)) continue;
			expect(activeNavItem(page.replace(/\[[^\]]+\]/g, 'x')), page).toBeTruthy();
		}
	});
	it('tiene todas las secciones de antes del mapa (no se perdió ningún href)', () => {
		const hrefs = NAV.map((i) => i.href);
		for (const h of [
			'/admin',
			'/admin/eventos',
			'/admin/eventos/nuevo',
			'/admin/eventos/importar',
			'/admin/eventos/agenda',
			'/admin/checkin',
			'/admin/ventas',
			'/admin/ventas/transferencias',
			'/admin/ventas/codigos',
			'/admin/comunidad/personas',
			'/admin/estadisticas',
			'/admin/ajustes/propinas',
			'/admin/contenido/material',
			'/admin/comunidad/perfiles',
			'/admin/etiquetas',
			'/admin/contenido/no-listadas',
			'/admin/ajustes/cobros',
			'/admin/ajustes/fondo',
			'/admin/ajustes/mails',
			'/admin/ajustes/admins',
			'/admin/ajustes/interruptores',
			'/admin/ajustes/actividad',
			'/admin/comunidad/cuentas',
			// La lista de Cuentas › Perfiles se unió a /admin/comunidad/perfiles (Perfiles, decisión de gorrite
			// del 1/10): su página se borró, ver REMOVED en adminPaths.test.js.
			'/admin/eventos/lugares'
		]) {
			expect(hrefs).toContain(h);
		}
	});
	it('una sola sección «Perfiles» en Comunidad (decisión de gorrite): /admin/comunidad/perfiles', () => {
		const perfiles = NAV.filter((i) => /perfil|amigue/i.test(`${i.id} ${i.label}`));
		expect(perfiles).toHaveLength(1);
		expect(perfiles[0]).toMatchObject({
			id: 'amigues',
			href: '/admin/comunidad/perfiles',
			label: 'Perfiles',
			area: 'comunidad',
			counter: 'profilesToReview'
		});
		expect(
			NAV.filter((i) => i.href.startsWith('/admin/comunidad/cuentas/')).map((i) => i.id)
		).toEqual([]);
	});
	it('la barra del celu usa ítems que existen', () => {
		for (const id of MOBILE_TABS) if (id !== 'mas') expect(navItem(id)).toBeTruthy();
		expect(MOBILE_TABS).toEqual(['inicio', 'eventos', 'checkin', 'entradas', 'mas']);
	});
	it('"Importar planilla" no está en el menú pero sigue en NAV (buscador) con su página', () => {
		const importar = navItem('eventos-importar');
		expect(importar?.menu).toBe(false);
		expect(importar && navLink(importar)).toBe('/admin/eventos/importar');
		for (const a of [null, ...NAV_AREAS.map((x) => x.id)])
			for (const i of navAreaItems(a)) expect(i.menu).not.toBe(false);
	});
	it('los parent apuntan a ítems que existen y están en el menú', () => {
		for (const i of NAV) if (i.parent) expect(navItem(i.parent)?.menu).not.toBe(false);
	});
	it('el orden aprobado: por frecuencia de uso dentro de cada área', () => {
		/** @param {string} a */
		const ids = (a) => navAreaItems(a).map((i) => i.id);
		expect(ids('eventos')).toEqual([
			'eventos',
			'eventos-nuevo',
			'eventos-agenda',
			'checkin',
			'eventos-series',
			'eventos-lugares',
			'ajustes-personas'
		]);
		expect(ids('ventas')).toEqual([
			'entradas',
			'entradas-transferencias',
			'entradas-codigos',
			'tienda'
		]);
		expect(ids('comunidad')).toEqual(['personas', 'amigues', 'cuentas']);
		expect(ids('mensajes')).toEqual(['ajustes-plantillas', 'lo-que-sigo', 'bandeja']);
		expect(ids('etiquetas')).toEqual(['etiquetas']);
		expect(ids('contenido')).toEqual([
			'material',
			'no-listadas',
			'contenido-base',
			'colecciones',
			'videos'
		]);
		expect(ids('estadisticas')).toEqual(['estadisticas']);
		expect(ids('ajustes')).toEqual([
			'ajustes-cobros',
			'ajustes-fondo',
			'propinas',
			'ajustes-mails',
			'ajustes-admins',
			'ajustes-interruptores',
			'actividad'
		]);
	});
	it('lo que viene va siempre al final de su área', () => {
		for (const a of NAV_AREAS) {
			const items = navAreaItems(a.id);
			const firstSoon = items.findIndex((i) => i.soon);
			if (firstSoon >= 0)
				expect(
					items.slice(firstSoon).every((i) => i.soon),
					a.id
				).toBe(true);
		}
	});
	it('Interruptores está en el menú (Ajustes › Sistema) y en la paleta de comandos', () => {
		const sistema = navAreaSections('ajustes').find((g) => g.id === 'sistema');
		expect(sistema?.items.map((i) => i.id)).toContain('ajustes-interruptores');
		const cmds = buildCommands();
		expect(matchCommands(cmds, 'interruptores')[0]).toMatchObject({
			id: 'nav:ajustes-interruptores',
			href: '/admin/ajustes/interruptores',
			hint: 'Ajustes'
		});
	});
	it('Personas, Perfiles y Cuentas en Comunidad; Plantillas en Mensajes; Actividad en Ajustes', () => {
		for (const id of ['personas', 'amigues', 'cuentas'])
			expect(navItem(id)?.area, id).toBe('comunidad');
		expect(navItem('ajustes-plantillas')).toMatchObject({
			area: 'mensajes',
			href: '/admin/mensajes/plantillas'
		});
		expect(navItem('actividad')).toMatchObject({ area: 'ajustes', sub: 'sistema' });
		expect(navItem('etiquetas')?.area).toBe('etiquetas');
		expect(navItem('estadisticas')?.area).toBe('estadisticas');
		expect(navItem('eventos-lugares')?.area).toBe('eventos');
	});
	it('"Roles y preguntas" está en Eventos, en /admin/eventos/roles', () => {
		expect(navItem('ajustes-personas')).toMatchObject({
			label: 'Roles y preguntas',
			area: 'eventos',
			href: '/admin/eventos/roles'
		});
	});
	it('cada sección vive bajo /admin/<área>/ (paso 2 del mapa)', () => {
		// Inicio no tiene área, y Check-in queda en /admin/checkin porque su URL está guardada en
		// los celus de la puerta.
		const exceptions = ['inicio', 'checkin'];
		const misplaced = NAV.filter((i) => !exceptions.includes(i.id))
			.filter((i) => i.href !== `/admin/${i.area}` && !i.href.startsWith(`/admin/${i.area}/`))
			.map((i) => `${i.id}: ${i.href}`);
		expect(misplaced).toEqual([]);
		expect(navItem('checkin')?.href).toBe('/admin/checkin');
	});
	it('bajo /admin/ajustes/ solo hay secciones de Ajustes', () => {
		const outside = NAV.filter((i) => i.area !== 'ajustes' && i.href.startsWith('/admin/ajustes/'));
		expect(outside).toEqual([]);
	});
	it('el botón "Para revisar" lleva a la tarjeta del Inicio', () => {
		expect(REVIEW_LINK).toMatchObject({ href: '/admin#para-revisar', counter: 'review' });
	});
	it('"Para revisar": una sola cuenta para el botón de arriba y el Inicio', () => {
		// Sale del mismo contador de panelCounts, aunque la tarjeta tenga más filas (avisos).
		const counts = { review: 7, transfers: 3, reviewOrders: 1, profilesToReview: 3, unlisted: 10 };
		expect(reviewCountOf(counts)).toBe(7);
		expect(reviewCountOf({})).toBe(0);
		expect(reviewCountOf(null)).toBe(0);
		expect(reviewCountOf(undefined)).toBe(0);
	});
});

describe('menú simplificado (NAV_GROUPS, revisión de UI paso 3)', () => {
	it('cinco entradas arriba: Eventos, Ventas, Comunidad, Contenido y Ajustes al pie', () => {
		expect(NAV_GROUPS.map((g) => g.label)).toEqual([
			'Eventos',
			'Ventas',
			'Comunidad',
			'Contenido',
			'Ajustes'
		]);
		expect(NAV_GROUPS.filter((g) => g.foot).map((g) => g.id)).toEqual(['ajustes']);
		for (const g of NAV_GROUPS) expect(g.icon && g.emoji, g.id).toBeTruthy();
	});
	it('cada área está en un solo grupo, así ninguna sección del menú se pierde', () => {
		const areas = NAV_GROUPS.flatMap((g) => g.areas);
		expect([...areas].sort()).toEqual(NAV_AREAS.map((a) => a.id).sort());
		const inGroups = NAV_GROUPS.flatMap((g) => navGroupItems(g.id).map((i) => i.id));
		const inAreas = NAV_AREAS.flatMap((a) => navAreaItems(a.id).map((i) => i.id));
		expect([...inGroups].sort()).toEqual([...inAreas].sort());
		expect(new Set(inGroups).size).toBe(inGroups.length);
	});
	it('el grupo de cada área (y de un grupo, por su id)', () => {
		expect(navGroupOf('estadisticas')?.id).toBe('ventas');
		expect(navGroupOf('mensajes')?.id).toBe('comunidad');
		expect(navGroupOf('etiquetas')?.id).toBe('contenido');
		expect(navGroupOf('ajustes')?.id).toBe('ajustes');
		expect(navGroupOf(null)).toBeUndefined();
		expect(navGroupOf('no-existe')).toBeUndefined();
	});
	it('el área principal sin título; las otras, debajo de su nombre (Ajustes, con sus subgrupos)', () => {
		/** @param {string} g */
		const blocks = (g) => navGroupSections(g).map((s) => [s.label, s.items.map((i) => i.id)]);
		expect(blocks('ventas')).toEqual([
			['', ['entradas', 'entradas-transferencias', 'entradas-codigos', 'tienda']],
			['Estadísticas', ['estadisticas']]
		]);
		expect(blocks('comunidad')).toEqual([
			['', ['personas', 'amigues', 'cuentas']],
			['Mensajes', ['ajustes-plantillas', 'lo-que-sigo', 'bandeja']]
		]);
		expect(blocks('contenido')).toEqual([
			['', ['material', 'no-listadas', 'contenido-base', 'colecciones', 'videos']],
			['Etiquetas', ['etiquetas']]
		]);
		expect(navGroupSections('ajustes').map((s) => s.label)).toEqual([
			'Plata',
			'Comunicación',
			'Equipo',
			'Sistema'
		]);
		// "Ocultar lo que viene": un área que se queda sin nada no deja su título vacío.
		expect(
			navGroupSections('comunidad', { hideSoon: true }).map((s) => [s.label, s.items.length])
		).toEqual([
			['', 3],
			['Mensajes', 1]
		]);
	});
	it('groupCount suma los contadores de todas sus áreas', () => {
		const counts = { transfers: 2, profilesToReview: 3, unlisted: 4 };
		expect(groupCount('ventas', counts)).toBe(2);
		expect(groupCount('comunidad', counts)).toBe(3);
		expect(groupCount('contenido', counts)).toBe(4);
		expect(groupCount('no-existe', counts)).toBe(0);
	});
});

describe('areaBackLink («← Área» arriba del título)', () => {
	it('Plantillas vuelve a Mensajes, su área (no a Ajustes)', () => {
		expect(navItem('ajustes-plantillas')?.area).toBe('mensajes');
		expect(areaBackLink('ajustes-plantillas')).toEqual({
			href: '/admin/mensajes',
			label: 'Mensajes'
		});
	});
	it('Códigos vuelve a Ventas; sin área o sin página del área, null', () => {
		expect(areaBackLink('entradas-codigos')).toEqual({ href: '/admin/ventas', label: 'Ventas' });
		expect(areaBackLink('inicio')).toBe(null);
		expect(areaBackLink('no-existe')).toBe(null);
		expect(areaBackLink('ajustes-mails')).toBe(null);
	});
});

describe('navLink y navState', () => {
	/** @type {import('./nav.js').NavItem} */
	const base = { id: 'a', href: '/admin/a', emoji: '', label: '', area: null, soon: false };
	it('navLink: el href si existe; null si viene (para el buscador y los atajos)', () => {
		expect(navLink(base)).toBe('/admin/a');
		expect(navLink({ ...base, soon: true, phase: 5 })).toBe(null);
	});
	it('navState: próximamente, prueba (interruptor apagado), oculta o lista', () => {
		expect(navState({ ...base, soon: true, phase: 5 })).toBe('soon');
		expect(navState({ ...base, flag: 'x' }, { x: false })).toBe('prueba');
		expect(navState({ ...base, flag: 'x', hiddenWhenOff: true }, { x: false })).toBe('hidden');
		expect(navState({ ...base, flag: 'x' }, { x: true })).toBe('ready');
		// Sin saber el estado del interruptor, no se esconde nada.
		expect(navState({ ...base, flag: 'x', hiddenWhenOff: true })).toBe('ready');
		expect(navState(base)).toBe('ready');
	});
	it('con el interruptor apagado se ve "prueba" o se esconde (si la página da 404)', () => {
		const flags = { series: false, personas_eventos: false, cuentas: false };
		const ids = navAreaItems('eventos', { flags }).map((i) => i.id);
		expect(ids).not.toContain('eventos-series');
		expect(ids).not.toContain('ajustes-personas');
		expect(navAreaItems('comunidad', { flags }).map((i) => i.id)).toContain('cuentas');
		const cuentas = navItem('cuentas');
		expect(cuentas && navState(cuentas, flags)).toBe('prueba');
	});
	it('"Ocultar lo que viene" saca los próximamente del menú, y nada más', () => {
		for (const a of NAV_AREAS) {
			const all = navAreaItems(a.id);
			expect(navAreaItems(a.id, { hideSoon: true })).toEqual(all.filter((i) => !i.soon));
		}
	});
	it('navFlagKeys: los interruptores que usa el menú, sin repetir', () => {
		expect(navFlagKeys().sort()).toEqual([
			'contenido_db',
			'cuentas',
			'personas_eventos',
			'propinas',
			'series'
		]);
	});
	it('areaCount suma los contadores de las secciones del área', () => {
		expect(areaCount('ventas', { transfers: 3 })).toBe(3);
		expect(areaCount('contenido', { unlisted: 2, transfers: 3 })).toBe(2);
		expect(areaCount('comunidad', {})).toBe(0);
	});
});

describe('páginas "Próximamente"', () => {
	it('soonItemAt y el matcher solo aceptan las URLs reservadas', () => {
		for (const i of NAV.filter((x) => x.soon)) {
			expect(soonItemAt(i.href)?.id).toBe(i.id);
			expect(soonItemAt(i.href + '/')?.id).toBe(i.id);
			expect(soonMatcher(i.href.slice('/admin/'.length))).toBe(true);
		}
		expect(soonItemAt('/admin/ventas')).toBeUndefined();
		expect(soonMatcher('entradas')).toBe(false);
		expect(soonMatcher('mensajes/otra')).toBe(false);
		expect(soonMatcher('')).toBe(false);
	});
	it('marcan su ítem como activo', () => {
		expect(activeNavItem('/admin/mensajes')?.id).toBe('bandeja');
		expect(activeNavItem('/admin/contenido/videos')?.id).toBe('videos');
	});
});

describe('activeNavItem', () => {
	it('marca el href más largo que coincide', () => {
		expect(activeNavItem('/admin')?.id).toBe('inicio');
		expect(activeNavItem('/admin/')?.id).toBe('inicio');
		expect(activeNavItem('/admin/ventas/codigos')?.id).toBe('entradas-codigos');
		expect(activeNavItem('/admin/eventos/nuevo')?.id).toBe('eventos-nuevo');
		expect(activeNavItem('/admin/comunidad/cuentas')?.id).toBe('cuentas');
		expect(activeNavItem('/admin/comunidad/cuentas/00000000-0000-4000-8000-000000000000')?.id).toBe(
			'cuentas'
		);
		// La ficha de un perfil es parte de Perfiles (/admin/comunidad/perfiles), no de Cuentas.
		expect(activeNavItem('/admin/comunidad/cuentas/perfiles/12')?.id).toBe('amigues');
		expect(activeNavItem('/admin/comunidad/perfiles')?.id).toBe('amigues');
		expect(activeNavItem('/admin/comunidad/perfiles/Gorro_Rojo')?.id).toBe('amigues');
		expect(activeNavItem('/admin/ajustes/mails')?.id).toBe('ajustes-mails');
		expect(activeNavItem('/admin/mensajes/plantillas/compra')?.id).toBe('ajustes-plantillas');
		expect(activeNavItem('/admin/eventos/roles')?.id).toBe('ajustes-personas');
		expect(activeNavItem('/admin/eventos/series')?.id).toBe('eventos-series');
	});
	it('páginas sin ítem propio marcan su sección', () => {
		expect(activeNavItem('/admin/ventas/alguno')?.id).toBe('entradas');
		expect(activeNavItem('/admin/eventos/alguno/ventas')?.id).toBe('eventos');
	});
	it('Importar planilla marca la Agenda', () => {
		expect(activeNavItem('/admin/eventos/importar')?.id).toBe('eventos-agenda');
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

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
	activeSection,
	areaBackLink,
	areaCount,
	eventHref,
	eventTabOf,
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
	sectionTabs,
	sideSections,
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
	it('las áreas aprobadas, en orden, con ícono, y Ajustes al pie (la Puerta, propia: opción C)', () => {
		expect(NAV_AREAS.map((a) => a.label)).toEqual([
			'Puerta',
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
			// La portada de Ajustes (decisión 0042) muestra los subgrupos: no está en ninguno.
			if (i.id === 'ajustes') expect(i.sub, i.id).toBeUndefined();
			else if (i.area === 'ajustes') expect(subs.has(String(i.sub)), i.id).toBe(true);
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
			// /admin/estadisticas se partió en tres pestañas (gorrite, 11/10); la vieja redirige a
			// Ventas (ver el test de abajo y `estadisticas/redirect.test.js`).
			'/admin/estadisticas/ventas',
			'/admin/estadisticas/asistencia',
			'/admin/estadisticas/visitas',
			'/admin/ajustes/propinas',
			'/admin/contenido/material',
			'/admin/comunidad/perfiles',
			'/admin/etiquetas',
			'/admin/contenido/no-listadas',
			'/admin/ajustes/cobros',
			'/admin/ajustes/fondo',
			// Antes /admin/ajustes/mails (redirige acá): todo lo de mails, en Mensajes.
			'/admin/mensajes/configuracion',
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
		expect(ids('puerta')).toEqual(['checkin']);
		expect(ids('eventos')).toEqual([
			'eventos',
			'eventos-agenda',
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
		expect(ids('mensajes')).toEqual([
			'ajustes-plantillas',
			'ajustes-mails',
			'lo-que-sigo',
			'bandeja'
		]);
		expect(ids('etiquetas')).toEqual(['etiquetas']);
		expect(ids('contenido')).toEqual([
			'material',
			'biblioteca',
			'no-listadas',
			'contenido-base',
			'colecciones',
			'videos'
		]);
		expect(ids('estadisticas')).toEqual([
			'estadisticas',
			'estadisticas-asistencia',
			'estadisticas-visitas'
		]);
		expect(ids('ajustes')).toEqual([
			'ajustes-cobros',
			'ajustes-fondo',
			'propinas',
			'ajustes-vistas-previas',
			'ajustes-textos-bot',
			'ajustes-admins',
			'ajustes-interruptores',
			'ajustes-automatizaciones',
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
		expect(navItem('estadisticas-asistencia')?.area).toBe('estadisticas');
		expect(navItem('estadisticas-visitas')?.area).toBe('estadisticas');
		expect(navItem('eventos-lugares')?.area).toBe('eventos');
		expect(navItem('checkin')?.area).toBe('puerta');
	});
	it('«Cargar evento» no está en el menú (es una acción, opción C) pero sigue en el buscador', () => {
		const nuevo = navItem('eventos-nuevo');
		expect(nuevo).toMatchObject({ menu: false, parent: 'eventos', href: '/admin/eventos/nuevo' });
		expect(nuevo?.highlight).toBeUndefined();
		expect(matchCommands(buildCommands(), 'crear evento')[0]).toMatchObject({
			id: 'nav:eventos-nuevo',
			href: '/admin/eventos/nuevo'
		});
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
	it('siete entradas: Puerta, Eventos, Ventas, Comunidad, Contenido, Estadísticas y Ajustes al pie', () => {
		// gorrite (4/10): Estadísticas vuelve a ser su propia entrada, fuera de Ventas.
		// gorrite (11/10, opción C): la Puerta es su propia entrada, resaltada.
		expect(NAV_GROUPS.map((g) => g.label)).toEqual([
			'Puerta',
			'Eventos',
			'Ventas',
			'Comunidad',
			'Contenido',
			'Estadísticas',
			'Ajustes'
		]);
		expect(NAV_GROUPS.filter((g) => g.foot).map((g) => g.id)).toEqual(['ajustes']);
		expect(NAV_GROUPS.filter((g) => g.highlight).map((g) => g.id)).toEqual(['puerta']);
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
		expect(navGroupOf('estadisticas')?.id).toBe('estadisticas');
		expect(navGroupOf('ventas')?.id).toBe('ventas');
		expect(navGroupOf('mensajes')?.id).toBe('comunidad');
		expect(navGroupOf('etiquetas')?.id).toBe('contenido');
		expect(navGroupOf('ajustes')?.id).toBe('ajustes');
		expect(navGroupOf('puerta')?.id).toBe('puerta');
		expect(navGroupOf(null)).toBeUndefined();
		expect(navGroupOf('no-existe')).toBeUndefined();
	});
	it('el área principal sin título; las otras, debajo de su nombre (Ajustes, con sus subgrupos)', () => {
		/** @param {string} g */
		const blocks = (g) => navGroupSections(g).map((s) => [s.label, s.items.map((i) => i.id)]);
		expect(blocks('ventas')).toEqual([
			['', ['entradas', 'entradas-transferencias', 'entradas-codigos', 'tienda']]
		]);
		expect(blocks('estadisticas')).toEqual([
			['', ['estadisticas', 'estadisticas-asistencia', 'estadisticas-visitas']]
		]);
		expect(blocks('comunidad')).toEqual([
			['', ['personas', 'amigues', 'cuentas']],
			['Mensajes', ['ajustes-plantillas', 'ajustes-mails', 'lo-que-sigo', 'bandeja']]
		]);
		expect(blocks('contenido')).toEqual([
			['', ['material', 'biblioteca', 'no-listadas', 'contenido-base', 'colecciones', 'videos']],
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
			['Mensajes', 3]
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

describe('sectionTabs (pestañas de sección)', () => {
	/** @param {string} path @param {Record<string, boolean>} [flags] */
	const labels = (path, flags) => sectionTabs(path, { flags })?.tabs.map((t) => t.label) ?? null;
	it('Ajustes no lleva pestañas: tiene portada con todas sus secciones (decisión 0042)', () => {
		for (const item of NAV.filter((i) => i.area === 'ajustes')) {
			expect(sectionTabs(item.href), item.href).toBe(null);
		}
		expect(sectionTabs('/admin/ajustes/actividad/')).toBe(null);
		expect(navGroupOf('ajustes')?.landing).toBe('ajustes');
		expect(navItem('ajustes')?.href).toBe('/admin/ajustes');
		// La portada: las mismas secciones que antes eran pestañas, en sus cuatro subgrupos.
		expect(navAreaSections('ajustes').map((s) => [s.label, s.items.map((i) => i.label)])).toEqual([
			['Plata', ['Cobros', 'Fondo', 'Propinas']],
			['Comunicación', ['Vistas previas al compartir', 'Textos del bot']],
			['Equipo', ['Admins']],
			['Sistema', ['Interruptores', 'Automatizaciones', 'Actividad']]
		]);
		// Cada tarjeta tiene su línea de qué hay.
		for (const s of navAreaSections('ajustes'))
			for (const i of s.items) expect(i.desc, i.id).toBeTruthy();
	});
	it('los grupos con varias áreas suman sus secciones (sin lo que viene)', () => {
		expect(labels('/admin/ventas')).toEqual(['Todas las ventas', 'Transferencias', 'Códigos']);
		// Estadísticas va sola en el menú, pero desde el 11/10 tiene tres secciones (gorrite): lleva
		// pestañas. /admin/estadisticas ya no es una página (redirige a Ventas): sin pestañas.
		expect(sectionTabs('/admin/estadisticas')).toBe(null);
		for (const path of [
			'/admin/estadisticas/ventas',
			'/admin/estadisticas/asistencia',
			'/admin/estadisticas/visitas'
		]) {
			expect(sectionTabs(path)).toEqual({
				label: 'Secciones de Estadísticas',
				tabs: [
					{
						href: '/admin/estadisticas/ventas',
						label: 'Ventas en el tiempo',
						icon: navItem('estadisticas')?.icon
					},
					{
						href: '/admin/estadisticas/asistencia',
						label: 'Asistencia',
						icon: navItem('estadisticas-asistencia')?.icon
					},
					{
						href: '/admin/estadisticas/visitas',
						label: 'Visitas al sitio',
						icon: navItem('estadisticas-visitas')?.icon
					}
				]
			});
		}
		expect(labels('/admin/mensajes/plantillas')).toEqual([
			'Personas',
			'Perfiles',
			'Cuentas',
			'Plantillas',
			'Configuración',
			'Lo que sigo'
		]);
		expect(labels('/admin/etiquetas')).toEqual([
			'Material',
			'Biblioteca',
			'No listadas',
			'En la base',
			'Árbol de etiquetas'
		]);
	});
	it('con el interruptor apagado, lo que da 404 no aparece', () => {
		const labelsOf = (/** @type {Record<string, boolean>} */ flags) =>
			navAreaSections('ajustes', { flags }).flatMap((s) => s.items.map((i) => i.label));
		expect(labelsOf({ propinas: false })).toContain('Propinas');
	});
	it('Eventos también lleva pestañas (la barra lateral ya no muestra sus páginas, opción C)', () => {
		const eventos = ['Eventos', 'Agenda', 'Series', 'Lugares', 'Roles y preguntas'];
		for (const path of [
			'/admin/eventos',
			'/admin/eventos/agenda',
			'/admin/eventos/series',
			'/admin/eventos/lugares',
			'/admin/eventos/roles'
		]) {
			expect(labels(path), path).toEqual(eventos);
		}
		expect(sectionTabs('/admin/eventos')?.label).toBe('Secciones de Eventos');
		// Ni «Cargar evento» (es una acción: botón en Eventos) ni la Puerta (sección propia).
		expect(labels('/admin/eventos')).not.toContain('Cargar evento');
		expect(labels('/admin/eventos')).not.toContain('Puerta');
	});
	it('cada pestaña lleva el ícono de su sección (el mismo que en la barra lateral)', () => {
		const paths = NAV.filter((i) => !i.soon && i.menu !== false).map((i) => i.href);
		let checked = 0;
		for (const path of paths) {
			for (const tab of sectionTabs(path)?.tabs ?? []) {
				const item = NAV.find((i) => i.href === tab.href);
				expect(tab.icon, tab.href).toBeTruthy();
				expect(tab.icon, tab.href).toBe(item?.icon);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(10);
	});
	it('cada pestaña lleva el contador «a revisar» de su sección (como la barra lateral)', () => {
		const counts = { transfers: 2, profilesToReview: 3, unlisted: 0, review: 9 };
		const ventas = sectionTabs('/admin/ventas', { counts })?.tabs ?? [];
		expect(ventas.find((t) => t.label === 'Transferencias')?.count).toBe(2);
		expect(ventas.find((t) => t.label === 'Todas las ventas')).not.toHaveProperty('count');
		const comunidad = sectionTabs('/admin/comunidad/personas', { counts })?.tabs ?? [];
		expect(comunidad.find((t) => t.label === 'Perfiles')?.count).toBe(3);
		// Un contador en 0 no se muestra.
		const contenido = sectionTabs('/admin/contenido/material', { counts })?.tabs ?? [];
		expect(contenido.find((t) => t.label === 'No listadas')).not.toHaveProperty('count');
	});
	it('lo que viene: al final, gris y sin contador, salvo con «Ocultar lo que viene»', () => {
		const shown = sectionTabs('/admin/ventas', { hideSoon: false })?.tabs ?? [];
		expect(shown.map((t) => t.label)).toEqual([
			'Todas las ventas',
			'Transferencias',
			'Códigos',
			'Tienda'
		]);
		expect(shown.at(-1)).toMatchObject({ href: '/admin/ventas/tienda', soon: true });
		expect(shown.slice(0, -1).every((t) => !t.soon)).toBe(true);
		const hidden = sectionTabs('/admin/ventas', { hideSoon: true })?.tabs ?? [];
		expect(hidden.some((t) => t.soon)).toBe(false);
		// Sin decir nada, como antes: sin lo que viene.
		expect(sectionTabs('/admin/ventas')?.tabs.some((t) => t.soon)).toBe(false);
	});
	it('no van en Inicio, en la Puerta (una sola página), en subpáginas ni en lo que viene', () => {
		expect(sectionTabs('/admin')).toBe(null);
		expect(sectionTabs('/admin/checkin')).toBe(null);
		expect(sectionTabs('/admin/eventos/nuevo')).toBe(null);
		expect(sectionTabs('/admin/eventos/alguno/ventas')).toBe(null);
		expect(sectionTabs('/admin/comunidad/personas/123')).toBe(null);
		expect(sectionTabs('/admin/ventas/tienda')).toBe(null);
		expect(sectionTabs('/admin/eventos/importar')).toBe(null);
	});
});

describe('areaBackLink («← Área» arriba del título)', () => {
	it('Plantillas es de Mensajes, pero Mensajes no tiene página todavía (Bandeja): sin link', () => {
		// Antes de la parte 2 llevaba a /admin/mensajes, que es «Próximamente» (gorrite, 11/10:
		// «el botón "Mensajes" no lleva a ningún lado»; mismo arreglo que #305).
		expect(navItem('ajustes-plantillas')?.area).toBe('mensajes');
		expect(navItem('bandeja')?.soon).toBe(true);
		expect(areaBackLink('ajustes-plantillas')).toBe(null);
	});
	it('ningún «← Área» lleva a una página «Próximamente» ni a una que no está en el menú', () => {
		for (const item of NAV) {
			const back = areaBackLink(item.id);
			if (!back) continue;
			const target = NAV.find((i) => i.href === back.href);
			expect(target, item.id).toBeTruthy();
			expect(target?.soon, item.id).toBe(false);
		}
	});
	it('cuando la página del área existe, el link vuelve a ella', () => {
		expect(areaBackLink('entradas-codigos')).toEqual({ href: '/admin/ventas', label: 'Ventas' });
	});
	it('Códigos vuelve a Ventas; sin área o sin página del área, null', () => {
		expect(areaBackLink('entradas-codigos')).toEqual({ href: '/admin/ventas', label: 'Ventas' });
		expect(areaBackLink('inicio')).toBe(null);
		expect(areaBackLink('no-existe')).toBe(null);
		// Ajustes tiene portada (decisión 0042): cada sección vuelve a ella.
		expect(areaBackLink('actividad')).toEqual({ href: '/admin/ajustes', label: 'Ajustes' });
		// Configuración de los mails se mudó a Mensajes, que todavía no tiene página propia.
		expect(navItem('ajustes-mails')?.area).toBe('mensajes');
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
	// Lo de «interruptor apagado → "prueba" u oculta» con secciones reales se fue con los
	// interruptores `personas_eventos`, `cuentas` y `propinas` (quedaron fijos); el mecanismo
	// lo sigue cubriendo el test de navState de arriba.
	it('las secciones que tenían interruptor se ven siempre, listas', () => {
		const flags = { personas_eventos: false, cuentas: false, propinas: false };
		const ids = navAreaItems('eventos', { flags }).map((i) => i.id);
		// Series ya no tiene interruptor (quedó fijo): se ve siempre.
		expect(ids).toContain('eventos-series');
		expect(ids).toContain('ajustes-personas');
		expect(navAreaItems('comunidad', { flags }).map((i) => i.id)).toContain('cuentas');
		for (const id of ['cuentas', 'ajustes-personas', 'propinas']) {
			const item = navItem(id);
			expect(item && navState(item, flags), id).toBe('ready');
		}
	});
	it('"Ocultar lo que viene" saca los próximamente del menú, y nada más', () => {
		for (const a of NAV_AREAS) {
			const all = navAreaItems(a.id);
			expect(navAreaItems(a.id, { hideSoon: true })).toEqual(all.filter((i) => !i.soon));
		}
	});
	it('navFlagKeys: los interruptores que usa el menú, sin repetir', () => {
		expect(navFlagKeys().sort()).toEqual([]);
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
		// «Cargar evento» no está en el menú: su página marca Eventos.
		expect(activeNavItem('/admin/eventos/nuevo')?.id).toBe('eventos');
		expect(activeNavItem('/admin/comunidad/cuentas')?.id).toBe('cuentas');
		expect(activeNavItem('/admin/comunidad/cuentas/00000000-0000-4000-8000-000000000000')?.id).toBe(
			'cuentas'
		);
		// La ficha de un perfil es parte de Perfiles (/admin/comunidad/perfiles), no de Cuentas.
		expect(activeNavItem('/admin/comunidad/cuentas/perfiles/12')?.id).toBe('amigues');
		expect(activeNavItem('/admin/comunidad/perfiles')?.id).toBe('amigues');
		expect(activeNavItem('/admin/comunidad/perfiles/Gorro_Rojo')?.id).toBe('amigues');
		expect(activeNavItem('/admin/mensajes/configuracion')?.id).toBe('ajustes-mails');
		expect(activeNavItem('/admin/mensajes/plantillas/compra')?.id).toBe('ajustes-plantillas');
		expect(activeNavItem('/admin/eventos/roles')?.id).toBe('ajustes-personas');
		expect(activeNavItem('/admin/eventos/series')?.id).toBe('eventos-series');
		expect(activeNavItem('/admin/estadisticas/ventas')?.id).toBe('estadisticas');
		expect(activeNavItem('/admin/estadisticas/asistencia')?.id).toBe('estadisticas-asistencia');
		expect(activeNavItem('/admin/estadisticas/visitas')?.id).toBe('estadisticas-visitas');
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
		expect(eventHref('x', 'lista-espera')).toBe('/admin/eventos/x/lista-espera');
	});
	it('las direcciones de las pestañas que se juntaron siguen siendo las mismas', () => {
		// Ventas junta Órdenes y Transferencias; Mails junta el aviso y las plantillas (11/10).
		expect(eventHref('x', 'ventas')).toBe('/admin/eventos/x/ventas');
		expect(eventHref('x', 'transferencias')).toBe('/admin/eventos/x/transferencias');
		expect(eventHref('x', 'mail')).toBe('/admin/eventos/x/mail');
		expect(eventHref('x', 'mails')).toBe('/admin/eventos/x/mails');
		expect(eventHref('x', 'no-existe')).toBe('/admin/eventos/x');
	});
	it('son 7 pestañas, en este orden', () => {
		expect(EVENT_TABS.map((t) => t.label)).toEqual([
			'Resumen',
			'Editar',
			'Ventas',
			'Puerta',
			'Códigos',
			'Mails',
			'Preguntas'
		]);
	});
	it('Ventas y Mails tienen vistas; la primera es la de la pestaña', () => {
		for (const tab of EVENT_TABS.filter((t) => t.views)) {
			expect(tab.views?.[0].suffix, tab.id).toBe(tab.suffix);
		}
		const views = (/** @type {string} */ id) =>
			EVENT_TABS.find((t) => t.id === id)?.views?.map((v) => v.suffix);
		expect(views('ventas')).toEqual(['/ventas', '/ordenes', '/transferencias', '/lista-espera']);
		expect(views('mails')).toEqual(['/mail', '/mails']);
	});
	it('eventTabOf: la pestaña y la vista de cada dirección (y de sus subpáginas)', () => {
		const of = (/** @type {string} */ path) => {
			const r = eventTabOf(path);
			return r && [r.tab.id, r.view?.id ?? null];
		};
		expect(of('/admin/eventos/x')).toEqual(['resumen', null]);
		expect(of('/admin/eventos/x/')).toEqual(['resumen', null]);
		expect(of('/admin/eventos/x/editar')).toEqual(['editar', null]);
		expect(of('/admin/eventos/x/ventas')).toEqual(['ventas', 'ventas']);
		expect(of('/admin/eventos/x/ordenes')).toEqual(['ventas', 'ordenes']);
		expect(of('/admin/eventos/x/ordenes/cargar')).toEqual(['ventas', 'ordenes']);
		expect(of('/admin/eventos/x/transferencias')).toEqual(['ventas', 'transferencias']);
		expect(of('/admin/eventos/x/lista-espera')).toEqual(['ventas', 'lista-espera']);
		expect(of('/admin/eventos/x/ingreso')).toEqual(['ingreso', null]);
		expect(of('/admin/eventos/x/mail')).toEqual(['mails', 'mail']);
		expect(of('/admin/eventos/x/mails')).toEqual(['mails', 'mails']);
		expect(of('/admin/eventos/x/mails/confirmacion')).toEqual(['mails', 'mails']);
		expect(of('/admin/eventos/x/otra')).toBeNull();
		expect(of('/admin/ventas')).toBeNull();
	});
	it('eventPanelLink va a Ventas si el evento vende entradas, si no al Resumen', () => {
		expect(EVENT_TABS[0].soon).toBe(false);
		expect(eventPanelLink('x', { tickets: true })).toBe('/admin/eventos/x/ventas');
		expect(eventPanelLink('x')).toBe('/admin/eventos/x');
	});
	it('contentEditLink: los eventos en la ficha, los perfiles y la wiki en la base, el material en /edit', () => {
		expect(contentEditLink('/calendario/picantearla-2026-10')).toBe(
			'/admin/eventos/picantearla-2026-10/editar'
		);
		expect(contentEditLink('/calendario/picantearla-2026-10/')).toBe(
			'/admin/eventos/picantearla-2026-10/editar'
		);
		expect(contentEditLink('/material/guia')).toBe('/edit/material/guia');
		// «Solo base»: los perfiles se editan en Comunidad › Perfiles (el editor del .md ya no existe).
		expect(contentEditLink('/amigues/alguien')).toBe('/admin/comunidad/perfiles/alguien');
		expect(contentEditLink('/calendario')).toBeNull();
		expect(contentEditLink('/calendario/x/compartir')).toBeNull();
		// La página de la wiki: su texto, en Etiquetas › Texto de la wiki.
		expect(contentEditLink('/wiki/algo')).toBe('/admin/etiquetas/wiki/algo');
		expect(contentEditLink('/wiki/Rancheadita-Kinky')).toBe(
			'/admin/etiquetas/wiki/Rancheadita-Kinky'
		);
		expect(contentEditLink('/wiki')).toBeNull();
	});
	it('la agenda tiene su ítem', () => {
		expect(activeNavItem('/admin/eventos/agenda')?.id).toBe('eventos-agenda');
	});
});

describe('íconos de las pestañas de la ficha del evento', () => {
	it('todas tienen ícono del mismo juego (Lucide) y su emoji', () => {
		for (const tab of EVENT_TABS) {
			expect(tab.icon, tab.id).toBeTruthy();
			expect(tab.emoji, tab.id).not.toBe('');
		}
	});
	it('las que son una sección del menú usan el ícono de esa sección', () => {
		const withSection = EVENT_TABS.filter((t) => t.section);
		// Transferencias ya no es una pestaña (es una vista de Ventas) y Mails tiene ícono propio.
		expect(withSection.map((t) => t.id)).toEqual(['ventas', 'ingreso', 'codigos', 'preguntas']);
		for (const tab of withSection) {
			const item = navItem(/** @type {string} */ (tab.section));
			expect(item, tab.id).toBeTruthy();
			expect(tab.icon, tab.id).toBe(item?.icon);
			expect(tab.emoji, tab.id).toBe(item?.emoji);
		}
	});
	it('si una pestaña se llama como una sección o un área del menú, lleva su mismo ícono', () => {
		let matched = 0;
		for (const tab of EVENT_TABS) {
			const same = [...NAV.filter((i) => i.menu !== false), ...NAV_AREAS].filter(
				(i) => i.label === tab.label
			);
			for (const item of same) {
				expect(tab.icon, `${tab.label} ↔ ${item.id}`).toBe(item.icon);
				matched++;
			}
		}
		// Ventas, Puerta y Códigos (Transferencias pasó a ser una vista de Ventas, sin ícono).
		expect(matched).toBeGreaterThanOrEqual(3);
	});
});

describe('barra lateral (opción C: sideSections)', () => {
	it('las 7 secciones, en orden, con Ajustes al pie y sin la Puerta (parte 2)', () => {
		const secs = sideSections();
		expect(secs.map((s) => s.label)).toEqual([
			'Inicio',
			'Eventos',
			'Ventas',
			'Comunidad',
			'Contenido',
			'Estadísticas',
			'Ajustes'
		]);
		expect(secs.filter((s) => s.foot).map((s) => s.id)).toEqual(['ajustes']);
		// La Puerta salió de la barra lateral (gorrite, 11/10): sigue en la barra de abajo del celu.
		expect(secs.map((s) => s.id)).not.toContain('puerta');
		expect(MOBILE_TABS).toContain('checkin');
		for (const s of secs) expect(s.icon && s.emoji, s.id).toBeTruthy();
	});
	it('cada sección lleva a la primera página que existe de su grupo (o a su portada)', () => {
		expect(Object.fromEntries(sideSections().map((s) => [s.id, s.href]))).toEqual({
			inicio: '/admin',
			eventos: '/admin/eventos',
			ventas: '/admin/ventas',
			comunidad: '/admin/comunidad/personas',
			contenido: '/admin/contenido/material',
			estadisticas: '/admin/estadisticas/ventas',
			// Ajustes, a su portada (decisión 0042).
			ajustes: '/admin/ajustes'
		});
		const pages = new Set(adminPages());
		for (const s of sideSections()) {
			expect(pages.has(s.href), s.href).toBe(true);
			expect(navItem(s.root)?.href, s.id).toBe(s.href);
		}
	});
	it('ninguna acción en la barra: «Cargar evento» no está', () => {
		const hrefs = sideSections().map((s) => s.href);
		expect(hrefs).not.toContain('/admin/eventos/nuevo');
	});
	it('cada página del menú se alcanza: su sección en la barra y, si hay más de una, su pestaña (o su tarjeta en la portada)', () => {
		const secs = new Map(sideSections().map((s) => [s.id, s.href]));
		for (const item of NAV.filter((i) => !i.soon && i.menu !== false)) {
			// Los grupos fuera de la barra lateral (`side: false`, la Puerta) están en la barra de
			// abajo del celu (y en «Ir a…» y en cada evento).
			if (navGroupOf(item.area)?.side === false) {
				expect(MOBILE_TABS, item.id).toContain(item.id);
				continue;
			}
			const section = activeSection(item);
			expect(section && secs.has(section), item.id).toBe(true);
			// Un grupo con portada (Ajustes) muestra una tarjeta por cada sección de su área.
			const landing = navGroupOf(String(section))?.landing;
			const reachable =
				secs.get(String(section)) === item.href ||
				Boolean(
					sectionTabs(String(secs.get(String(section))))?.tabs.some((t) => t.href === item.href)
				) ||
				Boolean(
					landing &&
					navAreaSections(String(item.area)).some((s) => s.items.some((i) => i.id === item.id))
				);
			expect(reachable, item.id).toBe(true);
		}
	});
	it('el contador de cada sección suma el de su grupo', () => {
		const counts = { transfers: 2, profilesToReview: 3, unlisted: 4 };
		const by = Object.fromEntries(sideSections({ counts }).map((s) => [s.id, s.count]));
		expect(by).toMatchObject({ inicio: 0, ventas: 2, comunidad: 3, contenido: 4 });
	});
	it('activeSection: Inicio, el grupo de la página, o null', () => {
		expect(activeSection(activeNavItem('/admin'))).toBe('inicio');
		expect(activeSection(activeNavItem('/admin/checkin'))).toBe('puerta');
		expect(activeSection(activeNavItem('/admin/eventos/alguno/ingreso'))).toBe('eventos');
		expect(activeSection(activeNavItem('/admin/eventos/nuevo'))).toBe('eventos');
		expect(activeSection(activeNavItem('/admin/mensajes/plantillas'))).toBe('comunidad');
		expect(activeSection(activeNavItem('/admin/etiquetas'))).toBe('contenido');
		expect(activeSection(activeNavItem('/admin/ajustes/admins'))).toBe('ajustes');
		expect(activeSection(undefined)).toBe(null);
	});
});

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	EXTRA_COMMANDS,
	SEARCH_HELP_COMMAND,
	SEARCH_TIPS,
	paletteCommands,
	placeSections,
	preferenceCommands,
	recordsFirst
} from './paletteActions.js';
import { buildCommands, matchCommands } from './commands.js';
import { NAV, REVIEW_LINK, navItem } from './nav.js';
import { parseSearchQuery } from '$lib/utils/searchQuery.js';

const ROUTES = join(import.meta.dirname, '..', '..', 'routes', '(authed)');
const BASE = 'https://panel.test';

/**
 * ¿La dirección es una sección del menú o una página del panel que existe?
 * @param {string} href
 */
function resolves(href) {
	const { pathname } = new URL(href, BASE);
	if (NAV.some((i) => i.href === pathname)) return true;
	return existsSync(join(ROUTES, ...pathname.split('/').filter(Boolean), '+page.svelte'));
}

describe('acciones que no son secciones', () => {
	it('cada una lleva a una sección o a una página que existe', () => {
		// 6: «Importar etiquetas» se fue con su página (decisión 0032).
		expect(EXTRA_COMMANDS.length).toBeGreaterThanOrEqual(6);
		for (const c of EXTRA_COMMANDS) expect(resolves(String(c.href)), c.id).toBe(true);
	});

	it('«Para revisar» va a la tarjeta del Inicio', () => {
		const c = EXTRA_COMMANDS.find((x) => x.id === 'review');
		expect(c?.label).toBe('Para revisar');
		expect(c?.href).toBe(REVIEW_LINK.href);
		const url = new URL(String(c?.href), BASE);
		expect(url.pathname).toBe('/admin');
		expect(url.hash).toBe('#para-revisar');
	});

	it('«Nuevo código de descuento» abre el formulario de Códigos (#nuevo)', () => {
		const c = buildCommands().find((x) => x.id === 'new-code');
		const url = new URL(String(c?.href), BASE);
		expect(url.pathname).toBe(navItem('entradas-codigos')?.href);
		expect(url.hash).toBe('#nuevo');
		const page = readFileSync(join(ROUTES, 'admin', 'ventas', 'codigos', '+page.svelte'), 'utf8');
		expect(page).toContain('id="nuevo"');
	});

	it('se encuentran por lo que hacen', () => {
		const cmds = paletteCommands();
		/** @param {string} q */
		const first = (q) => matchCommands(cmds, q)[0]?.id;
		expect(first('para revisar')).toBe('review');
		expect(first('nuevo material')).toBe('new-material');
		expect(first('nuevo perfil')).toBe('new-profile');
		// Los importadores de perfiles y etiquetas se fueron con los .md (decisión 0032); de Perfiles
		// queda la clasificación.
		expect(first('clasificar perfiles')).toBe('classify-profiles');
		expect(first('importar lugares')).toBe('import-places');
		expect(first('vincular')).toBe('link-places');
		expect(first('tema')).toBe('theme');
		expect(first('modo oscuro')).toBe('theme');
		expect(first('ocultar lo que viene')).toBe('hide-soon');
		// Importar eventos es la sección «Importar planilla» (ya estaba); sigue primera con «importar».
		expect(first('importar eventos')).toBe('nav:eventos-importar');
		expect(first('importar')).toBe('nav:eventos-importar');
	});

	it('las preferencias no van a otra página y dicen qué van a hacer', () => {
		const [theme, soon] = preferenceCommands();
		expect(theme).toMatchObject({ run: 'theme', label: 'Cambiar tema' });
		expect(theme.href).toBeUndefined();
		expect(soon).toMatchObject({ run: 'hide-soon', label: 'Ocultar lo que viene' });
		expect(preferenceCommands({ hideSoon: true })[1].label).toBe('Mostrar lo que viene');
		expect(paletteCommands().every((c) => c.href || c.run)).toBe(true);
	});
});

describe('recordsFirst: qué va arriba, las acciones o los registros', () => {
	const exact = [{ items: [{ exact: true }] }];
	const loose = [{ items: [{}] }];
	it('sin registros, las acciones (y sin búsqueda también)', () => {
		expect(recordsFirst('ana', [], [])).toBe(false);
		expect(recordsFirst('', [], exact)).toBe(false);
	});
	it('un registro igual a lo buscado va arriba', () => {
		expect(recordsFirst('José Inventado', ['Personas'], exact)).toBe(true);
		expect(recordsFirst('KV-ABCDEF12', [], exact)).toBe(true);
	});
	it('salvo que una acción se llame exactamente así', () => {
		expect(recordsFirst('series', ['Series'], exact)).toBe(false);
		expect(recordsFirst('SÉRIES', ['Series'], exact)).toBe(false);
	});
	it('si ninguna acción coincide por el nombre (solo por palabras extra), los registros', () => {
		expect(recordsFirst('ana', ['Visitas al sitio'], loose)).toBe(true);
	});
	it('si una acción coincide por el nombre y ningún registro es igual, las acciones', () => {
		expect(recordsFirst('fondo', ['Fondo', 'Ventas en el tiempo'], loose)).toBe(false);
		expect(recordsFirst('import', ['Importar planilla'], loose)).toBe(false);
		expect(recordsFirst('ferencias', ['Transferencias'], loose)).toBe(false);
	});
});

describe('«Cómo buscar»', () => {
	it('es una acción que se encuentra por «cómo buscar» u «operadores», y con «ayuda»', () => {
		const cmds = paletteCommands();
		expect(cmds).toContain(SEARCH_HELP_COMMAND);
		expect(SEARCH_HELP_COMMAND.run).toBe('search-help');
		for (const q of ['como buscar', 'Cómo buscar', 'operadores', 'filtros']) {
			expect(matchCommands(cmds, q)[0]?.id, q).toBe('search-help');
		}
		// «ayuda»: los atajos de teclado y «Cómo buscar».
		expect(matchCommands(cmds, 'ayuda').map((c) => c.id)).toEqual(
			expect.arrayContaining(['help', 'search-help'])
		);
	});

	it('cada ejemplo usa de verdad un operador (la ayuda no promete lo que no anda)', () => {
		expect(SEARCH_TIPS.length).toBeGreaterThanOrEqual(8);
		for (const tip of SEARCH_TIPS) {
			for (const q of [tip.q, ...(tip.also ?? [])]) {
				expect(parseSearchQuery(q).operators, q).toBe(true);
			}
		}
	});
});

describe('placeSections (la paleta sin nada escrito: Fijados y Recientes)', () => {
	const pinned = [
		{ href: '/admin/ventas/transferencias', label: 'Transferencias', context: 'Ventas' },
		{
			href: '/admin/eventos/fiesta-inventada/ordenes',
			label: 'Órdenes',
			context: 'Fiesta inventada'
		}
	];
	const recent = [
		{ href: '/admin/eventos/agenda', label: 'Agenda', context: 'Eventos' },
		{ href: '/admin/comunidad/personas/ana-ejemplo', label: 'Ana Ejemplo' }
	];

	it('primero las fijadas y después las recientes, con los nombres de la barra lateral', () => {
		const sections = placeSections(pinned, recent);
		expect(sections.map((s) => [s.id, s.label])).toEqual([
			['pinned', 'Fijados'],
			['recent', 'Recientes']
		]);
		expect(sections[0].rows.map((r) => [r.title, r.sub, r.href])).toEqual([
			['Transferencias', 'Ventas', '/admin/ventas/transferencias'],
			['Órdenes', 'Fiesta inventada', '/admin/eventos/fiesta-inventada/ordenes']
		]);
		// Sin contexto, sin línea de abajo.
		expect(sections[1].rows.map((r) => [r.title, r.sub])).toEqual([
			['Agenda', 'Eventos'],
			['Ana Ejemplo', '']
		]);
		// El ícono es el de su página (placeIcon), como en la barra.
		expect(sections.flatMap((s) => s.rows).every((r) => r.place)).toBe(true);
	});

	it('las claves no se repiten y una fijada no sale también en Recientes', () => {
		const sections = placeSections(pinned, [...recent, pinned[0]]);
		const rows = sections.flatMap((s) => s.rows);
		expect(rows.map((r) => r.href)).toEqual([
			'/admin/ventas/transferencias',
			'/admin/eventos/fiesta-inventada/ordenes',
			'/admin/eventos/agenda',
			'/admin/comunidad/personas/ana-ejemplo'
		]);
		expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
	});

	it('las secciones vacías no van; sin ninguna, nada (la paleta avisa)', () => {
		expect(placeSections([], recent).map((s) => s.id)).toEqual(['recent']);
		expect(placeSections(pinned, []).map((s) => s.id)).toEqual(['pinned']);
		expect(placeSections([], [])).toEqual([]);
	});
});

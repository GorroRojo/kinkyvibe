import { describe, expect, it } from 'vitest';
import {
	GO_SHORTCUTS,
	NAV_ICONS,
	buildCommands,
	goShortcutHref,
	goShortcutRows,
	matchCommands,
	shortcutOf
} from './commands.js';
import { NAV, navItem, navLink } from './nav.js';

describe('buildCommands', () => {
	it('incluye cada sección con página y las acciones pedidas', () => {
		const cmds = buildCommands();
		const labels = cmds.map((c) => c.label);
		for (const item of NAV) {
			if (navLink(item)) expect(labels).toContain(item.label);
			else expect(labels).not.toContain(item.label);
		}
		for (const l of [
			'Cargar evento',
			'Importar planilla',
			'Nuevo código de descuento',
			'Abrir check-in de hoy'
		])
			expect(labels).toContain(l);
		expect(cmds.every((c) => c.href || c.run)).toBe(true);
	});
	it('con un evento hoy, "Abrir check-in de hoy" va directo a su modo puerta', () => {
		const cmds = buildCommands({
			today: [
				{ slug: 'picantearla', title: 'Picantearla', href: '/admin/entradas/picantearla/ingreso' }
			]
		});
		const c = cmds.find((x) => x.id === 'checkin-today:picantearla');
		expect(c).toMatchObject({ label: 'Abrir check-in de hoy: Picantearla' });
		expect(c?.href).toBe('/admin/entradas/picantearla/ingreso');
	});
});

describe('secciones de Ajustes y Cuentas', () => {
	it('cada sección del menú tiene su ícono en la paleta', () => {
		for (const item of NAV) expect(NAV_ICONS[item.id], item.id).toBeTruthy();
	});
	it('Interruptores está en el menú de Ajustes y se encuentra en la paleta', () => {
		const item = navItem('ajustes-interruptores');
		expect(item).toMatchObject({ href: '/admin/ajustes/interruptores', group: 'ajustes' });
		expect(item?.menu).not.toBe(false);
		const cmds = buildCommands();
		for (const q of ['interruptores', 'funciones nuevas', 'prender'])
			expect(matchCommands(cmds, q).map((c) => c.id)).toContain('nav:ajustes-interruptores');
	});
});

describe('matchCommands', () => {
	const cmds = buildCommands();
	it('encuentra por nombre, sin tildes, y por palabras extra', () => {
		expect(matchCommands(cmds, 'cargar')[0].label).toBe('Cargar evento');
		expect(matchCommands(cmds, 'importar')[0].label).toBe('Importar planilla');
		expect(matchCommands(cmds, 'nuevo codigo')[0].label).toBe('Nuevo código de descuento');
		expect(matchCommands(cmds, 'check', 2).map((c) => c.id)).toContain('checkin-today');
		expect(matchCommands(cmds, 'ajustes de mails').map((c) => c.id)).toContain('nav:ajustes-mails');
		expect(matchCommands(cmds, 'registro').map((c) => c.id)).toContain('nav:actividad');
	});
	it('vacío devuelve todo (con límite) y sin coincidencias, nada', () => {
		expect(matchCommands(cmds, '', 3)).toHaveLength(3);
		expect(matchCommands(cmds, 'zzzz')).toEqual([]);
		expect(matchCommands(cmds, 'fer').map((c) => c.id)).not.toContain(
			'nav:entradas-transferencias'
		);
		expect(matchCommands(cmds, 'ferencias').map((c) => c.id)).toContain(
			'nav:entradas-transferencias'
		);
	});
});

describe('atajos g + letra', () => {
	it('no se repiten letras ni secciones, y todas existen en NAV', () => {
		expect(new Set(GO_SHORTCUTS.map((s) => s.key)).size).toBe(GO_SHORTCUTS.length);
		expect(new Set(GO_SHORTCUTS.map((s) => s.id)).size).toBe(GO_SHORTCUTS.length);
		for (const s of GO_SHORTCUTS) expect(navItem(s.id)).toBeTruthy();
	});
	it('g i va al Inicio, g e a Eventos, g a a Actividad', () => {
		expect(goShortcutHref('i')).toBe('/admin');
		expect(goShortcutHref('e')).toBe('/admin/eventos');
		expect(goShortcutHref('a')).toBe('/admin/actividad');
		expect(goShortcutHref('I')).toBe('/admin');
		expect(goShortcutHref('z')).toBe(null);
		expect(shortcutOf('inicio')).toBe('g i');
	});
	it('la hoja de atajos marca las secciones que todavía no existen', () => {
		const rows = goShortcutRows();
		for (const r of rows) {
			const s = GO_SHORTCUTS.find((x) => x.key === r.keys[1]);
			const item = s && navItem(s.id);
			expect(r.available).toBe(Boolean(item && navLink(item)));
		}
	});
});

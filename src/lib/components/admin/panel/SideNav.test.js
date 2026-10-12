/**
 * Barra lateral del panel en el servidor (opción C, decisión 0038): las 8 secciones con su nombre,
 * sin sub-ítems ni «Cargar evento», la actual marcada, la Puerta resaltada y «Recientes».
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SideNav from './SideNav.svelte';
import { navItem } from '$lib/admin/nav.js';
import { textOf } from '$lib/testing/html.js';

/** @param {string} id */
const item = (id) => /** @type {import('$lib/admin/nav.js').NavItem} */ (navItem(id));

/**
 * Los links de las secciones: href, si es la actual y si va resaltado.
 * @param {string} html
 */
function sections(html) {
	return [...html.matchAll(/<a class="sec[^"]*"[^>]*>/g)].map((m) => ({
		href: m[0].match(/href="([^"]+)"/)?.[1],
		current: m[0].includes('aria-current="page"'),
		highlight: /class="sec[^"]*\bhl\b/.test(m[0])
	}));
}

describe('SideNav', () => {
	it('las 8 secciones, en orden, sin sub-ítems ni acciones', () => {
		const { body } = render(SideNav, { props: { active: item('entradas') } });
		expect(sections(body).map((s) => s.href)).toEqual([
			'/admin',
			'/admin/checkin',
			'/admin/eventos',
			'/admin/ventas',
			'/admin/comunidad/personas',
			'/admin/contenido/material',
			'/admin/estadisticas/ventas',
			'/admin/ajustes/cobros'
		]);
		const text = textOf(body);
		for (const label of ['Inicio', 'Puerta', 'Eventos', 'Ventas', 'Comunidad', 'Ajustes'])
			expect(text).toContain(label);
		expect(text).not.toContain('Cargar evento');
		expect(text).not.toContain('Transferencias');
		expect(body).not.toContain('Abrir todo');
	});

	it('marca la sección de la página actual (también en una subpágina)', () => {
		/** @param {string} id */
		const current = (id) =>
			sections(render(SideNav, { props: { active: item(id) } }).body)
				.filter((s) => s.current)
				.map((s) => s.href);
		expect(current('entradas-transferencias')).toEqual(['/admin/ventas']);
		expect(current('ajustes-plantillas')).toEqual(['/admin/comunidad/personas']);
		expect(current('checkin')).toEqual(['/admin/checkin']);
		expect(current('inicio')).toEqual(['/admin']);
		expect(current('actividad')).toEqual(['/admin/ajustes/cobros']);
	});

	it('la Puerta va resaltada', () => {
		const { body } = render(SideNav, { props: { active: item('inicio') } });
		expect(
			sections(body)
				.filter((s) => s.highlight)
				.map((s) => s.href)
		).toEqual(['/admin/checkin']);
	});

	it('cada sección muestra la suma de los contadores de su grupo', () => {
		const { body } = render(SideNav, {
			props: { active: item('inicio'), counts: { transfers: 2, unlisted: 5 } }
		});
		const ventas = body.slice(body.indexOf('href="/admin/ventas"'));
		expect(textOf(ventas.slice(0, ventas.indexOf('</a>')))).toContain('2');
		const contenido = body.slice(body.indexOf('href="/admin/contenido/material"'));
		expect(textOf(contenido.slice(0, contenido.indexOf('</a>')))).toContain('5');
	});

	it('«Recientes»: sus links, con título; sin recientes no hay título', () => {
		const recent = [
			{ href: '/admin/eventos/fiesta-de-prueba/ordenes', label: 'Fiesta de prueba · Órdenes' },
			{ href: '/admin/ventas/transferencias', label: 'Transferencias' }
		];
		const { body } = render(SideNav, { props: { active: item('inicio'), recent } });
		expect(textOf(body)).toContain('Recientes');
		expect(body).toContain('href="/admin/eventos/fiesta-de-prueba/ordenes"');
		expect(body).toContain('Fiesta de prueba · Órdenes');
		const empty = render(SideNav, { props: { active: item('inicio') } }).body;
		expect(textOf(empty)).not.toContain('Recientes');
	});
});

/**
 * Barra lateral del panel en el servidor (opción C, decisión 0038): las 7 secciones con su nombre,
 * sin sub-ítems ni «Cargar evento» ni la Puerta (parte 2), la actual marcada, «Fijados» y
 * «Recientes».
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
	it('las 7 secciones, en orden, sin sub-ítems, acciones ni la Puerta', () => {
		const { body } = render(SideNav, { props: { active: item('entradas') } });
		expect(sections(body).map((s) => s.href)).toEqual([
			'/admin',
			'/admin/eventos',
			'/admin/ventas',
			'/admin/comunidad/personas',
			'/admin/contenido/material',
			'/admin/estadisticas/ventas',
			'/admin/ajustes/cobros'
		]);
		const text = textOf(body);
		for (const label of ['Inicio', 'Eventos', 'Ventas', 'Comunidad', 'Ajustes'])
			expect(text).toContain(label);
		expect(body).not.toContain('href="/admin/checkin"');
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
		// En la Puerta no se marca ninguna (no está en la barra).
		expect(current('checkin')).toEqual([]);
		expect(current('inicio')).toEqual(['/admin']);
		expect(current('actividad')).toEqual(['/admin/ajustes/cobros']);
	});

	it('ninguna sección va resaltada (la Puerta, la única que lo iba, salió de la barra)', () => {
		const { body } = render(SideNav, { props: { active: item('inicio') } });
		expect(sections(body).filter((s) => s.highlight)).toEqual([]);
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

	it('cada reciente: ícono, nombre y contexto, y su botón «Fijar»', () => {
		const recent = [
			{
				href: '/admin/eventos/fiesta-de-prueba/ordenes',
				label: 'Órdenes',
				context: 'Fiesta de prueba'
			}
		];
		const { body } = render(SideNav, { props: { active: item('inicio'), recent } });
		const row = body.slice(body.indexOf('href="/admin/eventos/fiesta-de-prueba/ordenes"'));
		expect(row).toMatch(/class="pl[^"]*">Órdenes</);
		expect(row).toMatch(/class="pc[^"]*">Fiesta de prueba</);
		expect(row.slice(0, row.indexOf('</svg>'))).toContain('<svg');
		expect(body).toContain('aria-label="Fijar «Órdenes»"');
	});

	it('«Fijados» arriba de Recientes, con Subir, Bajar y Soltar (los bordes, desactivados)', () => {
		const pinned = [
			{ href: '/admin/ventas/transferencias', label: 'Transferencias', context: 'Ventas' },
			{ href: '/admin/eventos/agenda', label: 'Agenda', context: 'Eventos' }
		];
		const recent = [{ href: '/admin/ventas/codigos', label: 'Códigos' }];
		const { body } = render(SideNav, { props: { active: item('inicio'), pinned, recent } });
		const text = textOf(body);
		expect(text.indexOf('Fijados')).toBeGreaterThan(-1);
		expect(text.indexOf('Fijados')).toBeLessThan(text.indexOf('Recientes'));
		expect(body).toMatch(/<button[^>]*disabled[^>]*aria-label="Subir «Transferencias»"/);
		expect(body).not.toMatch(/<button[^>]*disabled[^>]*aria-label="Bajar «Transferencias»"/);
		expect(body).toMatch(/<button[^>]*disabled[^>]*aria-label="Bajar «Agenda»"/);
		expect(body).toContain('aria-label="Soltar «Agenda» (sacarla de Fijados)"');
		expect(body).toMatch(/<li[^>]*draggable="true"/);
		// Sin fijados, no hay título.
		expect(textOf(render(SideNav, { props: { active: item('inicio') } }).body)).not.toContain(
			'Fijados'
		);
	});

	it('con 7 fijados, «Fijar» queda desactivado (y dice por qué)', () => {
		const pinned = Array.from({ length: 7 }, (_, i) => ({
			href: `/admin/eventos/ev-${i}`,
			label: `Evento ${i}`
		}));
		const recent = [{ href: '/admin/ventas/codigos', label: 'Códigos' }];
		const { body } = render(SideNav, { props: { active: item('inicio'), pinned, recent } });
		expect(body).toMatch(/<button[^>]*disabled[^>]*aria-label="Fijar «Códigos»"/);
		expect(body).toContain('Ya tenés 7 fijados');
	});

	it('los links de la barra precargan la página al pasar el mouse', () => {
		const { body } = render(SideNav, { props: { active: item('inicio') } });
		expect(body).toMatch(/<nav class="sn[^"]*"[^>]*data-sveltekit-preload-data="hover"/);
	});
});

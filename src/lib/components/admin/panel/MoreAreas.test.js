/**
 * Panel "Más" del celu: los grupos del menú, menos los que ya están enteros en la barra de abajo
 * (la Puerta, sección propia desde la opción C).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MoreAreas from './MoreAreas.svelte';
import { navItem } from '$lib/admin/nav.js';
import { textOf } from '$lib/testing/html.js';

describe('MoreAreas', () => {
	it('muestra los grupos sin repetir la Puerta (ya está en la barra de abajo)', () => {
		const { body } = render(MoreAreas, { props: { active: navItem('inicio') } });
		const rows = [...body.matchAll(/<b[^>]*>(.*?)<\/b>/g)].map((m) => textOf(m[1]));
		expect(rows).toEqual([
			'Eventos',
			'Ventas',
			'Comunidad',
			'Contenido',
			'Estadísticas',
			'Ajustes'
		]);
	});

	it('Ajustes lleva a su portada (decisión 0041); los demás grupos abren sus secciones', () => {
		const { body } = render(MoreAreas, { props: { active: navItem('inicio') } });
		const links = [...body.matchAll(/<a[^>]*class="arow[^"]*"[^>]*href="([^"]*)"/g)].map(
			(m) => m[1]
		);
		expect(links).toEqual(['/admin/ajustes']);
		expect([...body.matchAll(/<button[^>]*class="arow/g)].length).toBe(5);
	});
});

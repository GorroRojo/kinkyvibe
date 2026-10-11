/**
 * Barra lateral del panel en el servidor: el grupo de la página actual sale abierto, los demás
 * cerrados (lo guardado en el navegador se suma al cargar), y arriba está «Abrir todo».
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SideNav from './SideNav.svelte';
import { navItem } from '$lib/admin/nav.js';
import { textOf } from '$lib/testing/html.js';

/** @param {string} id */
const item = (id) => /** @type {import('$lib/admin/nav.js').NavItem} */ (navItem(id));

/**
 * La etiqueta de apertura del botón de un grupo.
 * @param {string} html
 * @param {string} group
 */
function groupButton(html, group) {
	const at = html.indexOf(`aria-controls="kv-area-${group}"`);
	if (at === -1) return '';
	return html.slice(html.lastIndexOf('<button', at), html.indexOf('>', at) + 1);
}

describe('SideNav', () => {
	it('abre el grupo de la página actual y deja cerrados los demás', () => {
		const { body } = render(SideNav, { props: { active: item('entradas') } });
		expect(groupButton(body, 'ventas')).toContain('aria-expanded="true"');
		for (const g of ['eventos', 'comunidad', 'contenido', 'estadisticas', 'ajustes']) {
			expect(groupButton(body, g), g).toContain('aria-expanded="false"');
		}
	});

	it('en Inicio no abre ningún grupo', () => {
		const { body } = render(SideNav, { props: { active: item('inicio') } });
		for (const g of ['eventos', 'ventas', 'comunidad', 'ajustes']) {
			expect(groupButton(body, g), g).toContain('aria-expanded="false"');
		}
	});

	it('arriba tiene «Abrir todo» (todavía no están todos abiertos)', () => {
		const { body } = render(SideNav, { props: { active: item('entradas') } });
		const start = body.indexOf('<button type="button" class="all');
		expect(start).toBeGreaterThan(-1);
		expect(textOf(body.slice(start, body.indexOf('</button>', start)))).toBe('Abrir todo');
		// Antes que el primer grupo.
		expect(start).toBeLessThan(body.indexOf('kv-area-eventos'));
	});
});

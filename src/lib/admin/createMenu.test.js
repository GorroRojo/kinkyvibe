import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { CREATE_ITEMS, createItems } from './createMenu.js';
import { navItem } from './nav.js';
import { createCommands, paletteCommands } from './paletteActions.js';
import CreateMenu from '$lib/components/admin/panel/CreateMenu.svelte';
import { textOf } from '$lib/testing/html.js';

describe('«+ Crear ▾» (createMenu.js)', () => {
	it('todo lo que se crea hoy, con su página; lo que viene, al final y sin link', () => {
		const items = createItems();
		const ready = items.filter((c) => !c.soon);
		const soon = items.filter((c) => c.soon);
		expect(ready.map((c) => c.id)).toEqual([
			'evento',
			'serie',
			'lugar',
			'importar',
			'rol',
			'codigo',
			'perfil',
			'material',
			'kinkipedia'
		]);
		expect(soon.map((c) => c.id)).toEqual(['producto', 'coleccion', 'video']);
		expect(items.findIndex((c) => c.soon)).toBe(ready.length);
		for (const c of ready) expect(c.href, c.id).toMatch(/^\/admin\//);
		for (const c of soon) {
			expect(c.phase, c.id).toBeGreaterThan(0);
			expect(navItem(c.section)?.soon, c.id).toBe(true);
		}
	});

	it('cada ítem es de una sección que existe; lo listo, de una sección lista', () => {
		for (const c of CREATE_ITEMS) {
			const section = navItem(c.section);
			expect(section, c.id).toBeTruthy();
			if (c.href) expect(section?.soon, c.id).toBe(false);
			else expect(section?.soon, c.id).toBe(true);
		}
	});

	it('con «Ocultar lo que viene», sin lo que viene', () => {
		expect(createItems({ hideSoon: true }).some((c) => c.soon)).toBe(false);
	});

	it('el menú: botón con aria-haspopup, ítems con rol, lo que viene deshabilitado', () => {
		const { body } = render(CreateMenu, { props: {} });
		expect(body).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
		expect(body).toMatch(/<ul[^>]*role="menu"[^>]*hidden/);
		expect(body).toContain('href="/admin/eventos/nuevo"');
		expect(body).toContain('href="/admin/ventas/codigos#nuevo"');
		expect(body).toMatch(/role="menuitem"[^>]*aria-disabled="true"/);
		const text = textOf(body);
		expect(text).toContain('Crear');
		expect(text).toContain('Próximamente');
		expect(body).not.toContain('href="/admin/ventas/tienda"');
		expect(body).toMatch(/<ul[^>]*data-sveltekit-preload-data="hover"/);
	});

	it('en el celu, solo el «+» con nombre para lectores de pantalla', () => {
		const { body } = render(CreateMenu, { props: { compact: true } });
		expect(body).toMatch(/<button[^>]*aria-label="Crear"/);
	});

	it('«Ir a…» suma «Crear: …» para lo que no tenía acción, sin repetir URLs', () => {
		const all = paletteCommands();
		const others = new Set(all.filter((c) => !c.id.startsWith('create:')).map((c) => c.href));
		for (const c of all.filter((x) => x.id.startsWith('create:'))) {
			expect(others.has(c.href), c.id).toBe(false);
		}
		const labels = all.map((c) => c.label);
		expect(labels).toContain('Crear: Serie de eventos');
		expect(labels).toContain('Crear: Lugar');
		// La Kinkipedia se escribe en Etiquetas, que ya es una acción («Árbol de etiquetas»).
		expect(labels).not.toContain('Crear: Entrada de la Kinkipedia');
		// Ya estaban con otro nombre: no se repiten.
		expect(labels).not.toContain('Crear: Material');
		expect(labels).not.toContain('Crear: Evento');
		// Lo que viene no está.
		expect(createCommands([]).some((c) => c.label.includes('Producto'))).toBe(false);
	});
});

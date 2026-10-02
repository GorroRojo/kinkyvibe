/**
 * Contenido › No listadas: filas del panel (como Eventos), no las tarjetas del sitio público con
 * su «Comprar entradas». Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { unlistedRows } from '$lib/admin/unlisted.js';
import Page from './+page.svelte';

/** @param {string} category @param {string} slug @param {Record<string, unknown>} [meta] */
const post = (category, slug, meta = {}) =>
	/** @type {any} */ ({
		path: `/${category}/${slug}`,
		meta: { category, postID: slug, title: `Título de ${slug}`, ...meta }
	});

/** @param {any[]} posts */
const page = (posts) => render(Page, { props: { data: { rows: unlistedRows(posts) } } }).body;

describe('/admin/contenido/no-listadas', () => {
	it('un evento con entradas a la venta: fila del panel, sin el botón de compra del sitio', () => {
		const body = page([
			post('calendario', 'fiesta-inventada', {
				start: '2026-12-12T20:00',
				status: 'abierto',
				link: 'https://example.com/entradas',
				tags: ['fiesta']
			}),
			post('material', 'guia-inventada')
		]);
		expect(body).not.toMatch(/Comprar entradas/i);
		expect(body).not.toContain('/entradas');
		expect(body).toContain('class="list');
		expect(body).toContain('Evento · 12 dic 2026 · 20:00');
		expect(body).toContain('Título de fiesta-inventada');
		expect(body).toContain('href="/admin/eventos/fiesta-inventada"');
		expect(body).toContain('href="/admin/contenido/material/guia-inventada"');
		// La página pública, en otra pestaña.
		expect(body).toContain('href="/calendario/fiesta-inventada"');
		expect(body).toContain('no listada');
	});

	it('sin nada no listado: el estado vacío', () => {
		const body = page([]);
		expect(body).toContain('No hay publicaciones no listadas');
		expect(body).not.toContain('class="list');
	});
});

/**
 * Contenido › No listadas: filas del panel (no las publicaciones enteras). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { unlistedRows } from './unlisted.js';

/** @param {string} category @param {string} slug @param {Record<string, unknown>} [meta] */
const post = (category, slug, meta = {}) =>
	/** @type {any} */ ({
		path: `/${category}/${slug}`,
		meta: { category, postID: slug, title: `Título de ${slug}`, ...meta }
	});

describe('unlistedRows', () => {
	it('un evento: fecha, ficha del panel, página pública y si es borrador', () => {
		const [row] = unlistedRows([
			post('calendario', 'fiesta-inventada', {
				start: '2026-12-12T20:00',
				featured: '/img/fiesta.webp',
				borrador: true,
				status: 'abierto'
			})
		]);
		expect(row).toEqual({
			path: '/calendario/fiesta-inventada',
			slug: 'fiesta-inventada',
			category: 'calendario',
			categoryLabel: 'Evento',
			title: 'Título de fiesta-inventada',
			start: '2026-12-12T20:00',
			thumb: '/img/fiesta.webp',
			draft: true,
			editHref: '/admin/eventos/fiesta-inventada'
		});
	});

	it('Material y Perfiles van a su editor del panel; sin fecha ni imagen sin resolver', () => {
		const rows = unlistedRows([
			post('material', 'guia-inventada', { featured: 3, start: '2026-01-01' }),
			post('amigues', 'colectivo-inventado', { force_unpublished: true })
		]);
		expect(rows.map((r) => [r.categoryLabel, r.editHref, r.start, r.thumb, r.draft])).toEqual([
			['Material', '/admin/contenido/material/guia-inventada', '', '', false],
			['Perfil', '/admin/comunidad/perfiles/colectivo-inventado', '', '', true]
		]);
	});

	it('una fecha que el frontmatter leyó como Date queda como la escribe el sitio', () => {
		const [row] = unlistedRows([
			post('calendario', 'taller-inventado', { start: new Date('2026-11-01T23:30:00Z') })
		]);
		// 23:30 UTC son las 20:30 en Argentina.
		expect(row.start).toBe('2026-11-01T20:30');
	});
});

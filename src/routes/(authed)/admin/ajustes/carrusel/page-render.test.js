/**
 * Ajustes › Carrusel de la portada: «Cómo se ve ahora» dice de dónde salen los colores de cada
 * diapositiva, con el castellano bien armado («del flyer», «de la imagen»). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

/** @param {Record<string, unknown>} over */
const slide = (over) => ({
	path: '/calendario/x',
	title: 'Algo inventado',
	tipo: 'Evento',
	featured: '/media/img/x.webp',
	start: '2031-07-01T20:00-03:00',
	estiloDelEvento: null,
	colors: null,
	editHref: '/admin/eventos/x/editar#sec-datos',
	...over
});

/** @param {Record<string, unknown>[]} slides */
function renderPage(slides) {
	const data = /** @type {any} */ ({
		dbAvailable: true,
		enabled: true,
		modo: 'rotar',
		dias: 14,
		maximo: 8,
		rangos: { dias: { min: 1, max: 60 }, maximo: { min: 1, max: 12 } },
		updatedAt: null,
		updatedBy: null,
		slides,
		missing: { total: 0, images: [] }
	});
	// Sin las etiquetas ni los comentarios de Svelte: el texto como se lee.
	return render(Page, { props: { data, form: null } })
		.body.replace(/<!--[^>]*-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');
}

describe('Ajustes › Carrusel de la portada: de dónde salen los colores', () => {
	it('un evento con flyer sin colores: «faltan los colores del flyer»', () => {
		const text = renderPage([slide({})]);
		expect(text).toContain(
			'Fondo de la marca, rotando: faltan los colores del flyer (calculalos abajo).'
		);
		expect(text).not.toContain('de el flyer');
	});

	it('lo nuevo con imagen sin colores: «faltan los colores de la imagen»', () => {
		const text = renderPage([
			slide({ path: '/material/x', tipo: 'Material', start: null, editHref: null })
		]);
		expect(text).toContain(
			'Fondo de la marca, rotando: faltan los colores de la imagen (calculalos abajo).'
		);
	});
});

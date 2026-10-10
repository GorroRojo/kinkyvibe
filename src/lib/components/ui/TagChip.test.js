/**
 * El chip de etiqueta compartido (decisión de gorrite, 4/10: el mismo en todos lados, también en
 * los filtros del sitio). Como casilla (`checkbox`) tiene que seguir siendo una casilla de verdad:
 * se enfoca con Tab, se tilda con Espacio y los lectores de pantalla la leen como casilla, con el
 * nombre de la etiqueta. Etiquetas inventadas.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TagChip from './TagChip.svelte';
import { textOf, withoutComments } from '$lib/testing/html.js';

/** @param {Record<string, any>} props */
const html = (props) =>
	withoutComments(render(TagChip, { props: /** @type {any} */ (props) }).body);
/** Lo que lee un lector de pantalla (sin el emoji, que va con aria-hidden). @param {string} body */
const spoken = (body) => textOf(body.replace(/<span aria-hidden="true">[^<]*<\/span>/g, '')).trim();

describe('TagChip', () => {
	it('solo: un <span class="kv-tag"> con el nombre', () => {
		const body = html({ tag: 'etiqueta inventada' });
		expect(body).toMatch(/<span class="kv-tag[^"]*"[^>]*>etiqueta inventada<\/span>/);
		expect(body).not.toContain('<input');
	});

	it('con `href`: un link con rel="tag"', () => {
		const body = html({ tag: 'etiqueta inventada', href: '/todo?tags=etiqueta%20inventada' });
		expect(body).toMatch(/<a class="kv-tag[^"]*"[^>]*href="\/todo\?tags=etiqueta%20inventada"/);
		expect(body).toContain('rel="tag"');
	});

	it('`selected`: elegido (lleno)', () => {
		expect(html({ tag: 'etiqueta inventada', selected: true })).toMatch(/class="kv-tag[^"]*\bon\b/);
	});

	it('casilla: <label> con una casilla de verdad adentro y el chip al lado', () => {
		const body = html({ tag: 'etiqueta inventada', name: 'etiqueta inventada', checkbox: true });
		expect(body).toMatch(/^<label class="kv-tag-check[^"]*">/);
		expect(body).toMatch(/<input type="checkbox"[^>]*name="etiqueta inventada"/);
		expect(body).not.toMatch(/<input[^>]*checked/);
		// el texto del label (lo que lee un lector de pantalla) es el nombre de la etiqueta
		expect(spoken(body)).toBe('etiqueta inventada');
		// la casilla va antes del chip: `input:focus-visible + .kv-tag` dibuja el foco en el chip
		expect(body).toMatch(/<input[^>]*>\s*<span class="kv-tag/);
		expect(body).not.toMatch(/tabindex="-1"/);
	});

	it('casilla tildada: `checked` y el chip lleno', () => {
		const body = html({ tag: 'etiqueta inventada', checkbox: true, selected: true });
		expect(body).toMatch(/<input type="checkbox"[^>]*checked/);
		expect(body).toMatch(/class="kv-tag[^"]*\bon\b/);
	});

	it('`label`: otro texto (por ejemplo un plural en una frase), la misma etiqueta', () => {
		const body = html({ tag: 'libro inventado', label: 'libros inventados', checkbox: true });
		expect(body).toContain('value="libro inventado"');
		expect(spoken(body)).toBe('libros inventados');
	});
});

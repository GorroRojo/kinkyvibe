/**
 * Sección «Imagen» de los formularios del panel: el input de archivo nativo dice «Choose File»
 * (en el idioma del navegador), así que se ve un botón «Elegir archivo» que lo envuelve. El input
 * sigue ahí (escondido a la vista, no al teclado) y la etiqueta lo nombra.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ImageSection from './ImageSection.svelte';

/** @param {Record<string, unknown>} [props] */
const section = (props = {}) =>
	render(ImageSection, {
		props: { inputId: 'imagen-prueba', buttonText: 'Subir una imagen nueva', ...props }
	}).body;

describe('ImageSection: elegir la imagen', () => {
	it('botón en castellano y el input adentro de su etiqueta', () => {
		const body = section();
		expect(body).toContain('Elegir archivo');
		expect(body).not.toMatch(/Choose File/i);
		const label = body.match(
			/<label class="file[^"]*" for="imagen-prueba"[^>]*>([\s\S]*?)<\/label>/
		);
		expect(label).toBeTruthy();
		const inside = label?.[1] ?? '';
		expect(inside).toContain('Subir una imagen nueva');
		expect(inside).toMatch(/<input[^>]*type="file"/);
		expect(inside).toMatch(/<input[^>]*id="imagen-prueba"/);
		expect(inside).toContain('Elegir archivo');
	});

	it('el input se puede enfocar (no está deshabilitado ni fuera del orden del teclado)', () => {
		const input = section().match(/<input[^>]*type="file"[^>]*>/)?.[0] ?? '';
		expect(input).not.toMatch(/tabindex="-1"|disabled|hidden/);
		expect(input).toContain('aria-describedby="imagen-prueba-name"');
	});

	it('dice qué archivo se eligió (o que no hay ninguno)', () => {
		expect(section()).toContain('Ningún archivo elegido');
		const chosen = section({
			upload: { url: 'blob:x', name: 'foto-inventada.webp', ext: 'webp', error: '' }
		});
		expect(chosen).toContain('Elegiste: foto-inventada.webp');
	});
});

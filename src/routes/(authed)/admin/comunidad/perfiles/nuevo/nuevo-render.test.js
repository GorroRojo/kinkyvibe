/**
 * Perfil nuevo: con «Quién lo puede ver» en Oculto (como lo abre «Crear perfil» de «Enlaces que
 * faltan», `?oculto=1`) el botón dice «Crear oculto» y el subtítulo que queda oculto; con las
 * otras visibilidades, «Crear y publicar» y «Se publica en Amigues al guardar.» como siempre.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { textOf } from '$lib/testing/html.js';
import { emptyFormValues } from '$lib/server/amigues/editor.js';
import Page from './+page.svelte';

/** @param {string} visibility */
function page(visibility) {
	const values = { ...emptyFormValues('persona'), visibility };
	const data = { editor: 'db', values, kinds: { persona: 'Persona' } };
	return textOf(render(Page, { props: { data, form: null } }).body).replace(/\s+/g, ' ');
}

describe('Perfil nuevo: el botón y el subtítulo según quién lo puede ver', () => {
	it('oculto: «Crear oculto» y «Queda oculto…»', () => {
		const text = page('hidden');
		expect(text).toContain('Crear oculto');
		expect(text).toContain(
			'Persona, proyecto o lugar. Queda oculto: no aparece en Amigues hasta que lo cambies.'
		);
		expect(text).not.toContain('Crear y publicar');
		expect(text).not.toContain('Se publica en Amigues al guardar.');
	});

	it.each(['public', 'members'])('%s: el texto de siempre', (visibility) => {
		const text = page(visibility);
		expect(text).toContain('Crear y publicar');
		expect(text).toContain('Persona, proyecto o lugar. Se publica en Amigues al guardar.');
		expect(text).not.toContain('Crear oculto');
		expect(text).not.toContain('Queda oculto');
	});
});

// @vitest-environment jsdom
/**
 * Perfil nuevo en el navegador: al cambiar «Quién lo puede ver» el botón y el subtítulo cambian
 * en el momento (Oculto → «Crear oculto»; las otras → «Crear y publicar»).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { emptyFormValues } from '$lib/server/amigues/editor.js';
import Page from './+page.svelte';

afterEach(cleanup);

/** @param {string} visibility */
function open(visibility) {
	const values = { ...emptyFormValues('persona'), visibility };
	const data = { editor: 'db', values, kinds: { persona: 'Persona' } };
	return render(Page, { props: { data, form: null } });
}

/** @param {string} value */
const radio = (value) =>
	/** @type {HTMLInputElement} */ (
		document.querySelector(`input[name="visibility"][value="${value}"]`)
	);

describe('Perfil nuevo: el texto sigue a «Quién lo puede ver»', () => {
	it('de Público a Oculto y de vuelta', async () => {
		open('public');
		expect(screen.getByRole('button', { name: 'Crear y publicar' })).toBeTruthy();
		await fireEvent.click(radio('hidden'));
		expect(screen.getByRole('button', { name: 'Crear oculto' })).toBeTruthy();
		expect(document.body.textContent).toContain(
			'Queda oculto: no aparece en Amigues hasta que lo cambies.'
		);
		await fireEvent.click(radio('public'));
		expect(screen.getByRole('button', { name: 'Crear y publicar' })).toBeTruthy();
		expect(document.body.textContent).toContain('Se publica en Amigues al guardar.');
	});

	it('arranca oculto (desde «Enlaces que faltan») y pasa a Solo personas con cuenta', async () => {
		open('hidden');
		expect(screen.getByRole('button', { name: 'Crear oculto' })).toBeTruthy();
		await fireEvent.click(radio('members'));
		expect(screen.getByRole('button', { name: 'Crear y publicar' })).toBeTruthy();
	});
});

// @vitest-environment jsdom
/**
 * El puntaje de 1 a 5 de un formulario (FormQuestions.svelte): cinco radios en un solo grupo
 * (con nombre, así las flechas lo recorren y se elige uno), descriptos por «1 = …» y «5 = …», y
 * sin la pastilla estirada de `.kv-segmented` (gorrite, 5/11: «se ve mal, como estirado»).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import FormQuestions from './FormQuestions.svelte';
import { answerName } from '$lib/utils/formularios.js';

afterEach(cleanup);

const rating = {
	id: 'r1',
	kind: /** @type {const} */ ('rating'),
	label: '¿Cómo la pasaste?',
	required: true,
	options: [],
	low: 'Mal',
	high: 'Re bien'
};

describe('FormQuestions: el puntaje', () => {
	it('son cinco radios con el mismo nombre en un radiogroup descripto por la escala', () => {
		render(FormQuestions, { props: { questions: [rating], idPrefix: 'f' } });
		const group = /** @type {HTMLElement} */ (document.querySelector('[role="radiogroup"]'));
		expect(group.getAttribute('aria-label')).toBe('¿Cómo la pasaste?');
		expect(group.classList.contains('kv-segmented')).toBe(false);
		const radios = [...group.querySelectorAll('input[type="radio"]')].map(
			(r) => /** @type {HTMLInputElement} */ (r)
		);
		expect(radios.map((r) => r.value)).toEqual(['1', '2', '3', '4', '5']);
		expect(new Set(radios.map((r) => r.name))).toEqual(new Set([answerName('r1')]));
		const scale = /** @type {HTMLElement} */ (
			document.getElementById(String(group.getAttribute('aria-describedby')))
		);
		expect(scale.textContent).toContain('1 = Mal');
		expect(scale.textContent).toContain('5 = Re bien');
		// La escala va dentro del mismo bloque que los botones (así queda debajo de sus puntas).
		expect(scale.parentElement).toBe(group.parentElement);
	});

	it('en la vista previa del panel los radios también van agrupados (sin mandar nada)', () => {
		render(FormQuestions, { props: { questions: [rating], idPrefix: 'v', preview: true } });
		const names = [...document.querySelectorAll('input[type="radio"]')].map(
			(r) => /** @type {HTMLInputElement} */ (r).name
		);
		expect(names).toHaveLength(5);
		expect(new Set(names).size).toBe(1);
		expect(names[0]).not.toBe(answerName('r1'));
	});

	it('vuelve lo elegido después de un error', () => {
		render(FormQuestions, { props: { questions: [rating], values: { r1: '4' } } });
		const checked = /** @type {HTMLInputElement} */ (
			document.querySelector('input[type="radio"]:checked')
		);
		expect(checked.value).toBe('4');
	});
});

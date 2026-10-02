/**
 * Preguntas del formulario de compra: las de "una vez por entrada" usan el nombre de esa entrada
 * (`campo_<id>_<entrada>`), así cada persona responde la suya.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SignupFieldInputs from './SignupFieldInputs.svelte';

/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
const fields = [
	{ id: 7, label: '¿Alguna restricción alimentaria?', kind: 'text', required: true, options: [] }
];

describe('SignupFieldInputs', () => {
	it('una vez por compra: campo_<id>, con título y aviso', () => {
		const { body } = render(SignupFieldInputs, { props: { fields } });
		expect(body).toContain('name="campo_7"');
		expect(body).toContain('Unas preguntas más');
		expect(body).toContain('les organizadores');
	});

	it('de una entrada: campo_<id>_<entrada>, sin título, con lo que ya se respondió y su error', () => {
		const { body } = render(SignupFieldInputs, {
			props: {
				fields,
				ticket: 1,
				legend: '',
				hint: false,
				values: { campo_7_1: 'Sin TACC' },
				errors: { campo_7_1: 'Completá esta respuesta.' }
			}
		});
		expect(body).toContain('name="campo_7_1"');
		expect(body).toContain('id="entradas-campo-7-1"');
		expect(body).toContain('Sin TACC');
		expect(body).toContain('Completá esta respuesta.');
		expect(body).not.toContain('<legend');
		expect(body).not.toContain('les organizadores');
	});
});

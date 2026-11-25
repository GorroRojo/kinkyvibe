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
		expect(body).toContain('id="entradas-campo-t1-7"');
		expect(body).toContain('Sin TACC');
		expect(body).toContain('Completá esta respuesta.');
		expect(body).not.toContain('<legend');
		expect(body).not.toContain('les organizadores');
	});
});

describe('SignupFieldInputs: todos los tipos (sin JavaScript)', () => {
	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	const all = [
		{ id: 1, label: 'Tu apodo', kind: 'short', required: true, options: [], help: 'Como te dicen' },
		{ id: 2, label: 'Edad', kind: 'number', required: true, options: [], min: 18, max: 99 },
		{ id: 3, label: 'Desde cuándo', kind: 'date', required: false, options: [] },
		{ id: 4, label: 'Intereses', kind: 'multi', required: true, options: ['Sogas', 'Látex'] },
		{ id: 5, label: 'Talle', kind: 'select', required: true, options: ['S', 'M'] },
		{
			id: 6,
			label: 'Puntaje',
			kind: 'rating',
			required: false,
			options: [],
			low: 'Mal',
			high: 'Re bien'
		},
		{ id: 7, label: 'Rol', kind: 'choice', required: true, options: ['Arriba', 'Abajo'] }
	];

	it('cada tipo con su campo nativo, su `name` y lo que volvió', () => {
		const { body } = render(SignupFieldInputs, {
			props: {
				fields: all,
				values: {
					campo_1: 'Gatite',
					campo_2: '30',
					campo_4: ['Látex'],
					campo_5: 'M',
					campo_6: '4'
				},
				errors: { campo_2: 'Tiene que ser entre 18 y 99.' }
			}
		});
		const tag = (/** @type {string} */ name) =>
			[...body.matchAll(/<(input|select|textarea)\b[^>]*>/g)]
				.map((m) => m[0])
				.filter((t) => t.includes(`name="${name}"`));
		expect(tag('campo_1')[0]).toMatch(/type="text"[^>]*required/);
		expect(tag('campo_1')[0]).toContain('value="Gatite"');
		expect(body).toContain('Como te dicen');
		expect(tag('campo_2')[0]).toMatch(/type="number"/);
		expect(tag('campo_2')[0]).toMatch(/min="18"[^>]*max="99"/);
		expect(tag('campo_2')[0]).toContain('aria-invalid="true"');
		expect(body).toContain('Tiene que ser entre 18 y 99.');
		expect(tag('campo_3')[0]).toMatch(/type="date"/);
		expect(tag('campo_3')[0]).not.toContain('required');
		// Varias opciones: una casilla por opción con el mismo `name`, sin `required` del navegador.
		expect(tag('campo_4')).toHaveLength(2);
		expect(tag('campo_4').some((t) => t.includes('required'))).toBe(false);
		expect(tag('campo_4').find((t) => t.includes('value="Látex"'))).toContain('checked');
		expect(tag('campo_5')[0]).toMatch(/<select[^>]*required/);
		expect(body).toMatch(/<option value="M" selected/);
		expect(tag('campo_6')).toHaveLength(5);
		expect(tag('campo_6').find((t) => t.includes('value="4"'))).toContain('checked');
		expect(tag('campo_7')).toHaveLength(2);
		expect(tag('campo_7').every((t) => t.includes('required'))).toBe(true);
	});

	it('por entrada: el `name` de esa entrada', () => {
		const { body } = render(SignupFieldInputs, {
			props: { fields: all.slice(3, 4), ticket: 2, legend: '', hint: false }
		});
		expect(body.match(/name="campo_4_2"/g)).toHaveLength(2);
	});
});

/**
 * Lo común de las preguntas (formularios y preguntas de inscripción): los tipos de cada sistema,
 * la validación de cada respuesta por tipo, las barras de los resúmenes y lo propio de cada tipo.
 */
import { describe, expect, it } from 'vitest';
import {
	CHECKBOX_YES,
	QUESTION_KINDS,
	SIGNUP_KINDS,
	parseQuestionSettings,
	questionSettings,
	tallyOptions,
	validateAnswerValue,
	validateQuestion
} from './questions.js';

const opts = { textMax: 10 };
/** @param {Partial<import('./questions.js').QuestionDef>} q */
const q = (q) => ({ kind: /** @type {const} */ ('text'), required: true, options: [], ...q });

describe('tipos', () => {
	it('las de inscripción tienen todos los de los formularios menos «Foto»', () => {
		expect(SIGNUP_KINDS).toEqual(QUESTION_KINDS.filter((k) => k !== 'photo'));
		expect(validateQuestion({ label: 'Tu cara', kind: 'photo' }, SIGNUP_KINDS)).toEqual({
			ok: false,
			errors: { kind: 'Elegí el tipo de pregunta.' }
		});
	});
});

describe('validateAnswerValue', () => {
	it('texto y texto corto: largo y vacías', () => {
		expect(validateAnswerValue(q({}), ' a\r\nb ', opts)).toEqual({ value: 'a\nb' });
		expect(validateAnswerValue(q({ kind: 'short' }), ' a\nb ', opts)).toEqual({ value: 'a b' });
		expect(validateAnswerValue(q({}), 'x'.repeat(11), opts)).toEqual({ error: 'Hasta 10 letras.' });
		expect(validateAnswerValue(q({}), '', opts)).toEqual({ error: 'Completá esta respuesta.' });
		expect(validateAnswerValue(q({ required: false }), '  ', opts)).toEqual({ value: null });
	});

	it('número: coma decimal, mínimo y máximo', () => {
		const n = q({ kind: 'number', min: 18, max: 99 });
		expect(validateAnswerValue(n, '30,5', opts)).toEqual({ value: '30.5' });
		expect(validateAnswerValue(n, 'treinta', opts)).toEqual({
			error: 'Escribí solo un número (por ejemplo 12 o 3,5).'
		});
		expect(validateAnswerValue(n, '12', opts)).toEqual({ error: 'Tiene que ser entre 18 y 99.' });
		expect(validateAnswerValue(q({ kind: 'number', min: 1.5 }), '1', opts)).toEqual({
			error: 'Tiene que ser 1,5 o más.'
		});
		expect(validateAnswerValue(n, '', opts)).toEqual({ error: 'Escribí un número.' });
	});

	it('fecha: una que existe', () => {
		const d = q({ kind: 'date' });
		expect(validateAnswerValue(d, '2024-02-29', opts)).toEqual({ value: '2024-02-29' });
		expect(validateAnswerValue(d, '2025-02-29', opts)).toEqual({
			error: 'Elegí una fecha válida.'
		});
		expect(validateAnswerValue(d, '', opts)).toEqual({ error: 'Elegí una fecha.' });
	});

	it('opciones y lista: solo una de la lista', () => {
		for (const kind of /** @type {const} */ (['choice', 'select'])) {
			const c = q({ kind, options: ['S', 'M'] });
			expect(validateAnswerValue(c, 'M', opts)).toEqual({ value: 'M' });
			expect(validateAnswerValue(c, 'XL', opts)).toEqual({ error: 'Elegí una de las opciones.' });
			expect(validateAnswerValue(c, '', opts)).toEqual({ error: 'Elegí una opción.' });
		}
	});

	it('varias opciones: una lista o una sola, en el orden de la pregunta, sin repetidas', () => {
		const m = q({ kind: 'multi', options: ['Sogas', 'Látex', 'Impacto'] });
		expect(validateAnswerValue(m, ['Impacto', 'Sogas', 'Sogas'], opts)).toEqual({
			value: 'Sogas | Impacto'
		});
		expect(validateAnswerValue(m, 'Látex', opts)).toEqual({ value: 'Látex' });
		expect(validateAnswerValue(m, ['Sogas', 'Cuero'], opts)).toEqual({
			error: 'Elegí entre las opciones de la lista.'
		});
		expect(validateAnswerValue(m, [], opts)).toEqual({ error: 'Elegí al menos una opción.' });
		expect(validateAnswerValue({ ...m, required: false }, undefined, opts)).toEqual({
			value: null
		});
	});

	it('casilla y puntaje', () => {
		expect(validateAnswerValue(q({ kind: 'checkbox' }), 'on', opts)).toEqual({
			value: CHECKBOX_YES
		});
		expect(validateAnswerValue(q({ kind: 'checkbox' }), undefined, opts)).toEqual({
			error: 'Marcá esta casilla para seguir.'
		});
		expect(validateAnswerValue(q({ kind: 'rating' }), '4', opts)).toEqual({ value: '4' });
		expect(validateAnswerValue(q({ kind: 'rating' }), '6', opts)).toEqual({
			error: 'Elegí un puntaje de 1 a 5.'
		});
	});
});

describe('barras', () => {
	it('las opciones en su orden, las que ya no son al final; varias opciones cuenta cada una', () => {
		const multi = { kind: 'multi', options: ['A', 'B', 'C'] };
		expect(tallyOptions(multi, ['A | C', 'C', 'Z'])).toEqual([
			{ option: 'A', count: 1, defined: true },
			{ option: 'B', count: 0, defined: true },
			{ option: 'C', count: 2, defined: true },
			{ option: 'Z', count: 1, defined: false }
		]);
		expect(tallyOptions({ kind: 'rating' }, ['5', '5', '2']).map((b) => b.count)).toEqual([
			0, 1, 0, 0, 2
		]);
		expect(tallyOptions({ kind: 'checkbox' }, [CHECKBOX_YES])).toEqual([
			{ option: CHECKBOX_YES, count: 1, defined: true }
		]);
		expect(tallyOptions({ kind: 'text' }, ['hola'])).toEqual([
			{ option: 'hola', count: 1, defined: false }
		]);
	});
});

describe('lo propio de cada tipo', () => {
	it('se guarda solo lo que corresponde y se lee sin confiar en la forma', () => {
		expect(questionSettings({ kind: 'number', min: 0, max: 5, help: 'Ayuda' })).toEqual({
			help: 'Ayuda',
			min: 0,
			max: 5
		});
		expect(questionSettings({ kind: 'text', min: 1, low: 'x' })).toEqual({});
		expect(parseQuestionSettings('number', '{"min":1,"max":"no","low":"x"}')).toEqual({ min: 1 });
		expect(parseQuestionSettings('rating', 'roto')).toEqual({ low: 'Mal', high: 'Re bien' });
	});
});

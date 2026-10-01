import { describe, expect, it } from 'vitest';
import {
	ANSWER_MAX,
	CHECKBOX_YES,
	MAX_OPTIONS,
	answerColumns,
	answerFor,
	fieldInputName,
	parseOptions,
	parseStoredAnswers,
	validateAnswers,
	validateFieldDef
} from './signupFields.js';

/** @type {import('./signupFields.js').SignupField[]} */
const FIELDS = [
	{ id: 1, label: '¿Alguna restricción alimentaria?', kind: 'text', required: false, options: [] },
	{
		id: 2,
		label: '¿Cómo te enteraste?',
		kind: 'choice',
		required: true,
		options: ['Instagram', 'Una amistad']
	},
	{ id: 3, label: 'Leí el protocolo de cuidados', kind: 'checkbox', required: true, options: [] },
	{ id: 4, label: 'Quiero recibir novedades', kind: 'checkbox', required: false, options: [] }
];

describe('preguntas (lo que arma le admin)', () => {
	it('valida texto, tipo y opciones', () => {
		expect(validateFieldDef({ label: '  ¿Algo  más? ', kind: 'text', required: 'on' })).toEqual({
			ok: true,
			field: { label: '¿Algo más?', kind: 'text', required: true, options: [] }
		});
		const choice = validateFieldDef({
			label: '¿Cómo te enteraste?',
			kind: 'choice',
			options: 'Instagram\n\nUna amistad\nInstagram'
		});
		expect(choice.ok && choice.field.options).toEqual(['Instagram', 'Una amistad']);
		const bad = validateFieldDef({ label: 'x', kind: 'html', options: '' });
		expect(bad.ok).toBe(false);
		expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['kind', 'label']);
		expect(validateFieldDef({ label: 'Elegí', kind: 'choice', options: 'una sola' }).ok).toBe(
			false
		);
		const tooMany = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `op ${i}`).join('\n');
		expect(validateFieldDef({ label: 'Elegí', kind: 'choice', options: tooMany }).ok).toBe(false);
		expect(
			validateFieldDef({ label: 'Elegí', kind: 'choice', options: ['a', 'x'.repeat(81)] }).ok
		).toBe(false);
	});

	it('opciones: una por renglón, sin vacías ni repetidas', () => {
		expect(parseOptions(' a \r\nb\n\na')).toEqual(['a', 'b']);
		expect(parseOptions(['a', 3, null])).toEqual(['a']); // solo texto
		expect(parseOptions(undefined)).toEqual([]);
	});
});

describe('respuestas (lo que manda quien compra)', () => {
	const n = fieldInputName;

	it('guarda lo respondido, sin las opcionales vacías', () => {
		const r = validateAnswers(FIELDS, {
			[n(1)]: '  Sin gluten\r\n\r\n\r\ngracias ',
			[n(2)]: 'Una amistad',
			[n(3)]: 'on',
			[n(4)]: ''
		});
		expect(r).toEqual({
			ok: true,
			answers: [
				{ id: 1, label: FIELDS[0].label, value: 'Sin gluten\n\ngracias' },
				{ id: 2, label: FIELDS[1].label, value: 'Una amistad' },
				{ id: 3, label: FIELDS[2].label, value: CHECKBOX_YES }
			]
		});
	});

	it('obligatorias, opciones que no existen y largos', () => {
		const r = validateAnswers(FIELDS, {
			[n(1)]: 'x'.repeat(ANSWER_MAX + 1),
			[n(2)]: 'Una opción inventada'
		});
		expect(r.ok).toBe(false);
		expect(!r.ok && r.errors).toEqual({
			[n(1)]: `Hasta ${ANSWER_MAX} letras.`,
			[n(2)]: 'Elegí una de las opciones.',
			[n(3)]: 'Marcá esta casilla para seguir.'
		});
		const empty = validateAnswers(FIELDS, {});
		expect(!empty.ok && Object.keys(empty.errors)).toEqual([n(2), n(3)]);
		expect(validateAnswers([], { [n(1)]: 'algo' })).toEqual({ ok: true, answers: [] });
	});

	it('lo guardado se lee sin confiar en la forma', () => {
		expect(parseStoredAnswers('[{"id":1,"label":"P","value":"R"},{"x":1},null]')).toEqual([
			{ id: 1, label: 'P', value: 'R' }
		]);
		expect(parseStoredAnswers('roto')).toEqual([]);
		expect(parseStoredAnswers('{"id":1}')).toEqual([]);
	});

	it('columnas para el CSV: las de hoy primero, después las viejas; una por pregunta', () => {
		const lists = [
			[{ id: 9, label: 'Pregunta borrada', value: 'algo' }],
			[{ id: 2, label: 'Texto viejo de la 2', value: 'Instagram' }]
		];
		expect(answerColumns(lists, FIELDS.slice(0, 2))).toEqual([
			{ id: 1, label: FIELDS[0].label },
			{ id: 2, label: FIELDS[1].label },
			{ id: 9, label: 'Pregunta borrada' }
		]);
		expect(answerColumns([], [])).toEqual([]);
		expect(answerFor(lists[0], 9)).toBe('algo');
		expect(answerFor(lists[0], 1)).toBe('');
		expect(answerFor(undefined, 1)).toBe('');
	});
});

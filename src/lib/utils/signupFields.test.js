import { describe, expect, it } from 'vitest';
import {
	ANSWER_MAX,
	CHECKBOX_YES,
	MAX_OPTIONS,
	FIELD_CSV_COLUMNS,
	answerColumns,
	answerFor,
	answerSetCount,
	answerSlots,
	fieldAppliesTo,
	fieldInputName,
	fieldsForTicketType,
	parseOptions,
	parseStoredAnswers,
	parseTicketTypes,
	scopeText,
	validateAnswers,
	validateFieldDef,
	validateFieldScope
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

describe('alcance: a qué entradas aplica y cuántas veces se pregunta', () => {
	/** @type {import('./signupFields.js').SignupField[]} */
	const SCOPED = [
		{
			id: 10,
			label: 'Talle de remera',
			kind: 'text',
			required: true,
			options: [],
			ticketTypes: ['vip']
		},
		{
			id: 11,
			label: '¿Alguna restricción alimentaria?',
			kind: 'text',
			required: true,
			options: [],
			perTicket: true
		},
		{
			id: 12,
			label: 'Acepto el protocolo',
			kind: 'checkbox',
			required: false,
			options: [],
			perTicket: true,
			ticketTypes: ['general']
		}
	];

	it('nombres de los campos: por compra y por entrada', () => {
		expect(fieldInputName(4)).toBe('campo_4');
		expect(fieldInputName(4, 0)).toBe('campo_4_0');
		expect(fieldInputName(4, 2)).toBe('campo_4_2');
	});

	it('qué preguntas aplican a cada tipo de entrada (sin tipos = todas)', () => {
		expect(fieldAppliesTo({ ticketTypes: [] }, 'vip')).toBe(true);
		expect(fieldAppliesTo({}, 'vip')).toBe(true);
		expect(fieldAppliesTo({ ticketTypes: ['general'] }, 'vip')).toBe(false);
		expect(fieldsForTicketType(SCOPED, 'vip').map((f) => f.id)).toEqual([10, 11]);
		expect(fieldsForTicketType(SCOPED, 'general').map((f) => f.id)).toEqual([11, 12]);
		expect(fieldsForTicketType(FIELDS, 'cualquiera')).toHaveLength(FIELDS.length);
	});

	it('cuántas veces se responde cada una y cuántas respuestas pide una compra', () => {
		expect(answerSlots({ perTicket: false }, 3)).toEqual([null]);
		expect(answerSlots({}, 3)).toEqual([null]);
		expect(answerSlots({ perTicket: true }, 3)).toEqual([0, 1, 2]);
		expect(answerSlots({ perTicket: true }, 0)).toEqual([0]);
		// VIP x3: talle (1) + restricción (3).
		expect(answerSetCount(SCOPED, 'vip', 3)).toBe(4);
		// General x3: restricción (3) + protocolo (3).
		expect(answerSetCount(SCOPED, 'general', 3)).toBe(6);
		expect(answerSetCount(FIELDS, 'general', 5)).toBe(4);
	});

	it('valida el alcance que elige le admin', () => {
		const types = ['general', 'vip', 'socies'];
		expect(validateFieldScope({}, types)).toEqual({ ok: true, perTicket: false, ticketTypes: [] });
		expect(
			validateFieldScope({ perTicket: 'on', scope: 'all', ticketTypes: ['vip'] }, types)
		).toEqual({ ok: true, perTicket: true, ticketTypes: [] });
		// En el orden del evento, sin los que no existen.
		expect(
			validateFieldScope({ scope: 'some', ticketTypes: ['socies', 'otro', 'general'] }, types)
		).toEqual({ ok: true, perTicket: false, ticketTypes: ['general', 'socies'] });
		// Todos = todos (así un tipo nuevo también la pregunta).
		expect(validateFieldScope({ scope: 'some', ticketTypes: types }, types)).toMatchObject({
			ticketTypes: []
		});
		expect(validateFieldScope({ scope: 'some', ticketTypes: ['otro'] }, types)).toEqual({
			ok: false,
			errors: { ticketTypes: 'Elegí al menos un tipo de entrada.' }
		});
		// Generales: sin tipos, aplican a todos.
		expect(validateFieldScope({ scope: 'some', ticketTypes: ['vip'] }, [])).toMatchObject({
			ok: true,
			ticketTypes: []
		});
	});

	it('lee los tipos guardados sin confiar en la forma', () => {
		expect(parseTicketTypes('["vip"," general ","vip",""]')).toEqual(['vip', 'general']);
		expect(parseTicketTypes('no es json')).toEqual([]);
		expect(parseTicketTypes('{"a":1}')).toEqual([]);
		expect(parseTicketTypes([1, 'vip', 'x'.repeat(61)])).toEqual(['vip']);
	});

	it('valida las respuestas del tipo elegido; las de por entrada, una por entrada', () => {
		const missing = validateAnswers(SCOPED, {}, { typeId: 'vip', quantity: 2 });
		expect(!missing.ok && missing.errors).toEqual({
			campo_10: 'Completá esta respuesta.',
			campo_11_0: 'Completá esta respuesta.',
			campo_11_1: 'Completá esta respuesta.'
		});
		const ok = validateAnswers(
			SCOPED,
			{
				campo_10: 'M',
				campo_11_0: 'Vegana',
				campo_11_1: ' Sin TACC ',
				campo_12_0: 'on',
				campo_11_2: 'x'
			},
			{ typeId: 'vip', quantity: 2 }
		);
		expect(ok).toEqual({
			ok: true,
			answers: [
				{ id: 10, label: 'Talle de remera', value: 'M' },
				{ id: 11, label: '¿Alguna restricción alimentaria?', value: 'Vegana', ticket: 1 },
				{ id: 11, label: '¿Alguna restricción alimentaria?', value: 'Sin TACC', ticket: 2 }
			]
		});
		const general = validateAnswers(
			SCOPED,
			{ campo_10: 'M', campo_11_0: 'Vegana', campo_12_0: 'on' },
			{ typeId: 'general', quantity: 1 }
		);
		expect(general.ok && general.answers.map((a) => [a.id, a.ticket])).toEqual([
			[11, 1],
			[12, 1]
		]);
	});

	it('guardadas: conserva la entrada; en tablas y CSV van juntas con su entrada', () => {
		const stored = parseStoredAnswers(
			JSON.stringify([
				{ id: 11, label: 'Restricción', value: 'Vegana', ticket: 1 },
				{ id: 11, label: 'Restricción', value: 'Sin TACC', ticket: 2 },
				{ id: 10, label: 'Talle', value: 'M', ticket: 0 }
			])
		);
		expect(stored).toEqual([
			{ id: 11, label: 'Restricción', value: 'Vegana', ticket: 1 },
			{ id: 11, label: 'Restricción', value: 'Sin TACC', ticket: 2 },
			{ id: 10, label: 'Talle', value: 'M' }
		]);
		expect(answerFor(stored, 11)).toBe('Entrada 1: Vegana | Entrada 2: Sin TACC');
		expect(answerFor(stored, 10)).toBe('M');
		expect(answerFor(stored, 99)).toBe('');
		expect(answerColumns([stored])).toEqual([
			{ id: 11, label: 'Restricción' },
			{ id: 10, label: 'Talle' }
		]);
	});

	it('el panel muestra el alcance (y va en el CSV de preguntas)', () => {
		const types = [
			{ id: 'general', name: 'General' },
			{ id: 'vip', name: 'VIP' }
		];
		expect(scopeText(SCOPED[0], types)).toBe('Solo VIP · una vez por compra');
		expect(scopeText(SCOPED[1], types)).toBe('Todas las entradas · una vez por entrada');
		expect(scopeText({ ticketTypes: ['borrado'] })).toBe('Solo borrado · una vez por compra');
		const csv = Object.fromEntries(
			FIELD_CSV_COLUMNS.map((c) => [c.label, c.value ? c.value(SCOPED[2]) : ''])
		);
		expect(csv['se pregunta']).toBe('una vez por entrada');
		expect(csv['tipos de entrada']).toBe('general');
	});
});

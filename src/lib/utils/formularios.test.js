/**
 * Formularios, reglas puras (docs/formularios.md): preguntas (validar, ids, orden), respuestas,
 * privacidad (qué se guarda anónimo, qué muestra el panel, el aviso al cambiar), direcciones,
 * resumen y CSV. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	CHECKBOX_YES,
	MAX_MULTI_OPTIONS,
	MAX_OPTIONS,
	MAX_QUESTIONS,
	MULTI_SEPARATOR,
	answerName,
	formPath,
	formSlug,
	isAnonymousResponse,
	isPhotoKey,
	isIsoDate,
	newQuestionId,
	organizersSee,
	parseNumber,
	parseStoredQuestions,
	photoKey,
	privacyChangeWarning,
	responsesCsvRows,
	showAnswer,
	showsIdentity,
	shuffled,
	summarize,
	uniqueSlug,
	validateFormAnswers,
	validateFormSettings,
	validateQuestion,
	validateQuestions
} from './formularios.js';

const q = (/** @type {Record<string, unknown>} */ extra = {}) => ({
	label: '¿Qué te gustó?',
	kind: 'text',
	required: false,
	options: [],
	...extra
});

describe('validateQuestion', () => {
	it('acepta los tipos y pone los extremos del puntaje por defecto', () => {
		expect(validateQuestion(q())).toMatchObject({ ok: true, question: { kind: 'text' } });
		expect(validateQuestion(q({ kind: 'checkbox' }))).toMatchObject({ ok: true });
		expect(validateQuestion(q({ kind: 'choice', options: ['Sí', 'No'] }))).toMatchObject({
			ok: true,
			question: { options: ['Sí', 'No'] }
		});
		expect(validateQuestion(q({ kind: 'multi', options: ['A', 'B'] }))).toMatchObject({
			ok: true,
			question: { kind: 'multi', options: ['A', 'B'] }
		});
		expect(validateQuestion(q({ kind: 'rating' }))).toMatchObject({
			ok: true,
			question: { low: 'Mal', high: 'Re bien' }
		});
	});

	it(`varias opciones: hasta ${MAX_MULTI_OPTIONS} opciones (las de una sola, hasta ${MAX_OPTIONS})`, () => {
		const opts = (/** @type {number} */ n) =>
			Array.from({ length: n }, (_, i) => `Opción ${i + 1}`);
		expect(validateQuestion(q({ kind: 'multi', options: opts(MAX_MULTI_OPTIONS) }))).toMatchObject({
			ok: true
		});
		expect(
			validateQuestion(q({ kind: 'multi', options: opts(MAX_MULTI_OPTIONS + 1) }))
		).toMatchObject({ ok: false, errors: { options: `Hasta ${MAX_MULTI_OPTIONS} opciones.` } });
		expect(validateQuestion(q({ kind: 'choice', options: opts(MAX_OPTIONS + 1) }))).toMatchObject({
			ok: false,
			errors: { options: `Hasta ${MAX_OPTIONS} opciones.` }
		});
		expect(validateQuestion(q({ kind: 'multi', options: ['Sola'] }))).toMatchObject({
			ok: false,
			errors: { options: expect.any(String) }
		});
	});

	it('varias opciones: ninguna opción puede tener «|» (separa las elegidas)', () => {
		for (const bad of ['Cuerdas | nudos', 'A|B', '| suelta']) {
			expect(validateQuestion(q({ kind: 'multi', options: [bad, 'Otra'] }))).toMatchObject({
				ok: false,
				errors: { options: expect.stringContaining('|') }
			});
		}
		// En las de una sola opción no molesta (la respuesta es una sola).
		expect(validateQuestion(q({ kind: 'choice', options: ['A | B', 'C'] }))).toMatchObject({
			ok: true
		});
	});

	it('las preguntas de inscripción no aceptan varias opciones', () => {
		const r = validateQuestion(q({ kind: 'multi', options: ['A', 'B'] }), [
			'text',
			'choice',
			'checkbox'
		]);
		expect(r).toMatchObject({ ok: false, errors: { kind: expect.any(String) } });
	});

	it('las preguntas de inscripción no aceptan puntaje', () => {
		const r = validateQuestion(q({ kind: 'rating' }), ['text', 'choice', 'checkbox']);
		expect(r).toMatchObject({ ok: false, errors: { kind: expect.any(String) } });
	});

	it('pide texto y al menos dos opciones', () => {
		expect(validateQuestion(q({ label: ' ' }))).toMatchObject({ ok: false });
		expect(validateQuestion(q({ kind: 'choice', options: ['Sola'] }))).toMatchObject({
			ok: false,
			errors: { options: expect.any(String) }
		});
	});
});

describe('validateQuestions (el editor)', () => {
	it('mantiene el orden y los ids, y da ids nuevos a las nuevas y a las repetidas', () => {
		const r = validateQuestions([
			q({ id: 'p2', label: 'Segunda arriba' }),
			q({ id: 'p1', label: 'Primera abajo' }),
			q({ label: 'Nueva' }),
			q({ id: 'p1', label: 'Duplicada' })
		]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.questions.map((x) => x.label)).toEqual([
			'Segunda arriba',
			'Primera abajo',
			'Nueva',
			'Duplicada'
		]);
		const ids = r.questions.map((x) => x.id);
		expect(ids.slice(0, 2)).toEqual(['p2', 'p1']);
		expect(new Set(ids).size).toBe(4);
	});

	it('lee el JSON del formulario y dice qué pregunta está mal', () => {
		const r = validateQuestions(JSON.stringify([q(), q({ label: '' })]));
		expect(r).toMatchObject({ ok: false, message: 'Revisá 1 pregunta.' });
		if (!r.ok) expect(Object.keys(r.errors)).toEqual(['1']);
		expect(validateQuestions('{roto')).toMatchObject({ ok: false });
	});

	it(`hasta ${MAX_QUESTIONS} preguntas`, () => {
		const many = Array.from({ length: MAX_QUESTIONS + 1 }, () => q());
		expect(validateQuestions(many)).toMatchObject({ ok: false });
	});

	it('newQuestionId no repite', () => {
		expect(newQuestionId(['p1', 'p2'])).toBe('p3');
		expect(newQuestionId(['p3'])).toBe('p2');
		expect(newQuestionId(['p1', 'p2', 'p4'])).toBe('p5');
	});

	it('parseStoredQuestions saltea lo que no es una pregunta', () => {
		expect(
			parseStoredQuestions('[{"id":"p1","kind":"rating","label":"x"},{"kind":"otro"}]')
		).toEqual([
			{
				id: 'p1',
				kind: 'rating',
				label: 'x',
				required: false,
				options: [],
				low: 'Mal',
				high: 'Re bien'
			}
		]);
		expect(parseStoredQuestions('nada')).toEqual([]);
	});
});

describe('validateFormAnswers', () => {
	const questions = /** @type {import('./formularios.js').Question[]} */ ([
		{ id: 'p1', kind: 'rating', label: 'Puntaje', required: true, options: [] },
		{ id: 'p2', kind: 'choice', label: '¿Volverías?', required: false, options: ['Sí', 'No'] },
		{ id: 'p3', kind: 'checkbox', label: 'Acepto', required: false, options: [] },
		{ id: 'p4', kind: 'text', label: 'Algo más', required: false, options: [] }
	]);
	const form = (/** @type {Record<string, string>} */ v) =>
		new Map(Object.entries(v).map(([k, val]) => [answerName(k), val]));

	it('guarda las respuestas con la pregunta copiada', () => {
		const r = validateFormAnswers(questions, form({ p1: '4', p2: 'Sí', p3: 'on', p4: ' hola ' }));
		expect(r).toEqual({
			ok: true,
			answers: [
				{ id: 'p1', label: 'Puntaje', value: '4' },
				{ id: 'p2', label: '¿Volverías?', value: 'Sí' },
				{ id: 'p3', label: 'Acepto', value: CHECKBOX_YES },
				{ id: 'p4', label: 'Algo más', value: 'hola' }
			]
		});
	});

	it('marca las obligatorias y lo que no es una opción', () => {
		const r = validateFormAnswers(questions, form({ p2: 'Quizás' }));
		expect(r).toMatchObject({
			ok: false,
			errors: { p1: 'Elegí un puntaje.', p2: expect.any(String) }
		});
		expect(validateFormAnswers(questions, form({ p1: '7' }))).toMatchObject({ ok: false });
	});

	describe('varias opciones', () => {
		const multi = /** @type {import('./formularios.js').Question} */ ({
			id: 'm1',
			kind: 'multi',
			label: '¿Qué te interesa?',
			required: true,
			options: ['Cuerdas', 'Cera', 'Impacto', 'Charlas']
		});
		/** Como un FormData: el mismo `name` repetido (una casilla por opción). */
		const picks = (/** @type {string[]} */ list) => {
			const fd = new FormData();
			for (const v of list) fd.append(answerName('m1'), v);
			return fd;
		};

		it('junta las elegidas en el orden de la lista, sin repetidas', () => {
			const r = validateFormAnswers([multi], picks(['Charlas', 'Cuerdas', ' Charlas ']));
			expect(r).toEqual({
				ok: true,
				answers: [
					{ id: 'm1', label: '¿Qué te interesa?', value: `Cuerdas${MULTI_SEPARATOR}Charlas` }
				]
			});
		});

		it('una sola elegida (también desde un Map) y lo que no es una opción', () => {
			expect(validateFormAnswers([multi], new Map([[answerName('m1'), 'Cera']]))).toMatchObject({
				ok: true,
				answers: [{ value: 'Cera' }]
			});
			expect(validateFormAnswers([multi], picks(['Cera', 'Inventada']))).toMatchObject({
				ok: false,
				errors: { m1: 'Elegí entre las opciones de la lista.' }
			});
		});

		it('obligatoria: al menos una; opcional: vacía no se guarda', () => {
			expect(validateFormAnswers([multi], picks([]))).toMatchObject({
				ok: false,
				errors: { m1: 'Elegí al menos una opción.' }
			});
			const optional = { ...multi, required: false };
			const r = validateFormAnswers([optional, questions[3]], picks(['']));
			expect(r).toMatchObject({
				ok: false,
				message: 'Contestá al menos una pregunta para mandarlo.'
			});
		});
	});

	it('no guarda una respuesta en blanco', () => {
		const optional = questions.slice(1);
		expect(validateFormAnswers(optional, form({}))).toMatchObject({
			ok: false,
			message: 'Contestá al menos una pregunta para mandarlo.'
		});
	});
});

describe('privacidad', () => {
	it('qué se guarda como anónimo', () => {
		expect(isAnonymousResponse('anonymous', undefined)).toBe(true);
		expect(isAnonymousResponse('named', 'on')).toBe(false);
		expect(isAnonymousResponse('choose', 'on')).toBe(true);
		expect(isAnonymousResponse('choose', null)).toBe(false);
	});

	it('pasar a anónimo esconde los nombres de lo que ya llegó; lo anónimo nunca muestra nombre', () => {
		expect(showsIdentity('named', { anonymous: false })).toBe(true);
		expect(showsIdentity('anonymous', { anonymous: false })).toBe(false);
		expect(showsIdentity('choose', { anonymous: true })).toBe(false);
		expect(showsIdentity('named', { anonymous: true })).toBe(false);
	});

	it('el editor avisa al cambiar', () => {
		expect(privacyChangeWarning('named', 'named', 3)).toBeNull();
		expect(privacyChangeWarning('named', 'anonymous', 3)).toMatch(/sin nombre/);
		expect(privacyChangeWarning('anonymous', 'named', 3)).toMatch(/siguen anónimas/);
		expect(privacyChangeWarning('named', 'choose', 0)).toMatch(/cada persona elige/);
	});
});

describe('direcciones', () => {
	it('sale del nombre y no repite', () => {
		expect(formSlug('Proponé un taller o una colaboración')).toBe(
			'propone-un-taller-o-una-colaboracion'
		);
		const taken = new Set(['beca', 'beca-2']);
		expect(uniqueSlug('Beca', (s) => taken.has(s))).toBe('beca-3');
		expect(uniqueSlug('Plantilla encuesta', () => false)).toBe('encuesta');
	});

	it('la encuesta vive en el evento y los demás en /formularios', () => {
		expect(formPath({ kind: 'survey', slug: 'encuesta-x', eventSlug: '2099-01-01-fiesta' })).toBe(
			'/calendario/2099-01-01-fiesta/encuesta'
		);
		expect(formPath({ kind: 'form', slug: 'beca', eventSlug: null })).toBe('/formularios/beca');
	});

	it('validateFormSettings', () => {
		const base = { title: 'Pedido de beca', access: 'link', privacy: 'named', audience: 'admins' };
		expect(validateFormSettings(base)).toMatchObject({
			ok: true,
			settings: { slug: 'pedido-de-beca' }
		});
		expect(validateFormSettings({ ...base, slug: 'plantilla-x' })).toMatchObject({ ok: false });
		expect(validateFormSettings({ ...base, access: 'ticket' })).toMatchObject({
			ok: false,
			errors: { eventSlug: 'Elegí el evento.' }
		});
		expect(organizersSee({ audience: 'organizers', eventSlug: null })).toBe(false);
	});
});

describe('respuestas en el panel', () => {
	const questions = /** @type {import('./formularios.js').Question[]} */ ([
		{ id: 'p1', kind: 'rating', label: 'Puntaje', required: false, options: [] },
		{ id: 'p2', kind: 'choice', label: '¿Volverías?', required: false, options: ['Sí', 'No'] },
		{ id: 'p3', kind: 'text', label: 'Algo más', required: false, options: [] }
	]);
	const rows = [
		{
			answers: [
				{ id: 'p1', label: 'Puntaje', value: '5' },
				{ id: 'p2', label: '¿Volverías?', value: 'Sí' }
			],
			anonymous: false,
			name: 'Persona Demo',
			pronouns: 'elle',
			email: 'demo@example.com',
			day: '2099-01-02'
		},
		{
			answers: [
				{ id: 'p1', label: 'Puntaje', value: '4' },
				{ id: 'p3', label: 'Algo más', value: 'Todo bien' },
				{ id: 'viejo', label: 'Pregunta borrada', value: 'x' }
			],
			anonymous: true,
			day: '2099-01-03'
		}
	];

	it('promedios, conteos y textos (y las preguntas viejas al final)', () => {
		const s = summarize(questions, rows);
		expect(s[0]).toMatchObject({ average: 4.5, distribution: [0, 0, 0, 1, 1] });
		// La escala viaja con el resumen («1 = … · 5 = …» en la página de respuestas).
		expect(s[0].low).toBeTruthy();
		expect(s[0].high).toBeTruthy();
		expect(s[1]).toMatchObject({
			counts: [
				{ option: 'Sí', count: 1 },
				{ option: 'No', count: 0 }
			]
		});
		expect(s[2]).toMatchObject({ texts: ['Todo bien'] });
		expect(s[3]).toMatchObject({ id: 'viejo', label: 'Pregunta borrada' });
	});

	it('CSV: nombres solo si se muestran; en un formulario anónimo, sin columnas de nombre', () => {
		const named = responsesCsvRows(questions, rows, 'named');
		// Nombre, pronombres y mail van juntos: son lo que define si una respuesta es anónima.
		expect(named[0].slice(0, 4)).toEqual(['día', 'nombre', 'pronombres', 'mail']);
		expect(named[1].slice(0, 4)).toEqual([
			'2099-01-02',
			'Persona Demo',
			'elle',
			'demo@example.com'
		]);
		expect(named[2].slice(1, 4)).toEqual(['', '', '']);
		const anon = responsesCsvRows(questions, rows, 'anonymous');
		expect(anon[0]).not.toContain('nombre');
		expect(anon[0]).not.toContain('pronombres');
		expect(anon.flat()).not.toContain('Persona Demo');
		expect(anon.flat()).not.toContain('elle');
	});

	it('varias opciones: cada respuesta cuenta en cada opción que eligió; el CSV, juntas', () => {
		const multi = /** @type {import('./formularios.js').Question[]} */ ([
			{ id: 'm1', kind: 'multi', label: 'Intereses', required: false, options: ['A', 'B', 'C'] }
		]);
		const day = '2099-01-02';
		const resp = [
			{ answers: [{ id: 'm1', label: 'Intereses', value: 'A | C' }], anonymous: true, day },
			{ answers: [{ id: 'm1', label: 'Intereses', value: 'A' }], anonymous: true, day },
			// Una opción que después se sacó de la lista sigue contando.
			{ answers: [{ id: 'm1', label: 'Intereses', value: 'B | Vieja' }], anonymous: true, day },
			{ answers: [], anonymous: true, day }
		];
		const [s] = summarize(multi, resp);
		expect(s).toMatchObject({
			kind: 'multi',
			answered: 3,
			counts: [
				{ option: 'A', count: 2 },
				{ option: 'B', count: 1 },
				{ option: 'C', count: 1 },
				{ option: 'Vieja', count: 1 }
			]
		});
		const csv = responsesCsvRows(multi, resp, 'anonymous');
		expect(csv.map((r) => r[1])).toEqual(['Intereses', 'A | C', 'A', 'B | Vieja', '']);
	});

	it('shuffled mezcla sin perder nada', () => {
		let i = 0;
		const seq = [0.1, 0.9, 0.5];
		const out = shuffled([1, 2, 3, 4], () => seq[i++ % seq.length]);
		expect([...out].sort()).toEqual([1, 2, 3, 4]);
	});
});

describe('texto corto, número, fecha y lista desplegable (24/11)', () => {
	it('validateQuestion: la lista lleva de 2 a 40 opciones; el número, mínimo y máximo opcionales', () => {
		const opts = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => `Opción ${i}`);
		expect(validateQuestion(q({ kind: 'short' }))).toMatchObject({ ok: true });
		expect(validateQuestion(q({ kind: 'date' }))).toMatchObject({ ok: true });
		expect(validateQuestion(q({ kind: 'select', options: opts(MAX_MULTI_OPTIONS) }))).toMatchObject(
			{ ok: true }
		);
		expect(
			validateQuestion(q({ kind: 'select', options: opts(MAX_MULTI_OPTIONS + 1) }))
		).toMatchObject({ ok: false, errors: { options: `Hasta ${MAX_MULTI_OPTIONS} opciones.` } });
		expect(validateQuestion(q({ kind: 'select', options: ['Sola'] }))).toMatchObject({
			ok: false
		});
		const n = validateQuestion(q({ kind: 'number', min: '0', max: '2,5' }));
		expect(n).toMatchObject({ ok: true, question: { kind: 'number', min: 0, max: 2.5 } });
		const free = validateQuestion(q({ kind: 'number', min: '', max: '' }));
		expect(free.ok && 'min' in free.question).toBe(false);
		expect(validateQuestion(q({ kind: 'number', min: 'diez' }))).toMatchObject({
			ok: false,
			errors: { range: 'El mínimo y el máximo, números.' }
		});
		expect(validateQuestion(q({ kind: 'number', min: 5, max: 1 }))).toMatchObject({
			ok: false,
			errors: { range: 'El mínimo no puede ser más que el máximo.' }
		});
		// Los límites solo son del número.
		const text = validateQuestion(q({ kind: 'text', min: 1 }));
		expect(text.ok && 'min' in text.question).toBe(false);
		// Las de inscripción no los aceptan.
		expect(validateQuestion(q({ kind: 'short' }), ['text', 'choice', 'checkbox'])).toMatchObject({
			ok: false
		});
	});

	it('parseStoredQuestions conserva el mínimo y el máximo del número', () => {
		expect(
			parseStoredQuestions(
				'[{"id":"n1","kind":"number","label":"x","min":1,"max":"9"},{"id":"d1","kind":"date","label":"y"}]'
			)
		).toEqual([
			{ id: 'n1', kind: 'number', label: 'x', required: false, options: [], min: 1 },
			{ id: 'd1', kind: 'date', label: 'y', required: false, options: [] }
		]);
	});

	it('parseNumber e isIsoDate', () => {
		expect(parseNumber(' 3,5 ')).toBe(3.5);
		expect(parseNumber('-2')).toBe(-2);
		expect(parseNumber('')).toBe(null);
		expect(parseNumber('1e5')).toBeNaN();
		expect(parseNumber('12 personas')).toBeNaN();
		expect(parseNumber('9'.repeat(14))).toBeNaN();
		expect(isIsoDate('2026-02-28')).toBe(true);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('28/02/2026')).toBe(false);
	});

	const questions = /** @type {import('./formularios.js').Question[]} */ ([
		{ id: 's1', kind: 'short', label: 'Apodo', required: true, options: [] },
		{ id: 'n1', kind: 'number', label: 'Cuántas', required: false, options: [], min: 0, max: 10 },
		{ id: 'd1', kind: 'date', label: 'Cuándo', required: false, options: [] },
		{ id: 'l1', kind: 'select', label: 'Barrio', required: false, options: ['Uno', 'Dos'] }
	]);
	/** @param {Record<string, string>} v */
	const form = (v) => new Map(Object.entries(v).map(([k, x]) => [answerName(k), x]));

	it('validateFormAnswers: guarda texto de una línea, el número, la fecha ISO y la opción', () => {
		const r = validateFormAnswers(
			questions,
			form({ s1: '  Un\napodo ', n1: '7,5', d1: '2026-03-01', l1: 'Dos' })
		);
		expect(r).toEqual({
			ok: true,
			answers: [
				{ id: 's1', label: 'Apodo', value: 'Un apodo' },
				{ id: 'n1', label: 'Cuántas', value: '7.5' },
				{ id: 'd1', label: 'Cuándo', value: '2026-03-01' },
				{ id: 'l1', label: 'Barrio', value: 'Dos' }
			]
		});
	});

	it('validateFormAnswers: rechaza lo que no vale', () => {
		const r = validateFormAnswers(
			questions,
			form({ s1: '', n1: '11', d1: '2026-13-01', l1: 'Tres' })
		);
		expect(r).toMatchObject({
			ok: false,
			errors: {
				s1: 'Completá esta respuesta.',
				n1: 'Tiene que ser entre 0 y 10.',
				d1: 'Elegí una fecha válida.',
				l1: 'Elegí una de las opciones.'
			}
		});
		const only = (/** @type {Partial<import('./formularios.js').Question>} */ extra) =>
			validateFormAnswers(
				[{ id: 'n1', kind: 'number', label: 'N', required: true, options: [], ...extra }],
				form({ n1: '-1' })
			);
		expect(only({ min: 0 })).toMatchObject({ errors: { n1: 'Tiene que ser 0 o más.' } });
		expect(only({ max: -2.5 })).toMatchObject({ errors: { n1: 'Tiene que ser -2,5 o menos.' } });
		expect(only({})).toMatchObject({ ok: true });
		expect(validateFormAnswers(questions.slice(1, 2), form({ n1: 'muchas' }))).toMatchObject({
			errors: { n1: 'Escribí solo un número (por ejemplo 12 o 3,5).' }
		});
	});

	it('el resumen: la lista cuenta como las opciones; número y fecha, la lista de lo respondido', () => {
		const day = '2099-01-02';
		const resp = [
			{
				answers: [
					{ id: 'n1', label: 'Cuántas', value: '2.5' },
					{ id: 'd1', label: 'Cuándo', value: '2026-03-01' },
					{ id: 'l1', label: 'Barrio', value: 'Dos' }
				],
				anonymous: true,
				day
			}
		];
		const s = summarize(questions, resp);
		expect(s[1]).toMatchObject({ kind: 'number', texts: ['2.5'] });
		expect(s[2]).toMatchObject({ kind: 'date', texts: ['2026-03-01'] });
		expect(s[3]).toMatchObject({
			kind: 'select',
			counts: [
				{ option: 'Uno', count: 0 },
				{ option: 'Dos', count: 1 }
			]
		});
		// El CSV lleva lo guardado; el panel lo muestra con coma y la fecha al revés.
		expect(responsesCsvRows(questions, resp, 'anonymous')[1]).toEqual([
			day,
			'',
			'2.5',
			'2026-03-01',
			'Dos'
		]);
		expect(showAnswer('number', '2.5')).toBe('2,5');
		expect(showAnswer('date', '2026-03-01')).toBe('01/03/2026');
		expect(showAnswer('text', '2.5')).toBe('2.5');
	});
});

describe('«Foto»', () => {
	const hash = 'ab'.repeat(32);
	const key = photoKey(7, hash, 'png');
	const q = /** @type {any} */ ({
		id: 'f1',
		kind: 'photo',
		label: 'Tu cara',
		required: true,
		options: []
	});

	it('la clave es privada (formularios/<id>/<sha-256>.<ext>) y se reconoce', () => {
		expect(key).toBe(`formularios/7/${hash}.png`);
		expect(isPhotoKey(key)).toBe(true);
		expect(isPhotoKey(`img/${hash}.png`)).toBe(false);
		expect(isPhotoKey(`formularios/7/${hash}.svg`)).toBe(false);
		expect(isPhotoKey(`formularios/7/../${hash}.png`)).toBe(false);
	});

	it('es un tipo de pregunta sin opciones', () => {
		const r = validateQuestion({ kind: 'photo', label: 'Tu cara', options: 'a\nb' });
		expect(r).toEqual({
			ok: true,
			question: { kind: 'photo', label: 'Tu cara', required: false, options: [] }
		});
		expect(parseStoredQuestions(JSON.stringify([{ ...q }]))[0].kind).toBe('photo');
	});

	it('la respuesta guarda solo una clave de foto; obligatoria sin foto, error', () => {
		expect(validateFormAnswers([q], new Map([[answerName('f1'), key]]))).toEqual({
			ok: true,
			answers: [{ id: 'f1', label: 'Tu cara', value: key }]
		});
		const no = /** @type {any} */ (validateFormAnswers([q], new Map()));
		expect(no.errors.f1).toBe('Subí una foto.');
		const bad = /** @type {any} */ (validateFormAnswers([q], new Map([[answerName('f1'), 'x']])));
		expect(bad.errors.f1).toBe('Subí una foto.');
	});

	it('el resumen solo cuenta; el CSV lleva «sí» y el panel «Foto», nunca la clave', () => {
		const responses = [
			{ answers: [{ id: 'f1', label: 'Tu cara', value: key }], anonymous: true, day: '2026-11-25' },
			{ answers: [], anonymous: true, day: '2026-11-25' }
		];
		expect(summarize([q], responses)).toEqual([
			{ id: 'f1', label: 'Tu cara', kind: 'photo', answered: 1 }
		]);
		// Una pregunta que ya no está sigue siendo una foto (por su clave).
		expect(summarize([], responses)[0].kind).toBe('photo');
		const [, a, b] = responsesCsvRows([q], responses, 'anonymous');
		expect(a).toEqual(['2026-11-25', 'sí']);
		expect(b).toEqual(['2026-11-25', '']);
		expect(showAnswer('photo', key)).toBe('Foto');
	});
});

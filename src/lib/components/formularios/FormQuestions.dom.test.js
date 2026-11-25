// @vitest-environment jsdom
/**
 * Las preguntas de un formulario (FormQuestions.svelte). El puntaje: cinco radios en un solo grupo
 * (con nombre, así las flechas lo recorren y se elige uno), descriptos por «1 = …» y «5 = …», y
 * sin la pastilla estirada de `.kv-segmented` (gorrite, 5/11: «se ve mal, como estirado»). La
 * ayuda de cada pregunta, antes de lo que se contesta (gorrite, 24/11), y los tipos nuevos.
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

describe('FormQuestions: varias opciones', () => {
	const multi = {
		id: 'm1',
		kind: /** @type {const} */ ('multi'),
		label: '¿Qué te interesa?',
		required: false,
		options: ['Cuerdas', 'Cera', 'Impacto']
	};

	it('una casilla por opción, con el mismo nombre, dentro de un fieldset con su legend', () => {
		render(FormQuestions, { props: { questions: [multi], idPrefix: 'f' } });
		const fieldset = /** @type {HTMLFieldSetElement} */ (document.querySelector('fieldset'));
		expect(fieldset.querySelector('legend')?.textContent).toContain('¿Qué te interesa?');
		const boxes = [...fieldset.querySelectorAll('input[type="checkbox"]')].map(
			(b) => /** @type {HTMLInputElement} */ (b)
		);
		expect(boxes.map((b) => b.value)).toEqual(['Cuerdas', 'Cera', 'Impacto']);
		expect(new Set(boxes.map((b) => b.name))).toEqual(new Set([answerName('m1')]));
		// Cada casilla con su texto como etiqueta.
		expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual([
			'Cuerdas',
			'Cera',
			'Impacto'
		]);
	});

	it('vuelven marcadas las elegidas después de un error', () => {
		render(FormQuestions, { props: { questions: [multi], values: { m1: 'Cuerdas | Impacto' } } });
		const checked = [...document.querySelectorAll('input[type="checkbox"]:checked')].map(
			(b) => /** @type {HTMLInputElement} */ (b).value
		);
		expect(checked).toEqual(['Cuerdas', 'Impacto']);
	});
});

describe('FormQuestions: la ayuda va debajo del título, antes de lo que se contesta', () => {
	/** @param {string} kind */
	const q = (kind) => ({
		id: `q${kind}`,
		kind: /** @type {any} */ (kind),
		label: `Pregunta ${kind}`,
		required: false,
		options: ['A', 'B'],
		help: `Ayuda ${kind}`
	});
	const kinds = ['text', 'short', 'choice', 'multi', 'select', 'rating', 'number', 'date'];

	it.each(kinds)('%s: la ayuda está antes del primer campo y lo describe', (kind) => {
		render(FormQuestions, { props: { questions: [q(kind)], idPrefix: 'f' } });
		const help = /** @type {HTMLElement} */ (document.getElementById(`f-q${kind}-help`));
		expect(help.textContent).toBe(`Ayuda ${kind}`);
		const control = /** @type {HTMLElement} */ (
			document.querySelector('input:not([type="hidden"]), select, textarea')
		);
		// La ayuda viene antes en el documento.
		expect(help.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		const described =
			control.closest('fieldset')?.getAttribute('aria-describedby') ??
			control.getAttribute('aria-describedby');
		expect(described?.split(' ')).toContain(`f-q${kind}-help`);
	});

	it('con un error, el campo queda descripto por el error y por la ayuda', () => {
		render(FormQuestions, {
			props: { questions: [q('short')], idPrefix: 'f', errors: { qshort: 'Completá esto.' } }
		});
		const input = /** @type {HTMLInputElement} */ (document.querySelector('input'));
		expect(input.getAttribute('aria-describedby')).toBe('f-qshort-error f-qshort-help');
	});
});

describe('FormQuestions: texto corto, número, fecha y lista desplegable', () => {
	const questions = /** @type {import('$lib/utils/formularios.js').Question[]} */ ([
		{ id: 's1', kind: 'short', label: 'Apodo', required: false, options: [] },
		{ id: 'n1', kind: 'number', label: 'Cuántas', required: false, options: [], min: 0, max: 10 },
		{ id: 'd1', kind: 'date', label: 'Cuándo', required: false, options: [] },
		{ id: 'l1', kind: 'select', label: 'Barrio', required: true, options: ['Uno', 'Dos'] }
	]);

	it('son campos nativos con su nombre (andan sin JavaScript)', () => {
		render(FormQuestions, { props: { questions, idPrefix: 'f' } });
		const short = /** @type {HTMLInputElement} */ (document.getElementById('f-s1'));
		expect([short.type, short.name, short.maxLength]).toEqual(['text', answerName('s1'), 1000]);
		const num = /** @type {HTMLInputElement} */ (document.getElementById('f-n1'));
		expect([num.type, num.name, num.step, num.min, num.max]).toEqual([
			'number',
			answerName('n1'),
			'any',
			'0',
			'10'
		]);
		const date = /** @type {HTMLInputElement} */ (document.getElementById('f-d1'));
		expect([date.type, date.name]).toEqual(['date', answerName('d1')]);
		const select = /** @type {HTMLSelectElement} */ (document.getElementById('f-l1'));
		expect(select.name).toBe(answerName('l1'));
		expect([...select.options].map((o) => o.value)).toEqual(['', 'Uno', 'Dos']);
	});

	it('vuelve lo escrito y lo elegido después de un error', () => {
		render(FormQuestions, {
			props: { questions, values: { s1: 'Algo', n1: '3.5', d1: '2026-01-02', l1: 'Dos' } }
		});
		const inputs = [...document.querySelectorAll('input')].map((i) => i.value);
		expect(inputs).toEqual(['Algo', '3.5', '2026-01-02']);
		expect(/** @type {HTMLSelectElement} */ (document.querySelector('select')).value).toBe('Dos');
	});
});

describe('FormQuestions: la foto', () => {
	const photo = {
		id: 'f1',
		kind: /** @type {const} */ ('photo'),
		label: 'Tu cara',
		required: true,
		options: [],
		help: 'Ayuda de prueba'
	};

	it('es un campo de archivo nativo que acepta imágenes, con su nombre y su ayuda', () => {
		render(FormQuestions, { props: { questions: [photo], idPrefix: 'f' } });
		const input = /** @type {HTMLInputElement} */ (document.getElementById('f-f1'));
		expect([input.type, input.accept, input.name]).toEqual(['file', 'image/*', answerName('f1')]);
		expect(input.getAttribute('aria-describedby')).toBe('f-f1-help');
	});

	it('en la vista previa del panel no tiene nombre (no se manda nada)', () => {
		render(FormQuestions, { props: { questions: [photo], idPrefix: 'f', preview: true } });
		expect(/** @type {HTMLInputElement} */ (document.getElementById('f-f1')).name).toBe('');
	});
});

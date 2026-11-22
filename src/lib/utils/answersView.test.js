import { describe, expect, it } from 'vitest';
import { answerTallies, orderAnswers, ticketAnswer, ticketQuestions } from './answersView.js';

const Q1 = 'Es la primera vez que voy a un Picantearla';
const Q2 = '¿Alguna restricción alimentaria?';
const Q3 = '¿Cómo te enteraste?';

/** Una compra de dos entradas: dos preguntas por entrada y una por compra (datos inventados). */
const order = [
	{ id: 1, label: Q1, value: 'Sí', ticket: 1 },
	{ id: 2, label: Q2, value: 'Vegana', ticket: 1 },
	{ id: 1, label: Q1, value: 'No', ticket: 2 },
	{ id: 3, label: Q3, value: 'Instagram' }
];

describe('columnas y respuestas de una compra', () => {
	it('las preguntas por entrada, en orden y sin repetir', () => {
		expect(ticketQuestions(order)).toEqual([
			{ id: 1, label: Q1 },
			{ id: 2, label: Q2 }
		]);
	});
	it('la respuesta de cada entrada; vacía si no contestó', () => {
		expect(ticketAnswer(order, 1, 0)).toBe('Sí');
		expect(ticketAnswer(order, 1, 1)).toBe('No');
		expect(ticketAnswer(order, 2, 1)).toBe('');
	});
	it('las de una vez por compra, aparte', () => {
		expect(orderAnswers(order)).toEqual([{ id: 3, label: Q3, value: 'Instagram' }]);
	});
});

describe('answerTallies', () => {
	it('cuenta cada respuesta, de más a menos', () => {
		const t = answerTallies([order, [{ id: 1, label: Q1, value: 'Sí', ticket: 1 }]]);
		expect(t.find((q) => q.id === 1)).toEqual({
			id: 1,
			label: Q1,
			perTicket: true,
			counts: [
				{ value: 'Sí', n: 2 },
				{ value: 'No', n: 1 }
			]
		});
		expect(t.find((q) => q.id === 3)?.perTicket).toBe(false);
	});
	it('deja afuera el texto libre (muchas respuestas distintas o largas)', () => {
		const many = Array.from({ length: 8 }, (_, i) => [
			{ id: 9, label: 'Algo más', value: `respuesta ${i}` }
		]);
		const long = [[{ id: 8, label: 'Contanos', value: 'x'.repeat(80) }]];
		const ids = answerTallies([...many, ...long]).map((q) => q.id);
		expect(ids).not.toContain(9);
		expect(ids).not.toContain(8);
	});
	it('no cuenta respuestas vacías', () => {
		expect(answerTallies([[{ id: 1, label: Q1, value: '  ' }]])).toEqual([]);
	});
});

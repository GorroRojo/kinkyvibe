import { describe, expect, it } from 'vitest';
import {
	answerKey,
	copyText,
	defaultStatus,
	filterOrders,
	isLongAnswer,
	matchesAnswer,
	matchesStatus,
	matchesToggle,
	orderAnswerGroups,
	orderSearchText,
	questionCards,
	statusFilterOf,
	tally
} from './ordersView.js';

/** @typedef {import('./ordersView.js').ViewOrder} ViewOrder */

/**
 * Una compra de prueba (datos inventados).
 * @param {Partial<ViewOrder>} o
 * @returns {ViewOrder}
 */
function order(o = {}) {
	return {
		id: 'o1',
		reference: 'KV-AAAA0001',
		name: 'Persona Uno',
		email: 'uno@example.com',
		pronouns: 'elle',
		status: 'approved',
		quantity: 1,
		typeId: 'general',
		note: '',
		toInvoice: false,
		invoicedAt: null,
		fondo: null,
		contribution: null,
		holders: [{ name: 'Persona Uno', pronouns: 'elle', firstTime: null }],
		answers: [],
		...o
	};
}

/** @type {import('./ordersView.js').ViewField[]} */
const FIELDS = [
	{
		id: 1,
		label: 'Es la primera vez que voy a un Picantearla',
		shortLabel: 'Primera vez',
		kind: 'choice',
		options: ['Sí', 'No'],
		perTicket: true
	},
	{ id: 2, label: '¿Alguna necesidad específica?', kind: 'text', options: [], perTicket: true },
	{
		id: 3,
		label: '¿Cómo te enteraste?',
		kind: 'choice',
		options: ['Instagram', 'Amigues', 'Otro']
	},
	{ id: 4, label: 'Acepto las reglas', kind: 'checkbox', options: [], ticketTypes: ['vip'] }
];

describe('estados', () => {
	it('lee ?estado= y descarta lo que no es un estado', () => {
		expect(statusFilterOf('transferencias')).toBe('transferencias');
		expect(statusFilterOf('todas')).toBe('todas');
		expect(statusFilterOf('approved')).toBe('');
		expect(statusFilterOf(null)).toBe('');
	});

	it('cada estado con lo suyo', () => {
		expect(
			matchesStatus({ status: 'awaiting_transfer', transferPending: true }, 'transferencias')
		).toBe(true);
		expect(matchesStatus({ status: 'expired', transferPending: false }, 'transferencias')).toBe(
			false
		);
		expect(matchesStatus({ status: 'pending' }, 'pendientes')).toBe(true);
		expect(matchesStatus({ status: 'awaiting_transfer' }, 'pendientes')).toBe(false);
		expect(matchesStatus({ status: 'refunded' }, 'reembolsadas')).toBe(true);
		expect(matchesStatus({ status: 'cancelled' }, 'todas')).toBe(true);
	});

	it('arranca en transferencias si hay; si no, aprobadas; un evento chico, todas', () => {
		const many = Array.from({ length: 6 }, (_, i) => order({ id: `o${i}` }));
		expect(defaultStatus(many)).toBe('aprobadas');
		expect(defaultStatus([...many, order({ id: 't', transferPending: true })])).toBe(
			'transferencias'
		);
		expect(defaultStatus(many.slice(0, 5))).toBe('todas');
	});
});

describe('interruptores y cuentas', () => {
	it('sin facturar, con nota, primera vez, Fondo', () => {
		expect(matchesToggle(order({ toInvoice: true }), 'sin-facturar')).toBe(true);
		expect(matchesToggle(order({ toInvoice: true, invoicedAt: 1 }), 'sin-facturar')).toBe(false);
		expect(matchesToggle(order({ note: '  ' }), 'con-nota')).toBe(false);
		expect(matchesToggle(order({ note: 'invitade' }), 'con-nota')).toBe(true);
		expect(
			matchesToggle(
				order({ holders: [{ name: 'A', pronouns: '', firstTime: true }] }),
				'primera-vez'
			)
		).toBe(true);
		expect(matchesToggle(order({ fondo: 1500 }), 'uso-fondo')).toBe(true);
		expect(matchesToggle(order({ contribution: 0 }), 'aporto-fondo')).toBe(false);
	});

	it('🧾 compras · 👥 personas; con primera vez, solo quienes vienen por primera vez', () => {
		const list = [
			order({
				quantity: 2,
				holders: [
					{ name: 'A', pronouns: '', firstTime: true },
					{ name: 'B', pronouns: '', firstTime: false }
				]
			}),
			order({ id: 'o2', quantity: 1 })
		];
		expect(tally(list)).toBe('🧾 2 · 👥 3');
		expect(tally(list, 'primera-vez')).toBe('🧾 2 · 👥 1');
	});

	it('filterOrders junta estado, interruptores y respuesta', () => {
		const ids = new Set(FIELDS.map((f) => f.id));
		const a = order({
			id: 'a',
			toInvoice: true,
			answers: [{ id: 3, label: 'x', value: 'Instagram' }]
		});
		const b = order({ id: 'b', toInvoice: true, answers: [{ id: 3, label: 'x', value: 'Otro' }] });
		const c = order({ id: 'c', status: 'refunded', toInvoice: true });
		const answer = { key: 'f3', value: 'Instagram', label: '¿Cómo te enteraste?: Instagram' };
		expect(filterOrders([a, b, c], { status: 'aprobadas' }).map((o) => o.id)).toEqual(['a', 'b']);
		expect(
			filterOrders([a, b, c], {
				status: 'todas',
				toggles: ['sin-facturar'],
				answer,
				fieldIds: ids
			}).map((o) => o.id)
		).toEqual(['a']);
	});
});

describe('respuestas en la tarjeta de la compra', () => {
	it('cada entrada con las suyas, en el orden del formulario; las de la compra aparte', () => {
		const o = order({
			quantity: 2,
			holders: [
				{ name: 'Persona Uno', pronouns: 'elle' },
				{ name: 'Persona Dos', pronouns: 'ella' }
			],
			answers: [
				{ id: 2, label: 'Necesidades (viejo)', value: 'Sentarme', ticket: 2 },
				{ id: 1, label: 'Primera vez', value: 'Sí', ticket: 2 },
				{ id: 1, label: 'Primera vez', value: 'No', ticket: 1 },
				{ id: 3, label: '¿Cómo te enteraste?', value: 'Instagram' },
				{ id: 1, label: 'Primera vez', value: 'Sí', ticket: 5 },
				{ id: 2, label: 'Necesidades', value: '   ', ticket: 1 }
			]
		});
		const g = orderAnswerGroups(o, FIELDS);
		expect(g.holders[0].map((a) => [a.label, a.value])).toEqual([['Primera vez', 'No']]);
		expect(g.holders[1].map((a) => [a.label, a.value, a.choice])).toEqual([
			['Primera vez', 'Sí', true],
			['¿Alguna necesidad específica?', 'Sentarme', false]
		]);
		// La entrada 5 no está en la lista de personas: va con las de la compra.
		expect(g.order.map((a) => [a.key, a.value, a.ticket])).toEqual([
			['f1', 'Sí', 5],
			['f3', 'Instagram', null]
		]);
	});

	it('una pregunta borrada se muestra con el texto guardado y no se filtra por ella', () => {
		const g = orderAnswerGroups(
			order({ answers: [{ id: 99, label: 'Talle', value: 'M' }] }),
			FIELDS
		);
		expect(g.order).toEqual([
			{
				key: 'l:Talle',
				label: 'Talle',
				fullLabel: 'Talle',
				value: 'M',
				choice: false,
				ticket: null
			}
		]);
	});

	it('el filtro por respuesta mira la pregunta (por id, o por texto si se borró) y el valor', () => {
		const ids = new Set(FIELDS.map((f) => f.id));
		const o = order({
			answers: [
				{ id: 1, label: 'Primera vez', value: 'Sí', ticket: 1 },
				{ id: 99, label: 'Talle', value: 'M' }
			]
		});
		expect(answerKey({ id: 1, label: 'cualquiera' }, ids)).toBe('f1');
		expect(matchesAnswer(o, { key: 'f1', value: 'Sí', label: '' }, ids)).toBe(true);
		expect(matchesAnswer(o, { key: 'f1', value: 'No', label: '' }, ids)).toBe(false);
		expect(matchesAnswer(o, { key: 'l:Talle', value: 'M', label: '' }, ids)).toBe(true);
	});

	it('el buscador encuentra por respuesta, sin acentos', () => {
		const o = order({
			answers: [{ id: 2, label: 'x', value: 'Luces estroboscópicas', ticket: 1 }]
		});
		expect(orderSearchText(o)).toContain('estroboscopicas');
		expect(orderSearchText(o)).toContain('kv-aaaa0001');
	});
});

describe('Respuestas: una tarjeta por pregunta', () => {
	const orders = [
		order({
			id: 'a',
			quantity: 2,
			holders: [
				{ name: 'Ana Ejemplo', pronouns: 'ella', firstTime: true },
				{ name: 'Bruno Ejemplo', pronouns: '', firstTime: false }
			],
			answers: [
				{ id: 1, label: 'Primera vez', value: 'Sí', ticket: 1 },
				{ id: 1, label: 'Primera vez', value: 'No', ticket: 2 },
				{ id: 2, label: 'Necesidades', value: 'Saber dónde está la salida.', ticket: 1 },
				{ id: 3, label: '¿Cómo te enteraste?', value: 'Instagram' }
			]
		}),
		order({
			id: 'b',
			name: 'Dani Ejemplo',
			pronouns: 'elle',
			holders: [{ name: 'Dani Ejemplo', pronouns: 'elle', firstTime: true }],
			answers: [
				{ id: 1, label: 'Primera vez', value: 'Sí', ticket: 1 },
				{ id: 3, label: '¿Cómo te enteraste?', value: 'Un flyer' },
				{ id: 77, label: 'Talle de remera', value: 'L' }
			]
		})
	];
	const cards = questionCards(FIELDS, orders);

	it('en el orden del formulario, y al final las preguntas que ya no están', () => {
		expect(cards.map((c) => c.key)).toEqual(['f1', 'f2', 'f3', 'f4', 'l:Talle de remera']);
		expect(cards[0].label).toBe('Primera vez');
		expect(cards[0].fullLabel).toBe('Es la primera vez que voy a un Picantearla');
	});

	it('opciones: todas, la más elegida primero; un valor que ya no es opción también cuenta', () => {
		expect(cards[0]).toMatchObject({ perTicket: true, answered: 3, asked: 3 });
		expect(cards[0].bars.map((b) => [b.value, b.n])).toEqual([
			['Sí', 2],
			['No', 1]
		]);
		expect(cards[2]).toMatchObject({ perTicket: false, answered: 2, asked: 2 });
		expect(cards[2].bars.map((b) => [b.value, b.n, b.defined])).toEqual([
			['Instagram', 1, true],
			['Un flyer', 1, false],
			['Amigues', 0, true],
			['Otro', 0, true]
		]);
	});

	it('casilla: «Sí», y solo se le pregunta a los tipos de entrada a los que aplica', () => {
		expect(cards[3]).toMatchObject({ kind: 'checkbox', answered: 0, asked: 0 });
		expect(cards[3].bars).toEqual([{ value: 'Sí', n: 0, defined: true }]);
	});

	it('texto: solo quienes escribieron algo, con nombre, pronombres y primera vez', () => {
		expect(cards[1].entries).toEqual([
			{
				orderId: 'a',
				name: 'Ana Ejemplo',
				pronouns: 'ella',
				firstTime: true,
				value: 'Saber dónde está la salida.'
			}
		]);
		expect(cards[1]).toMatchObject({ answered: 1, asked: 3 });
	});

	it('pregunta borrada: como texto, con quien compró si era por compra', () => {
		expect(cards[4]).toMatchObject({ removed: true, kind: 'text', answered: 1 });
		expect(cards[4].entries[0]).toMatchObject({
			orderId: 'b',
			name: 'Dani Ejemplo',
			firstTime: true
		});
	});

	it('«Copiar para el equipo»: «Nombre (pronombres): respuesta», una por línea', () => {
		expect(
			copyText({
				entries: [
					{ orderId: 'a', name: 'Ana', pronouns: 'ella', firstTime: null, value: 'Una\ncosa' },
					{ orderId: 'b', name: 'Bruno', pronouns: '', firstTime: null, value: 'Otra' }
				]
			})
		).toBe('Ana (ella): Una / cosa\nBruno: Otra');
	});

	it('respuestas largas: más de una línea o muchas letras', () => {
		expect(isLongAnswer('Sí')).toBe(false);
		expect(isLongAnswer('a\nb')).toBe(true);
		expect(isLongAnswer('x'.repeat(61))).toBe(true);
	});
});

describe('los tipos de los formularios en Respuestas y Compras', () => {
	/** @type {import('./ordersView.js').ViewField[]} */
	const fields = [
		{ id: 10, label: 'Intereses', kind: 'multi', options: ['Sogas', 'Látex', 'Impacto'] },
		{ id: 11, label: 'Talle', kind: 'select', options: ['S', 'M', 'L'] },
		{ id: 12, label: 'Puntaje', kind: 'rating', options: [] },
		{ id: 13, label: 'Edad', kind: 'number', options: [] },
		{ id: 14, label: 'Desde', kind: 'date', options: [] }
	];
	const orders = [
		order({
			id: 'a',
			answers: [
				{ id: 10, label: 'Intereses', value: 'Sogas | Impacto', kind: 'multi' },
				{ id: 11, label: 'Talle', value: 'M', kind: 'select' },
				{ id: 12, label: 'Puntaje', value: '5', kind: 'rating' },
				{ id: 13, label: 'Edad', value: '30.5', kind: 'number' },
				{ id: 14, label: 'Desde', value: '2024-03-09', kind: 'date' }
			]
		}),
		order({
			id: 'b',
			answers: [
				{ id: 10, label: 'Intereses', value: 'Impacto', kind: 'multi' },
				{ id: 11, label: 'Talle', value: 'M', kind: 'select' },
				{ id: 12, label: 'Puntaje', value: '2', kind: 'rating' }
			]
		})
	];

	it('opciones, lista, varias opciones y puntaje van con barras; número y fecha, como se leen', () => {
		const cards = questionCards(fields, orders);
		expect(cards.map((c) => c.kind)).toEqual(['multi', 'select', 'rating', 'text', 'text']);
		// Varias opciones: cada compra cuenta en cada opción que eligió.
		expect(cards[0].answered).toBe(2);
		expect(cards[0].bars.map((b) => [b.value, b.n])).toEqual([
			['Impacto', 2],
			['Sogas', 1],
			['Látex', 0]
		]);
		expect(cards[1].bars.map((b) => [b.value, b.n])).toEqual([
			['M', 2],
			['S', 0],
			['L', 0]
		]);
		// El puntaje, del 1 al 5 en orden.
		expect(cards[2].bars.map((b) => [b.value, b.n])).toEqual([
			['1', 0],
			['2', 1],
			['3', 0],
			['4', 0],
			['5', 1]
		]);
		expect(cards[3].entries.map((e) => e.value)).toEqual(['30,5']);
		expect(cards[4].entries.map((e) => e.value)).toEqual(['09/03/2024']);
	});

	it('tocar una barra de «Varias opciones» filtra las compras que la eligieron entre otras', () => {
		const ids = new Set(fields.map((f) => f.id));
		const sogas = { key: 'f10', value: 'Sogas', label: '', multi: true };
		expect(orders.map((o) => matchesAnswer(o, sogas, ids))).toEqual([true, false]);
		const impacto = { ...sogas, value: 'Impacto' };
		expect(orders.map((o) => matchesAnswer(o, impacto, ids))).toEqual([true, true]);
		// Sin `multi`, la respuesta entera (lo de «ver quiénes respondieron igual»).
		expect(orders.map((o) => matchesAnswer(o, { ...impacto, multi: false }, ids))).toEqual([
			false,
			true
		]);
	});

	it('en la tarjeta de la compra, número y fecha como se leen; las de opciones se filtran', () => {
		const g = orderAnswerGroups(orders[0], fields);
		expect(g.order.map((a) => [a.value, a.choice])).toEqual([
			['Sogas | Impacto', true],
			['M', true],
			['5', true],
			['30,5', false],
			['09/03/2024', false]
		]);
	});
});

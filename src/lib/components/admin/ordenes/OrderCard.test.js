/**
 * Una compra en Ventas › Órdenes: todo a la vista (cada entrada con sus respuestas, las de la
 * compra aparte) y solo los botones que corresponden a su estado. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import OrderCard from './OrderCard.svelte';
import AnswersView from './AnswersView.svelte';
import { questionCards } from '$lib/admin/ordersView.js';

/** @param {Record<string, unknown>} over */
function order(over = {}) {
	return {
		id: 'orden-1',
		reference: 'KV-ORDEN001',
		name: 'Persona Uno',
		email: 'uno@example.com',
		pronouns: 'elle',
		dniTail: '',
		type: 'General',
		typeId: 'general',
		quantity: 2,
		status: 'approved',
		method: 'mercadopago',
		total: 10000,
		extrasAmount: 0,
		refundedAmount: 0,
		checkedIn: 1,
		emailSent: true,
		emailProblem: null,
		createdAt: Date.UTC(2026, 10, 20, 21, 0),
		expiresAt: Date.UTC(2026, 10, 22, 21, 0),
		paymentId: '123',
		confirmedBy: null,
		toInvoice: false,
		invoicedAt: null,
		note: '',
		priceChange: '',
		transferPending: false,
		holders: [
			{ name: 'Persona Uno', pronouns: 'elle', checkedIn: true, firstTime: false },
			{ name: 'Persona Dos', pronouns: 'ella', checkedIn: false, firstTime: true }
		],
		answers: [
			{ id: 1, label: 'Primera vez', value: 'Sí', ticket: 2 },
			{ id: 2, label: '¿Alguna restricción alimentaria?', value: 'Vegana', ticket: 1 },
			{ id: 3, label: 'Talle de remera', value: 'M' }
		],
		...over
	};
}

const fields = [
	{
		id: 1,
		label: 'Primera vez',
		kind: /** @type {const} */ ('choice'),
		options: ['Sí', 'No'],
		perTicket: true
	},
	{
		id: 2,
		label: '¿Alguna restricción alimentaria?',
		kind: /** @type {const} */ ('text'),
		options: [],
		perTicket: true
	}
];

/** @param {Record<string, unknown>} over */
const html = (over = {}) => render(OrderCard, { props: { o: order(over), fields } }).body;

describe('OrderCard', () => {
	it('cada entrada con sus respuestas, «primera vez» e ingresó; las de la compra aparte', () => {
		const body = html();
		expect(body).toContain('Persona Dos');
		expect(body).toContain('primera vez');
		expect(body).toContain('ingresó');
		expect(body).toContain('Vegana');
		// Una pregunta que ya no está en el formulario: con el texto guardado.
		expect(body).toContain('Talle de remera:');
		expect(body).not.toContain('alimentaria?:');
		// Solo las de opciones se pueden usar para filtrar.
		expect(body.match(/ver quiénes respondieron igual/g)).toHaveLength(1);
	});

	it('aprobada: Reenviar mail y «Más» (corregir el mail, reembolsar); sin facturar, sin casilla', () => {
		const body = html();
		expect(body).toContain('Reenviar mail');
		expect(body).toContain('Corregir el mail…');
		expect(body).toContain('Reembolsar…');
		expect(body).not.toContain('Llegó la transferencia');
		expect(body).not.toContain('action="?/invoiced"');
		expect(html({ toInvoice: true })).toContain('action="?/invoiced"');
	});

	it('transferencia por confirmar: «Llegó la transferencia ✓» y Cancelar, sin Reenviar mail', () => {
		const body = html({
			status: 'awaiting_transfer',
			method: 'transferencia',
			transferPending: true,
			paymentId: null
		});
		expect(body).toContain('Llegó la transferencia ✓');
		expect(body).toContain('action="?/cancel"');
		expect(body).toContain('reservada hasta');
		expect(body).not.toContain('Reenviar mail');
		expect(body).not.toContain('Reembolsar…');
	});

	it('transferencia cancelada por une admin: «Deshacer rechazo»', () => {
		const body = html({ status: 'cancelled', method: 'transferencia', confirmedBy: 'gorrite' });
		expect(body).toContain('Deshacer rechazo');
		expect(body).toContain('canceló gorrite');
		expect(body).not.toContain('Reenviar mail');
	});
});

describe('AnswersView', () => {
	it('barras con todas las opciones y la de texto con quienes escribieron', () => {
		const cards = questionCards(fields, [/** @type {any} */ (order())]);
		const { body } = render(AnswersView, { props: { cards } });
		expect(body).toContain('👥 1');
		expect(body).toContain('👥 0');
		expect(body).toContain('Copiar para el equipo');
		expect(body).toContain('href="#orden-orden-1"');
		expect(body).toContain('Vegana');
		expect(body).toContain('ya no está en el formulario');
	});
});

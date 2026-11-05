/**
 * El editor compartido de preguntas (docs/formularios.md): mover con ↑ ↓ (o arrastrando),
 * duplicar, lo que se manda al guardar (en su orden) y la vista previa.
 */
import { describe, expect, it } from 'vitest';
import {
	blankItem,
	duplicateItem,
	moveItem,
	previewQuestions,
	toEditorItems,
	toPayload
} from './questionEditor.js';

const saved = [
	{ id: 'p1', kind: 'text', label: 'Primera', required: true, options: [] },
	{ id: 'p2', kind: 'choice', label: 'Segunda', required: false, options: ['Sí', 'No'] },
	{ id: 'p3', kind: 'rating', label: 'Tercera', required: false, options: [], low: 'Mal' }
];

describe('mover', () => {
	it('sube, baja y arrastra a cualquier lugar sin perder ninguna', () => {
		const items = toEditorItems(saved);
		const labels = (/** @type {any[]} */ l) => l.map((q) => q.label);
		expect(labels(moveItem(items, 1, 0))).toEqual(['Segunda', 'Primera', 'Tercera']);
		expect(labels(moveItem(items, 0, 1))).toEqual(['Segunda', 'Primera', 'Tercera']);
		expect(labels(moveItem(items, 0, 2))).toEqual(['Segunda', 'Tercera', 'Primera']);
		expect(labels(moveItem(items, 2, 0))).toEqual(['Tercera', 'Primera', 'Segunda']);
		// Fuera de rango (↑ en la primera, ↓ en la última): igual.
		expect(labels(moveItem(items, 0, -1))).toEqual(labels(items));
		expect(labels(moveItem(items, 2, 3))).toEqual(labels(items));
		// No cambia la lista original.
		expect(labels(items)).toEqual(['Primera', 'Segunda', 'Tercera']);
	});

	it('lo guardado sale en el orden nuevo, con los ids de siempre', () => {
		const moved = moveItem(toEditorItems(saved), 2, 0);
		expect(toPayload(moved).map((q) => q.id)).toEqual(['p3', 'p1', 'p2']);
	});
});

describe('duplicar y agregar', () => {
	it('la copia va justo abajo, sin id (es nueva) y con su propia clave', () => {
		const items = toEditorItems(saved);
		const out = duplicateItem(items, 0);
		expect(out.map((q) => q.label)).toEqual(['Primera', 'Primera (copia)', 'Segunda', 'Tercera']);
		expect(out[1].id).toBeNull();
		expect(out[1].key).not.toBe(out[0].key);
		expect(out[1].required).toBe(true);
	});

	it('una pregunta nueva es de texto y sin id', () => {
		expect(blankItem()).toMatchObject({ kind: 'text', id: null, label: '' });
	});
});

describe('lo que se manda', () => {
	it('formularios: opciones solo en las de opciones, extremos solo en el puntaje', () => {
		const p = toPayload(toEditorItems(saved));
		expect(p[0]).toMatchObject({ options: [] });
		expect(p[1]).toMatchObject({ options: ['Sí', 'No'] });
		expect(p[2]).toMatchObject({ low: 'Mal', high: '' });
		expect(p[0]).not.toHaveProperty('perTicket');
	});

	it('inscripción: con alcance y sin ayuda', () => {
		const items = toEditorItems([
			{
				id: 4,
				kind: 'text',
				label: 'Dieta',
				required: false,
				options: [],
				perTicket: true,
				ticketTypes: ['vip']
			}
		]);
		expect(toPayload(items, { signup: true })).toEqual([
			{
				id: 4,
				kind: 'text',
				label: 'Dieta',
				required: false,
				options: [],
				perTicket: true,
				scope: 'some',
				ticketTypes: ['vip']
			}
		]);
	});

	it('la vista previa limpia las opciones y pone los extremos por defecto', () => {
		const items = toEditorItems(saved);
		items[1].optionsText = 'Sí\n\nSí\nNo ';
		const p = previewQuestions(items);
		expect(p[1].options).toEqual(['Sí', 'No']);
		expect(p[2]).toMatchObject({ low: 'Mal', high: 'Re bien' });
	});
});

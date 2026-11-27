import { describe, expect, it } from 'vitest';
import {
	BULK_ACTIONS,
	bulkMessage,
	chunk,
	isBulkAction,
	keepVisible,
	mailList,
	mergeBulk,
	skipReason,
	splitForAction
} from './orderBulk.js';

const approved = { id: 'a', status: 'approved', toInvoice: true, invoicedAt: null };
const invoiced = { id: 'b', status: 'approved', toInvoice: true, invoicedAt: 5 };
const free = { id: 'c', status: 'approved', toInvoice: false, invoicedAt: null };
const pending = { id: 'd', status: 'pending', toInvoice: false, invoicedAt: null };
const review = { ...approved, id: 'e', needsReview: 'late_payment' };

describe('orderBulk', () => {
	it('solo acciones seguras: nada de plata', () => {
		expect(BULK_ACTIONS.map((a) => a.id)).toEqual([
			'facturada',
			'sin-facturar',
			'revisada',
			'reenviar'
		]);
		expect(isBulkAction('reembolsar')).toBe(false);
		expect(isBulkAction('confirm')).toBe(false);
		expect(isBulkAction('facturada')).toBe(true);
	});

	it('a qué compras aplica cada acción', () => {
		expect(skipReason('facturada', approved)).toBeNull();
		expect(skipReason('facturada', invoiced)).toBe('ya-facturada');
		expect(skipReason('facturada', free)).toBe('sin-pago');
		expect(skipReason('sin-facturar', invoiced)).toBeNull();
		expect(skipReason('sin-facturar', approved)).toBe('ya-sin-facturar');
		expect(skipReason('revisada', review)).toBeNull();
		expect(skipReason('revisada', approved)).toBe('sin-revisar');
		expect(skipReason('reenviar', approved)).toBeNull();
		expect(skipReason('reenviar', pending)).toBe('no-aprobada');
		const s = splitForAction('reenviar', [approved, pending, free]);
		expect(s.apply.map((o) => o.id)).toEqual(['a', 'c']);
		expect(s.skipped).toEqual([{ id: 'd', reason: 'no-aprobada' }]);
	});

	it('tandas', () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 5)).toEqual([]);
	});

	it('suma tandas; si se cortó, las que faltan quedan salteadas', () => {
		const a = mergeBulk(
			{ done: [], skipped: [{ id: 'x', reason: 'no-aprobada' }] },
			{
				done: ['a'],
				skipped: []
			}
		);
		const b = mergeBulk(a, { done: [], skipped: [{ id: 'b', reason: 'esperar' }], stopped: true }, [
			'c'
		]);
		expect(b).toEqual({
			done: ['a'],
			skipped: [
				{ id: 'x', reason: 'no-aprobada' },
				{ id: 'b', reason: 'esperar' },
				{ id: 'c', reason: 'esperar' }
			],
			stopped: true
		});
	});

	it('el resultado: «N hechas, M salteadas (motivo)»', () => {
		expect(bulkMessage({ done: ['a'], skipped: [] })).toBe('1 hecha.');
		expect(
			bulkMessage({
				done: ['a', 'b', 'c'],
				skipped: [
					{ id: 'd', reason: 'ya-facturada' },
					{ id: 'e', reason: 'sin-pago' },
					{ id: 'f', reason: 'ya-facturada' }
				]
			})
		).toBe('3 hechas, 3 salteadas (2 ya facturadas; 1 sin pago para facturar).');
		expect(bulkMessage({ done: [], skipped: [{ id: 'd', reason: 'no-aprobada' }] })).toBe(
			'0 hechas, 1 salteada (1 no aprobada).'
		);
	});

	it('mails sin repetir (sin importar mayúsculas)', () => {
		expect(
			mailList([
				{ email: 'una@example.com' },
				{ email: 'UNA@example.com' },
				{ email: ' otra@example.com ' },
				{ email: '' }
			])
		).toEqual(['una@example.com', 'otra@example.com']);
	});

	it('la selección queda solo con las que se ven', () => {
		const sel = ['a', 'b'];
		expect(keepVisible(sel, new Set(['a', 'b', 'c']))).toBe(sel);
		expect(keepVisible(sel, new Set(['b']))).toEqual(['b']);
	});
});

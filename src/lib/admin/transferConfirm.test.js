import { describe, expect, it } from 'vitest';
import { confirmPaymentQuestion, keepRows } from './transferConfirm.js';

const row = (id) => ({
	id,
	reference: `KV-${id}`,
	name: 'Persona Prueba',
	total: 12000,
	quantity: 1,
	type: 'General'
});

describe('confirmPaymentQuestion', () => {
	it('muestra nombre, monto y la cantidad en singular o plural', () => {
		const q = confirmPaymentQuestion(row('A'));
		expect(q.title).toBe('¿Confirmar el pago de Persona Prueba?');
		expect(q.text).toContain('KV-A');
		expect(q.text).toContain('12.000');
		expect(q.text).toContain('1 entrada General');
		expect(confirmPaymentQuestion({ ...row('B'), quantity: 2 }).text).toContain(
			'2 entradas General'
		);
		expect(q.tone).toBe('primary');
	});
});

describe('keepRows', () => {
	it('sin resueltas, las filas tal cual', () => {
		expect(keepRows([row('a'), row('b')], [])).toEqual([
			{ row: row('a'), result: null },
			{ row: row('b'), result: null }
		]);
	});
	it('la fila confirmada (ya no está en la lista) vuelve a su lugar con el aviso', () => {
		const out = keepRows(
			[row('a'), row('c')],
			[{ row: row('b'), index: 1, ok: true, message: 'Pago confirmado' }]
		);
		expect(out.map((r) => r.row.id)).toEqual(['a', 'b', 'c']);
		expect(out[1].result).toEqual({ ok: true, message: 'Pago confirmado' });
	});
	it('si falló (sigue en la lista), el aviso va en esa fila sin duplicarla', () => {
		const out = keepRows([row('a')], [{ row: row('a'), index: 0, ok: false, message: 'No' }]);
		expect(out).toHaveLength(1);
		expect(out[0].result).toEqual({ ok: false, message: 'No' });
	});
	it('un índice más allá del final va al final', () => {
		const out = keepRows([], [{ row: row('z'), index: 5, ok: true, message: 'ok' }]);
		expect(out.map((r) => r.row.id)).toEqual(['z']);
	});
});

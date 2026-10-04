/**
 * Meta de venta de un evento: leerla del frontmatter, el formulario, lo neto (lo cobrado menos la
 * comisión de Mercado Pago) y el avance contra la meta. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { formatARS } from './money.js';
import {
	GOAL_MAX,
	describeSalesGoal,
	goalFromForm,
	goalProgress,
	goalToForm,
	netRevenue,
	orderMpFee,
	parseSalesGoal,
	salesGoalProblem,
	storedSalesGoal
} from './salesGoal.js';
import { mpSurcharge } from './tickets.js';

describe('parseSalesGoal', () => {
	it('lee la forma guardada (plata o entradas)', () => {
		expect(parseSalesGoal('plata:250000')).toEqual({ kind: 'plata', value: 250000 });
		expect(parseSalesGoal('entradas:30')).toEqual({ kind: 'entradas', value: 30 });
		expect(parseSalesGoal(' Plata : 250.000 ')).toEqual({ kind: 'plata', value: 250000 });
	});

	it('acepta la forma de mapa escrita a mano en el frontmatter (una sola clave)', () => {
		expect(parseSalesGoal({ plata: 180000 })).toEqual({ kind: 'plata', value: 180000 });
		expect(parseSalesGoal({ entradas: '40' })).toEqual({ kind: 'entradas', value: 40 });
		expect(parseSalesGoal({ plata: 1, entradas: 2 })).toBeNull();
	});

	it('lo que no se entiende es sin meta (nunca tira)', () => {
		for (const raw of [
			undefined,
			null,
			'',
			'plata',
			'plata:',
			'plata:0',
			'plata:-5',
			'plata:12,5',
			'cupo:30',
			'entradas:abc',
			`entradas:${GOAL_MAX.entradas + 1}`,
			42,
			[],
			{ cupo: 3 }
		])
			expect(parseSalesGoal(raw)).toBeNull();
	});

	it('salesGoalProblem: nada si no hay meta o está bien; un mensaje si está rota', () => {
		expect(salesGoalProblem(undefined)).toBeNull();
		expect(salesGoalProblem('')).toBeNull();
		expect(salesGoalProblem('entradas:30')).toBeNull();
		expect(salesGoalProblem('entradas:0')).toMatch(/entero mayor a 0/);
	});

	it('storedSalesGoal y describeSalesGoal', () => {
		expect(storedSalesGoal({ kind: 'plata', value: 250000 })).toBe('plata:250000');
		expect(storedSalesGoal(null)).toBe('');
		expect(describeSalesGoal({ kind: 'plata', value: 250000 })).toBe(formatARS(250000));
		expect(describeSalesGoal({ kind: 'entradas', value: 1 })).toBe('1 entrada');
		expect(describeSalesGoal({ kind: 'entradas', value: 30 })).toBe('30 entradas');
	});
});

describe('formulario «Meta»', () => {
	it('sin meta no es un error', () => {
		expect(goalFromForm('', '123')).toEqual({ goal: null, error: '' });
	});

	it('plata y entradas válidas', () => {
		expect(goalFromForm('plata', '250.000')).toEqual({
			goal: { kind: 'plata', value: 250000 },
			error: ''
		});
		expect(goalFromForm('entradas', ' 30 ')).toEqual({
			goal: { kind: 'entradas', value: 30 },
			error: ''
		});
	});

	it('errores en voseo, según la medida', () => {
		expect(goalFromForm('plata', '').error).toBe(
			'Meta: escribí cuánta plata querés juntar, en pesos enteros (mayor a 0).'
		);
		expect(goalFromForm('entradas', '0').error).toBe(
			'Meta: escribí cuántas entradas querés vender (un número entero mayor a 0).'
		);
		expect(goalFromForm('plata', String(GOAL_MAX.plata * 10)).error).toMatch(/sobra un cero/);
		expect(goalFromForm('entradas', '1000000').error).toMatch(/sobra un cero/);
	});

	it('goalToForm: los campos para una meta guardada', () => {
		expect(goalToForm('plata:250000')).toEqual({ kind: 'plata', value: '250000' });
		expect(goalToForm('roto')).toEqual({ kind: '', value: '' });
	});
});

describe('lo neto: lo cobrado menos la comisión de Mercado Pago', () => {
	it('la comisión de una orden es su recargo si pagó con Mercado Pago; si no, 0', () => {
		expect(orderMpFee({ payment_method: 'mercadopago', surcharge_amount: 360 })).toBe(360);
		for (const m of ['transferencia', 'efectivo', 'otro', 'gratis']) {
			expect(orderMpFee({ payment_method: m, surcharge_amount: 360 })).toBe(0);
		}
		expect(orderMpFee({ payment_method: 'mercadopago', surcharge_amount: null })).toBe(0);
	});

	it('el recargo es justo lo que se queda MP: lo neto de una compra con MP es la base', () => {
		// Base $ 17.600 con 2 %: el recargo ($ 360) se calcula para que, después de la comisión,
		// quede la base (docs/tickets.md, «Precio: fondo, código y recargo»).
		const surcharge = mpSurcharge(17600, 200);
		expect(surcharge).toBe(360);
		const order = { payment_method: 'mercadopago', surcharge_amount: surcharge };
		expect(netRevenue({ revenue: 17600 + surcharge, mpFee: orderMpFee(order) })).toBe(17600);
	});

	it('netRevenue: recaudado − comisión, nunca negativo', () => {
		expect(netRevenue({ revenue: 100000, mpFee: 2000 })).toBe(98000);
		expect(netRevenue({ revenue: 0, mpFee: 0 })).toBe(0);
		expect(netRevenue({ revenue: 10, mpFee: 50 })).toBe(0);
	});
});

describe('goalProgress', () => {
	it('plata: lo NETO (recaudado − comisión de MP) contra la meta, con el porcentaje', () => {
		const p = goalProgress('plata:250000', { sold: 23, revenue: 183600, mpFee: 3600 });
		expect(p).toEqual({
			kind: 'plata',
			current: 180000,
			target: 250000,
			pct: 72,
			reached: false,
			text: `${formatARS(180000)} netos de ${formatARS(250000)} (72 %)`
		});
	});

	it('plata: la comisión puede ser lo que falta para llegar', () => {
		expect(goalProgress('plata:100000', { sold: 10, revenue: 100000, mpFee: 0 })?.reached).toBe(
			true
		);
		const p = goalProgress('plata:100000', { sold: 10, revenue: 100000, mpFee: 1500 });
		expect(p).toMatchObject({ current: 98500, pct: 99, reached: false });
	});

	it('entradas: «23 de 30 entradas» (la comisión no cuenta)', () => {
		const p = goalProgress({ kind: 'entradas', value: 30 }, { sold: 23, revenue: 999, mpFee: 50 });
		expect(p?.text).toBe('23 de 30 entradas');
		expect(p?.pct).toBe(77);
		expect(p?.reached).toBe(false);
		expect(goalProgress('entradas:1', { sold: 0, revenue: 0, mpFee: 0 })?.text).toBe(
			'0 de 1 entrada'
		);
	});

	it('pasarse de la meta: más de 100 % y cumplida', () => {
		const p = goalProgress('entradas:20', { sold: 25, revenue: 0, mpFee: 0 });
		expect(p?.pct).toBe(125);
		expect(p?.reached).toBe(true);
	});

	it('sin meta (o rota): null, para mostrar el cupo como siempre', () => {
		const totals = { sold: 3, revenue: 100, mpFee: 0 };
		expect(goalProgress(null, totals)).toBeNull();
		expect(goalProgress('', totals)).toBeNull();
		expect(goalProgress('plata:0', totals)).toBeNull();
	});
});

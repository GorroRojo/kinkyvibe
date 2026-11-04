import { describe, expect, it } from 'vitest';
import {
	CAJA,
	cleanAccount,
	closingSummary,
	computeAccount,
	emptyAccount,
	eventIncome,
	fondoLine,
	fondoNet,
	settleUp,
	splitProfit,
	splitWhole,
	venueCost,
	yearSummary
} from './reparto.js';

/** @param {number} n */
const fmt = (n) => `$ ${n.toLocaleString('es-AR')}`;

/**
 * Una orden de mentira, aprobada y online por MP salvo que se diga otra cosa.
 * @param {Partial<Record<string, any>>} o
 */
const order = (o) =>
	/** @type {any} */ ({
		status: 'approved',
		quantity: 1,
		total: 10000,
		payment_method: 'mercadopago',
		channel: 'online',
		surcharge_amount: 0,
		fondo_amount: 0,
		fondo_contribution: 0,
		...o
	});

describe('eventIncome', () => {
	it('separa preventa y puerta, sin el recargo de MP ni los aportes al Fondo', () => {
		const income = eventIncome([
			order({ total: 10600, surcharge_amount: 600 }),
			order({ total: 11000, fondo_contribution: 1000 }),
			order({ total: 7000, fondo_amount: 3000 }),
			order({ channel: 'puerta', payment_method: 'efectivo', total: 12000, quantity: 1 }),
			order({ channel: 'manual', payment_method: 'transferencia', total: 10000, quantity: 2 }),
			order({ status: 'refunded', total: 10000 }),
			order({ status: 'awaiting_transfer', payment_method: 'transferencia', total: 10000 })
		]);
		expect(income.gross).toBe(50600);
		expect(income.mpFee).toBe(600);
		expect(income.presale).toBe(10000 + 10000 + 7000 + 10000);
		expect(income.door).toBe(12000);
		expect(income.tickets).toBe(6);
		expect(income.fondoUsed).toBe(3000);
		expect(income.fondoContributed).toBe(1000);
		expect(income.refunded).toEqual({ orders: 1, amount: 10000 });
		expect(income.awaiting).toEqual({ orders: 1, amount: 10000 });
		expect(income.rows.map((r) => r.key)).toEqual(['mercadopago', 'puerta-efectivo', 'manual']);
	});
});

describe('el Fondo, orden por orden', () => {
	it('cubrió más de lo que recibió: el Fondo le pasa la diferencia al evento', () => {
		const income = eventIncome([
			order({ total: 15000, fondo_amount: 15000, quantity: 2 }),
			order({ total: 15000, fondo_amount: 15000, quantity: 2 }),
			order({ total: 28000, fondo_contribution: 8000, quantity: 2 }),
			order({ total: 20000 })
		]);
		expect(fondoNet(income)).toBe(22000);
		expect(fondoLine(income, fmt)).toBe(
			'Fondo: cubrió $ 30.000 en descuentos − recibió $ 8.000 en aportes = el Fondo le pasa $ 22.000 al evento'
		);
	});

	it('recibió más de lo que cubrió: el evento le pasa la diferencia al Fondo', () => {
		const income = eventIncome([
			order({ total: 9000, fondo_amount: 1000 }),
			order({ total: 15000, fondo_contribution: 5000 })
		]);
		expect(fondoNet(income)).toBe(-4000);
		expect(fondoLine(income, fmt)).toBe(
			'Fondo: cubrió $ 1.000 en descuentos − recibió $ 5.000 en aportes = el evento le pasa $ 4.000 al Fondo'
		);
	});

	it('sin descuentos ni aportes, quedan a mano y el Fondo no entra en la cuenta', () => {
		const income = eventIncome([order({})]);
		expect(fondoNet(income)).toBe(0);
		expect(fondoLine(income, fmt)).toMatch(/= quedan a mano$/);
		const r = computeAccount(income, emptyAccount());
		expect(r.parties.some((p) => p.kind === 'fondo')).toBe(false);
	});

	it('usa los montos de cada orden, no un promedio por entrada', () => {
		// 3 entradas, una sola con descuento del Fondo: 9.000 ÷ 3 daría otra cosa.
		const income = eventIncome([
			order({ quantity: 2, total: 20000 }),
			order({ quantity: 1, total: 1000, fondo_amount: 9000 })
		]);
		expect(income.fondoUsed).toBe(9000);
	});
});

describe('venueCost: las cuatro formas del lugar', () => {
	it('fijo', () => {
		expect(venueCost({ kind: 'fijo', amount: 50000 }, 999999).amount).toBe(50000);
	});
	it('por hora: horas × precio', () => {
		expect(venueCost({ kind: 'hora', hours: 3.5, rate: 12000 }, 0).amount).toBe(42000);
	});
	it('porcentaje de los ingresos, redondeado al peso', () => {
		expect(venueCost({ kind: 'porcentaje', pct: 30 }, 100001).amount).toBe(30000);
		expect(venueCost({ kind: 'porcentaje', pct: 30 }, 100005).amount).toBe(30002);
	});
	it('porcentaje con mínimo fijo: el mayor', () => {
		const rule = /** @type {const} */ ({
			kind: 'porcentaje_minimo',
			pct: 25,
			minKind: 'fijo',
			minAmount: 40000
		});
		expect(venueCost(rule, 100000)).toEqual({
			amount: 40000,
			byPct: 25000,
			min: 40000,
			usedMin: true
		});
		expect(venueCost(rule, 200000)).toEqual({
			amount: 50000,
			byPct: 50000,
			min: 40000,
			usedMin: false
		});
	});
	it('porcentaje con mínimo por hora', () => {
		const rule = /** @type {const} */ ({
			kind: 'porcentaje_minimo',
			pct: 20,
			minKind: 'hora',
			hours: 4,
			rate: 10000
		});
		expect(venueCost(rule, 150000).amount).toBe(40000);
		expect(venueCost(rule, 250000).amount).toBe(50000);
	});
	it('una regla rota no cobra nada', () => {
		expect(venueCost(/** @type {any} */ ({ kind: 'nada' }), 100000).amount).toBe(0);
		expect(venueCost(null, 100000).amount).toBe(0);
	});
});

describe('splitProfit', () => {
	it('regla de talleres: Mel (equipo) + Memi → Memi 35 %, Caja KV 65 %', () => {
		const r = splitProfit(
			100000,
			[
				{ id: 'mel', name: 'Mel', team: true },
				{ id: 'memi', name: 'Memi', team: false }
			],
			{ productionPct: 30, mode: 'iguales', lossBy: 'produccion' }
		);
		expect(r.shares.map((s) => s.amount)).toEqual([35000, 35000]);
		expect(r.caja).toBe(65000);
		expect(r.problem).toBe('');
	});

	it('los pesos del redondeo van a la Caja KV', () => {
		const r = splitProfit(
			100001,
			[
				{ id: 'a', name: 'A', team: false },
				{ id: 'b', name: 'B', team: false },
				{ id: 'c', name: 'C', team: false }
			],
			{ productionPct: 30, mode: 'iguales', lossBy: 'produccion' }
		);
		// 70 % de 100.001 = 70.000,7 → 70.000 para repartir; 23.333 cada une; el resto, a la Caja.
		expect(r.shares.map((s) => s.amount)).toEqual([23333, 23333, 23333]);
		expect(r.caja).toBe(100001 - 3 * 23333);
		expect(r.caja + r.shares.reduce((s, x) => s + x.amount, 0)).toBe(100001);
	});

	it('con porcentajes que no suman 100 avisa y no reparte', () => {
		const r = splitProfit(
			1000,
			[
				{ id: 'a', name: 'A', team: false, pct: 60 },
				{ id: 'b', name: 'B', team: false, pct: 30 }
			],
			{ productionPct: 30, mode: 'porcentajes', lossBy: 'produccion' }
		);
		expect(r.problem).toBe('Los porcentajes suman 90 %: falta repartir 10 %.');
		expect(r.caja).toBe(1000);
	});

	const MEL_MEMI = [
		{ id: 'mel', name: 'Mel', team: true },
		{ id: 'memi', name: 'Memi', team: false }
	];

	// Pérdida (gorrite, Mesa 4/11): por defecto la ponen quienes producen, según su parte.
	it('con pérdida, por defecto: Mel + Memi no ponen nada y la pone la Caja KV (única productora)', () => {
		const r = splitProfit(-100000, MEL_MEMI, DEFAULT());
		expect(r.shares.map((s) => s.amount)).toEqual([0, 0]);
		expect(r.caja).toBe(-100000);
	});

	it('con pérdida y una co-productora al 50 %, la ponen mitad y mitad', () => {
		const r = splitProfit(-100001, MEL_MEMI, DEFAULT(), [
			{ id: 'org', name: 'Colectivo de prueba', share: 50 }
		]);
		expect(r.shares.map((s) => s.amount)).toEqual([0, 0]);
		expect(r.coproducers[0].amount).toBe(-50000);
		// La Caja KV pone su mitad y el peso del redondeo.
		expect(r.caja).toBe(-50001);
	});

	it('con ganancia, la producción se reparte entre la Caja KV y quien co-produce', () => {
		const r = splitProfit(100000, MEL_MEMI, DEFAULT(), [
			{ id: 'org', name: 'Colectivo de prueba', share: 50 }
		]);
		// Producción 30.000: 15.000 al colectivo; la Caja KV, 15.000 + la parte de Mel (35.000).
		expect(r.coproducers[0].amount).toBe(15000);
		expect(r.shares.map((s) => s.amount)).toEqual([35000, 35000]);
		expect(r.caja).toBe(50000);
	});

	it('co-productoras que suman más de 100 % avisan', () => {
		const r = splitProfit(1000, MEL_MEMI, DEFAULT(), [
			{ id: 'a', name: 'A', share: 60 },
			{ id: 'b', name: 'B', share: 50 }
		]);
		expect(r.problem).toMatch(/suman 110 %/);
	});

	// Con «todes», la pérdida se reparte como la ganancia.
	it('con pérdida y «todes»: Mel (equipo) + Memi → Memi pone 35 %, la Caja KV 65 %', () => {
		const r = splitProfit(-100000, MEL_MEMI, TODES());
		expect(r.shares.map((s) => s.amount)).toEqual([-35000, -35000]);
		expect(r.caja).toBe(-65000);
	});

	it('con pérdida y «todes», cada facilitadore pone su parte para abajo y la Caja KV el resto', () => {
		const r = splitProfit(
			-100001,
			[
				{ id: 'a', name: 'A', team: false },
				{ id: 'b', name: 'B', team: false },
				{ id: 'c', name: 'C', team: false }
			],
			TODES()
		);
		expect(r.shares.map((s) => s.amount)).toEqual([-23333, -23333, -23333]);
		expect(r.caja).toBe(-100001 + 3 * 23333);
		expect(r.caja + r.shares.reduce((s, x) => s + x.amount, 0)).toBe(-100001);
	});

	it('con pérdida, «todes» y porcentajes, la misma repartija', () => {
		const r = splitProfit(
			-10000,
			[
				{ id: 'a', name: 'A', team: false, pct: 60 },
				{ id: 'b', name: 'B', team: false, pct: 40 }
			],
			{ productionPct: 30, mode: 'porcentajes', lossBy: 'todes' }
		);
		expect(r.shares.map((s) => s.amount)).toEqual([-4200, -2800]);
		expect(r.caja).toBe(-3000);
	});

	it('sin ganancia ni pérdida, nadie pone ni se lleva nada', () => {
		const r = splitProfit(0, [{ id: 'a', name: 'A', team: false }], DEFAULT());
		expect(r.shares[0].amount).toBe(0);
		expect(r.caja).toBe(0);
	});
});

describe('computeAccount con pérdida', () => {
	// Ingresos 100.000 (lo tiene la Caja KV); lugar fijo 150.000 sin pagar: pérdida 50.000.
	const income = eventIncome([order({ quantity: 10, total: 100000 })]);
	/** @param {Record<string, unknown>} extra */
	const account = (extra) =>
		cleanAccount({
			...emptyAccount(),
			venue: { kind: 'fijo', amount: 150000 },
			people: [
				{ id: 'mel', name: 'Mel', team: true },
				{ id: 'memi', name: 'Memi', team: false }
			],
			...extra
		});

	it('por defecto la pone la Caja KV y Memi no pone nada', () => {
		const r = computeAccount(income, account({}));
		expect(r.profit).toBe(-50000);
		expect(r.caja).toBe(-50000);
		expect(r.parties.find((p) => p.id === 'memi')?.balance).toBe(0);
		expect(r.parties.reduce((s, p) => s + p.balance, 0)).toBe(0);
		expect(r.transfers).toEqual([
			expect.objectContaining({ fromName: 'Caja KV', toName: 'Lugar', amount: 150000 })
		]);
	});

	it('con una co-productora al 50 %, ella pone su mitad', () => {
		const r = computeAccount(
			income,
			account({ coproducers: [{ id: 'org', name: 'Colectivo de prueba', share: 50 }] })
		);
		expect(r.parties.find((p) => p.id === 'org')?.balance).toBe(-25000);
		expect(r.caja).toBe(-25000);
		expect(r.parties.reduce((s, p) => s + p.balance, 0)).toBe(0);
		expect(r.transfers).toContainEqual(
			expect.objectContaining({ fromName: 'Colectivo de prueba', toName: 'Lugar', amount: 25000 })
		);
	});

	it('con «todes», Memi pone su parte y le pasa a quien tiene que cobrar', () => {
		const r = computeAccount(
			income,
			account({ split: { productionPct: 30, mode: 'iguales', lossBy: 'todes' } })
		);
		expect(r.split.shares.find((s) => s.id === 'memi')?.amount).toBe(-17500);
		expect(r.caja).toBe(-32500);
		expect(r.parties.find((p) => p.id === 'memi')?.balance).toBe(-17500);
		expect(r.parties.reduce((s, p) => s + p.balance, 0)).toBe(0);
		expect(r.transfers).toContainEqual(
			expect.objectContaining({ fromName: 'Memi', toName: 'Lugar', amount: 17500 })
		);
	});
});

function TODES() {
	return /** @type {const} */ ({ productionPct: 30, mode: 'iguales', lossBy: 'todes' });
}

function DEFAULT() {
	return /** @type {const} */ ({ productionPct: 30, mode: 'iguales', lossBy: 'produccion' });
}

describe('computeAccount: un taller de ejemplo', () => {
	// Ingresos por entradas 200.000 (180.000 cobrados + 20.000 que cubrió el Fondo), un aporte
	// solidario de 5.000; lugar 30 %, materiales 10.000; Mel (equipo) y Memi facilitan.
	const income = eventIncome([
		order({ quantity: 10, total: 100000 }),
		order({ quantity: 4, total: 20000, fondo_amount: 20000 }),
		order({ quantity: 2, total: 25000, fondo_contribution: 5000 }),
		order({ channel: 'puerta', payment_method: 'efectivo', quantity: 4, total: 40000 })
	]);
	const data = cleanAccount({
		...emptyAccount(),
		expenses: [
			{ id: 'm', concept: 'Materiales', amount: 10000, paidBy: 'memi', paidAt: '2026-11-02' }
		],
		people: [
			{ id: 'mel', name: 'Mel', team: true },
			{ id: 'memi', name: 'Memi', team: false }
		],
		holders: { mercadopago: CAJA, 'puerta-efectivo': 'memi' }
	});
	const r = computeAccount(income, data);

	it('ingresos, lugar, ganancia y reparto', () => {
		expect(r.ticketIncome).toBe(200000);
		expect(r.fondo).toBe(15000);
		expect(r.venue.amount).toBe(60000);
		expect(r.profit).toBe(200000 - 60000 - 10000);
		expect(r.split.shares.find((s) => s.id === 'memi')?.amount).toBe(45500);
		// 30 % de producción (39.000) + la parte de Mel (45.500) = 84.500.
		expect(r.caja).toBe(84500);
		expect(r.caja + 45500).toBe(r.profit);
	});

	it('los saldos suman cero y las transferencias los dejan a mano', () => {
		expect(r.parties.reduce((s, p) => s + p.balance, 0)).toBe(0);
		const net = new Map(r.parties.map((p) => [p.id, p.balance]));
		for (const t of r.transfers) {
			net.set(t.from, (net.get(t.from) ?? 0) + t.amount);
			net.set(t.to, (net.get(t.to) ?? 0) - t.amount);
		}
		expect([...net.values()].every((v) => v === 0)).toBe(true);
	});

	it('el lugar sin pagar aparece como alguien a quien pagarle', () => {
		expect(r.transfers.some((t) => t.toName === 'Lugar' && t.amount === 60000)).toBe(true);
	});

	it('el Fondo le pasa al evento lo que cubrió menos lo que recibió', () => {
		const fondo = r.parties.find((p) => p.kind === 'fondo');
		expect(fondo?.balance).toBe(-15000);
	});

	it('una contratación del equipo que se deja en la caja va a la Caja KV', () => {
		const withFee = computeAccount(
			income,
			cleanAccount({
				...data,
				fees: [
					{
						id: 'f',
						concept: 'Monitore',
						amount: 20000,
						team: true,
						keep: 'caja',
						paidBy: '',
						paidAt: ''
					}
				]
			})
		);
		expect(withFee.profit).toBe(r.profit - 20000);
		expect(withFee.feesToCaja).toBe(20000);
		expect(withFee.parties.some((p) => p.name === 'Monitore')).toBe(false);
		expect(withFee.parties.reduce((s, p) => s + p.balance, 0)).toBe(0);
	});

	it('el resumen al cerrar', () => {
		expect(closingSummary(income, r)).toEqual({
			tickets: 20,
			presale: 140000,
			door: 40000,
			fondo_net: 15000,
			other_income: 0,
			income_total: 200000,
			venue: 60000,
			fees: 0,
			other_expenses: 10000,
			expenses_total: 70000,
			caja: r.caja,
			profit: 130000
		});
	});
});

describe('cleanAccount', () => {
	it('recorta y completa lo que manda la página', () => {
		const a = cleanAccount({
			venue: { kind: 'porcentaje', pct: 140 },
			expenses: [{ id: 'x<y>', concept: 'a'.repeat(500), amount: -3, paidAt: 'ayer' }],
			people: [{ id: 'p', name: 'P', team: 'sí' }],
			split: { productionPct: 'nada', mode: 'montos' }
		});
		expect(a.venue).toEqual({ kind: 'porcentaje', pct: 100 });
		expect(a.expenses[0]).toEqual({
			id: 'xy',
			concept: 'a'.repeat(120),
			amount: 0,
			paidBy: '',
			paidAt: ''
		});
		expect(a.people[0].team).toBe(false);
		expect(a.split).toEqual({ productionPct: 0, mode: 'iguales', lossBy: 'produccion' });
	});
});

describe('splitWhole y settleUp', () => {
	it('splitWhole no pierde pesos, tampoco con pérdida', () => {
		expect(splitWhole(100, [1, 1, 1])).toEqual([34, 33, 33]);
		expect(splitWhole(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
	});
	it('settleUp junta deudores con acreedores', () => {
		expect(
			settleUp([
				{ id: 'a', name: 'A', balance: -100 },
				{ id: 'b', name: 'B', balance: 60 },
				{ id: 'c', name: 'C', balance: 40 }
			])
		).toEqual([
			{ from: 'a', fromName: 'A', to: 'b', toName: 'B', amount: 60 },
			{ from: 'a', fromName: 'A', to: 'c', toName: 'C', amount: 40 }
		]);
	});
});

describe('yearSummary', () => {
	it('suma por mes y en total', () => {
		const row = (/** @type {string} */ d, /** @type {number} */ profit) => ({
			event_date: d,
			tickets: 1,
			presale: 0,
			door: 0,
			fondo_net: 0,
			other_income: 0,
			income_total: 0,
			venue: 0,
			fees: 0,
			other_expenses: 0,
			expenses_total: 0,
			caja: 0,
			profit
		});
		const y = yearSummary([row('2026-03-10', 100), row('2026-01-05', 50), row('2026-03-20', 25)]);
		expect(y.months.map((m) => [m.month, m.events, m.profit])).toEqual([
			['2026-01', 1, 50],
			['2026-03', 2, 125]
		]);
		expect(y.total.profit).toBe(175);
		expect(y.total.events).toBe(3);
	});
});

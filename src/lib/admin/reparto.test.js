import { describe, expect, it } from 'vitest';
import { formatARS } from '$lib/utils/money.js';
import {
	CAJA,
	cajaPart,
	cleanAccount,
	cleanIncome,
	closingSummary,
	computeAccount,
	emptyAccount,
	eventIncome,
	extraIncomeText,
	fondoLine,
	fondoNet,
	newPart,
	settleUp,
	splitProfit,
	splitWhole,
	usualParts,
	venueCost,
	yearSummary
} from './reparto.js';

const fmtMoney = formatARS;

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

/**
 * El reparto de una cuenta guardada con la forma de antes (`people`, `split`, `coproducers`), que
 * `cleanAccount` pasa a partes: los casos de antes tienen que dar los mismos números.
 * @param {number} profit
 * @param {any[]} people
 * @param {any} split
 * @param {any[]} [coproducers]
 */
function legacySplit(profit, people, split, coproducers = []) {
	const a = cleanAccount({ ...emptyAccount(), parts: undefined, people, split, coproducers });
	const r = splitProfit(profit, a.parts, a.loss);
	return {
		...r,
		// Les facilitadores y quienes co-producen, como los devolvía el reparto de antes.
		facilitators: r.shares.filter((s) => s.role === 'facilita'),
		coproducers: r.shares.filter((s) => s.role === 'produce')
	};
}

describe('splitProfit con cuentas guardadas antes de las partes', () => {
	it('regla de talleres: Mel (equipo) + Memi → Memi 35 %, Caja KV 65 %', () => {
		const r = legacySplit(
			100000,
			[
				{ id: 'mel', name: 'Mel', team: true },
				{ id: 'memi', name: 'Memi', team: false }
			],
			{ productionPct: 30, mode: 'iguales', lossBy: 'produccion' }
		);
		expect(r.facilitators.map((s) => s.amount)).toEqual([35000, 35000]);
		expect(r.caja).toBe(65000);
		expect(r.problem).toBe('');
	});

	it('los pesos del redondeo van a la Caja KV', () => {
		const r = legacySplit(
			100001,
			[
				{ id: 'a', name: 'A', team: false },
				{ id: 'b', name: 'B', team: false },
				{ id: 'c', name: 'C', team: false }
			],
			{ productionPct: 30, mode: 'iguales', lossBy: 'produccion' }
		);
		// 70 % de 100.001 = 70.000,7 → 70.000 para repartir; 23.333 cada une; el resto, a la Caja.
		expect(r.facilitators.map((s) => s.amount)).toEqual([23333, 23333, 23333]);
		expect(r.caja).toBe(100001 - 3 * 23333);
		expect(r.caja + r.facilitators.reduce((s, x) => s + x.amount, 0)).toBe(100001);
	});

	// Cambio a propósito (gorrite, 5/11: reparto libre): el aviso ya no habla de los porcentajes
	// de les facilitadores sino de lo que queda sin repartir; sigue sin repartir nada.
	it('con porcentajes que no suman 100 avisa (lo sin repartir) y no reparte', () => {
		const r = legacySplit(
			1000,
			[
				{ id: 'a', name: 'A', team: false, pct: 60 },
				{ id: 'b', name: 'B', team: false, pct: 30 }
			],
			{ productionPct: 30, mode: 'porcentajes', lossBy: 'produccion' }
		);
		// 30 % producción + 70 % × 90 % = 93 %: quedan $ 70 sin repartir.
		expect(r.problem).toBe(
			`Sin repartir: ${fmtMoney(70)}. Sumá una parte que se lleve «lo que sobra» o ajustá los porcentajes.`
		);
		expect(r.unassigned).toBe(70);
		expect(r.caja).toBe(1000);
	});

	it('con porcentajes que suman 100, cada une su parte de lo de les facilitadores', () => {
		const r = legacySplit(
			10000,
			[
				{ id: 'a', name: 'A', team: false, pct: 60 },
				{ id: 'b', name: 'B', team: false, pct: 40 }
			],
			{ productionPct: 30, mode: 'porcentajes', lossBy: 'produccion' }
		);
		expect(r.facilitators.map((s) => s.amount)).toEqual([4200, 2800]);
		expect(r.caja).toBe(3000);
	});

	const MEL_MEMI = [
		{ id: 'mel', name: 'Mel', team: true },
		{ id: 'memi', name: 'Memi', team: false }
	];

	// Pérdida (gorrite, Mesa 4/11): por defecto la ponen quienes producen, según su parte.
	it('con pérdida, por defecto: Mel + Memi no ponen nada y la pone la Caja KV (única productora)', () => {
		const r = legacySplit(-100000, MEL_MEMI, DEFAULT());
		expect(r.facilitators.map((s) => s.amount)).toEqual([0, 0]);
		expect(r.caja).toBe(-100000);
	});

	it('con pérdida y una co-productora al 50 %, la ponen mitad y mitad', () => {
		const r = legacySplit(-100001, MEL_MEMI, DEFAULT(), [
			{ id: 'org', name: 'Colectivo de prueba', share: 50 }
		]);
		expect(r.facilitators.map((s) => s.amount)).toEqual([0, 0]);
		expect(r.coproducers[0].amount).toBe(-50000);
		// La Caja KV pone su mitad y el peso del redondeo.
		expect(r.caja).toBe(-50001);
	});

	it('con ganancia, la producción se reparte entre la Caja KV y quien co-produce', () => {
		const r = legacySplit(100000, MEL_MEMI, DEFAULT(), [
			{ id: 'org', name: 'Colectivo de prueba', share: 50 }
		]);
		// Producción 30.000: 15.000 al colectivo; la Caja KV, 15.000 + la parte de Mel (35.000).
		expect(r.coproducers[0].amount).toBe(15000);
		expect(r.facilitators.map((s) => s.amount)).toEqual([35000, 35000]);
		expect(r.caja).toBe(50000);
	});

	it('co-productoras que suman más de 100 % avisan', () => {
		const r = legacySplit(1000, MEL_MEMI, DEFAULT(), [
			{ id: 'a', name: 'A', share: 60 },
			{ id: 'b', name: 'B', share: 50 }
		]);
		expect(r.problem).toMatch(/suman 110 %/);
	});

	it('sin facilitadores, todo es de la producción (la Caja KV y quien co-produce)', () => {
		const r = legacySplit(100001, [], DEFAULT(), [
			{ id: 'org', name: 'Colectivo de prueba', share: 40 }
		]);
		expect(r.problem).toBe('');
		expect(r.coproducers[0].amount).toBe(40000);
		expect(r.caja).toBe(60001);
	});

	// Con «todes», la pérdida se reparte como la ganancia.
	it('con pérdida y «todes»: Mel (equipo) + Memi → Memi pone 35 %, la Caja KV 65 %', () => {
		const r = legacySplit(-100000, MEL_MEMI, TODES());
		expect(r.facilitators.map((s) => s.amount)).toEqual([-35000, -35000]);
		expect(r.caja).toBe(-65000);
	});

	it('con pérdida y «todes», cada facilitadore pone su parte para abajo y la Caja KV el resto', () => {
		const r = legacySplit(
			-100001,
			[
				{ id: 'a', name: 'A', team: false },
				{ id: 'b', name: 'B', team: false },
				{ id: 'c', name: 'C', team: false }
			],
			TODES()
		);
		expect(r.facilitators.map((s) => s.amount)).toEqual([-23333, -23333, -23333]);
		expect(r.caja).toBe(-100001 + 3 * 23333);
		expect(r.caja + r.facilitators.reduce((s, x) => s + x.amount, 0)).toBe(-100001);
	});

	it('con pérdida, «todes» y porcentajes, la misma repartija', () => {
		const r = legacySplit(
			-10000,
			[
				{ id: 'a', name: 'A', team: false, pct: 60 },
				{ id: 'b', name: 'B', team: false, pct: 40 }
			],
			{ productionPct: 30, mode: 'porcentajes', lossBy: 'todes' }
		);
		expect(r.facilitators.map((s) => s.amount)).toEqual([-4200, -2800]);
		expect(r.caja).toBe(-3000);
	});

	it('sin ganancia ni pérdida, nadie pone ni se lleva nada', () => {
		const r = legacySplit(0, [{ id: 'a', name: 'A', team: false }], DEFAULT());
		expect(r.facilitators[0].amount).toBe(0);
		expect(r.caja).toBe(0);
	});

	it('pasa a partes: la Caja KV, quienes co-producen y les facilitadores', () => {
		const a = cleanAccount({
			people: [
				{ id: 'mel', name: 'Mel', team: true, pct: null },
				{ id: 'memi', name: 'Memi', team: false, pct: null }
			],
			coproducers: [{ id: 'org', name: 'Colectivo de prueba', share: 50 }],
			split: { productionPct: 30, mode: 'iguales', lossBy: 'produccion' }
		});
		expect(a.loss).toBe('marcadas');
		expect(a.parts.map((p) => [p.id, p.role, p.rule, p.pct, p.team, p.coversLoss])).toEqual([
			[CAJA, '', 'pct', 15, true, true],
			['org', 'produce', 'pct', 15, false, true],
			['mel', 'facilita', 'resto', 0, true, false],
			['memi', 'facilita', 'resto', 0, false, false]
		]);
		expect(a).not.toHaveProperty('people');
		expect(a).not.toHaveProperty('split');
	});
});

/**
 * Una parte de mentira.
 * @param {Partial<import('./reparto.js').Part>} p
 */
const part = (p) => newPart({ id: p.name?.toLowerCase() ?? 'x', ...p });

describe('splitProfit: partes libres', () => {
	it('un reparto raro: un monto fijo, un porcentaje y lo que sobra entre dos', () => {
		const parts = [
			part({ name: 'Ana', rule: 'fijo', amount: 20000 }),
			part({ name: 'Bel', rule: 'pct', pct: 25 }),
			part({ name: 'Cata', rule: 'resto' }),
			cajaPart({ rule: 'resto' })
		];
		const r = splitProfit(100001, parts, 'marcadas');
		expect(r.problem).toBe('');
		// Bel: 25 % de 100.001 = 25.000; sobran 100.001 − 20.000 − 25.000,25 = 55.000 → 27.500 c/u.
		expect(r.shares.map((s) => s.amount)).toEqual([20000, 25000, 27500, 27500]);
		// La Caja KV: lo suyo y el peso del redondeo.
		expect(r.caja).toBe(27501);
		expect(r.shares.map((s) => s.name)).toEqual(['Ana', 'Bel', 'Cata', 'Caja KV']);
	});

	it('lo de une del equipo de KV va a la Caja KV', () => {
		const r = splitProfit(
			90000,
			[part({ name: 'Mel', team: true }), part({ name: 'Memi' }), part({ name: 'Lu' })],
			'marcadas'
		);
		expect(r.shares.map((s) => s.amount)).toEqual([30000, 30000, 30000]);
		expect(r.caja).toBe(30000);
	});

	it('sin partes, la ganancia queda en la Caja KV', () => {
		const r = splitProfit(5000, [], 'marcadas');
		expect(r).toEqual({ shares: [], caja: 5000, unassigned: 0, problem: '' });
	});

	it('avisa si los porcentajes pasan de 100 %', () => {
		const r = splitProfit(
			1000,
			[part({ name: 'A', rule: 'pct', pct: 70 }), part({ name: 'B', rule: 'pct', pct: 40.5 })],
			'marcadas'
		);
		expect(r.problem).toBe('Los porcentajes suman 110,5 %: no pueden pasar de 100 %.');
		expect(r.caja).toBe(1000);
	});

	it('avisa si los montos fijos pasan de la ganancia', () => {
		const r = splitProfit(
			30000,
			[part({ name: 'A', rule: 'fijo', amount: 40000 }), part({ name: 'B' })],
			'marcadas'
		);
		expect(r.problem).toBe(
			`Los montos fijos suman ${fmtMoney(40000)}: es más que la ganancia (${fmtMoney(30000)}).`
		);
		expect(r.shares.every((s) => s.amount === 0)).toBe(true);
	});

	it('avisa si los porcentajes y los montos fijos juntos pasan de la ganancia', () => {
		const r = splitProfit(
			100000,
			[part({ name: 'A', rule: 'fijo', amount: 60000 }), part({ name: 'B', rule: 'pct', pct: 50 })],
			'marcadas'
		);
		expect(r.problem).toBe(
			`Los porcentajes (${fmtMoney(50000)}) y los montos fijos (${fmtMoney(60000)}) se llevan más que la ganancia (${fmtMoney(100000)}).`
		);
	});

	it('avisa lo sin repartir si nadie se lleva lo que sobra', () => {
		const r = splitProfit(
			100000,
			[part({ name: 'A', rule: 'fijo', amount: 10000 }), part({ name: 'B', rule: 'pct', pct: 50 })],
			'marcadas'
		);
		expect(r.unassigned).toBe(40000);
		expect(r.problem).toMatch(/^Sin repartir: /);
	});

	it('porcentajes que suman 100 no dejan nada sin repartir (los pesos del redondeo, a la Caja)', () => {
		const r = splitProfit(
			100001,
			[part({ name: 'A', rule: 'pct', pct: 50 }), part({ name: 'B', rule: 'pct', pct: 50 })],
			'marcadas'
		);
		expect(r.problem).toBe('');
		expect(r.shares.map((s) => s.amount)).toEqual([50000, 50000]);
		expect(r.caja).toBe(1);
	});

	describe('con pérdida', () => {
		const parts = [
			cajaPart({ rule: 'pct', pct: 20, coversLoss: true }),
			part({ name: 'Org', rule: 'pct', pct: 20, coversLoss: true }),
			part({ name: 'Ana', rule: 'fijo', amount: 5000 }),
			part({ name: 'Bel', rule: 'resto' }),
			part({ name: 'Cata', rule: 'resto' })
		];

		it('las marcadas, según su parte', () => {
			const r = splitProfit(-10001, parts, 'marcadas');
			expect(r.shares.map((s) => s.amount)).toEqual([-5000, -5000, 0, 0, 0]);
			expect(r.caja).toBe(-5001);
		});

		it('todes, según su parte: los montos fijos no ponen; lo que sobra, el % que queda', () => {
			const r = splitProfit(-10000, parts, 'todes');
			// Caja 20, Org 20, Bel y Cata 30 cada une (60 % que queda, en dos).
			expect(r.shares.map((s) => s.amount)).toEqual([-2000, -2000, 0, -3000, -3000]);
			expect(r.caja).toBe(-2000);
		});

		it('sin ninguna marcada, la pone la Caja KV', () => {
			const r = splitProfit(-10000, [part({ name: 'Ana' }), part({ name: 'Bel' })], 'marcadas');
			expect(r.shares.map((s) => s.amount)).toEqual([0, 0]);
			expect(r.caja).toBe(-10000);
		});

		it('marcadas sin parte (montos fijos), en partes iguales', () => {
			const r = splitProfit(
				-10000,
				[
					part({ name: 'Ana', rule: 'fijo', amount: 1, coversLoss: true }),
					part({ name: 'Bel', rule: 'fijo', amount: 1, coversLoss: true })
				],
				'marcadas'
			);
			expect(r.shares.map((s) => s.amount)).toEqual([-5000, -5000]);
			expect(r.caja).toBe(0);
		});
	});
});

describe('«Lo de siempre»', () => {
	let n = 0;
	const makeId = () => `n${++n}`;

	it('sin partes: la Caja KV con 30 % y une facilitadore con lo que sobra', () => {
		const parts = usualParts([], makeId);
		expect(parts.map((p) => [p.id, p.role, p.rule, p.pct, p.coversLoss])).toEqual([
			[CAJA, '', 'pct', 30, true],
			['n1', 'facilita', 'resto', 0, false]
		]);
	});

	it('reparte la producción entre la Caja KV y quien co-produce, y deja lo demás', () => {
		const parts = usualParts(
			[
				part({ name: 'Mel', role: 'facilita', rule: 'pct', pct: 10 }),
				part({ name: 'Org', role: 'produce', rule: 'fijo', amount: 3 }),
				part({ name: 'Otra', rule: 'fijo', amount: 1000 })
			],
			makeId
		);
		expect(parts.map((p) => [p.name, p.rule, p.pct, p.coversLoss])).toEqual([
			['Caja KV', 'pct', 15, true],
			['Org', 'pct', 15, true],
			['Mel', 'resto', 10, false],
			['Otra', 'fijo', 0, false]
		]);
	});

	it('da lo mismo que la regla de talleres de antes', () => {
		const parts = usualParts(
			[
				part({ id: 'mel', name: 'Mel', role: 'facilita', team: true }),
				part({ id: 'memi', name: 'Memi', role: 'facilita' })
			],
			makeId
		);
		const r = splitProfit(100000, parts, 'marcadas');
		expect(r.shares.find((s) => s.id === 'memi')?.amount).toBe(35000);
		expect(r.caja).toBe(65000);
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
			extras: 0,
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
		// Una cuenta de antes (sin `parts`): pasa a partes, con lo raro limpio.
		expect(a.parts.map((p) => [p.id, p.rule, p.pct, p.team])).toEqual([
			[CAJA, 'pct', 0, true],
			['p', 'resto', 0, false]
		]);
		expect(a.loss).toBe('marcadas');
	});

	it('limpia las partes: una sola Caja KV, reglas y porcentajes que existen', () => {
		const a = cleanAccount({
			parts: [
				{ id: 'caja', name: 'Otra cosa', team: false, rule: 'fijo', amount: 5 },
				{ id: 'caja', rule: 'resto' },
				{ id: 'x', name: 'X', rule: 'todo', pct: 250, amount: -4, role: 'jefa', coversLoss: 1 }
			],
			loss: 'nadie'
		});
		expect(a.parts).toEqual([
			{
				id: CAJA,
				name: 'Caja KV',
				team: true,
				role: '',
				rule: 'fijo',
				pct: 0,
				amount: 5,
				coversLoss: false
			},
			{
				id: 'x',
				name: 'X',
				team: false,
				role: '',
				rule: 'resto',
				pct: 100,
				amount: 0,
				coversLoss: false
			}
		]);
		expect(a.loss).toBe('marcadas');
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
			extras: 0,
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

describe('los extras de la compra (órdenes inventadas)', () => {
	// Un trago a $ 2.000 y una remera a $ 15.000; las filas de `order_extras` por orden.
	const trago = (/** @type {number} */ quantity, price = 2000) => ({
		id: 'trago',
		name: 'Trago',
		price,
		quantity
	});
	const remera = (/** @type {number} */ quantity) => ({
		id: 'remera',
		name: 'Remera',
		price: 15000,
		quantity
	});
	const account = (/** @type {Record<string, any>} */ more = {}) =>
		cleanAccount({ ...emptyAccount(), parts: [cajaPart({ rule: 'resto' })], ...more });

	it('solo entradas: nada cambia', () => {
		const income = eventIncome([
			order({ id: 'a', quantity: 2, total: 20000 }),
			order({ id: 'b', channel: 'puerta', payment_method: 'efectivo', total: 12000 })
		]);
		expect(income.extras).toBe(0);
		expect(income.extrasLines).toEqual([]);
		expect(income.rows.map((r) => r.extras)).toEqual([0, 0]);
		const r = computeAccount(income, account());
		expect(r.extras).toBe(0);
		expect(r.totalIncome).toBe(32000);
		expect(r.venue.amount).toBe(9600);
		expect(closingSummary(income, r)).toMatchObject({ extras: 0, income_total: 32000 });
	});

	it('entradas y extras online: el recargo de MP de todo se descuenta una sola vez', () => {
		// Entrada 10.000 + 2 tragos 4.000 = 14.000; recargo 6 % de todo = 840, guardado en `total`.
		const orders = [
			order({ id: 'a', total: 10840, surcharge_amount: 840, extras_amount: 4000 }),
			order({ id: 'b', total: 10000 })
		];
		const income = eventIncome(orders, new Map([['a', [trago(2)]]]));
		expect(income.presale).toBe(20000);
		expect(income.mpFee).toBe(840);
		expect(income.gross).toBe(20840);
		expect(income.extras).toBe(4000);
		expect(income.rows).toEqual([
			expect.objectContaining({ key: 'mercadopago', amount: 20840, extras: 4000, mpFee: 840 })
		]);
		expect(income.extrasLines).toEqual([{ id: 'trago', name: 'Trago', quantity: 2, amount: 4000 }]);
		expect(extraIncomeText(income.extrasLines[0], fmt)).toBe('2 × Trago $ 4.000');

		const r = computeAccount(income, account({ holders: { mercadopago: 'mp' } }));
		expect(r.ticketIncome).toBe(20000);
		expect(r.totalIncome).toBe(24000);
		// El lugar (30 %) cobra sobre las entradas, no sobre los extras…
		expect(r.venueBase).toBe(20000);
		expect(r.venue.amount).toBe(6000);
		expect(r.profit).toBe(18000);
		// …y quien tiene la cuenta de MP tiene lo cobrado menos el recargo: 20.000 + 4.000.
		expect(r.parties.find((p) => p.name === 'mp')?.held).toBe(24000);
		expect(r.parties.reduce((t, p) => t + p.balance, 0)).toBe(0);
		expect(closingSummary(income, r)).toMatchObject({
			presale: 20000,
			extras: 4000,
			income_total: 24000
		});
	});

	it('«El lugar cobra su % también sobre los extras»: la base suma los extras', () => {
		const income = eventIncome(
			[order({ id: 'a', total: 10000, extras_amount: 4000 })],
			new Map([['a', [trago(2)]]])
		);
		const r = computeAccount(income, account({ extrasTo: 'porcentaje' }));
		expect(r.venueBase).toBe(14000);
		expect(r.venue.amount).toBe(4200);
		expect(r.venueTotal).toBe(4200);
		expect(r.totalIncome).toBe(14000);
		// Con un monto fijo, no cambia nada.
		const fixed = computeAccount(
			income,
			account({ extrasTo: 'porcentaje', venue: { kind: 'fijo', amount: 5000 } })
		);
		expect(fixed.venue.amount).toBe(5000);
	});

	it('«Todos al lugar»: los extras son un gasto del lugar y quien los tiene se los pasa', () => {
		// Entradas online por MP (las tiene la Caja KV); extras en la puerta en efectivo (los tiene
		// Memi). El lugar cobra 30 % de las entradas más todos los extras.
		const income = eventIncome(
			[
				order({ id: 'a', quantity: 2, total: 20000 }),
				order({
					id: 'p',
					channel: 'puerta',
					payment_method: 'efectivo',
					total: 10000,
					extras_amount: 9000
				})
			],
			new Map([['p', [trago(3, 3000)]]])
		);
		const data = account({
			extrasTo: 'lugar',
			holders: { mercadopago: CAJA, 'puerta-efectivo': 'memi' },
			parts: [cajaPart({ rule: 'pct', pct: 30 }), newPart({ id: 'memi', name: 'Memi' })]
		});
		const r = computeAccount(income, data);
		expect(r.totalIncome).toBe(39000);
		expect(r.venueBase).toBe(30000);
		expect(r.venue.amount).toBe(9000);
		expect(r.extrasToVenue).toBe(9000);
		expect(r.venueTotal).toBe(18000);
		expect(r.allExpenses).toBe(18000);
		// La ganancia es la misma que sin extras: no llegan al reparto.
		expect(r.profit).toBe(21000);
		const noExtras = computeAccount(
			eventIncome([
				order({ quantity: 2, total: 20000 }),
				order({ channel: 'puerta', payment_method: 'efectivo', total: 10000 })
			]),
			data
		);
		expect(noExtras.profit - noExtras.venue.amount).toBe(r.profit - r.venue.amount);
		expect(r.parties.find((p) => p.name === 'Lugar')?.share).toBe(18000);
		expect(r.parties.reduce((t, p) => t + p.balance, 0)).toBe(0);
		// Memi tiene los 19.000 de la puerta: le toca 14.700, así que pasa 4.300 (al lugar).
		expect(r.transfers.filter((t) => t.toName === 'Lugar').reduce((t, x) => t + x.amount, 0)).toBe(
			18000
		);
		expect(closingSummary(income, r)).toMatchObject({
			extras: 9000,
			income_total: 39000,
			venue: 18000,
			expenses_total: 18000,
			profit: 21000
		});
	});

	it('la casilla de antes (`venueOnExtras`) pasa a «porcentaje»; sin nada, «al reparto»', () => {
		expect(
			cleanAccount({ ...emptyAccount(), extrasTo: undefined, venueOnExtras: true }).extrasTo
		).toBe('porcentaje');
		expect(cleanAccount({ ...emptyAccount(), extrasTo: undefined }).extrasTo).toBe('reparto');
		expect(cleanAccount({ ...emptyAccount(), extrasTo: 'cualquiera' }).extrasTo).toBe('reparto');
		expect(cleanAccount({ ...emptyAccount(), extrasTo: 'lugar' }).extrasTo).toBe('lugar');
		expect(cleanAccount({})).not.toHaveProperty('venueOnExtras');
	});

	it('extras vendidos en la puerta en efectivo (y entregados en la barra): los tiene la caja de la puerta', () => {
		const income = eventIncome(
			[
				order({ id: 'a', total: 10000 }),
				// Venta en la puerta con 3 tragos y una remera; ya se entregó uno (no importa).
				order({
					id: 'p',
					channel: 'puerta',
					payment_method: 'efectivo',
					total: 12000,
					extras_amount: 21000
				}),
				// Solo extras en la puerta, con una entrada a la gorra de $ 0.
				order({
					id: 'q',
					channel: 'puerta',
					payment_method: 'efectivo',
					total: 0,
					extras_amount: 2000
				})
			],
			new Map([
				['p', [trago(3), remera(1)]],
				['q', [trago(1)]]
			])
		);
		expect(income.door).toBe(12000);
		expect(income.extras).toBe(23000);
		expect(income.extrasLines.map((x) => extraIncomeText(x, fmt))).toEqual([
			'4 × Trago $ 8.000',
			'1 × Remera $ 15.000'
		]);
		const door = income.rows.find((r) => r.key === 'puerta-efectivo');
		expect(door).toMatchObject({ amount: 12000, extras: 23000, orders: 2 });
		const r = computeAccount(income, account({ holders: { 'puerta-efectivo': 'Puerta' } }));
		expect(r.totalIncome).toBe(10000 + 12000 + 23000);
		expect(r.venue.amount).toBe(6600);
		expect(r.parties.find((p) => p.name === 'Puerta')?.held).toBe(35000);
		expect(r.parties.reduce((t, p) => t + p.balance, 0)).toBe(0);
	});

	it('reembolsadas y transferencias sin confirmar no cuentan, con sus extras; las cortesías a $ 0 tampoco', () => {
		const income = eventIncome(
			[
				order({ id: 'a', total: 10000, extras_amount: 2000 }),
				order({ id: 'r', status: 'refunded', total: 10600, extras_amount: 4000 }),
				order({
					id: 't',
					status: 'awaiting_transfer',
					payment_method: 'transferencia',
					total: 10000,
					extras_amount: 15000
				}),
				// Una cortesía cargada a mano: entrada y extras sin cargo.
				order({ id: 'c', channel: 'manual', payment_method: 'gratis', total: 0 })
			],
			new Map([
				['a', [trago(1)]],
				['r', [trago(2)]],
				['t', [remera(1)]],
				['c', [trago(2, 0)]]
			])
		);
		expect(income.extras).toBe(2000);
		expect(income.extrasLines).toEqual([{ id: 'trago', name: 'Trago', quantity: 1, amount: 2000 }]);
		expect(income.refunded).toEqual({ orders: 1, amount: 14600 });
		expect(income.awaiting).toEqual({ orders: 1, amount: 25000 });
		expect(computeAccount(income, account()).totalIncome).toBe(12000);
	});

	it('una cuenta cerrada antes de los extras da los mismos números', () => {
		// La foto de antes: sin `extras`, sin `extrasLines` y filas sin `extras`.
		const now = eventIncome([order({ id: 'a', quantity: 2, total: 20000 })]);
		const { extras, extrasLines, ...old } = now;
		expect([extras, extrasLines]).toEqual([0, []]);
		const oldSnapshot = JSON.parse(
			JSON.stringify({ ...old, rows: old.rows.map(({ extras: _x, ...row }) => row) })
		);
		const income = cleanIncome(oldSnapshot);
		expect(income).toEqual(now);
		const data = cleanAccount({ ...emptyAccount(), extrasTo: undefined });
		expect(data.extrasTo).toBe('reparto');
		expect(computeAccount(/** @type {any} */ (income), data).totalIncome).toBe(20000);
		expect(cleanIncome(null)).toBeNull();
		expect(cleanIncome({ hola: 1 })).toBeNull();
	});
});

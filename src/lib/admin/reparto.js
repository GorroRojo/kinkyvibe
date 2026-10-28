/**
 * Gastos y reparto de un evento (prototipo, interruptor `gastos_reparto`; docs/tickets.md, «Gastos
 * y reparto»). Funciones puras: lo que entró (de las órdenes del evento, en el servidor) y la
 * cuenta del reparto con «quién le debe a quién» (en la página, con lo que carga cada quien).
 *
 * Todo en pesos enteros. Nada de esto se guarda en la base: los gastos y las personas viven en la
 * página (y en el navegador de quien la usa).
 */

/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */

/**
 * @typedef {object} IncomeRow
 * @prop {string} key de dónde vino la plata (`mercadopago`, `transferencia`, `puerta-efectivo`…)
 * @prop {string} label
 * @prop {number} orders
 * @prop {number} tickets
 * @prop {number} amount lo cobrado (el `total` de las órdenes), antes de la comisión
 * @prop {number} mpFee la comisión de Mercado Pago de esas órdenes (solo en `mercadopago`)
 */

/**
 * @typedef {object} Income
 * @prop {IncomeRow[]} rows solo las que cobraron algo
 * @prop {number} gross
 * @prop {number} mpFee
 * @prop {number} fondoUsed lo que cubrió el Fondo (la gente pagó menos)
 * @prop {number} fondoContributed lo que se pagó de más para el Fondo (solidarias)
 * @prop {{ orders: number, amount: number }} refunded reembolsadas: no cuentan
 * @prop {{ orders: number, amount: number }} awaiting transferencias sin confirmar: no cuentan
 */

const SOURCE_LABELS = /** @type {Record<string, string>} */ ({
	mercadopago: 'Mercado Pago (online)',
	transferencia: 'Transferencias (online)',
	'puerta-efectivo': 'Puerta: efectivo',
	'puerta-transferencia': 'Puerta: transferencia',
	'puerta-mercadopago': 'Puerta: Mercado Pago',
	'puerta-otro': 'Puerta: otro medio',
	manual: 'Cargadas a mano en el panel'
});

/**
 * De dónde vino la plata de una orden: la puerta por medio de pago, lo cargado a mano junto, y lo
 * online por medio de pago.
 * @param {Pick<Order, 'payment_method' | 'channel'>} o
 */
export function incomeSource(o) {
	if (o.channel === 'puerta') return `puerta-${o.payment_method}`;
	if (o.channel === 'manual') return 'manual';
	return o.payment_method;
}

/** @param {string} key */
export function incomeLabel(key) {
	return SOURCE_LABELS[key] ?? key;
}

/**
 * Lo que entró con un evento, de sus órdenes (`listOrders`). Como el resto del panel: solo las
 * aprobadas; la comisión de MP es el recargo guardado en cada orden pagada con MP
 * (`orderMpFee`, docs/tickets.md, «Meta de venta»).
 *
 * @param {Pick<Order, 'status' | 'quantity' | 'total' | 'payment_method' | 'channel' | 'surcharge_amount' | 'fondo_amount' | 'fondo_contribution'>[]} orders
 * @returns {Income}
 */
export function eventIncome(orders) {
	/** @type {Map<string, IncomeRow>} */
	const by = new Map();
	const out = {
		gross: 0,
		mpFee: 0,
		fondoUsed: 0,
		fondoContributed: 0,
		refunded: { orders: 0, amount: 0 },
		awaiting: { orders: 0, amount: 0 }
	};
	for (const o of orders) {
		const total = Number(o.total) || 0;
		if (o.status === 'refunded') {
			out.refunded.orders += 1;
			out.refunded.amount += total;
			continue;
		}
		if (o.status === 'awaiting_transfer') {
			out.awaiting.orders += 1;
			out.awaiting.amount += total;
			continue;
		}
		if (o.status !== 'approved') continue;
		const key = incomeSource(o);
		const row = by.get(key) ?? {
			key,
			label: incomeLabel(key),
			orders: 0,
			tickets: 0,
			amount: 0,
			mpFee: 0
		};
		const fee = o.payment_method === 'mercadopago' ? Number(o.surcharge_amount) || 0 : 0;
		row.orders += 1;
		row.tickets += Number(o.quantity) || 0;
		row.amount += total;
		row.mpFee += fee;
		by.set(key, row);
		out.gross += total;
		out.mpFee += fee;
		out.fondoUsed += Number(o.fondo_amount) || 0;
		out.fondoContributed += Number(o.fondo_contribution) || 0;
	}
	const order = Object.keys(SOURCE_LABELS);
	const rows = [...by.values()]
		.filter((r) => r.amount > 0)
		.sort((a, b) => rank(order, a.key) - rank(order, b.key));
	return { rows, ...out };
}

/** @param {string[]} order @param {string} key */
const rank = (order, key) => (order.includes(key) ? order.indexOf(key) : order.length);

/**
 * Reparte `total` pesos enteros según `weights` (≥ 0), sin perder ni sumar pesos: cada parte se
 * redondea para abajo y los pesos que sobran van a las partes con el resto más grande (y, si
 * empatan, a las primeras). Funciona igual con un total negativo (una pérdida).
 *
 * @param {number} total
 * @param {number[]} weights
 * @returns {number[]}
 */
export function splitWhole(total, weights) {
	const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
	if (!weights.length) return [];
	if (sum <= 0) return weights.map(() => 0);
	const sign = total < 0 ? -1 : 1;
	const abs = Math.abs(Math.round(total));
	const exact = weights.map((w) => (abs * Math.max(0, w)) / sum);
	const parts = exact.map(Math.floor);
	let left = abs - parts.reduce((s, p) => s + p, 0);
	const byRemainder = exact
		.map((x, i) => ({ i, r: x - Math.floor(x) }))
		.filter((x) => weights[x.i] > 0)
		.sort((a, b) => b.r - a.r || a.i - b.i);
	for (let k = 0; left > 0 && byRemainder.length; k = (k + 1) % byRemainder.length, left--) {
		parts[byRemainder[k].i] += 1;
	}
	return parts.map((p) => sign * p || 0);
}

/**
 * @typedef {object} Person
 * @prop {string} id
 * @prop {string} name
 * @prop {number | null} value su porcentaje (modo `porcentajes`) o su monto fijo (modo `montos`)
 */

/**
 * @typedef {object} Expense
 * @prop {string} id
 * @prop {string} concept
 * @prop {number} amount
 * @prop {string} paidBy el id de la persona que lo pagó, o '' si falta pagarlo
 */

/**
 * @typedef {'iguales' | 'porcentajes' | 'montos'} SplitMode
 */

/**
 * Las partes del reparto. `iguales`: todes lo mismo. `porcentajes`: cada quien su %, que tienen
 * que sumar 100. `montos`: quien tiene un monto se lleva ese monto y el resto se reparte en partes
 * iguales entre les demás (si todes tienen monto, tienen que sumar lo que queda).
 *
 * @param {number} pot lo que queda para repartir (puede ser negativo: una pérdida)
 * @param {Person[]} people
 * @param {SplitMode} mode
 * @returns {{ shares: number[], problem: string }}
 */
export function splitShares(pot, people, mode) {
	const n = people.length;
	if (!n) return { shares: [], problem: '' };
	if (mode === 'porcentajes') {
		const pcts = people.map((p) => Math.max(0, Number(p.value) || 0));
		const sum = Math.round(pcts.reduce((s, x) => s + x, 0) * 100) / 100;
		if (sum !== 100) {
			const diff = Math.round((100 - sum) * 100) / 100;
			return {
				shares: people.map(() => 0),
				problem:
					diff > 0
						? `Los porcentajes suman ${fmtPct(sum)} %: falta repartir ${fmtPct(diff)} %.`
						: `Los porcentajes suman ${fmtPct(sum)} %: sobran ${fmtPct(-diff)} %.`
			};
		}
		return { shares: splitWhole(pot, pcts), problem: '' };
	}
	if (mode === 'montos') {
		const fixed = people.map((p) =>
			p.value === null || p.value === undefined || Number.isNaN(Number(p.value))
				? null
				: Math.round(Number(p.value))
		);
		const fixedSum = fixed.reduce((/** @type {number} */ s, x) => s + (x ?? 0), 0);
		const rest = pot - fixedSum;
		const free = fixed.filter((x) => x === null).length;
		if (!free) {
			if (rest === 0) return { shares: /** @type {number[]} */ (fixed), problem: '' };
			return {
				shares: people.map(() => 0),
				problem:
					rest > 0
						? `Los montos suman ${pesos(fixedSum)}: quedan ${pesos(rest)} sin repartir. Dejá a alguien sin monto para que se lleve el resto.`
						: `Los montos suman ${pesos(fixedSum)}: ${pesos(-rest)} más de lo que hay.`
			};
		}
		const restShares = splitWhole(
			rest,
			fixed.map((x) => (x === null ? 1 : 0))
		);
		return { shares: fixed.map((x, i) => (x === null ? restShares[i] : x)), problem: '' };
	}
	return {
		shares: splitWhole(
			pot,
			people.map(() => 1)
		),
		problem: ''
	};
}

/** @param {number} x */
const fmtPct = (x) => String(x).replace('.', ',');
/** @param {number} x */
const pesos = (x) =>
	new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'ARS',
		maximumFractionDigits: 0
	}).format(x);

/**
 * @typedef {object} Party alguien en la cuenta final: una persona del reparto, el Fondo o un gasto
 *   que falta pagar (a quién se le debe).
 * @prop {string} id
 * @prop {string} name
 * @prop {'persona' | 'fondo' | 'pendiente'} kind
 * @prop {number} share lo que le toca
 * @prop {number} paid lo que ya puso de su bolsillo (gastos)
 * @prop {number} held lo cobrado que tiene en su poder (su cuenta de MP, su alias, la caja)
 * @prop {number} balance share + paid − held: positivo, le tienen que pasar; negativo, tiene que pasar
 */

/**
 * @typedef {object} RepartoInput
 * @prop {Income} income
 * @prop {boolean} separateAportes los aportes al Fondo son del Fondo: se separan
 * @prop {boolean} addFondoUsed el Fondo le pasa al evento lo que cubrió
 * @prop {Expense[]} expenses
 * @prop {Person[]} people
 * @prop {SplitMode} mode
 * @prop {Record<string, string>} holders de cada fuente de plata (`IncomeRow.key`), quién la tiene
 */

/**
 * La cuenta entera: lo neto, los gastos, lo que queda, la parte de cada quien y las
 * transferencias para quedar a mano.
 *
 * @param {RepartoInput} input
 */
export function computeReparto({
	income,
	separateAportes,
	addFondoUsed,
	expenses,
	people,
	mode,
	holders
}) {
	const aportes = separateAportes ? income.fondoContributed : 0;
	const fondoIn = addFondoUsed ? income.fondoUsed : 0;
	const net = income.gross - income.mpFee - aportes + fondoIn;
	const valid = expenses.filter((e) => Number(e.amount) > 0);
	const totalExpenses = valid.reduce((s, e) => s + Math.round(Number(e.amount)), 0);
	const pot = net - totalExpenses;
	const { shares, problem } = splitShares(pot, people, mode);

	/** @type {Party[]} */
	const parties = people.map((p, i) => ({
		id: p.id,
		name: p.name.trim() || `Persona ${i + 1}`,
		kind: 'persona',
		share: shares[i] ?? 0,
		paid: 0,
		held: 0,
		balance: 0
	}));
	const byId = new Map(parties.map((p) => [p.id, p]));
	if (aportes || fondoIn) {
		parties.push({
			id: 'fondo',
			name: 'Fondo Kinky Vibe',
			kind: 'fondo',
			share: aportes - fondoIn,
			paid: 0,
			held: 0,
			balance: 0
		});
	}
	// La plata cobrada: cada fuente la tiene alguien (la de MP, sin la comisión: esa se la quedó MP).
	let unheld = 0;
	for (const row of income.rows) {
		const amount = row.amount - row.mpFee;
		const who = byId.get(holders[row.key] ?? '') ?? parties.find((p) => p.kind === 'persona');
		if (who) who.held += amount;
		else unheld += amount;
	}
	for (const e of valid) {
		const amount = Math.round(Number(e.amount));
		const who = byId.get(e.paidBy);
		if (who) who.paid += amount;
		else
			parties.push({
				id: `pendiente-${e.id}`,
				name: e.concept.trim() || 'Gasto sin nombre',
				kind: 'pendiente',
				share: 0,
				paid: amount,
				held: 0,
				balance: 0
			});
	}
	for (const p of parties) p.balance = p.share + p.paid - p.held;
	const ready = people.length > 0 && !problem;
	return {
		net,
		aportes,
		fondoIn,
		totalExpenses,
		pot,
		shares,
		problem,
		parties,
		unheld,
		transfers: ready ? settleUp(parties) : []
	};
}

/**
 * Quién le pasa cuánto a quién para quedar a mano: el que más debe le paga al que más le deben,
 * hasta que no quede nada. Da a lo sumo una transferencia menos que la cantidad de partes (no
 * siempre la cantidad mínima posible, pero casi siempre sí, y es fácil de seguir).
 *
 * @param {Pick<Party, 'id' | 'name' | 'balance'>[]} parties
 * @returns {{ from: string, fromName: string, to: string, toName: string, amount: number }[]}
 */
export function settleUp(parties) {
	const owes = parties
		.filter((p) => p.balance < 0)
		.map((p) => ({ ...p, left: -p.balance }))
		.sort((a, b) => b.left - a.left);
	const gets = parties
		.filter((p) => p.balance > 0)
		.map((p) => ({ ...p, left: p.balance }))
		.sort((a, b) => b.left - a.left);
	/** @type {{ from: string, fromName: string, to: string, toName: string, amount: number }[]} */
	const out = [];
	let i = 0;
	let j = 0;
	while (i < owes.length && j < gets.length) {
		const amount = Math.min(owes[i].left, gets[j].left);
		if (amount > 0)
			out.push({
				from: owes[i].id,
				fromName: owes[i].name,
				to: gets[j].id,
				toName: gets[j].name,
				amount
			});
		owes[i].left -= amount;
		gets[j].left -= amount;
		if (owes[i].left === 0) i++;
		if (gets[j].left === 0) j++;
	}
	return out;
}

/**
 * Gastos y reparto de un evento que vende entradas (interruptor `gastos_reparto`; docs/tickets.md,
 * «Gastos y reparto»). Funciones puras, las mismas en el servidor y en la página:
 *
 * - lo que entró, de las órdenes del evento (`eventIncome`), con el Fondo calculado orden por
 *   orden (lo que cubrió con su descuento y lo que recibió de las solidarias);
 * - el costo del lugar en sus cuatro formas (`venueCost`);
 * - la cuenta entera (`computeAccount`): ingresos, lugar, contrataciones, otros gastos, ganancia,
 *   la parte de la Caja KV y de cada facilitadore, y «quién le pasa a quién»;
 * - el resumen que se guarda al cerrar la cuenta (`closingSummary`).
 *
 * Todo en pesos enteros. La Caja KV es la plata de Kinky Vibe (no es el Fondo): siempre está en
 * el reparto y se queda con lo que sobra, incluidos los pesos del redondeo.
 */

/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */

/**
 * @typedef {object} IncomeRow
 * @prop {string} key de dónde vino la plata (`mercadopago`, `transferencia`, `puerta-efectivo`…)
 * @prop {string} label
 * @prop {'preventa' | 'puerta'} part
 * @prop {number} orders
 * @prop {number} tickets
 * @prop {number} amount lo cobrado (el `total` de las órdenes)
 * @prop {number} mpFee el recargo de Mercado Pago de esas órdenes (se lo queda MP)
 */

/**
 * @typedef {object} Income
 * @prop {IncomeRow[]} rows solo las que cobraron algo
 * @prop {number} gross lo cobrado
 * @prop {number} mpFee el recargo de MP (lo pagó quien compró y se lo quedó MP)
 * @prop {number} fondoUsed lo que cubrió el Fondo con su descuento (`fondo_amount`)
 * @prop {number} fondoContributed lo que se pagó de más para el Fondo (`fondo_contribution`)
 * @prop {number} tickets entradas de las órdenes aprobadas
 * @prop {number} presale lo que pagó la gente por las entradas antes del evento (online y a mano),
 *   sin el recargo de MP ni los aportes al Fondo
 * @prop {number} door lo mismo, en la puerta
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

/** Quién puede tener plata o pagar algo, además de las personas: la caja de Kinky Vibe. */
export const CAJA = 'caja';
export const CAJA_LABEL = 'Caja KV';

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

/** @param {unknown} x */
const int = (x) => {
	const n = Math.round(Number(x));
	return Number.isFinite(n) ? n : 0;
};

/**
 * Lo que entró con un evento, de sus órdenes (`listOrders`). Como el resto del panel: solo las
 * aprobadas. El recargo de MP es el guardado en cada orden pagada con MP (`orderMpFee`,
 * docs/tickets.md, «Meta de venta»). El Fondo, orden por orden: `fondo_amount` (lo que cubrió su
 * descuento) y `fondo_contribution` (el aporte de las solidarias), nunca un promedio.
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
		tickets: 0,
		presale: 0,
		door: 0,
		refunded: { orders: 0, amount: 0 },
		awaiting: { orders: 0, amount: 0 }
	};
	for (const o of orders) {
		const total = int(o.total);
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
		/** @type {'preventa' | 'puerta'} */
		const part = o.channel === 'puerta' ? 'puerta' : 'preventa';
		const row = by.get(key) ?? {
			key,
			label: incomeLabel(key),
			part,
			orders: 0,
			tickets: 0,
			amount: 0,
			mpFee: 0
		};
		const fee = o.payment_method === 'mercadopago' ? int(o.surcharge_amount) : 0;
		const contribution = int(o.fondo_contribution);
		const quantity = int(o.quantity);
		row.orders += 1;
		row.tickets += quantity;
		row.amount += total;
		row.mpFee += fee;
		by.set(key, row);
		out.gross += total;
		out.mpFee += fee;
		out.tickets += quantity;
		out.fondoUsed += int(o.fondo_amount);
		out.fondoContributed += contribution;
		// Lo que pagó por las entradas: sin el recargo (de MP) ni el aporte (del Fondo).
		out[part === 'puerta' ? 'door' : 'presale'] += total - fee - contribution;
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
 * El Fondo con el evento, neto: lo que cubrió en descuentos menos lo que recibió en aportes.
 * Positivo: el Fondo le pasa esa plata al evento; negativo: el evento se la pasa al Fondo.
 *
 * @param {Pick<Income, 'fondoUsed' | 'fondoContributed'>} income
 */
export function fondoNet(income) {
	return income.fondoUsed - income.fondoContributed;
}

/**
 * La línea del Fondo, para leer de un vistazo. Por ejemplo: «Fondo: cubrió $ 30.000 en descuentos
 * − recibió $ 8.000 en aportes = el Fondo le pasa $ 22.000 al evento».
 *
 * @param {Pick<Income, 'fondoUsed' | 'fondoContributed'>} income
 * @param {(n: number) => string} fmt
 */
export function fondoLine(income, fmt) {
	const net = fondoNet(income);
	const result =
		net > 0
			? `el Fondo le pasa ${fmt(net)} al evento`
			: net < 0
				? `el evento le pasa ${fmt(-net)} al Fondo`
				: 'quedan a mano';
	return `Fondo: cubrió ${fmt(income.fondoUsed)} en descuentos − recibió ${fmt(income.fondoContributed)} en aportes = ${result}`;
}

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

// ---------------------------------------------------------------------------------------------
// El lugar

/**
 * Cómo cobra el lugar. `fijo`: un monto. `hora`: horas × precio por hora. `porcentaje`: un % de
 * los ingresos por entradas. `porcentaje_minimo`: ese %, pero nunca menos que un mínimo, que es
 * fijo (`minKind: 'fijo'`, `minAmount`) o por hora (`minKind: 'hora'`, horas × `rate`).
 *
 * @typedef {'fijo' | 'hora' | 'porcentaje' | 'porcentaje_minimo'} VenueKind
 */
export const VENUE_KINDS = /** @type {const} */ ([
	'fijo',
	'hora',
	'porcentaje',
	'porcentaje_minimo'
]);

/**
 * @typedef {object} VenueRule
 * @prop {VenueKind} kind
 * @prop {number} [amount] `fijo`
 * @prop {number} [hours] `hora` y el mínimo por hora (se carga en cada evento)
 * @prop {number} [rate] precio por hora (`hora` y el mínimo por hora)
 * @prop {number} [pct] `porcentaje` y `porcentaje_minimo`
 * @prop {'fijo' | 'hora'} [minKind]
 * @prop {number} [minAmount] el mínimo fijo
 */

/** La regla de los talleres: 30 % de los ingresos para el lugar. */
export const DEFAULT_VENUE_RULE = Object.freeze(
	/** @type {VenueRule} */ ({ kind: 'porcentaje', pct: 30 })
);

/** @param {unknown} x */
const nonNeg = (x) => Math.max(0, Number(x) || 0);

/**
 * Una regla del lugar limpia (de un formulario o de la base). Lo que no es una regla da `null`.
 * @param {unknown} raw
 * @returns {VenueRule | null}
 */
export function cleanVenueRule(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const r = /** @type {Record<string, unknown>} */ (raw);
	const kind = /** @type {VenueKind} */ (r.kind);
	if (!VENUE_KINDS.includes(kind)) return null;
	/** @type {VenueRule} */
	const out = { kind };
	if (kind === 'fijo') out.amount = int(nonNeg(r.amount));
	if (kind === 'hora' || (kind === 'porcentaje_minimo' && r.minKind === 'hora')) {
		out.hours = Math.round(nonNeg(r.hours) * 100) / 100;
		out.rate = int(nonNeg(r.rate));
	}
	if (kind === 'porcentaje' || kind === 'porcentaje_minimo') {
		out.pct = Math.min(100, Math.round(nonNeg(r.pct) * 100) / 100);
	}
	if (kind === 'porcentaje_minimo') {
		out.minKind = r.minKind === 'hora' ? 'hora' : 'fijo';
		if (out.minKind === 'fijo') out.minAmount = int(nonNeg(r.minAmount));
	}
	return out;
}

/**
 * Lo que cobra el lugar con una regla, sobre `base` (los ingresos por entradas, con lo que cubrió
 * el Fondo). Los porcentajes se redondean al peso.
 *
 * @param {VenueRule | null | undefined} rule
 * @param {number} base
 * @returns {{ amount: number, byPct: number, min: number, usedMin: boolean }}
 */
export function venueCost(rule, base) {
	const r = cleanVenueRule(rule);
	const zero = { amount: 0, byPct: 0, min: 0, usedMin: false };
	if (!r) return zero;
	const perHour = int((r.hours ?? 0) * (r.rate ?? 0));
	if (r.kind === 'fijo') return { ...zero, amount: r.amount ?? 0 };
	if (r.kind === 'hora') return { ...zero, amount: perHour };
	const byPct = Math.max(0, Math.round((Math.max(0, base) * (r.pct ?? 0)) / 100));
	if (r.kind === 'porcentaje') return { ...zero, amount: byPct, byPct };
	const min = r.minKind === 'hora' ? perHour : (r.minAmount ?? 0);
	return { amount: Math.max(byPct, min), byPct, min, usedMin: min > byPct };
}

// ---------------------------------------------------------------------------------------------
// La cuenta

/**
 * Une facilitadore (o quien organiza y se lleva parte de la ganancia).
 * @typedef {object} Person
 * @prop {string} id
 * @prop {string} name
 * @prop {boolean} team es del equipo de KV: su parte va a la Caja KV
 * @prop {number | null} [pct] su porcentaje de la parte de les facilitadores (modo `porcentajes`)
 */

/**
 * Un gasto pagado (o por pagar). `paidBy`: el id de una persona, `caja`, u otro texto (quien
 * pagó, si no está en la cuenta); vacío, falta pagarlo. Nunca alias ni CBU.
 * @typedef {object} Payment
 * @prop {string} paidBy
 * @prop {string} paidAt fecha `AAAA-MM-DD`, o vacía
 */

/**
 * Una contratación (monitore, fotografe, técnica…). Si es del equipo de KV, `keep` dice si cobra
 * (`cobra`) o lo deja en la caja (`caja`).
 * @typedef {Payment & { id: string, concept: string, amount: number, team: boolean, keep: 'cobra' | 'caja' }} Fee
 */

/** @typedef {Payment & { id: string, concept: string, amount: number }} Expense */

/**
 * Otro ingreso (barra, sponsor, efectivo que no se cargó en la puerta): quién lo tiene.
 * @typedef {{ id: string, concept: string, amount: number, heldBy: string }} OtherIncome
 */

/**
 * @typedef {object} SplitRule
 * @prop {number} productionPct el % de la ganancia que va a la producción (30)
 * @prop {'iguales' | 'porcentajes'} mode cómo se reparte el resto entre les facilitadores
 * @prop {'produccion' | 'todes'} lossBy quién pone la pérdida: quienes producen (por defecto,
 *   gorrite, Mesa 4/11) o todes, con el mismo reparto que la ganancia
 */

export const DEFAULT_SPLIT = Object.freeze(
	/** @type {SplitRule} */ ({ productionPct: 30, mode: 'iguales', lossBy: 'produccion' })
);

/**
 * Quien produce junto con la Caja KV (otra organización o persona): su parte de la producción,
 * en %. La Caja KV tiene el resto (100 − la suma).
 * @typedef {{ id: string, name: string, share: number }} Coproducer
 */

/**
 * Todo lo que se carga a mano de la cuenta de un evento (lo que se guarda en `event_accounts`).
 * @typedef {object} AccountData
 * @prop {VenueRule} venue
 * @prop {Payment} venuePayment
 * @prop {Fee[]} fees
 * @prop {Expense[]} expenses
 * @prop {OtherIncome[]} otherIncome
 * @prop {Person[]} people
 * @prop {Coproducer[]} coproducers
 * @prop {SplitRule} split
 * @prop {Record<string, string>} holders de cada fuente de plata (`IncomeRow.key`), quién la tiene
 */

/**
 * Una cuenta vacía, con la regla del lugar (la del perfil del lugar, si tiene) y la de talleres.
 * @param {VenueRule | null} [venueDefault]
 * @returns {AccountData}
 */
export function emptyAccount(venueDefault = null) {
	return {
		venue: { ...(venueDefault ?? DEFAULT_VENUE_RULE) },
		venuePayment: { paidBy: '', paidAt: '' },
		fees: [],
		expenses: [],
		otherIncome: [],
		people: [],
		coproducers: [],
		split: { ...DEFAULT_SPLIT },
		holders: {}
	};
}

const MAX_LINES = 100;
const MAX_TEXT = 120;
/** @param {unknown} s */
const str = (s) => String(s ?? '').slice(0, MAX_TEXT);
/** @param {unknown} s */
const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s) : '');
/** @param {unknown} s */
const id = (s) =>
	String(s ?? '')
		.replace(/[^\w-]/g, '')
		.slice(0, 40);
/** @param {unknown} a */
const list = (a) => (Array.isArray(a) ? a.slice(0, MAX_LINES) : []);

/**
 * Una cuenta limpia (lo que manda la página, o lo leído de la base). Saca lo que no va, recorta
 * textos y listas, y completa lo que falta.
 *
 * @param {unknown} raw
 * @returns {AccountData}
 */
export function cleanAccount(raw) {
	const r = /** @type {Record<string, any>} */ (raw && typeof raw === 'object' ? raw : {});
	const base = emptyAccount();
	/** @param {any} p @returns {Payment} */
	const payment = (p) => ({ paidBy: str(p?.paidBy), paidAt: date(p?.paidAt) });
	const holders = /** @type {Record<string, string>} */ ({});
	if (r.holders && typeof r.holders === 'object') {
		for (const [k, v] of Object.entries(r.holders).slice(0, 20)) holders[id(k)] = str(v);
	}
	return {
		venue: cleanVenueRule(r.venue) ?? base.venue,
		venuePayment: payment(r.venuePayment),
		fees: list(r.fees).map((f) => ({
			id: id(f?.id),
			concept: str(f?.concept),
			amount: int(nonNeg(f?.amount)),
			team: f?.team === true,
			keep: f?.keep === 'caja' ? 'caja' : 'cobra',
			...payment(f)
		})),
		expenses: list(r.expenses).map((x) => ({
			id: id(x?.id),
			concept: str(x?.concept),
			amount: int(nonNeg(x?.amount)),
			...payment(x)
		})),
		otherIncome: list(r.otherIncome).map((x) => ({
			id: id(x?.id),
			concept: str(x?.concept),
			amount: int(nonNeg(x?.amount)),
			heldBy: str(x?.heldBy)
		})),
		people: list(r.people).map((p) => ({
			id: id(p?.id),
			name: str(p?.name),
			team: p?.team === true,
			pct: p?.pct === null || p?.pct === undefined || p?.pct === '' ? null : nonNeg(p.pct)
		})),
		coproducers: list(r.coproducers)
			.slice(0, 10)
			.map((c) => ({
				id: id(c?.id),
				name: str(c?.name),
				share: Math.min(100, Math.round(nonNeg(c?.share) * 100) / 100)
			})),
		split: {
			productionPct: Math.min(100, nonNeg(r.split?.productionPct ?? base.split.productionPct)),
			mode: r.split?.mode === 'porcentajes' ? 'porcentajes' : 'iguales',
			lossBy: r.split?.lossBy === 'todes' ? 'todes' : 'produccion'
		},
		holders
	};
}

/**
 * @typedef {object} Share
 * @prop {string} id
 * @prop {string} name
 * @prop {boolean} team
 * @prop {number} amount su parte de la ganancia (si es del equipo, va a la Caja KV); con pérdida,
 *   negativa: lo que pone
 */

/**
 * El reparto de la ganancia: `productionPct` % para la producción y el resto entre les
 * facilitadores (partes iguales o sus porcentajes, que tienen que sumar 100). La producción es de
 * la Caja KV y de quienes co-producen, según su parte. La parte de quien es del equipo de KV va a
 * la Caja KV, y la Caja se queda con lo que sobra al redondear.
 *
 * Con pérdida (gorrite, Mesa 4/11), por defecto la ponen solo quienes producen, según su parte de
 * la producción (sin co-productores, toda la Caja KV); les facilitadores no ponen nada. Con
 * `lossBy: 'todes'`, la pérdida se reparte como la ganancia: cada facilitadore pone su parte.
 * Cada parte se redondea para abajo (en valor absoluto) y la Caja KV pone lo que falta.
 *
 * @param {number} profit
 * @param {Person[]} people
 * @param {SplitRule} split
 * @param {Coproducer[]} [coproducers]
 * @returns {{ shares: Share[], coproducers: { id: string, name: string, share: number, amount: number }[], production: number, caja: number, problem: string }}
 */
export function splitProfit(profit, people, split, coproducers = []) {
	const named = people.map((p, i) => ({
		id: p.id,
		name: p.name.trim() || `Facilitadore ${i + 1}`,
		team: Boolean(p.team)
	}));
	const cops = coproducers.map((c, i) => ({
		id: c.id,
		name: c.name.trim() || `Co-productore ${i + 1}`,
		share: Math.max(0, Number(c.share) || 0)
	}));
	const sign = profit < 0 ? -1 : 1;
	/**
	 * La producción entre quienes co-producen (para abajo) y la Caja KV (el resto).
	 * @param {number} production
	 */
	const produce = (production) => {
		const abs = Math.abs(production);
		const s = production < 0 ? -1 : 1;
		return cops.map((c) => ({ ...c, amount: s * Math.floor((abs * c.share) / 100) || 0 }));
	};
	/**
	 * @param {number[]} amounts lo de cada facilitadore
	 * @param {string} problem
	 */
	const result = (amounts, problem) => {
		const shares = named.map((p, i) => ({ ...p, amount: amounts[i] ?? 0 }));
		const handed = shares.reduce((t, x) => t + x.amount, 0);
		const production = profit - handed;
		const copShares = produce(production);
		const team = shares.filter((x) => x.team).reduce((t, x) => t + x.amount, 0);
		const caja = production - copShares.reduce((t, x) => t + x.amount, 0) + team;
		return { shares, coproducers: copShares, production, caja, problem };
	};
	const copSum = Math.round(cops.reduce((t, c) => t + c.share, 0) * 100) / 100;
	if (copSum > 100) {
		return {
			...result([], ''),
			coproducers: cops.map((c) => ({ ...c, amount: 0 })),
			caja: profit,
			problem: `Las partes de quienes co-producen suman ${fmtPct(copSum)} %: no pueden pasar de 100 %.`
		};
	}
	// Sin facilitadores, sin ganancia, o con pérdida que pone la producción: todo a la producción.
	if (profit === 0 || !people.length || (profit < 0 && split.lossBy !== 'todes')) {
		return result([], '');
	}
	const prodPct = Math.min(100, Math.max(0, Number(split.productionPct) || 0));
	const pool = Math.floor((Math.abs(profit) * (100 - prodPct)) / 100);
	/** @type {number[]} */
	let weights = people.map(() => 1);
	if (split.mode === 'porcentajes') {
		weights = people.map((p) => Math.max(0, Number(p.pct) || 0));
		const sum = Math.round(weights.reduce((t, x) => t + x, 0) * 100) / 100;
		if (sum !== 100) {
			const diff = Math.round((100 - sum) * 100) / 100;
			const problem =
				diff > 0
					? `Los porcentajes suman ${fmtPct(sum)} %: falta repartir ${fmtPct(diff)} %.`
					: `Los porcentajes suman ${fmtPct(sum)} %: sobran ${fmtPct(-diff)} %.`;
			return { ...result([], problem), coproducers: produce(0), caja: profit };
		}
	}
	const sum = weights.reduce((t, w) => t + w, 0);
	return result(
		weights.map((w) => (sum > 0 ? sign * Math.floor((pool * w) / sum) || 0 : 0)),
		''
	);
}

/** @param {number} x */
const fmtPct = (x) => String(x).replace('.', ',');

/**
 * @typedef {object} Party alguien en la cuenta final: la Caja KV, une facilitadore, el Fondo, el
 *   lugar o alguien a quien se le debe un gasto o una contratación.
 * @prop {string} id
 * @prop {string} name
 * @prop {'caja' | 'persona' | 'coproduce' | 'fondo' | 'pendiente'} kind
 * @prop {number} share lo que le toca (su parte, o lo que se le debe)
 * @prop {number} paid lo que ya puso (gastos que pagó)
 * @prop {number} held la plata del evento que tiene (su cuenta de MP, su alias, la caja de la puerta)
 * @prop {number} balance share + paid − held: positivo, le tienen que pasar; negativo, tiene que pasar
 */

/**
 * La cuenta entera de un evento.
 *
 * @param {Income} income
 * @param {AccountData} data
 */
export function computeAccount(income, data) {
	const fondo = fondoNet(income);
	// La base del % del lugar: lo que pagó la gente por las entradas más lo que cubrió el Fondo,
	// sin los aportes al Fondo ni el recargo de MP («IIBB con fondo» de las planillas).
	const ticketIncome = income.presale + income.door + income.fondoUsed;
	const otherIncome = data.otherIncome.reduce((s, x) => s + x.amount, 0);
	const totalIncome = ticketIncome + otherIncome;
	const venue = venueCost(data.venue, ticketIncome);
	const fees = data.fees.filter((f) => f.amount > 0);
	const expenses = data.expenses.filter((x) => x.amount > 0);
	const feesTotal = fees.reduce((s, f) => s + f.amount, 0);
	const expensesTotal = expenses.reduce((s, x) => s + x.amount, 0);
	const allExpenses = venue.amount + feesTotal + expensesTotal;
	const profit = totalIncome - allExpenses;
	const split = splitProfit(profit, data.people, data.split, data.coproducers);
	// Lo que las contrataciones del equipo dejan en la caja: va a la Caja KV.
	const feesToCaja = fees
		.filter((f) => f.team && f.keep === 'caja')
		.reduce((s, f) => s + f.amount, 0);
	const caja = split.caja + feesToCaja;

	/** @type {Party[]} */
	const parties = [
		{ id: CAJA, name: CAJA_LABEL, kind: 'caja', share: caja, paid: 0, held: 0, balance: 0 }
	];
	for (const s of split.shares) {
		parties.push({
			id: s.id,
			name: s.name,
			kind: 'persona',
			share: s.team ? 0 : s.amount,
			paid: 0,
			held: 0,
			balance: 0
		});
	}
	for (const c of split.coproducers) {
		parties.push({
			id: c.id,
			name: c.name,
			kind: 'coproduce',
			share: c.amount,
			paid: 0,
			held: 0,
			balance: 0
		});
	}
	const byId = new Map(parties.map((p) => [p.id, p]));
	/**
	 * Quien tiene plata o pagó algo: una persona de la cuenta, la Caja KV, o alguien más (se suma
	 * como parte, con su nombre).
	 * @param {string} who
	 */
	const party = (who) => {
		const key = who.trim();
		const found =
			byId.get(key) ?? parties.find((p) => p.kind === 'pendiente' && p.id === `otro:${key}`);
		if (found) return found;
		/** @type {Party} */
		const p = {
			id: `otro:${key}`,
			name: key,
			kind: 'pendiente',
			share: 0,
			paid: 0,
			held: 0,
			balance: 0
		};
		parties.push(p);
		return p;
	};
	if (fondo !== 0) {
		// El Fondo «tiene» lo que cubrió (nadie lo cobró) y le toca lo que recibió en aportes.
		parties.push({
			id: 'fondo',
			name: 'Fondo Kinky Vibe',
			kind: 'fondo',
			share: income.fondoContributed,
			paid: 0,
			held: income.fondoUsed,
			balance: 0
		});
	}
	// La plata cobrada: cada fuente la tiene alguien (sin el recargo de MP: se lo quedó MP). Sin
	// elegir, la Caja KV.
	for (const row of income.rows) {
		party(data.holders[row.key] || CAJA).held += row.amount - row.mpFee;
	}
	for (const x of data.otherIncome) if (x.amount > 0) party(x.heldBy || CAJA).held += x.amount;
	/**
	 * Un pago: si alguien ya lo pagó, lo puso; si falta, se le debe a quien cobra.
	 * @param {Payment} p @param {number} amount @param {string} payee
	 */
	const pay = (p, amount, payee) => {
		if (p.paidBy.trim()) party(p.paidBy).paid += amount;
		else party(payee).share += amount;
	};
	if (venue.amount > 0) pay(data.venuePayment, venue.amount, 'Lugar');
	for (const f of fees) {
		if (f.team && f.keep === 'caja') continue;
		pay(f, f.amount, f.concept.trim() || 'Contratación');
	}
	for (const x of expenses) pay(x, x.amount, x.concept.trim() || 'Gasto sin nombre');
	for (const p of parties) p.balance = p.share + p.paid - p.held;
	return {
		fondo,
		ticketIncome,
		otherIncome,
		totalIncome,
		venue,
		feesTotal,
		feesToCaja,
		expensesTotal,
		allExpenses,
		profit,
		split,
		caja,
		parties,
		transfers: split.problem ? [] : settleUp(parties)
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

/**
 * El renglón del resumen que se guarda al cerrar la cuenta (`event_account_closings`), con las
 * columnas de las planillas.
 *
 * @param {Income} income
 * @param {ReturnType<typeof computeAccount>} result
 */
export function closingSummary(income, result) {
	return {
		tickets: income.tickets,
		presale: income.presale,
		door: income.door,
		fondo_net: result.fondo,
		other_income: result.otherIncome,
		income_total: result.totalIncome,
		venue: result.venue.amount,
		fees: result.feesTotal,
		other_expenses: result.expensesTotal,
		expenses_total: result.allExpenses,
		caja: result.caja,
		profit: result.profit
	};
}

/** @typedef {ReturnType<typeof closingSummary>} ClosingSummary */

/**
 * Los resúmenes cerrados de un año, por mes (el del evento) y el total.
 *
 * @param {(ClosingSummary & { event_date: string })[]} rows
 */
export function yearSummary(rows) {
	const keys = /** @type {(keyof ClosingSummary)[]} */ ([
		'tickets',
		'presale',
		'door',
		'fondo_net',
		'other_income',
		'income_total',
		'venue',
		'fees',
		'other_expenses',
		'expenses_total',
		'caja',
		'profit'
	]);
	const zero = () =>
		/** @type {ClosingSummary & { events: number }} */ (
			Object.fromEntries([['events', 0], ...keys.map((k) => [k, 0])])
		);
	/** @type {Map<string, ClosingSummary & { events: number }>} */
	const months = new Map();
	const total = zero();
	for (const r of rows) {
		const month = String(r.event_date).slice(0, 7);
		const m = months.get(month) ?? zero();
		m.events += 1;
		total.events += 1;
		for (const k of keys) {
			m[k] += Number(r[k]) || 0;
			total[k] += Number(r[k]) || 0;
		}
		months.set(month, m);
	}
	return {
		months: [...months.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, sums]) => ({ month, ...sums })),
		total
	};
}

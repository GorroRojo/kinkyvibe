/**
 * Gastos y reparto de un evento que vende entradas (interruptor `gastos_reparto`; docs/tickets.md,
 * «Gastos y reparto»). Funciones puras, las mismas en el servidor y en la página:
 *
 * - lo que entró, de las órdenes del evento (`eventIncome`), con el Fondo calculado orden por
 *   orden (lo que cubrió con su descuento y lo que recibió de las solidarias);
 * - el costo del lugar en sus cuatro formas (`venueCost`);
 * - la cuenta entera (`computeAccount`): ingresos, lugar, contrataciones, otros gastos, ganancia,
 *   el reparto entre las partes (`splitProfit`: cada una con un porcentaje, un monto fijo o «lo
 *   que sobra») y «quién le pasa a quién»;
 * - el resumen que se guarda al cerrar la cuenta (`closingSummary`).
 *
 * Todo en pesos enteros. La Caja KV es la plata de Kinky Vibe (no es el Fondo): siempre está en
 * el reparto y se queda con lo que sobra, incluidos los pesos del redondeo.
 */

import { formatARS as fmtARS } from '$lib/utils/money.js';

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
 * Un gasto pagado (o por pagar). `paidBy`: el id de una parte, `caja`, u otro texto (quien
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
 * Cómo se lleva lo suyo una parte del reparto: `pct`, un porcentaje de la ganancia; `fijo`, un
 * monto; `resto`, lo que sobra (entre todas las partes con `resto`, en partes iguales).
 * @typedef {'pct' | 'fijo' | 'resto'} PartRule
 */
export const PART_RULES = /** @type {const} */ (['pct', 'fijo', 'resto']);

/**
 * Qué es la parte, solo para los atajos y el nombre que se ve si no tiene (no cambia la cuenta):
 * `facilita` (une facilitadore: quien facilita o enseña), `produce` (quien co-produce con la Caja
 * KV) u otra (vacío).
 * @typedef {'' | 'facilita' | 'produce'} PartRole
 */

/**
 * Una parte del reparto de la ganancia: una persona, la producción, la Caja KV, otra
 * organización… La de id `caja` es la de la Caja KV (siempre del equipo).
 * @typedef {object} Part
 * @prop {string} id
 * @prop {string} name
 * @prop {boolean} team es del equipo de KV: lo suyo va a la Caja KV
 * @prop {PartRole} role
 * @prop {PartRule} rule
 * @prop {number} pct el % de la ganancia (`rule: 'pct'`)
 * @prop {number} amount el monto (`rule: 'fijo'`)
 * @prop {boolean} coversLoss pone si hay pérdida (con `loss: 'marcadas'`)
 */

/**
 * Quién pone si hay pérdida: todas las partes o solo las marcadas («Pone si hay pérdida»), cada
 * una según su parte (ver `lossWeights`). Sin ninguna marcada, la pone la Caja KV.
 * @typedef {'todes' | 'marcadas'} LossRule
 */

/** La producción de la regla de talleres: 30 % de la ganancia. */
export const USUAL_PRODUCTION_PCT = 30;

/**
 * Todo lo que se carga a mano de la cuenta de un evento (lo que se guarda en `event_accounts`).
 * @typedef {object} AccountData
 * @prop {VenueRule} venue
 * @prop {Payment} venuePayment
 * @prop {Fee[]} fees
 * @prop {Expense[]} expenses
 * @prop {OtherIncome[]} otherIncome
 * @prop {Part[]} parts el reparto, en el orden en que se ve
 * @prop {LossRule} loss
 * @prop {Record<string, string>} holders de cada fuente de plata (`IncomeRow.key`), quién la tiene
 */

/**
 * Una cuenta vacía, con la regla del lugar (la del perfil del lugar, si tiene) y la de talleres.
 * Sin partes, la ganancia queda en la Caja KV.
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
		parts: [],
		loss: 'marcadas',
		holders: {}
	};
}

const MAX_LINES = 100;
const MAX_PARTS = 30;
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
/** Un porcentaje entre 0 y 100, con hasta 4 decimales. @param {unknown} x */
const pct = (x) => Math.min(100, Math.round(nonNeg(x) * 10000) / 10000);

/**
 * Una parte nueva, con lo que falta completado.
 * @param {Partial<Part> & { id: string }} p
 * @returns {Part}
 */
export function newPart(p) {
	return {
		name: '',
		team: false,
		role: '',
		rule: 'resto',
		pct: 0,
		amount: 0,
		coversLoss: false,
		...p
	};
}

/** La parte de la Caja KV. @param {Partial<Part>} [p] @returns {Part} */
export const cajaPart = (p = {}) =>
	newPart({ rule: 'pct', ...p, id: CAJA, name: CAJA_LABEL, team: true, role: '' });

/**
 * Las partes limpias (de la página o de la base). Una sola de la Caja KV (la primera).
 * @param {unknown} raw
 * @returns {Part[]}
 */
function cleanParts(raw) {
	/** @type {Part[]} */
	const out = [];
	for (const p of (Array.isArray(raw) ? raw : []).slice(0, MAX_PARTS)) {
		const partId = id(p?.id);
		if (partId === CAJA && out.some((x) => x.id === CAJA)) continue;
		/** @type {Part} */
		const part = {
			id: partId,
			name: str(p?.name),
			team: p?.team === true,
			role: p?.role === 'facilita' || p?.role === 'produce' ? p.role : '',
			rule: PART_RULES.includes(p?.rule) ? p.rule : 'resto',
			pct: pct(p?.pct),
			amount: int(nonNeg(p?.amount)),
			coversLoss: p?.coversLoss === true
		};
		out.push(partId === CAJA ? cajaPart(part) : part);
	}
	return out;
}

/**
 * Las partes de una cuenta guardada antes de que el reparto fuera una lista libre (#549, hasta
 * el 5/11): `split` (`productionPct`, `mode`, `lossBy`), `people` (les facilitadores) y
 * `coproducers` (su parte de la producción). Da las mismas cuentas:
 *
 * - la producción pasa a ser la Caja KV con su porcentaje (`productionPct` × lo que le queda de
 *   la producción) y cada co-productore con el suyo (`productionPct` × su parte);
 * - cada facilitadore, «lo que sobra» (partes iguales) o `(100 − productionPct)` × su porcentaje;
 * - sin facilitadores, todo era de la producción: la Caja KV se lleva lo que sobra y cada
 *   co-productore su parte del total;
 * - co-productores que sumaban más de 100 % ya eran un error: siguen avisando;
 * - «Quienes producen» (`lossBy: 'produccion'`) pasa a «Las marcadas», con la Caja KV y les
 *   co-productores marcades; «Todes, como la ganancia», a «Todes».
 *
 * @param {Record<string, any>} r
 * @returns {{ parts: Part[], loss: LossRule }}
 */
export function legacyParts(r) {
	const prodPct = pct(r.split?.productionPct ?? USUAL_PRODUCTION_PCT);
	const byPct = r.split?.mode === 'porcentajes';
	const people = list(r.people).slice(0, MAX_PARTS - 11);
	const cops = list(r.coproducers)
		.slice(0, 10)
		.map((c) => ({ id: id(c?.id), name: str(c?.name), share: pct(c?.share) }));
	const copSum = cops.reduce((t, c) => t + c.share, 0);
	/** @type {Part[]} */
	const parts = [];
	if (!people.length && copSum <= 100) {
		parts.push(cajaPart({ rule: 'resto', coversLoss: true }));
		for (const c of cops) {
			parts.push(
				newPart({
					id: c.id,
					name: c.name,
					role: 'produce',
					rule: 'pct',
					pct: c.share,
					coversLoss: true
				})
			);
		}
	} else {
		parts.push(
			cajaPart({ pct: pct((prodPct * Math.max(0, 100 - copSum)) / 100), coversLoss: true })
		);
		for (const c of cops) {
			parts.push(
				newPart({
					id: c.id,
					name: c.name,
					role: 'produce',
					rule: 'pct',
					// Si pasaban de 100 % ya era un error (no se podía cerrar): siguen avisando.
					pct: copSum > 100 ? c.share : pct((prodPct * c.share) / 100),
					coversLoss: true
				})
			);
		}
		for (const p of people) {
			parts.push(
				newPart({
					id: id(p?.id),
					name: str(p?.name),
					team: p?.team === true,
					role: 'facilita',
					rule: byPct ? 'pct' : 'resto',
					pct: byPct ? pct(((100 - prodPct) * nonNeg(p?.pct)) / 100) : 0
				})
			);
		}
	}
	return { parts, loss: r.split?.lossBy === 'todes' ? 'todes' : 'marcadas' };
}

/**
 * «Lo de siempre» (la regla de talleres): la producción (`productionPct`, 30 %) entre la Caja KV y
 * quienes co-producen (las partes `produce`), en partes iguales, y lo que sobra entre les
 * facilitadores (las partes `facilita`; si no hay, suma une). Si hay pérdida, la ponen quienes
 * producen. Las otras partes quedan como estaban, al final.
 *
 * @param {Part[]} parts
 * @param {() => string} makeId
 * @param {number} [productionPct]
 * @returns {Part[]}
 */
export function usualParts(parts, makeId, productionPct = USUAL_PRODUCTION_PCT) {
	const producers = parts.filter((p) => p.id !== CAJA && p.role === 'produce');
	let facilitators = parts.filter((p) => p.id !== CAJA && p.role === 'facilita');
	const others = parts.filter((p) => p.id !== CAJA && !p.role);
	const each = Math.floor((productionPct / (producers.length + 1)) * 100) / 100;
	if (!facilitators.length) facilitators = [newPart({ id: makeId(), role: 'facilita' })];
	return [
		cajaPart({ pct: pct(productionPct - each * producers.length), coversLoss: true }),
		...producers.map((p) => ({
			...p,
			rule: /** @type {const} */ ('pct'),
			pct: each,
			coversLoss: true
		})),
		...facilitators.map((p) => ({ ...p, rule: /** @type {const} */ ('resto'), coversLoss: false })),
		...others
	];
}

/**
 * Una cuenta limpia (lo que manda la página, o lo leído de la base). Saca lo que no va, recorta
 * textos y listas, y completa lo que falta. Una cuenta guardada con el reparto de antes (sin
 * `parts`) pasa a partes (`legacyParts`).
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
	// La forma de antes: `split`, `people` y `coproducers`, sin partes.
	const legacy =
		!(Array.isArray(r.parts) && r.parts.length) &&
		Boolean(r.split || Array.isArray(r.people) || Array.isArray(r.coproducers));
	const split = legacy
		? legacyParts(r)
		: { parts: cleanParts(r.parts), loss: r.loss === 'todes' ? 'todes' : base.loss };
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
		parts: split.parts,
		loss: /** @type {LossRule} */ (split.loss),
		holders
	};
}

/**
 * El nombre que se ve de cada parte: el suyo, o «Facilitadore 2», «Co-productore 1», «Parte 3»
 * (contando las del mismo tipo). La de la Caja KV, siempre «Caja KV».
 * @param {Pick<Part, 'id' | 'name' | 'role'>[]} parts
 * @returns {string[]}
 */
export function partNames(parts) {
	/** @type {Record<string, number>} */
	const seen = {};
	return parts.map((p) => {
		const n = (seen[p.role] = (seen[p.role] ?? 0) + 1);
		if (p.id === CAJA) return CAJA_LABEL;
		const fallback =
			p.role === 'facilita' ? 'Facilitadore' : p.role === 'produce' ? 'Co-productore' : 'Parte';
		return p.name.trim() || `${fallback} ${n}`;
	});
}

/**
 * @typedef {object} Share
 * @prop {string} id
 * @prop {string} name
 * @prop {boolean} team del equipo de KV (o la Caja KV misma): lo suyo va a la Caja KV
 * @prop {PartRole} role
 * @prop {number} amount lo suyo de la ganancia; con pérdida, negativo: lo que pone
 */

/** Para que 0,1 + 0,2 no quede en 0,30000000000000004 y redondee para abajo un peso de más. */
const EPS = 1e-6;
/** @param {number} x */
const down = (x) => Math.floor(x + EPS);
/** @param {number} x */
const round4 = (x) => Math.round(x * 10000) / 10000;

/**
 * El peso de cada parte para repartir una pérdida, «según su parte»: su porcentaje; las de «lo que
 * sobra» se reparten en partes iguales el porcentaje que queda (100 − la suma de los
 * porcentajes); un monto fijo, nada (se lleva lo suyo solo si hay ganancia: lo que se paga igual
 * va en Contrataciones).
 * @param {Part[]} parts
 */
export function lossWeights(parts) {
	const pctSum = parts.filter((p) => p.rule === 'pct').reduce((t, p) => t + p.pct, 0);
	const rest = parts.filter((p) => p.rule === 'resto').length;
	const restPct = Math.max(0, 100 - pctSum);
	return parts.map((p) => (p.rule === 'pct' ? p.pct : p.rule === 'resto' ? restPct / rest : 0));
}

/**
 * El reparto de la ganancia entre las partes, en pesos enteros. Primero los porcentajes (de la
 * ganancia) y los montos fijos; lo que queda, entre las partes de «lo que sobra», en partes
 * iguales. Cada parte se redondea para abajo; lo de las partes del equipo de KV va a la Caja KV,
 * y la Caja KV se queda con los pesos del redondeo (y con todo si no hay partes).
 *
 * Avisa (`problem`, y entonces no reparte: todo queda en la Caja KV) si los porcentajes pasan de
 * 100 %, si los montos fijos (o con los porcentajes) pasan de la ganancia, o si sobra plata y
 * ninguna parte se lleva «lo que sobra» (`unassigned`: lo sin repartir).
 *
 * Con pérdida la ponen todas las partes o las marcadas (`loss`), según su parte
 * (`lossWeights`; si ninguna tiene parte, en partes iguales). Sin ninguna, la pone la Caja KV.
 * Cada una pone lo suyo redondeado para abajo y la Caja KV, lo que falta.
 *
 * @param {number} profit
 * @param {Part[]} parts
 * @param {LossRule} loss
 * @returns {{ shares: Share[], caja: number, unassigned: number, problem: string }}
 */
export function splitProfit(profit, parts, loss) {
	const names = partNames(parts);
	/** @param {number[]} amounts @param {string} [problem] @param {number} [unassigned] */
	const result = (amounts, problem = '', unassigned = 0) => {
		const shares = parts.map((p, i) => ({
			id: p.id,
			name: names[i],
			team: p.id === CAJA || p.team,
			role: p.role,
			amount: amounts[i] ?? 0
		}));
		const handed = shares.filter((s) => !s.team).reduce((t, s) => t + s.amount, 0);
		return { shares, caja: profit - handed, unassigned, problem };
	};
	const pctSum = round4(parts.filter((p) => p.rule === 'pct').reduce((t, p) => t + p.pct, 0));
	if (pctSum > 100) {
		return result([], `Los porcentajes suman ${fmtPct(pctSum)} %: no pueden pasar de 100 %.`);
	}
	if (profit === 0 || !parts.length) return result([]);
	if (profit < 0) {
		const weights = lossWeights(parts);
		const chosen = parts.map((p) => loss === 'todes' || p.coversLoss);
		if (!chosen.some(Boolean)) return result([]);
		let w = weights.map((x, i) => (chosen[i] ? x : 0));
		if (w.every((x) => x <= 0)) w = chosen.map((c) => (c ? 1 : 0));
		const sum = w.reduce((t, x) => t + x, 0);
		return result(w.map((x) => -down((-profit * x) / sum) || 0));
	}
	const fixed = parts.filter((p) => p.rule === 'fijo').reduce((t, p) => t + p.amount, 0);
	const byPct = (profit * pctSum) / 100;
	if (fixed > profit) {
		return result(
			[],
			`Los montos fijos suman ${fmtARS(fixed)}: es más que la ganancia (${fmtARS(profit)}).`
		);
	}
	if (fixed + byPct > profit + EPS) {
		return result(
			[],
			`Los porcentajes (${fmtARS(Math.round(byPct))}) y los montos fijos (${fmtARS(fixed)}) se llevan más que la ganancia (${fmtARS(profit)}).`
		);
	}
	const rest = Math.max(0, down(profit - fixed - byPct));
	const restCount = parts.filter((p) => p.rule === 'resto').length;
	if (!restCount && rest > 0) {
		return result(
			[],
			`Sin repartir: ${fmtARS(rest)}. Sumá una parte que se lleve «lo que sobra» o ajustá los porcentajes.`,
			rest
		);
	}
	return result(
		parts.map((p) =>
			p.rule === 'pct'
				? down((profit * p.pct) / 100)
				: p.rule === 'fijo'
					? p.amount
					: down(rest / restCount)
		)
	);
}

/** @param {number} x */
const fmtPct = (x) => String(x).replace('.', ',');

/**
 * @typedef {object} Party alguien en la cuenta final: la Caja KV, une facilitadore, el Fondo, el
 *   lugar o alguien a quien se le debe un gasto o una contratación.
 * @prop {string} id
 * @prop {string} name
 * @prop {'caja' | 'parte' | 'fondo' | 'pendiente'} kind
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
	const split = splitProfit(profit, data.parts, data.loss);
	// Lo que las contrataciones del equipo dejan en la caja: va a la Caja KV.
	const feesToCaja = fees
		.filter((f) => f.team && f.keep === 'caja')
		.reduce((s, f) => s + f.amount, 0);
	const caja = split.caja + feesToCaja;

	/** @type {Party[]} */
	const parties = [
		{ id: CAJA, name: CAJA_LABEL, kind: 'caja', share: caja, paid: 0, held: 0, balance: 0 }
	];
	// Cada parte (menos la Caja KV misma) puede tener plata o haber pagado algo; lo suyo, si es del
	// equipo, ya está en la Caja KV.
	for (const s of split.shares) {
		if (s.id === CAJA) continue;
		parties.push({
			id: s.id,
			name: s.name,
			kind: 'parte',
			share: s.team ? 0 : s.amount,
			paid: 0,
			held: 0,
			balance: 0
		});
	}
	const byId = new Map(parties.map((p) => [p.id, p]));
	/**
	 * Quien tiene plata o pagó algo: una parte de la cuenta, la Caja KV, o alguien más (se suma
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

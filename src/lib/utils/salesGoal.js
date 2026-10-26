/**
 * Meta de venta de un evento (docs/tickets.md, «Meta de venta»): una sola por evento, en plata
 * (pesos NETOS: lo cobrado en las órdenes aprobadas menos la comisión de Mercado Pago, ver
 * {@link netRevenue}) o en entradas (vendidas, órdenes aprobadas). El panel muestra el avance
 * contra la meta; sin meta, contra el cupo (como siempre).
 *
 * Se guarda en el evento, en la clave `meta_venta` del frontmatter (`meta_venta: plata:250000` o
 * `meta_venta: entradas:30`); en la base, la misma clave dentro de `extra` del objeto
 * `evento`, como el resto de la configuración de entradas. Duplicar un evento la copia como
 * cualquier otro campo.
 *
 * Funciones puras (sin red ni SvelteKit): las usan el editor (navegador), el servidor y vitest.
 */
import { formatARS } from './money.js';
import { parseAmount } from './tickets.js';

/** La clave del frontmatter. */
export const GOAL_KEY = 'meta_venta';

export const GOAL_KINDS = /** @type {const} */ (['plata', 'entradas']);

/** @typedef {(typeof GOAL_KINDS)[number]} GoalKind */
/** @typedef {{ kind: GoalKind, value: number }} SalesGoal */

/** Topes (para atajar un cero de más). */
export const GOAL_MAX = /** @type {const} */ ({ plata: 1_000_000_000, entradas: 100_000 });

/** @param {unknown} k @returns {k is GoalKind} */
const isKind = (k) => GOAL_KINDS.includes(/** @type {any} */ (k));

/**
 * El número de una meta: entero mayor a 0 y hasta el tope. Acepta «250.000», «$ 250.000» o 250000.
 * @param {GoalKind} kind
 * @param {unknown} raw
 */
function goalValue(kind, raw) {
	const n = parseAmount(typeof raw === 'number' ? raw : String(raw ?? ''));
	return n !== null && n > 0 && n <= GOAL_MAX[kind] ? n : null;
}

/**
 * Lee una meta guardada: `'plata:250000'`, `'entradas:30'` o, escrita a mano en el frontmatter,
 * `{ plata: 250000 }` / `{ entradas: 30 }` (una sola clave). Lo que no se entiende es `null` (sin
 * meta): una meta rota nunca frena la venta ni el panel.
 *
 * @param {unknown} raw
 * @returns {SalesGoal | null}
 */
export function parseSalesGoal(raw) {
	if (typeof raw === 'string') {
		const m = /^\s*([a-z]+)\s*:\s*(.+?)\s*$/i.exec(raw);
		if (!m) return null;
		const kind = m[1].toLowerCase();
		if (!isKind(kind)) return null;
		const value = goalValue(kind, m[2]);
		return value === null ? null : { kind, value };
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const keys = Object.keys(raw);
		if (keys.length !== 1 || !isKind(keys[0])) return null;
		const kind = keys[0];
		const value = goalValue(kind, /** @type {Record<string, unknown>} */ (raw)[kind]);
		return value === null ? null : { kind, value };
	}
	return null;
}

/**
 * ¿Qué tiene de malo una meta guardada? `null` si no hay o está bien.
 * @param {unknown} raw
 */
export function salesGoalProblem(raw) {
	if (raw === undefined || raw === null || raw === '') return null;
	return parseSalesGoal(raw)
		? null
		: 'La meta de venta tiene que ser «plata:<pesos>» o «entradas:<cantidad>», con un número entero mayor a 0.';
}

/**
 * Cómo se guarda (`'plata:250000'`), o '' sin meta.
 * @param {SalesGoal | null} goal
 */
export function storedSalesGoal(goal) {
	return goal ? `${goal.kind}:${goal.value}` : '';
}

/**
 * La meta escrita en el formulario («Meta»: ninguna, plata o entradas, y el número).
 *
 * @param {string} kind '' | 'plata' | 'entradas'
 * @param {string} value
 * @returns {{ goal: SalesGoal | null, error: string }}
 */
export function goalFromForm(kind, value) {
	if (!isKind(kind)) return { goal: null, error: '' };
	const raw = String(value ?? '').trim();
	const n = goalValue(kind, raw);
	if (n !== null) return { goal: { kind, value: n }, error: '' };
	const tooBig = (parseAmount(raw) ?? 0) > GOAL_MAX[kind];
	if (kind === 'plata')
		return {
			goal: null,
			error: tooBig
				? 'Meta: el monto es demasiado alto (¿sobra un cero?).'
				: 'Meta: escribí cuánta plata querés juntar, en pesos enteros (mayor a 0).'
		};
	return {
		goal: null,
		error: tooBig
			? 'Meta: son demasiadas entradas (¿sobra un cero?).'
			: 'Meta: escribí cuántas entradas querés vender (un número entero mayor a 0).'
	};
}

/**
 * Los campos del formulario para una meta guardada.
 * @param {unknown} raw
 * @returns {{ kind: '' | GoalKind, value: string }}
 */
export function goalToForm(raw) {
	const goal = parseSalesGoal(raw);
	return goal ? { kind: goal.kind, value: String(goal.value) } : { kind: '', value: '' };
}

/** @param {number} n */
const entradas = (n) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`;

/**
 * La meta en palabras: «$ 250.000» o «30 entradas».
 * @param {SalesGoal} goal
 */
export function describeSalesGoal(goal) {
	return goal.kind === 'plata' ? formatARS(goal.value) : entradas(goal.value);
}

/**
 * Lo recaudado de una orden, en SQL (sobre una fila de `orders`): su `total` menos lo reembolsado
 * desde el panel de Mercado Pago en un pago que sigue aprobado (`refunded_amount`, reembolso
 * parcial; migración 0065), nunca menos de 0. Es el «Recaudado» del panel. Sumar solo sobre
 * órdenes aprobadas (una reembolsada entera no suma nada, como siempre).
 */
export const REVENUE_SQL = `MAX(0, total - COALESCE(refunded_amount, 0))`;

/**
 * Lo mismo que {@link REVENUE_SQL}, sobre una orden ya leída.
 * @param {{ total: number, refunded_amount?: number | null }} order
 */
export function orderRevenue(order) {
	return Math.max(0, (Number(order.total) || 0) - (Number(order.refunded_amount) || 0));
}

/**
 * La comisión de Mercado Pago de una orden, en SQL (sobre una fila de `orders`), 0 si no se pagó
 * con Mercado Pago (transferencia, puerta, manual y sin cargo no tienen comisión):
 * - la que **cobró MP** (`mp_fee_amount`, migración 0065), si el pago la informó
 *   (`fee_details` del pago; la guarda el aviso de MP);
 * - si no, la **estimada**: el recargo (`surcharge_amount`), que se calcula al comprar con la tasa
 *   vigente (`mp_fee_percent` del evento, Ajustes → Cobros, TICKETS_MP_FEE_PERCENT o 2 %:
 *   `mpFeeBasisPoints`) justo para que, después de la comisión de MP, quede la base
 *   (`mpSurcharge` en ./tickets.js). {@link MP_FEE_ESTIMATED_SQL} dice cuánto es estimado.
 * Sumar solo sobre órdenes aprobadas.
 */
export const MP_FEE_SQL = `CASE WHEN payment_method = 'mercadopago'
	THEN COALESCE(mp_fee_amount, surcharge_amount) ELSE 0 END`;

/** La parte de {@link MP_FEE_SQL} que es estimada (MP no informó la comisión de esa orden). */
export const MP_FEE_ESTIMATED_SQL = `CASE WHEN payment_method = 'mercadopago' AND mp_fee_amount IS NULL
	THEN surcharge_amount ELSE 0 END`;

/**
 * Lo mismo que {@link MP_FEE_SQL}, sobre una orden ya leída.
 * @param {{ payment_method?: string | null, surcharge_amount?: number | null,
 *   mp_fee_amount?: number | null }} order
 */
export function orderMpFee(order) {
	if (order.payment_method !== 'mercadopago') return 0;
	return order.mp_fee_amount === null || order.mp_fee_amount === undefined
		? Number(order.surcharge_amount) || 0
		: Number(order.mp_fee_amount) || 0;
}

/**
 * Lo mismo que {@link MP_FEE_ESTIMATED_SQL}, sobre una orden ya leída.
 * @param {{ payment_method?: string | null, surcharge_amount?: number | null,
 *   mp_fee_amount?: number | null }} order
 */
export function orderMpFeeEstimated(order) {
	if (order.payment_method !== 'mercadopago') return 0;
	return order.mp_fee_amount === null || order.mp_fee_amount === undefined
		? Number(order.surcharge_amount) || 0
		: 0;
}

/**
 * Lo neto: lo cobrado (suma de {@link REVENUE_SQL} de las órdenes aprobadas, el «Recaudado» del
 * panel) menos la comisión de Mercado Pago de esas órdenes ({@link MP_FEE_SQL} /
 * {@link orderMpFee}).
 * @param {{ revenue: number, mpFee: number }} totals
 */
export function netRevenue({ revenue, mpFee }) {
	return Math.max(0, (Number(revenue) || 0) - (Number(mpFee) || 0));
}

/**
 * Si lo neto es estimado: `null` si no hay nada estimado (toda la comisión es la que cobró MP, o
 * no hay comisión), `'all'` si toda la comisión es estimada y `'part'` si solo una parte.
 * @param {{ mpFee?: number, mpFeeEstimated?: number }} totals
 * @returns {null | 'all' | 'part'}
 */
export function netEstimate({ mpFee = 0, mpFeeEstimated = 0 }) {
	const est = Number(mpFeeEstimated) || 0;
	if (est <= 0) return null;
	return est >= (Number(mpFee) || 0) ? 'all' : 'part';
}

/**
 * Cómo se explica un neto estimado (para un `title` o una línea chica), o `''` si no lo es.
 * @param {{ mpFee?: number, mpFeeEstimated?: number }} totals
 */
export function netEstimateText({ mpFee = 0, mpFeeEstimated = 0 }) {
	const kind = netEstimate({ mpFee, mpFeeEstimated });
	if (kind === 'all') {
		return 'Neto estimado: la comisión de Mercado Pago se calcula con la tasa de Ajustes › Cobros (MP todavía no la informó).';
	}
	if (kind === 'part') {
		return `Neto en parte estimado: ${formatARS(mpFeeEstimated)} de los ${formatARS(mpFee)} de comisión de Mercado Pago se calculan con la tasa de Ajustes › Cobros; el resto es lo que cobró MP.`;
	}
	return '';
}

/**
 * @typedef {object} GoalProgress
 * @prop {GoalKind} kind
 * @prop {number} current lo vendido (entradas) o lo neto (pesos, {@link netRevenue})
 * @prop {number} target la meta
 * @prop {number} pct porcentaje redondeado (puede pasar de 100)
 * @prop {boolean} reached se llegó a la meta
 * @prop {string} text «$ 180.000 netos de $ 250.000 (72 %)» o «23 de 30 entradas»; «netos
 *   estimados» si parte de la comisión de MP es estimada
 * @prop {null | 'all' | 'part'} [estimate] {@link netEstimate} (solo plata)
 * @prop {string} [estimateText] {@link netEstimateText}
 */

/**
 * El avance contra la meta, o `null` sin meta (entonces se muestra el cupo, como siempre).
 * Plata: lo neto ({@link netRevenue}: `revenue` = lo recaudado, `mpFee` = la comisión de MP de
 * las órdenes aprobadas). Entradas: `sold` (vendidas, órdenes aprobadas).
 *
 * @param {unknown} goal una meta (`SalesGoal`) o lo guardado (`'plata:250000'`)
 * @param {{ sold: number, revenue: number, mpFee: number, mpFeeEstimated?: number }} totals
 *   `mpFeeEstimated`: la parte de `mpFee` que es estimada ({@link MP_FEE_ESTIMATED_SQL}): con algo
 *   estimado, el texto dice «netos estimados» y `estimateText` explica cuánto.
 * @returns {GoalProgress | null}
 */
export function goalProgress(goal, { sold, revenue, mpFee, mpFeeEstimated = 0 }) {
	const g =
		goal && typeof goal === 'object' && 'kind' in goal && 'value' in goal
			? parseSalesGoal(storedSalesGoal(/** @type {SalesGoal} */ (goal)))
			: parseSalesGoal(goal);
	if (!g) return null;
	const current =
		g.kind === 'plata' ? netRevenue({ revenue, mpFee }) : Math.max(0, Number(sold) || 0);
	const pct = Math.round((current / g.value) * 100);
	const estimate = g.kind === 'plata' ? netEstimate({ mpFee, mpFeeEstimated }) : null;
	const text =
		g.kind === 'plata'
			? `${formatARS(current)} netos${estimate ? ' estimados' : ''} de ${formatARS(g.value)} (${pct} %)`
			: `${current} de ${entradas(g.value)}`;
	return {
		kind: g.kind,
		current,
		target: g.value,
		pct,
		reached: current >= g.value,
		text,
		estimate,
		estimateText: estimate ? netEstimateText({ mpFee, mpFeeEstimated }) : ''
	};
}

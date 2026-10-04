/**
 * Meta de venta de un evento (docs/tickets.md, «Meta de venta»): una sola por evento, en plata
 * (pesos NETOS: lo cobrado en las órdenes aprobadas menos la comisión de Mercado Pago, ver
 * {@link netRevenue}) o en entradas (vendidas, órdenes aprobadas). El panel muestra el avance
 * contra la meta; sin meta, contra el cupo (como siempre).
 *
 * Se guarda en el evento, en la clave `meta_venta` del frontmatter (`meta_venta: plata:250000` o
 * `meta_venta: entradas:30`); con `contenido_db`, la misma clave dentro de `extra` del objeto
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
 * La comisión de Mercado Pago de una orden, en SQL (sobre una fila de `orders`): su recargo
 * (`surcharge_amount`) si se pagó con Mercado Pago, 0 si no. El recargo se calcula al comprar con
 * la tasa vigente (`mp_fee_percent` del evento, Ajustes → Cobros, TICKETS_MP_FEE_PERCENT o 2 %:
 * `mpFeeBasisPoints`) justo para que, después de la comisión de MP, quede la base
 * (`mpSurcharge` en ./tickets.js): lo que se queda MP es ese recargo. Transferencia, puerta,
 * manual y sin cargo no tienen comisión. Sumar solo sobre órdenes aprobadas.
 */
export const MP_FEE_SQL = `CASE WHEN payment_method = 'mercadopago' THEN surcharge_amount ELSE 0 END`;

/**
 * Lo mismo que {@link MP_FEE_SQL}, sobre una orden ya leída.
 * @param {{ payment_method?: string | null, surcharge_amount?: number | null }} order
 */
export function orderMpFee(order) {
	return order.payment_method === 'mercadopago' ? Number(order.surcharge_amount) || 0 : 0;
}

/**
 * Lo neto: lo cobrado (suma del `total` de las órdenes aprobadas, el «Recaudado» del panel) menos
 * la comisión de Mercado Pago de esas órdenes ({@link MP_FEE_SQL} / {@link orderMpFee}).
 * @param {{ revenue: number, mpFee: number }} totals
 */
export function netRevenue({ revenue, mpFee }) {
	return Math.max(0, (Number(revenue) || 0) - (Number(mpFee) || 0));
}

/**
 * @typedef {object} GoalProgress
 * @prop {GoalKind} kind
 * @prop {number} current lo vendido (entradas) o lo neto (pesos, {@link netRevenue})
 * @prop {number} target la meta
 * @prop {number} pct porcentaje redondeado (puede pasar de 100)
 * @prop {boolean} reached se llegó a la meta
 * @prop {string} text «$ 180.000 netos de $ 250.000 (72 %)» o «23 de 30 entradas»
 */

/**
 * El avance contra la meta, o `null` sin meta (entonces se muestra el cupo, como siempre).
 * Plata: lo neto ({@link netRevenue}: `revenue` = lo recaudado, `mpFee` = la comisión de MP de
 * las órdenes aprobadas). Entradas: `sold` (vendidas, órdenes aprobadas).
 *
 * @param {unknown} goal una meta (`SalesGoal`) o lo guardado (`'plata:250000'`)
 * @param {{ sold: number, revenue: number, mpFee: number }} totals
 * @returns {GoalProgress | null}
 */
export function goalProgress(goal, { sold, revenue, mpFee }) {
	const g =
		goal && typeof goal === 'object' && 'kind' in goal && 'value' in goal
			? parseSalesGoal(storedSalesGoal(/** @type {SalesGoal} */ (goal)))
			: parseSalesGoal(goal);
	if (!g) return null;
	const current =
		g.kind === 'plata' ? netRevenue({ revenue, mpFee }) : Math.max(0, Number(sold) || 0);
	const pct = Math.round((current / g.value) * 100);
	const text =
		g.kind === 'plata'
			? `${formatARS(current)} netos de ${formatARS(g.value)} (${pct} %)`
			: `${current} de ${entradas(g.value)}`;
	return { kind: g.kind, current, target: g.value, pct, reached: current >= g.value, text };
}

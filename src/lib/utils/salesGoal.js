/**
 * Meta de venta de un evento (docs/tickets.md, «Meta de venta»): una sola por evento, en plata
 * (pesos, lo mismo que el panel cuenta como recaudado: la suma de las órdenes aprobadas, antes de
 * la comisión de Mercado Pago) o en entradas. El panel muestra el avance contra la meta; sin meta,
 * contra el cupo (como siempre).
 *
 * Dónde se guarda:
 * - en el evento, la clave `meta_venta` del frontmatter (`meta_venta: plata:250000` o
 *   `meta_venta: entradas:30`); con `contenido_db`, la misma clave dentro de `extra` del objeto
 *   `evento`, como el resto de la configuración de entradas;
 * - en una serie, la clave `meta_venta` de su etiqueta (hardcodedTags.js o el campo `meta_venta`
 *   del objeto `etiqueta`): la meta que heredan las ediciones NUEVAS al crearlas o duplicarlas (se
 *   copia; cambiarla después no toca los eventos que ya existen).
 *
 * Funciones puras (sin red ni SvelteKit): las usan el editor (navegador), el servidor y vitest.
 * Solo imports relativos (lo importa el tipo `etiqueta`, que usa el cron sin pasar por Vite).
 * Sobre el archivo de un evento: ./salesGoalFile.js.
 */
import { formatARS } from './money.js';
import { parseAmount } from './tickets.js';

/** La clave del frontmatter (y de la etiqueta de una serie). */
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
 * @typedef {object} GoalProgress
 * @prop {GoalKind} kind
 * @prop {number} current lo vendido (entradas) o recaudado (pesos)
 * @prop {number} target la meta
 * @prop {number} pct porcentaje redondeado (puede pasar de 100)
 * @prop {boolean} reached se llegó a la meta
 * @prop {string} text «$ 180.000 de $ 250.000 (72 %)» o «23 de 30 entradas»
 */

/**
 * El avance contra la meta, o `null` sin meta (entonces se muestra el cupo, como siempre).
 * `revenue` es lo que el panel cuenta como recaudado (suma de las órdenes aprobadas).
 *
 * @param {unknown} goal una meta (`SalesGoal`) o lo guardado (`'plata:250000'`)
 * @param {{ sold: number, revenue: number }} totals
 * @returns {GoalProgress | null}
 */
export function goalProgress(goal, { sold, revenue }) {
	const g =
		goal && typeof goal === 'object' && 'kind' in goal && 'value' in goal
			? parseSalesGoal(storedSalesGoal(/** @type {SalesGoal} */ (goal)))
			: parseSalesGoal(goal);
	if (!g) return null;
	const current = Math.max(0, g.kind === 'plata' ? Number(revenue) || 0 : Number(sold) || 0);
	const pct = Math.round((current / g.value) * 100);
	const text =
		g.kind === 'plata'
			? `${formatARS(current)} de ${formatARS(g.value)} (${pct} %)`
			: `${current} de ${entradas(g.value)}`;
	return { kind: g.kind, current, target: g.value, pct, reached: current >= g.value, text };
}

/**
 * Las metas por defecto de las series: `{ [serie]: 'plata:250000' }`, solo las que tienen una
 * válida.
 *
 * @param {readonly string[]} seriesIds las series (seriesTagIds)
 * @param {(id: string) => Record<string, unknown> | undefined} getTag
 * @returns {Record<string, string>}
 */
export function seriesGoalMap(seriesIds, getTag) {
	/** @type {Record<string, string>} */
	const out = {};
	for (const id of seriesIds) {
		const goal = parseSalesGoal(getTag(id)?.[GOAL_KEY]);
		if (goal) out[id] = storedSalesGoal(goal);
	}
	return out;
}

/**
 * La meta por defecto que le toca a un evento por sus etiquetas: la de la primera serie (en el
 * orden de sus etiquetas) que tenga una.
 *
 * @param {readonly unknown[] | undefined} tags
 * @param {Record<string, string> | null | undefined} seriesGoals ver {@link seriesGoalMap}
 * @returns {{ series: string, goal: SalesGoal } | null}
 */
export function seriesGoalFor(tags, seriesGoals) {
	if (!seriesGoals || !Array.isArray(tags)) return null;
	for (const t of tags) {
		const id = typeof t === 'string' ? t.trim() : '';
		if (!id || !Object.hasOwn(seriesGoals, id)) continue;
		const goal = parseSalesGoal(seriesGoals[id]);
		if (goal) return { series: id, goal };
	}
	return null;
}

/**
 * Herencia al crear o duplicar una edición (sin formulario: la carga rápida de la agenda y la
 * importación de la planilla): si el evento vende entradas y es de una serie con meta por
 * defecto, esa meta reemplaza la que vino copiada del original. Devuelve lo que hay que escribir
 * en `meta_venta`, o `null` si no hay que cambiar nada.
 *
 * @param {Record<string, any>} meta el frontmatter del evento nuevo
 * @param {Record<string, string> | null | undefined} seriesGoals
 * @returns {string | null}
 */
export function inheritedGoal(meta, seriesGoals) {
	if (!Array.isArray(meta?.tickets) || !meta.tickets.length) return null;
	const found = seriesGoalFor(meta.tags, seriesGoals);
	if (!found) return null;
	const next = storedSalesGoal(found.goal);
	return meta[GOAL_KEY] === next ? null : next;
}

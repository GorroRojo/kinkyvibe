/**
 * La ganancia de un evento en todo el panel (decisión de gorrite en la Mesa, 24/11: «Ganancia en
 * todo el panel, con ganancia estimada antes de cerrar»; docs/tickets.md, «Ganancia en el panel»).
 * Un solo número, el mismo en todas las páginas, sacado de la cuenta del evento (Gastos y reparto,
 * ./reparto.js):
 *
 * - **cuenta cerrada**: la ganancia del cierre (`event_account_closings.profit`), «Ganancia»;
 * - **cuenta abierta o sin empezar**: «Ganancia estimada» = la cuenta de Gastos y reparto
 *   (`computeAccount`) con lo que entró hasta ahora (`eventIncome`: sin el recargo de MP, con el
 *   Fondo orden por orden y los extras) y lo guardado de la cuenta hasta ahora (lugar,
 *   contrataciones, otros gastos, otros ingresos). Sin nada guardado, la misma cuenta que muestra
 *   la página para una cuenta sin guardar (`shownAccount`: la regla por defecto del lugar), con la
 *   pista «con la regla del lugar»; si ni así hay gastos, «sin gastos cargados».
 *
 * Funciones puras: las usan el servidor, las páginas y el bot.
 */
import { computeAccount, shownAccount } from './reparto.js';
import { formatSignedARS } from '$lib/utils/money.js';

/**
 * @typedef {object} EventProfit
 * @prop {number} amount la ganancia (negativa: pérdida), en pesos enteros
 * @prop {boolean} closed la cuenta está cerrada (el número es el del cierre)
 * @prop {boolean} noExpenses abierta y sin ningún gasto (lugar, contrataciones u otros)
 * @prop {boolean} venueDefault abierta, sin nada guardado y con gastos: los de la regla por defecto
 *   del lugar (lo que muestra Gastos y reparto antes de guardar)
 * @prop {number} income los ingresos de la cuenta (entradas sin recargo, Fondo, extras y otros)
 * @prop {number} expenses los gastos cargados hasta ahora (o los del cierre)
 */

/** Las palabras, en un solo lugar (las páginas y el bot las usan así). */
export const PROFIT_LABEL = 'Ganancia';
export const PROFIT_ESTIMATED_LABEL = 'Ganancia estimada';
export const PROFIT_NO_EXPENSES = 'sin gastos cargados';
export const PROFIT_VENUE_DEFAULT = 'con la regla del lugar';
export const PROFIT_NOT_CLOSED = 'falta cerrar la cuenta';

/** @typedef {{ closed: boolean, noExpenses: boolean, venueDefault?: boolean }} ProfitFlags */

/**
 * La ganancia de un evento: la del cierre si la cuenta está cerrada; si no, la estimada.
 *
 * @param {{
 *   income: import('./reparto.js').Income | null,
 *   account?: import('./reparto.js').AccountData | null,
 *   venueRule?: import('./reparto.js').VenueRule | null,
 *   closing?: { profit: number, income_total: number, expenses_total: number } | null
 * }} input `income`: lo que entró (`eventIncome`); `account`: lo guardado de la cuenta (o nada);
 *   `venueRule`: la regla por defecto del lugar del evento (o nada: la de talleres, como la
 *   página); `closing`: el resumen del cierre (o nada)
 * @returns {EventProfit | null} `null` sin cierre ni ingresos (no hay nada que mostrar)
 */
export function eventProfit({ income, account = null, venueRule = null, closing = null }) {
	if (closing) {
		return {
			amount: Number(closing.profit) || 0,
			closed: true,
			noExpenses: false,
			venueDefault: false,
			income: Number(closing.income_total) || 0,
			expenses: Number(closing.expenses_total) || 0
		};
	}
	if (!income) return null;
	const r = computeAccount(income, shownAccount(account, venueRule));
	return {
		amount: r.profit,
		closed: false,
		noExpenses: r.allExpenses === 0,
		venueDefault: !account && r.allExpenses > 0,
		income: r.totalIncome,
		expenses: r.allExpenses
	};
}

/**
 * «Ganancia» o «Ganancia estimada».
 * @param {Pick<EventProfit, 'closed'>} p
 */
export function profitLabel(p) {
	return p.closed ? PROFIT_LABEL : PROFIT_ESTIMATED_LABEL;
}

/**
 * La pista chica de una ganancia: «sin gastos cargados» (abierta, sin gastos), «con la regla del
 * lugar» (sin nada guardado: solo la regla por defecto del lugar) o '' (cerrada, o con la cuenta
 * guardada: la etiqueta ya dice «estimada»).
 * @param {ProfitFlags} p
 */
export function profitHint(p) {
	if (p.closed) return '';
	if (p.noExpenses) return PROFIT_NO_EXPENSES;
	return p.venueDefault ? PROFIT_VENUE_DEFAULT : '';
}

/**
 * Para un evento que ya pasó: la pista dice además que falta cerrar la cuenta.
 * @param {ProfitFlags} p
 */
export function pastProfitHint(p) {
	if (p.closed) return '';
	const hint = profitHint(p);
	return hint ? `${PROFIT_NOT_CLOSED}, ${hint}` : PROFIT_NOT_CLOSED;
}

/**
 * En una línea: «Ganancia estimada: $ 120.000 (sin gastos cargados)», «Ganancia: −$ 5.000».
 * @param {EventProfit} p
 * @param {{ past?: boolean }} [opts] `past`: el evento ya pasó (la pista dice si falta cerrar)
 */
export function profitText(p, { past = false } = {}) {
	const hint = past ? pastProfitHint(p) : profitHint(p);
	return `${profitLabel(p)}: ${formatSignedARS(p.amount)}${hint ? ` (${hint})` : ''}`;
}

/**
 * La ganancia por persona que entró (redondeada), o `null` si no entró nadie.
 * @param {Pick<EventProfit, 'amount'>} p
 * @param {number} people
 */
export function profitPerPerson(p, people) {
	const n = Number(people) || 0;
	return n > 0 ? Math.round(p.amount / n) : null;
}

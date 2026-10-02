/**
 * Compra de entradas en tres pasos (Entradas → Tus datos → Pagar): funciones puras que usa
 * TicketPurchase.svelte para saber qué paso tiene errores, si se puede avanzar y qué mostrar en
 * el resumen de la compra. Las cuentas de plata son las de `computePrice` y las validaciones,
 * las mismas que hace el servidor (`validateBuyer`, `validateHolders`, `validateAnswers`): acá
 * no se recalcula nada por otro camino. El servidor vuelve a validar todo al comprar.
 */
import { formatARS } from './money.js';
import { validateAnswers } from './signupFields.js';
import { validateBuyer, validateHolders } from './ticketBuyer.js';
import {
	ORDER_MAX_MESSAGE,
	exceedsOrderMax,
	fondoOptionLabel,
	mpSurcharge,
	parseAmount
} from './tickets.js';

/** Los pasos, en orden. `id` sirve para los ids del HTML. */
export const PURCHASE_STEPS = Object.freeze([
	Object.freeze({ id: 'entradas', label: 'Entradas' }),
	Object.freeze({ id: 'datos', label: 'Tus datos' }),
	Object.freeze({ id: 'pagar', label: 'Pagar' })
]);

export const STEP_TICKETS = 0;
export const STEP_BUYER = 1;
export const STEP_PAY = 2;

/** Campos del formulario que están en el paso «Entradas». */
const TICKETS_FIELDS = new Set(['type', 'tier', 'option', 'amount', 'quantity', 'code']);
/** Campos de quien compra (paso «Tus datos»); además, cada entrada y las preguntas. */
const BUYER_FIELDS = new Set(['name', 'pronouns', 'email', 'dni']);

/**
 * En qué paso está un campo del formulario (por su `name`, que es también la clave de su error
 * en lo que devuelve el servidor). Lo que no se reconoce va a «Pagar», donde se envía.
 *
 * @param {string} name
 * @returns {number}
 */
export function stepOfField(name) {
	if (TICKETS_FIELDS.has(name)) return STEP_TICKETS;
	if (BUYER_FIELDS.has(name) || name.startsWith('holder_') || name.startsWith('campo_')) {
		return STEP_BUYER;
	}
	return STEP_PAY;
}

/**
 * El primer paso que tiene algún error, o `null` si no hay errores.
 *
 * @param {Record<string, string> | null | undefined} errors
 * @returns {number | null}
 */
export function firstStepWithErrors(errors) {
	let first = null;
	for (const [name, message] of Object.entries(errors ?? {})) {
		if (!message) continue;
		const s = stepOfField(name);
		if (first === null || s < first) first = s;
	}
	return first;
}

/**
 * Los errores que NO son de ese paso (para reemplazar los de un paso por los nuevos).
 *
 * @param {Record<string, string>} errors
 * @param {number} step
 * @returns {Record<string, string>}
 */
export function errorsOutsideStep(errors, step) {
	return Object.fromEntries(Object.entries(errors).filter(([name]) => stepOfField(name) !== step));
}

/**
 * Hasta dónde se puede ir: el primer paso antes de `target` que tiene errores, o `target` si
 * todos los anteriores están bien. `errorsByStep[i]` son los errores del paso i.
 *
 * @param {readonly Record<string, string>[]} errorsByStep
 * @param {number} target
 * @returns {number}
 */
export function furthestReachable(errorsByStep, target) {
	for (let s = 0; s < target; s++) {
		if (Object.keys(errorsByStep[s] ?? {}).length) return s;
	}
	return target;
}

/**
 * "A la gorra": el monto por entrada que se va a cobrar con lo que está escrito (vacío = el
 * sugerido), o `null` si no sirve. `tooHigh`: es un número válido pero el total pasa el tope
 * técnico de la orden (¿un cero de más?).
 *
 * @param {{ min: number, suggested: number } | null | undefined} gorra
 * @param {string} amount lo escrito
 * @param {number} count cantidad de entradas
 * @returns {{ value: number | null, tooHigh: boolean }}
 */
export function gorraAmountFor(gorra, amount, count) {
	if (!gorra) return { value: null, tooHigh: false };
	if (!amount.trim()) return { value: gorra.suggested, tooHigh: false };
	const n = parseAmount(amount);
	const tooHigh = n !== null && exceedsOrderMax(n, count);
	return { value: n !== null && n >= gorra.min && !tooHigh ? n : null, tooHigh };
}

/**
 * Mensaje de un monto a la gorra que no sirve (el mismo que se ve mientras se escribe).
 *
 * @param {{ min: number }} gorra
 * @param {boolean} tooHigh
 */
export function gorraAmountError(gorra, tooHigh) {
	return tooHigh
		? ORDER_MAX_MESSAGE
		: `Escribí un monto en pesos (sin centavos), desde ${formatARS(gorra.min)}.`;
}

/**
 * Errores del paso «Entradas»: tipo elegido (y a la venta), cantidad y monto a la gorra.
 *
 * @param {{
 *   type: { available: number, closed: boolean, gorra?: { min: number, suggested: number } | null } | null | undefined,
 *   count: number,
 *   maxQuantity: number,
 *   amount: string
 * }} input
 * @returns {Record<string, string>}
 */
export function ticketsStepErrors({ type, count, maxQuantity, amount }) {
	/** @type {Record<string, string>} */
	const errors = {};
	if (!type || type.available === 0 || type.closed) {
		errors.type = 'Elegí un tipo de entrada.';
		return errors;
	}
	if (!Number.isInteger(count) || count < 1 || count > maxQuantity) {
		errors.quantity = 'Elegí cuántas entradas querés.';
	}
	if (type.gorra) {
		const g = gorraAmountFor(type.gorra, amount, count);
		if (g.value === null) errors.amount = gorraAmountError(type.gorra, g.tooHigh);
	}
	return errors;
}

/**
 * Errores del paso «Tus datos»: quien compra, cada entrada y las preguntas de inscripción que
 * aplican al tipo elegido (las mismas funciones que usa el servidor).
 *
 * @param {{
 *   buyer: { name: string, pronouns: string, email: string, dni: string },
 *   holders: readonly { name: string, pronouns: string }[],
 *   count: number,
 *   fields: readonly import('./signupFields.js').SignupField[],
 *   typeId: string,
 *   answers: Record<string, unknown>
 * }} input
 * @returns {Record<string, string>}
 */
export function buyerStepErrors({ buyer, holders, count, fields, typeId, answers }) {
	const b = validateBuyer(buyer);
	/** @type {Record<string, string>} */
	const errors = b.ok ? {} : { ...b.errors };
	Object.assign(errors, validateHolders(buyer, holders, count).errors);
	if (fields.length) {
		const a = validateAnswers(fields, answers, { typeId, quantity: count });
		if (!a.ok) Object.assign(errors, a.errors);
	}
	return errors;
}

/**
 * Errores del paso «Pagar»: medio de pago (si hay que elegir) y la casilla de +18/condiciones.
 *
 * @param {{ method: string, methods: readonly string[], free: boolean, accept: boolean }} input
 * @returns {Record<string, string>}
 */
export function payStepErrors({ method, methods, free, accept }) {
	/** @type {Record<string, string>} */
	const errors = {};
	if (!free && methods.length > 1 && !methods.includes(method)) {
		errors.method = 'Elegí un medio de pago.';
	}
	if (!accept) {
		errors.accept = 'Tenés que confirmar que tenés 18 años o más y aceptar las condiciones.';
	}
	return errors;
}

/**
 * @typedef {{ id: string, label: string, amount?: string, note?: boolean }} SummaryLine
 * @typedef {{
 *   item: { name: string, tier: string | null } | null,
 *   countText: string,
 *   option: string | null,
 *   lines: SummaryLine[],
 *   surchargePlaceholder: string | null,
 *   total: string
 * }} PurchaseSummary
 */

/**
 * Lo que muestra el resumen de la compra, a partir del resultado de `computePrice` (no hace
 * cuentas propias, salvo el recargo "de muestra" que reserva el lugar de esa línea).
 *
 * @param {{
 *   type: { name: string, tier?: { name: string } | null } | null | undefined,
 *   count: number,
 *   prices: ReturnType<typeof import('./tickets.js').computePrice>,
 *   gorra: boolean,
 *   showOption: boolean,
 *   discountCode: string | null,
 *   free: boolean,
 *   feeBasisPoints: number,
 *   methods: readonly string[]
 * }} input
 * @returns {PurchaseSummary}
 */
export function purchaseSummary({
	type,
	count,
	prices,
	gorra,
	showOption,
	discountCode,
	free,
	feeBasisPoints,
	methods
}) {
	/** @type {SummaryLine[]} */
	const lines = [];
	if (type) {
		lines.push({
			id: 'entradas',
			label: `Entradas (${count} × ${formatARS(prices.unit)})${gorra ? ' a la gorra' : ''}`,
			amount: formatARS(prices.subtotal)
		});
		if (prices.fondo) {
			lines.push({
				id: 'fondo',
				label: `💜 Ya descontado: el Fondo KinkyVibe cubre ${formatARS(prices.fondo)}`,
				note: true
			});
		}
		if (prices.contribution) {
			lines.push({
				id: 'aporte',
				label: `💜 Incluye ${formatARS(prices.contribution)} de aporte al Fondo KinkyVibe`,
				note: true
			});
		}
		if (prices.discount) {
			lines.push({
				id: 'codigo',
				label: `Código ${discountCode ?? ''}`.trim(),
				amount: `−${formatARS(prices.discount)}`
			});
		}
		if (prices.surcharge) {
			lines.push({
				id: 'recargo',
				label: 'Recargo Mercado Pago',
				amount: `+${formatARS(prices.surcharge)}`
			});
		}
	}
	const surchargePlaceholder =
		type && !prices.surcharge && feeBasisPoints && methods.includes('mercadopago') && !free
			? `+${formatARS(mpSurcharge(prices.total, feeBasisPoints))}`
			: null;
	return {
		item: type ? { name: type.name, tier: type.tier?.name ?? null } : null,
		countText: type ? (count === 1 ? '1 entrada' : `${count} entradas`) : '',
		option: type && showOption && !gorra ? fondoOptionLabel(prices.option) : null,
		lines,
		surchargePlaceholder,
		total: formatARS(type ? prices.total : 0)
	};
}

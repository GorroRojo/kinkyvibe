/**
 * «Vender en puerta»: la cuenta a la vista, así lo que dice el tipo de entrada (precio completo)
 * y lo que se cobra (con el descuento del Fondo o con un aporte) no parecen dos precios distintos.
 */
import { formatARS } from '$lib/utils/money.js';
import { ORDER_MAX_TOTAL, fondoFor, parseAmount } from '$lib/utils/tickets.js';

/** @param {number} part @param {number} whole */
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * «$ 12.000 − 20 % fondo = $ 9.600» ('' si no hay nada que explicar: se cobra el precio completo).
 * @param {{ list: number, fondo: number, contribution: number, total: number }} p el resultado de
 *   `computePrice` (sin código de descuento ni recargo: en la puerta no hay)
 * @param {number} quantity
 */
export function doorSaleBreakdown(p, quantity = 1) {
	if (!p || (!p.fondo && !p.contribution)) return '';
	const unit = quantity > 1 ? p.list / quantity : p.list;
	const start = quantity > 1 ? `${quantity} × ${formatARS(unit)}` : formatARS(p.list);
	const parts = [start];
	if (p.fondo) parts.push(`− ${percent(p.fondo, p.list)} % fondo`);
	if (p.contribution) parts.push(`+ ${percent(p.contribution, p.list)} % aporte al fondo`);
	return `${parts.join(' ')} = ${formatARS(p.total)}`;
}

/**
 * La etiqueta de una opción de precio, marcando la que se usa si no se elige otra.
 * @param {{ id: string, label: string }} o
 * @param {string} defaultId
 */
export function doorOptionLabel(o, defaultId) {
	return o.id === defaultId ? `${o.label} (por defecto)` : o.label;
}

/** El medio de pago que el formulario trae marcado al abrir la página. */
export const DOOR_SALE_DEFAULT_METHOD = 'efectivo';

/**
 * Vacía el formulario después de una venta y vuelve a marcar el medio de pago por defecto.
 * `form.reset()` solo no alcanza: los radios con `bind:group` no tienen el atributo `checked`, así
 * que el reset los deja a los dos sin marcar y la venta siguiente falla con «Elegí cómo pagó».
 * @param {HTMLFormElement} form
 * @returns {string} el medio de pago marcado (para la variable ligada al grupo)
 */
export function resetDoorSaleForm(form) {
	form.reset();
	const radios = /** @type {NodeListOf<HTMLInputElement>} */ (
		form.querySelectorAll('input[type="radio"][name="method"]')
	);
	for (const r of radios) r.checked = r.value === DOOR_SALE_DEFAULT_METHOD;
	return DOOR_SALE_DEFAULT_METHOD;
}

/**
 * El precio por entrada que se escribió en «Vender en puerta» (pesos enteros, con `parseAmount`:
 * «12.000», «$ 12000» o «0»), o `null` si no es un entero de 0 a `ORDER_MAX_TOTAL` (el mismo tope
 * que el precio de un tipo). Lo usan la pantalla (la cuenta a la vista) y el servidor
 * (`parseDoorSale`).
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseDoorAmount(raw) {
	const n = parseAmount(raw);
	return n !== null && n <= ORDER_MAX_TOTAL ? n : null;
}

/**
 * Precio y Fondo por entrada de lo que se va a cobrar en la puerta (la cuenta a la vista): el del
 * tipo si no se cambió; si se cambió, el Fondo con el mismo porcentaje (`fondoFor`, como
 * `parseDoorPrice` en el servidor). `null` si el monto no es válido.
 * @param {{ price: number, fondo: number }} type el precio en la puerta del tipo (`doorPrice`)
 * @param {unknown} amount lo que se escribió ('' = el del tipo)
 * @param {number | null} fondoPercent
 * @returns {{ price: number, fondo: number } | null}
 */
export function doorChargedPrice(type, amount, fondoPercent) {
	if (String(amount ?? '').trim() === '') return { price: type.price, fondo: type.fondo };
	const price = parseDoorAmount(amount);
	if (price === null) return null;
	if (price === type.price) return { price, fondo: type.fondo };
	return { price, fondo: fondoFor(price, fondoPercent) };
}

/**
 * «Precio cambiado en la puerta: $ 5.000 en vez de $ 12.000» (o «sin cargo en vez de …»); '' si
 * se cobró el precio de siempre (`list` null o igual).
 * @param {{ charged: number, list: number | null | undefined }} p por entrada
 */
export function doorPriceChangeText({ charged, list }) {
	if (list === null || list === undefined || list === charged) return '';
	return `Precio cambiado en la puerta: ${charged === 0 ? 'sin cargo' : formatARS(charged)} en vez de ${formatARS(list)}`;
}

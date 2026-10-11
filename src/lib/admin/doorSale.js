/**
 * «Vender en puerta»: la cuenta a la vista, así lo que dice el tipo de entrada (precio completo)
 * y lo que se cobra (con el descuento del Fondo o con un aporte) no parecen dos precios distintos.
 */
import { formatARS } from '$lib/utils/money.js';

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

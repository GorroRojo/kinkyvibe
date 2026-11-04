/**
 * Precios con el descuento del Fondo en el editor de eventos (sección Entradas): debajo de cada
 * precio, cuánto sale con el Fondo, y el texto de «Copiar precios» para la agenda y los flyers.
 *
 * Código puro (corre en el navegador mientras se escribe y en vitest). Las cuentas son las de la
 * compra: `fondo = round(precio × porcentaje / 100)` (`fondoFor`) y el precio con el Fondo es el de
 * la opción «Con el descuento del fondo» (`unitPrice`). Ver docs/tickets.md.
 */
import { formatARS } from './money.js';
import { fondoFor, parseAmount, unitPrice } from './tickets.js';

/**
 * Un porcentaje del Fondo que vale la pena mostrar (entero de 1 a 100), o `null` (sin Fondo, 0 o
 * algo raro).
 *
 * @param {unknown} percent
 * @returns {number | null}
 */
export function shownFondoPercent(percent) {
	return typeof percent === 'number' && Number.isInteger(percent) && percent > 0 && percent <= 100
		? percent
		: null;
}

/**
 * Lo que sale una entrada de `price` con el descuento del Fondo, o `null` (sin precio o sin un
 * porcentaje para mostrar).
 *
 * @param {number | null} price
 * @param {unknown} percent
 */
export function priceWithFondo(price, percent) {
	const p = shownFondoPercent(percent);
	if (price === null || p === null) return null;
	return unitPrice(price, fondoFor(price, p), 'fondo').price;
}

/**
 * La línea chiquita debajo de un precio que se está escribiendo: «Con el Fondo (20 %): $ 11.200».
 * '' si el precio no se entiende o no hay porcentaje para mostrar.
 *
 * @param {string} raw lo que hay en el campo
 * @param {unknown} percent
 */
export function fondoPriceLine(raw, percent) {
	const withFondo = priceWithFondo(parseAmount(raw ?? ''), percent);
	return withFondo === null ? '' : `Con el Fondo (${percent} %): ${formatARS(withFondo)}`;
}

/**
 * «El descuento del Fondo hoy es 20 %: puede cambiar.» ('' sin porcentaje para mostrar).
 *
 * @param {unknown} percent
 */
export function fondoTodayLine(percent) {
	const p = shownFondoPercent(percent);
	return p === null ? '' : `El descuento del Fondo hoy es ${p} %: puede cambiar.`;
}

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/**
 * «hasta el 7/11» de un datetime-local ('' si está vacío o no se entiende).
 *
 * @param {string} until
 */
export function untilShort(until) {
	const v = (until ?? '').trim();
	return LOCAL_RE.test(v) ? `hasta el ${Number(v.slice(8, 10))}/${Number(v.slice(5, 7))}` : '';
}

/**
 * Texto para pegar en la agenda o en un flyer: una línea por tramo (o el precio fijo) y, si tiene
 * precio en puerta propio, la de la puerta.
 *
 *     Preventa 1: $ 14.000 ($ 11.200 con el Fondo) hasta el 7/11
 *     General: $ 18.000 ($ 14.400 con el Fondo)
 *     En la puerta: $ 20.000 ($ 16.000 con el Fondo)
 *
 * Sin porcentaje para mostrar, sin la parte del Fondo. '' a la gorra.
 *
 * @param {Pick<import('./ticketsEditor.js').TicketTypeForm, 'mode' | 'name' | 'price' | 'tiers'
 *   | 'doorPrice'>} t
 * @param {unknown} percent
 */
export function pricesCopyText(t, percent) {
	if (t.mode === 'gorra') return '';
	/** @param {string} raw */
	const amount = (raw) => {
		const p = parseAmount(raw ?? '');
		if (p === null) return '$ ?';
		const withFondo = priceWithFondo(p, percent);
		return withFondo === null
			? formatARS(p)
			: `${formatARS(p)} (${formatARS(withFondo)} con el Fondo)`;
	};
	const lines =
		t.mode === 'tiers'
			? t.tiers.map((tr, j) =>
					[`${tr.name.trim() || `Tramo ${j + 1}`}: ${amount(tr.price)}`, untilShort(tr.until)]
						.filter(Boolean)
						.join(' ')
				)
			: [`${t.name.trim() || 'Entrada'}: ${amount(t.price)}`];
	if ((t.doorPrice ?? '').trim()) lines.push(`En la puerta: ${amount(t.doorPrice)}`);
	return lines.join('\n');
}

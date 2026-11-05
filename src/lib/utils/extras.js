/**
 * Extras de la compra de entradas (docs/tickets.md, «Extras»; decisión 0056): cosas que se suman a
 * las entradas en la misma compra (tragos, una remera…) y se canjean en la puerta o en la barra.
 * Prototipo detrás del interruptor `extras` (apagado: nada de esto se ve ni se cobra).
 *
 * Código puro: lo usan el editor de eventos (en el navegador), la página de compra, el servidor
 * (precio y cupo) y vitest.
 *
 * En el evento (junto con `tickets`):
 *
 * ```yaml
 * extras:
 *   - id: trago # minúsculas, números, - o _ (va en las órdenes: no cambiarlo después de vender)
 *     name: Trago
 *     price: 3000 # pesos, entero > 0
 *     description: Con o sin alcohol, en la barra # opcional, corta
 *     capacity: 100 # opcional: tope total (aprobadas + reservas vigentes)
 *     per_order: 4 # opcional: máximo por compra (si falta, EXTRA_HARD_MAX)
 * ```
 *
 * Reglas de plata: el Fondo y los códigos de descuento son **solo** de las entradas; los extras se
 * cobran a precio de lista. El recargo de Mercado Pago sí es sobre todo lo que se paga por MP
 * (`computePrice` en ./tickets.js).
 */
import { formatARS } from './money.js';

/** La clave del evento. */
export const EXTRAS_KEY = 'extras';

/** Mismo formato que el id de un tipo de entrada. */
export const EXTRA_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Cuántos extras puede tener un evento. */
export const EXTRAS_MAX = 10;

/** Largo máximo del nombre y de la descripción. */
export const EXTRA_NAME_MAX = 40;
export const EXTRA_DESCRIPTION_MAX = 120;

/** Tope técnico por compra de cada extra (cuando no tiene «máximo por compra», o es más alto). */
export const EXTRA_HARD_MAX = 20;

/** Tope del precio de un extra (el mismo que el de una entrada). */
export const EXTRA_PRICE_MAX = 100_000_000;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   price: number,
 *   description: string,
 *   capacity: number | null,
 *   perOrder: number | null
 * }} Extra
 */

/**
 * Lo que se lleva de un extra en una compra (o en una orden ya hecha).
 *
 * @typedef {{ id: string, name: string, price: number, quantity: number }} ExtraLine
 */

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

/**
 * Entero opcional desde `min` (vacío = `null`), o `undefined` si no es válido.
 *
 * @param {unknown} raw
 * @param {number} min
 */
function optionalInt(raw, min) {
	if (blank(raw)) return null;
	const n = Number(typeof raw === 'string' ? raw.trim() : raw);
	return Number.isSafeInteger(n) && n >= min ? n : undefined;
}

/**
 * Valida y normaliza `extras` del evento. Devuelve los extras y, si algo está mal, los errores (en
 * castellano, para el editor). Sin la clave: ninguno.
 *
 * @param {unknown} raw
 * @returns {{ extras: Extra[], errors: string[] }}
 */
export function parseExtras(raw) {
	if (raw === undefined || raw === null) return { extras: [], errors: [] };
	if (!Array.isArray(raw)) return { extras: [], errors: ['`extras` tiene que ser una lista.'] };
	/** @type {string[]} */
	const errors = [];
	/** @type {Extra[]} */
	const extras = [];
	/** @type {Set<string>} */
	const seen = new Set();
	if (raw.length > EXTRAS_MAX) errors.push(`Como mucho ${EXTRAS_MAX} extras por evento.`);
	raw.forEach((item, i) => {
		const r = /** @type {Record<string, unknown>} */ (item && typeof item === 'object' ? item : {});
		const name = typeof r.name === 'string' ? r.name.trim() : '';
		const label = `Extra ${i + 1}${name ? ` («${name}»)` : ''}`;
		const id = String(r.id ?? '');
		const before = errors.length;
		if (!EXTRA_ID_RE.test(id)) errors.push(`${label}: el id «${id}» no es válido.`);
		else if (seen.has(id)) errors.push(`${label}: el id «${id}» está repetido.`);
		seen.add(id);
		if (!name) errors.push(`${label}: falta el nombre.`);
		else if (name.length > EXTRA_NAME_MAX)
			errors.push(`${label}: el nombre es muy largo (hasta ${EXTRA_NAME_MAX}).`);
		const price = Number(r.price);
		if (!Number.isSafeInteger(price) || price <= 0 || price > EXTRA_PRICE_MAX)
			errors.push(`${label}: el precio tiene que ser un entero de pesos mayor a 0.`);
		const description = typeof r.description === 'string' ? r.description.trim() : '';
		if (description.length > EXTRA_DESCRIPTION_MAX)
			errors.push(`${label}: la descripción es muy larga (hasta ${EXTRA_DESCRIPTION_MAX}).`);
		const capacity = optionalInt(r.capacity, 0);
		if (capacity === undefined) errors.push(`${label}: el tope tiene que ser un entero o vacío.`);
		const perOrder = optionalInt(r.per_order, 1);
		if (perOrder === undefined)
			errors.push(`${label}: el máximo por compra tiene que ser un entero desde 1 o vacío.`);
		if (errors.length > before) return;
		extras.push({
			id,
			name,
			price,
			description,
			capacity: /** @type {number | null} */ (capacity),
			perOrder: /** @type {number | null} */ (perOrder)
		});
	});
	return { extras: errors.length ? [] : extras, errors };
}

/**
 * Cuántos se pueden llevar en una compra: el máximo por compra (o el tope técnico) y, con tope,
 * lo que queda.
 *
 * @param {Pick<Extra, 'capacity' | 'perOrder'>} extra
 * @param {number} taken aprobadas + reservas vigentes
 */
export function extraAvailable(extra, taken) {
	const perOrder = Math.min(extra.perOrder ?? EXTRA_HARD_MAX, EXTRA_HARD_MAX);
	if (extra.capacity === null) return perOrder;
	return Math.max(0, Math.min(perOrder, extra.capacity - taken));
}

/**
 * Las cantidades elegidas en un formulario (`extra_<id>`): enteros desde 0. Lo que no es un número
 * queda como está, para que la validación lo diga.
 *
 * @param {Pick<Extra, 'id'>[]} extras
 * @param {(name: string) => unknown} get
 * @returns {Record<string, string>}
 */
export function readExtrasChoice(extras, get) {
	/** @type {Record<string, string>} */
	const out = {};
	for (const e of extras) {
		const v = get(`extra_${e.id}`);
		out[e.id] = String(v ?? '')
			.trim()
			.slice(0, 6);
	}
	return out;
}

/**
 * Valida lo elegido: enteros de 0 al máximo por compra (y, con `available`, a lo que queda). Los
 * errores van con la clave del campo (`extra_<id>`).
 *
 * @param {Extra[]} extras
 * @param {Record<string, string | number>} choice
 * @param {{ available?: Record<string, number> }} [opts]
 * @returns {{ ok: true, lines: ExtraLine[] } | { ok: false, errors: Record<string, string> }}
 */
export function validateExtrasChoice(extras, choice, { available } = {}) {
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {ExtraLine[]} */
	const lines = [];
	for (const e of extras) {
		const raw = choice[e.id];
		if (raw === undefined || raw === '' || raw === 0 || raw === '0') continue;
		const n = Number(raw);
		const max = Math.min(e.perOrder ?? EXTRA_HARD_MAX, EXTRA_HARD_MAX);
		if (!Number.isSafeInteger(n) || n < 0) {
			errors[`extra_${e.id}`] = `La cantidad de «${e.name}» tiene que ser un número entero.`;
			continue;
		}
		if (n > max) {
			errors[`extra_${e.id}`] = `Podés llevar hasta ${max} de «${e.name}» por compra.`;
			continue;
		}
		const left = available?.[e.id];
		if (left !== undefined && n > left) {
			errors[`extra_${e.id}`] = extrasLeftMessage(e.name, left);
			continue;
		}
		if (n > 0) lines.push({ id: e.id, name: e.name, price: e.price, quantity: n });
	}
	for (const id of Object.keys(choice)) {
		if (!extras.some((e) => e.id === id) && Number(choice[id]) > 0)
			errors[`extra_${id}`] = 'Ese extra ya no está a la venta.';
	}
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, lines };
}

/**
 * «Quedan 2 de «Trago».» / «Se agotó «Trago».»
 *
 * @param {string} name
 * @param {number} left
 */
export function extrasLeftMessage(name, left) {
	return left > 0 ? `Quedan ${left} de «${name}».` : `Se agotó «${name}».`;
}

/**
 * Lo que suman los extras (pesos).
 *
 * @param {Pick<ExtraLine, 'price' | 'quantity'>[]} lines
 */
export function extrasAmount(lines) {
	return lines.reduce((s, l) => s + l.price * l.quantity, 0);
}

/**
 * «2 × Trago».
 *
 * @param {Pick<ExtraLine, 'name' | 'quantity'>} line
 */
export function extraLineText(line) {
	return `${line.quantity} × ${line.name}`;
}

/**
 * «+ 2 × Trago, 1 × Remera» (vacío sin extras).
 *
 * @param {Pick<ExtraLine, 'name' | 'quantity'>[]} lines
 */
export function extrasShortText(lines) {
	return lines.length ? `+ ${lines.map(extraLineText).join(', ')}` : '';
}

/**
 * «2 × Trago · 0 entregados» (canje en la puerta o la barra).
 *
 * @param {{ name: string, quantity: number, delivered: number }} line
 */
export function extraDeliveryText(line) {
	return `${extraLineText(line)} · ${line.delivered} ${line.delivered === 1 ? 'entregado' : 'entregados'}`;
}

/**
 * «Trago: vendidos 34 · entregados 12» (resumen de la barra).
 *
 * @param {{ name: string, sold: number, delivered: number }} row
 */
export function extraSummaryText(row) {
	return `${row.name}: vendidos ${row.sold} · entregados ${row.delivered}`;
}

/**
 * Lo que se pagó en total por una orden: las entradas (`total`, con el recargo de MP de todo) más
 * los extras (`extras_amount`, migración 0077; sin la columna, 0).
 *
 * @param {{ total: number, extras_amount?: number | null }} order
 */
export function orderPaid(order) {
	return Number(order.total) + Number(order.extras_amount ?? 0);
}

/**
 * Precio del extra para mostrar: «$ 3.000».
 *
 * @param {Pick<Extra, 'price'>} extra
 */
export function extraPriceText(extra) {
	return formatARS(extra.price);
}

/**
 * Las dos celdas de `ordenes.csv` con el interruptor `extras`: `extras` («2 × Trago, 1 × Remera»,
 * con lo entregado si hay) y `monto_extras` (solo en la fila de la entrada 1, como los demás
 * montos, para poder sumar la columna sin contar dos veces).
 *
 * @param {{ name: string, quantity: number, price: number, delivered?: number }[]} extras
 * @param {{ first: boolean }} opts
 * @returns {[string, number | '']}
 */
export function extrasCsvCells(extras, { first }) {
	const text = extras
		.map(
			(e) =>
				`${extraLineText(e)}${e.delivered ? ` (${e.delivered} ${e.delivered === 1 ? 'entregado' : 'entregados'})` : ''}`
		)
		.join(', ');
	return [text, first && extras.length ? extrasAmount(extras) : first ? 0 : ''];
}

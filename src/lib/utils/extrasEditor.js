/**
 * «Extras» en la sección Entradas del editor de eventos (decisión 0056; interruptor `extras`):
 * leer `extras` del evento a un estado de formulario, validarlo con las reglas de la venta
 * (`parseExtras` de ./extras.js) y volver a escribirlo. Código puro (navegador, servidor y vitest).
 * Lo usa ticketsEditor.js; sin extras en el formulario ni en el archivo, no escribe nada.
 */
import { EXTRAS_MAX, parseExtras } from './extras.js';
import { parseAmount } from './tickets.js';

/**
 * Un extra en el formulario. Como los tipos de entrada, el `id` sale del nombre al crearlo y no
 * cambia nunca (las órdenes lo guardan).
 *
 * @typedef {object} ExtraForm
 * @prop {string} key identificador local (para el `{#each}`), no se guarda
 * @prop {string | null} origId el `id` que ya tenía en el archivo (`null` = nuevo)
 * @prop {string} name
 * @prop {string} price
 * @prop {string} description
 * @prop {string} capacity '' = sin tope
 * @prop {string} perOrder '' = sin máximo propio (el tope técnico)
 */

const keyPrefix = `x${Math.random().toString(36).slice(2, 8)}-`;
let keyCounter = 0;
const newKey = () => `${keyPrefix}${++keyCounter}`;

/** @param {unknown} v */
const str = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * Los extras del archivo como formulario (tolera datos raros: la validación dice qué está mal).
 *
 * @param {unknown} raw
 * @returns {ExtraForm[]}
 */
export function readExtrasForm(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((r) => ({
		key: newKey(),
		origId: str(r?.id) || null,
		name: str(r?.name),
		price: str(r?.price),
		description: str(r?.description),
		capacity: str(r?.capacity),
		perOrder: str(r?.per_order)
	}));
}

/** Un extra vacío (nuevo). @returns {ExtraForm} */
export function emptyExtra() {
	return {
		key: newKey(),
		origId: null,
		name: '',
		price: '',
		description: '',
		capacity: '',
		perOrder: ''
	};
}

/**
 * Nombre → id para un extra nuevo («Trago con alcohol» → «trago-con-alcohol»), sin repetir.
 *
 * @param {string} name
 * @param {Set<string>} taken
 */
function extraIdFor(name, taken) {
	let base =
		String(name ?? '')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 36)
			.replace(/-+$/, '') || 'extra';
	if (!/^[a-z0-9]/.test(base)) base = `x-${base}`;
	if (!taken.has(base)) return base;
	for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Los extras como se guardan en el evento (`[]` sin extras). Los nuevos reciben su id del nombre;
 * los que ya existían no cambian de id. Tolera borradores viejos (sin el campo).
 *
 * @param {ExtraForm[] | undefined} list
 * @returns {Record<string, string | number>[]}
 */
export function formExtras(list) {
	const items = list ?? [];
	const taken = new Set(items.filter((e) => e.origId).map((e) => /** @type {string} */ (e.origId)));
	return items.map((e) => {
		const id = e.origId ?? extraIdFor(e.name, taken);
		taken.add(id);
		/** @type {Record<string, string | number>} */
		const out = { id, name: e.name.trim() };
		const price = parseAmount(e.price.trim());
		out.price = price === null ? e.price.trim() : price;
		if (e.description.trim()) out.description = e.description.trim();
		if (e.capacity.trim()) out.capacity = Number(e.capacity.trim());
		if (e.perOrder.trim()) out.per_order = Number(e.perOrder.trim());
		return out;
	});
}

/**
 * Los errores de los extras del formulario (las mismas reglas que la venta).
 *
 * @param {ExtraForm[] | undefined} list
 * @returns {string[]}
 */
export function extrasFormErrors(list) {
	if (!list?.length) return [];
	const errors = [];
	if (list.length > EXTRAS_MAX) errors.push(`Como mucho ${EXTRAS_MAX} extras por evento.`);
	const items = formExtras(list);
	items.forEach((e, i) => {
		if (typeof e.price === 'string' && e.price !== '')
			errors.push(`Extra ${i + 1}: el precio tiene que ser un número entero de pesos.`);
	});
	return [...errors, ...parseExtras(items).errors];
}

/**
 * Resumen corto para la revisión: « · Extras: Trago $ 3.000 (tope 100)».
 *
 * @param {ExtraForm[] | undefined} list
 * @param {(n: number) => string} formatARS
 */
export function describeExtras(list, formatARS) {
	if (!list?.length) return '';
	const parts = list.map((e) => {
		const p = parseAmount(e.price.trim());
		const cap = e.capacity.trim() ? ` (tope ${e.capacity.trim()})` : '';
		return `${e.name.trim() || '?'} ${p === null ? '?' : formatARS(p)}${cap}`;
	});
	return ` · Extras: ${parts.join(', ')}`;
}

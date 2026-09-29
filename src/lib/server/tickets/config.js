/**
 * Configuración de venta de entradas de un evento, leída del frontmatter del markdown.
 *
 * Es la ÚNICA fuente de verdad de precios y cupos: el formulario de compra solo manda el id del
 * tipo de entrada y la cantidad, nunca un precio.
 *
 * ```yaml
 * tickets:
 *   - id: general
 *     name: General
 *     price: 8000        # ARS, entero
 *     capacity: 40
 * tickets_close: 2026-10-16T18:00-03:00   # opcional; si falta, cierra al empezar el evento
 * ```
 */

/** @typedef {{ id: string, name: string, price: number, capacity: number }} TicketType */
/**
 * @typedef {{
 *   types: TicketType[],
 *   closesAt: number | null,
 *   status: string | undefined,
 *   title: string,
 *   start: string | undefined,
 *   location: string | undefined,
 *   location_name: string | undefined
 * }} EventTickets
 */

export { formatARS } from '$lib/utils/money.js';

export const MAX_PER_ORDER = 4;
const TYPE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Convierte una fecha del frontmatter (string ISO o Date de YAML) a milisegundos.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function toTime(value) {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
	if (typeof value !== 'string' || !value.trim()) return null;
	const t = new Date(value).getTime();
	return Number.isNaN(t) ? null : t;
}

/**
 * Valida y normaliza `tickets` del frontmatter. Devuelve `null` si el evento no vende entradas.
 * Tira un error descriptivo si la configuración está mal (mejor que vender con un precio raro).
 *
 * @param {Record<string, any> | undefined} meta
 * @returns {EventTickets | null}
 */
export function parseTicketConfig(meta) {
	if (!meta || meta.tickets === undefined || meta.tickets === null) return null;
	if (!Array.isArray(meta.tickets) || meta.tickets.length === 0) {
		throw new TypeError('`tickets` tiene que ser una lista con al menos un tipo de entrada');
	}
	/** @type {TicketType[]} */
	const types = [];
	for (const raw of meta.tickets) {
		const id = String(raw?.id ?? '');
		if (!TYPE_ID_RE.test(id)) throw new TypeError(`Id de entrada inválido: "${id}"`);
		if (types.some((t) => t.id === id)) throw new TypeError(`Id de entrada repetido: "${id}"`);
		const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id;
		const price = Number(raw.price);
		if (!Number.isSafeInteger(price) || price <= 0) {
			throw new TypeError(`Precio inválido para "${id}": tiene que ser un entero mayor a 0`);
		}
		const capacity = Number(raw.capacity);
		if (!Number.isSafeInteger(capacity) || capacity < 0) {
			throw new TypeError(`Cupo inválido para "${id}": tiene que ser un entero`);
		}
		types.push({ id, name, price, capacity });
	}
	const closesAt = toTime(meta.tickets_close) ?? toTime(meta.start);
	return {
		types,
		closesAt,
		status: meta.status,
		title: String(meta.title ?? ''),
		start: meta.start instanceof Date ? meta.start.toISOString() : meta.start,
		location: meta.location,
		location_name: meta.location_name
	};
}

/**
 * ¿Se pueden comprar entradas ahora? Devuelve el motivo si no.
 *
 * @param {EventTickets} config
 * @param {number} [now]
 * @returns {{ open: true } | { open: false, reason: 'cancelled' | 'soldout' | 'closed' }}
 */
export function salesState(config, now = Date.now()) {
	if (config.status === 'cancelado') return { open: false, reason: 'cancelled' };
	if (config.status === 'agotadas') return { open: false, reason: 'soldout' };
	if (config.closesAt !== null && now >= config.closesAt) return { open: false, reason: 'closed' };
	return { open: true };
}

/**
 * Valida lo que manda el formulario de compra. Los precios salen de `config`, no del form.
 *
 * @param {EventTickets} config
 * @param {{ type: unknown, quantity: unknown, name: unknown, email: unknown, accept: unknown }} input
 * @returns {{ ok: true, type: TicketType, quantity: number, name: string, email: string, total: number }
 *   | { ok: false, errors: Record<string, string> }}
 */
export function validatePurchase(config, input) {
	/** @type {Record<string, string>} */
	const errors = {};
	const type = config.types.find((t) => t.id === input.type);
	if (!type) errors.type = 'Elegí un tipo de entrada.';
	const quantity = Number(input.quantity);
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_ORDER) {
		errors.quantity = `Podés comprar entre 1 y ${MAX_PER_ORDER} entradas por compra.`;
	}
	const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
	if (name.length < 2 || name.length > 80) errors.name = 'Poné tu nombre (entre 2 y 80 letras).';
	const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
	if (email.length > 254 || !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(email)) {
		errors.email = 'Revisá el email: ahí te mandamos las entradas.';
	}
	if (input.accept !== 'on' && input.accept !== '1') {
		errors.accept = 'Tenés que confirmar que tenés 18 años o más y aceptar las condiciones.';
	}
	if (Object.keys(errors).length || !type) return { ok: false, errors };
	return { ok: true, type, quantity, name, email, total: type.price * quantity };
}

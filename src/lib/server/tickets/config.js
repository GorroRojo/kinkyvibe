/**
 * Configuración de venta de entradas de un evento, leída del frontmatter del markdown.
 *
 * Es la ÚNICA fuente de verdad de precios y cupos: el formulario de compra solo manda el id del
 * tipo de entrada y la cantidad, nunca un precio.
 *
 * ```yaml
 * fondo_percent: 20      # opcional: % del precio que cubre el Fondo KinkyVibe en TODOS los tipos
 * tickets:
 *   - id: general
 *     name: General
 *     price: 10000       # ARS, entero: precio completo de la entrada
 *     fondo: 2000        # opcional: $ que cubre el fondo en este tipo (pisa fondo_percent)
 *     capacity: 40
 * tickets_close: 2026-10-16T18:00-03:00   # opcional; si falta, cierra al empezar el evento
 * payment_methods: [mercadopago, transferencia]   # opcional; por defecto solo mercadopago
 * mp_fee_percent: 7.73   # opcional; si falta se usa TICKETS_MP_FEE_PERCENT
 * ```
 */

/** @typedef {{ id: string, name: string, price: number, fondo: number, capacity: number }} TicketType */
/** @typedef {'mercadopago' | 'transferencia'} PaymentMethod */
/** @typedef {{ name: string, pronouns: string }} Holder */
/** @typedef {{ name: string, email: string, dni: string }} Buyer */
/**
 * @typedef {{
 *   types: TicketType[],
 *   fondoPercent: number | null,
 *   paymentMethods: PaymentMethod[],
 *   mpFeeBasisPoints: number | null,
 *   closesAt: number | null,
 *   status: string | undefined,
 *   title: string,
 *   start: string | undefined,
 *   location: string | undefined,
 *   location_name: string | undefined
 * }} EventTickets
 */

import {
	MAX_TICKETS_PER_FORM,
	PAYMENT_METHODS,
	defaultFondoOption,
	isFondoOption,
	normalizeDni,
	parseFeePercent
} from '$lib/utils/tickets.js';

export { formatARS } from '$lib/utils/money.js';
export { MAX_TICKETS_PER_FORM };
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
	let fondoPercent = null;
	if (meta.fondo_percent !== undefined && meta.fondo_percent !== null) {
		fondoPercent = Number(meta.fondo_percent);
		if (!Number.isInteger(fondoPercent) || fondoPercent < 0 || fondoPercent > 100) {
			throw new TypeError('`fondo_percent` tiene que ser un entero entre 0 y 100');
		}
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
		// El `fondo` del tipo (en pesos) pisa el `fondo_percent` del evento.
		const fondo =
			raw.fondo !== undefined && raw.fondo !== null
				? Number(raw.fondo)
				: fondoPercent !== null
					? Math.round((price * fondoPercent) / 100)
					: 0;
		if (!Number.isSafeInteger(fondo) || fondo < 0 || fondo > price) {
			throw new TypeError(
				`Fondo inválido para "${id}": tiene que ser un entero entre 0 y el precio`
			);
		}
		types.push({ id, name, price, fondo, capacity });
	}
	/** @type {PaymentMethod[]} */
	let paymentMethods = ['mercadopago'];
	if (meta.payment_methods !== undefined && meta.payment_methods !== null) {
		const list = Array.isArray(meta.payment_methods)
			? meta.payment_methods
			: [meta.payment_methods];
		paymentMethods = [];
		for (const raw of list) {
			const m = String(raw).trim().toLowerCase();
			if (!(/** @type {readonly string[]} */ (PAYMENT_METHODS).includes(m))) {
				throw new TypeError(
					`Medio de pago desconocido: "${m}" (se puede usar ${PAYMENT_METHODS.join(', ')})`
				);
			}
			const method = /** @type {PaymentMethod} */ (m);
			if (!paymentMethods.includes(method)) paymentMethods.push(method);
		}
		if (!paymentMethods.length) throw new TypeError('`payment_methods` no puede estar vacío');
	}
	let mpFeeBasisPoints = null;
	if (meta.mp_fee_percent !== undefined && meta.mp_fee_percent !== null) {
		mpFeeBasisPoints = parseFeePercent(meta.mp_fee_percent);
		if (mpFeeBasisPoints === null) {
			throw new TypeError('`mp_fee_percent` tiene que ser un porcentaje entre 0 y 49,99');
		}
	}
	const closesAt = toTime(meta.tickets_close) ?? toTime(meta.start);
	return {
		types,
		fondoPercent,
		paymentMethods,
		mpFeeBasisPoints,
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

/** @param {unknown} raw */
function cleanText(raw) {
	return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Valida los datos de una persona (una entrada): son para el evento.
 *
 * - nombre: como se conoce a la persona (no hace falta que sea el del documento), 2 a 80 letras;
 * - pronombres: obligatorios, hasta 40 letras (texto libre: "ella", "elle / él", "cualquiera"…).
 *
 * @param {{ name?: unknown, pronouns?: unknown }} raw
 * @returns {{ ok: true, holder: Holder } | { ok: false, errors: { name?: string, pronouns?: string } }}
 */
export function validateHolder(raw) {
	/** @type {{ name?: string, pronouns?: string }} */
	const errors = {};
	const name = cleanText(raw.name);
	if (name.length < 2 || name.length > 80) errors.name = 'Poné un nombre (entre 2 y 80 letras).';
	const pronouns = cleanText(raw.pronouns);
	if (!pronouns) errors.pronouns = 'Poné los pronombres de esta persona.';
	else if (pronouns.length > 40) errors.pronouns = 'Hasta 40 letras.';
	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, holder: { name, pronouns } };
}

/**
 * Valida los datos administrativos de quien compra (uno por compra): nombre, email y DNI
 * (7 a 9 dígitos, se aceptan puntos; se guarda solo con dígitos).
 *
 * @param {{ name?: unknown, email?: unknown, dni?: unknown }} raw
 * @returns {{ ok: true, buyer: Buyer } | { ok: false, errors: { name?: string, email?: string, dni?: string } }}
 */
export function validateBuyer(raw) {
	/** @type {{ name?: string, email?: string, dni?: string }} */
	const errors = {};
	const name = cleanText(raw.name);
	if (name.length < 2 || name.length > 80) errors.name = 'Poné tu nombre (entre 2 y 80 letras).';
	const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
	if (email.length > 254 || !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(email)) {
		errors.email = 'Revisá el email: ahí te mandamos las entradas.';
	}
	const dni = normalizeDni(raw.dni);
	if (!dni) errors.dni = 'Revisá el DNI: tiene que tener entre 7 y 9 números.';
	if (Object.keys(errors).length || !dni) return { ok: false, errors };
	return { ok: true, buyer: { name, email, dni } };
}

/**
 * Valida lo que manda el formulario de compra. Los precios salen de `config`, no del form.
 *
 * Errores: `name`, `email`, `dni` (quien compra) y `holder_<campo>_<n>` (n desde 0) por entrada,
 * igual que los `name` del formulario. Si el nombre de la entrada 1 viene vacío se usa el de
 * quien compra (así funciona también sin JavaScript).
 *
 * @param {EventTickets} config
 * @param {{
 *   type: unknown, quantity: unknown, accept: unknown,
 *   buyer: { name?: unknown, email?: unknown, dni?: unknown },
 *   holders: { name?: unknown, pronouns?: unknown }[],
 *   method?: unknown,
 *   option?: unknown
 * }} input
 * @returns {{ ok: true, type: TicketType, quantity: number, buyer: Buyer, holders: Holder[],
 *     method: PaymentMethod, option: import('$lib/utils/tickets.js').FondoOption }
 *   | { ok: false, errors: Record<string, string> }}
 */
export function validatePurchase(config, input) {
	/** @type {Record<string, string>} */
	const errors = {};
	const type = config.types.find((t) => t.id === input.type);
	if (!type) errors.type = 'Elegí un tipo de entrada.';
	const quantity = Number(input.quantity);
	if (!Number.isInteger(quantity) || quantity < 1) {
		errors.quantity = 'Elegí cuántas entradas querés.';
	} else if (quantity > MAX_TICKETS_PER_FORM) {
		errors.quantity = `Para más de ${MAX_TICKETS_PER_FORM} entradas escribinos.`;
	}
	const b = validateBuyer(input.buyer);
	if (!b.ok) Object.assign(errors, b.errors);
	/** @type {Holder[]} */
	const holders = [];
	if (!errors.quantity) {
		for (let i = 0; i < quantity; i++) {
			const raw = input.holders[i] ?? {};
			const name = i === 0 && !cleanText(raw.name) ? input.buyer.name : raw.name;
			const r = validateHolder({ ...raw, name });
			if (r.ok) holders.push(r.holder);
			else for (const [k, v] of Object.entries(r.errors)) errors[`holder_${k}_${i}`] = v;
		}
	}
	const method =
		input.method === undefined || input.method === '' ? config.paymentMethods[0] : input.method;
	if (!config.paymentMethods.includes(/** @type {PaymentMethod} */ (method))) {
		errors.method = 'Elegí un medio de pago.';
	}
	// Opción del fondo: vacía = la de por defecto. "Con el descuento del fondo" en un tipo sin
	// fondo es lo mismo que precio completo, y se guarda así.
	let option = input.option === undefined || input.option === '' ? null : input.option;
	if (option !== null && !isFondoOption(option)) {
		errors.option = 'Elegí cómo querés pagar tu entrada.';
		option = null;
	}
	if (type && (option === null || (option === 'fondo' && !type.fondo))) {
		option = defaultFondoOption(type.fondo);
	}
	if (input.accept !== 'on' && input.accept !== '1') {
		errors.accept = 'Tenés que confirmar que tenés 18 años o más y aceptar las condiciones.';
	}
	if (Object.keys(errors).length || !type || !b.ok) return { ok: false, errors };
	return {
		ok: true,
		type,
		quantity,
		buyer: b.buyer,
		holders,
		method: /** @type {PaymentMethod} */ (method),
		option: /** @type {import('$lib/utils/tickets.js').FondoOption} */ (option)
	};
}

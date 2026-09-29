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
 *   - id: gorra
 *     name: A la gorra
 *     a_la_gorra: { minimo: 0, sugerido: 5000 }   # en lugar de `price`: la persona elige el monto
 *     capacity: 200
 * modalidad: online      # opcional: online | presencial (si falta: online si tiene la etiqueta
 *                        # "Online" y no tiene `location`). Online = link en lugar de QR.
 * tickets_close: 2026-10-16T18:00-03:00   # opcional; si falta, cierra al empezar el evento
 * payment_methods: [mercadopago, transferencia]   # opcional; por defecto solo mercadopago
 * mp_fee_percent: 2      # opcional; si falta: /admin/entradas/ajustes, TICKETS_MP_FEE_PERCENT o 2 %
 * ```
 */

/**
 * Tipo de entrada. En los tipos "a la gorra" `gorra` tiene el mínimo y el sugerido, `price` es el
 * sugerido (solo para mostrar) y `fondo` es 0: el monto lo elige la persona al comprar.
 *
 * @typedef {{ id: string, name: string, price: number, fondo: number, capacity: number,
 *   gorra: { min: number, suggested: number } | null }} TicketType
 */
/** @typedef {'mercadopago' | 'transferencia'} PaymentMethod */
/** @typedef {{ name: string, pronouns: string }} Holder */
/** @typedef {{ name: string, pronouns: string, email: string, dni: string }} Buyer */
/**
 * @typedef {{
 *   types: TicketType[],
 *   fondoPercent: number | null,
 *   fondoPercentSource: 'frontmatter' | 'auto' | null,
 *   paymentMethods: PaymentMethod[],
 *   mpFeeBasisPoints: number | null,
 *   closesAt: number | null,
 *   online: boolean,
 *   reminders: boolean,
 *   status: string | undefined,
 *   title: string,
 *   start: string | undefined,
 *   location: string | undefined,
 *   location_name: string | undefined
 * }} EventTickets
 */

import {
	GORRA_MAX_AMOUNT,
	MAX_TICKETS_PER_FORM,
	PAYMENT_METHODS,
	defaultFondoOption,
	isFondoOption,
	normalizeDni,
	parseAmount,
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
 * `options.fondoPercent` es el porcentaje automático del Fondo KinkyVibe (ver fondo.js): se usa
 * si el evento no fija `fondo_percent` (ni el tipo su `fondo`). Sin él, sin fondo.
 *
 * @param {Record<string, any> | undefined} meta
 * @param {{ fondoPercent?: number | null }} [options]
 * @returns {EventTickets | null}
 */
export function parseTicketConfig(meta, options = {}) {
	if (!meta || meta.tickets === undefined || meta.tickets === null) return null;
	if (!Array.isArray(meta.tickets) || meta.tickets.length === 0) {
		throw new TypeError('`tickets` tiene que ser una lista con al menos un tipo de entrada');
	}
	/** @type {number | null} */
	let fondoPercent = null;
	/** @type {'frontmatter' | 'auto' | null} */
	let fondoPercentSource = null;
	if (meta.fondo_percent !== undefined && meta.fondo_percent !== null) {
		fondoPercent = Number(meta.fondo_percent);
		if (!Number.isInteger(fondoPercent) || fondoPercent < 0 || fondoPercent > 100) {
			throw new TypeError('`fondo_percent` tiene que ser un entero entre 0 y 100');
		}
		fondoPercentSource = 'frontmatter';
	} else if (
		options.fondoPercent !== undefined &&
		options.fondoPercent !== null &&
		Number.isInteger(options.fondoPercent) &&
		options.fondoPercent >= 0 &&
		options.fondoPercent <= 100
	) {
		fondoPercent = options.fondoPercent;
		fondoPercentSource = 'auto';
	}
	/** @type {TicketType[]} */
	const types = [];
	for (const raw of meta.tickets) {
		const id = String(raw?.id ?? '');
		if (!TYPE_ID_RE.test(id)) throw new TypeError(`Id de entrada inválido: "${id}"`);
		if (types.some((t) => t.id === id)) throw new TypeError(`Id de entrada repetido: "${id}"`);
		const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id;
		const capacity = Number(raw.capacity);
		if (!Number.isSafeInteger(capacity) || capacity < 0) {
			throw new TypeError(`Cupo inválido para "${id}": tiene que ser un entero`);
		}
		if (raw.a_la_gorra !== undefined && raw.a_la_gorra !== null) {
			if (raw.price !== undefined && raw.price !== null) {
				throw new TypeError(`"${id}" tiene \`price\` y \`a_la_gorra\`: usá uno de los dos`);
			}
			const min = Number(raw.a_la_gorra?.minimo);
			const suggested = Number(raw.a_la_gorra?.sugerido);
			if (!Number.isSafeInteger(min) || min < 0) {
				throw new TypeError(`\`a_la_gorra.minimo\` inválido para "${id}": un entero desde 0`);
			}
			if (!Number.isSafeInteger(suggested) || suggested < min || suggested > GORRA_MAX_AMOUNT) {
				throw new TypeError(
					`\`a_la_gorra.sugerido\` inválido para "${id}": un entero entre el mínimo y ${GORRA_MAX_AMOUNT}`
				);
			}
			// Sin fondo: quien paga elige el monto (el fondo no aplica a la gorra).
			types.push({ id, name, price: suggested, fondo: 0, capacity, gorra: { min, suggested } });
			continue;
		}
		const price = Number(raw.price);
		if (!Number.isSafeInteger(price) || price <= 0) {
			throw new TypeError(`Precio inválido para "${id}": tiene que ser un entero mayor a 0`);
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
		types.push({ id, name, price, fondo, capacity, gorra: null });
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
		fondoPercentSource,
		paymentMethods,
		mpFeeBasisPoints,
		closesAt,
		online: isOnlineEvent(meta),
		// `recordatorios: false` en el frontmatter: este evento no manda recordatorios por mail.
		reminders: meta.recordatorios !== false,
		status: meta.status,
		title: String(meta.title ?? ''),
		start: meta.start instanceof Date ? meta.start.toISOString() : meta.start,
		location: meta.location,
		location_name: meta.location_name
	};
}

/**
 * ¿El evento es online? `modalidad: online | presencial` en el frontmatter manda; si falta, es
 * online si tiene la etiqueta "Online" (la que ya usan los eventos del calendario) y no tiene
 * `location`. En los eventos online las entradas llevan el link de la transmisión en lugar de un
 * QR, y no hay control de ingreso.
 *
 * @param {Record<string, any>} meta
 */
export function isOnlineEvent(meta) {
	const modalidad = typeof meta.modalidad === 'string' ? meta.modalidad.trim().toLowerCase() : '';
	if (modalidad === 'online' || modalidad === 'virtual') return true;
	if (modalidad === 'presencial') return false;
	const tags = Array.isArray(meta.tags) ? meta.tags : [];
	return !meta.location && tags.some((t) => String(t).trim().toLowerCase() === 'online');
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
 * Valida los datos de quien compra (uno por compra): nombre, pronombres (obligatorios, como en
 * cada entrada), email y DNI (7 a 9 dígitos, se aceptan puntos; se guarda solo con dígitos).
 *
 * @param {{ name?: unknown, pronouns?: unknown, email?: unknown, dni?: unknown }} raw
 * @returns {{ ok: true, buyer: Buyer } | { ok: false, errors: { name?: string, pronouns?: string, email?: string, dni?: string } }}
 */
export function validateBuyer(raw) {
	/** @type {{ name?: string, pronouns?: string, email?: string, dni?: string }} */
	const errors = {};
	const name = cleanText(raw.name);
	if (name.length < 2 || name.length > 80) errors.name = 'Poné tu nombre (entre 2 y 80 letras).';
	const pronouns = cleanText(raw.pronouns);
	if (!pronouns) errors.pronouns = 'Poné tus pronombres.';
	else if (pronouns.length > 40) errors.pronouns = 'Hasta 40 letras.';
	const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
	if (email.length > 254 || !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(email)) {
		errors.email = 'Revisá el email: ahí te mandamos las entradas.';
	}
	const dni = normalizeDni(raw.dni);
	if (!dni) errors.dni = 'Revisá el DNI: tiene que tener entre 7 y 9 números.';
	if (Object.keys(errors).length || !dni) return { ok: false, errors };
	return { ok: true, buyer: { name, pronouns, email, dni } };
}

/**
 * Valida lo que manda el formulario de compra. Los precios salen de `config`, no del form.
 *
 * Errores: `name`, `pronouns`, `email`, `dni` (quien compra), `amount` (monto "a la gorra") y
 * `holder_<campo>_<n>` (n desde 0) por entrada, igual que los `name` del formulario. Si el nombre
 * o los pronombres de la entrada 1 vienen vacíos se usan los de quien compra (así funciona
 * también sin JavaScript).
 *
 * "A la gorra": `amount` es el monto POR ENTRADA que eligió la persona (entero, desde el mínimo
 * del tipo hasta GORRA_MAX_AMOUNT); vacío = el sugerido. La opción queda `gorra` (sin fondo).
 *
 * @param {EventTickets} config
 * @param {{
 *   type: unknown, quantity: unknown, accept: unknown,
 *   buyer: { name?: unknown, pronouns?: unknown, email?: unknown, dni?: unknown },
 *   holders: { name?: unknown, pronouns?: unknown }[],
 *   method?: unknown,
 *   option?: unknown,
 *   amount?: unknown
 * }} input
 * @returns {{ ok: true, type: TicketType, quantity: number, buyer: Buyer, holders: Holder[],
 *     method: PaymentMethod, option: import('$lib/utils/tickets.js').PriceOption,
 *     unitPrice: number }
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
		errors.quantity = `Se pueden comprar hasta ${MAX_TICKETS_PER_FORM} entradas por vez.`;
	}
	const b = validateBuyer(input.buyer);
	if (!b.ok) Object.assign(errors, b.errors);
	/** @type {Holder[]} */
	const holders = [];
	if (!errors.quantity) {
		for (let i = 0; i < quantity; i++) {
			const raw = input.holders[i] ?? {};
			const name = i === 0 && !cleanText(raw.name) ? input.buyer.name : raw.name;
			const pronouns = i === 0 && !cleanText(raw.pronouns) ? input.buyer.pronouns : raw.pronouns;
			const r = validateHolder({ name, pronouns });
			if (r.ok) holders.push(r.holder);
			else for (const [k, v] of Object.entries(r.errors)) errors[`holder_${k}_${i}`] = v;
		}
	}
	const method =
		input.method === undefined || input.method === '' ? config.paymentMethods[0] : input.method;
	if (!config.paymentMethods.includes(/** @type {PaymentMethod} */ (method))) {
		errors.method = 'Elegí un medio de pago.';
	}
	/** @type {import('$lib/utils/tickets.js').PriceOption | null} */
	let option = null;
	let unitPrice = type?.price ?? 0;
	if (type?.gorra) {
		// A la gorra: el monto por entrada lo elige la persona (vacío = el sugerido).
		const raw = input.amount === undefined || input.amount === '' ? null : input.amount;
		const amount = raw === null ? type.gorra.suggested : parseAmount(raw);
		if (amount === null) {
			errors.amount = 'Escribí cuánto querés pagar por entrada, en pesos (sin centavos).';
		} else if (amount < type.gorra.min) {
			errors.amount = `El mínimo es $ ${type.gorra.min.toLocaleString('es-AR')} por entrada.`;
		} else if (amount > GORRA_MAX_AMOUNT) {
			errors.amount = `El máximo es $ ${GORRA_MAX_AMOUNT.toLocaleString('es-AR')} por entrada.`;
		} else {
			unitPrice = amount;
		}
		option = 'gorra';
	} else {
		// Opción del fondo: vacía = la de por defecto. "Con el descuento del fondo" en un tipo sin
		// fondo es lo mismo que precio completo, y se guarda así.
		let chosen = input.option === undefined || input.option === '' ? null : input.option;
		if (chosen !== null && !isFondoOption(chosen)) {
			errors.option = 'Elegí cómo querés pagar tu entrada.';
			chosen = null;
		}
		if (type && (chosen === null || (chosen === 'fondo' && !type.fondo))) {
			chosen = defaultFondoOption(type.fondo);
		}
		option = /** @type {import('$lib/utils/tickets.js').FondoOption | null} */ (chosen);
	}
	if (input.accept !== 'on' && input.accept !== '1') {
		errors.accept = 'Tenés que confirmar que tenés 18 años o más y aceptar las condiciones.';
	}
	if (Object.keys(errors).length || !type || !b.ok || option === null) return { ok: false, errors };
	return {
		ok: true,
		type,
		quantity,
		buyer: b.buyer,
		holders,
		method: /** @type {PaymentMethod} */ (method),
		option,
		unitPrice
	};
}

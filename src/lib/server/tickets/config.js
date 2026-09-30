/**
 * Configuración de venta de entradas de un evento, leída del frontmatter del markdown.
 *
 * Es la ÚNICA fuente de verdad de precios y cupos: el formulario de compra solo manda el id del
 * tipo de entrada y la cantidad, nunca un precio.
 *
 * ```yaml
 * tags: [KinkyVibe, ...]  # el Fondo KinkyVibe solo aplica a eventos con la etiqueta KinkyVibe
 * tickets:
 *   - id: general
 *     name: General
 *     price: 10000       # ARS, entero: precio completo de la entrada
 *     capacity: 40
 *   - id: gorra
 *     name: A la gorra
 *     a_la_gorra: { minimo: 0, sugerido: 5000 }   # en lugar de `price`: la persona elige el monto
 *     capacity: 200
 * modalidad: online      # opcional: online | presencial (si falta: online si tiene la etiqueta
 *                        # "Online" y no tiene `location`). Online = link en lugar de QR.
 * tickets_open: 2026-10-01T12:00-03:00    # opcional; antes de eso la venta no abrió
 * tickets_close: 2026-10-16T18:00-03:00   # opcional; si falta, cierra al empezar el evento
 *                                         # (solo fecha = hasta el fin de ese día; hora de
 *                                         # Argentina si no tiene zona)
 * payment_methods: [mercadopago, transferencia]   # opcional; por defecto solo mercadopago
 * mp_fee_percent: 2      # opcional; si falta: /admin/entradas/ajustes, TICKETS_MP_FEE_PERCENT o 2 %
 * ```
 */

/**
 * Tipo de entrada. En los tipos "a la gorra" `gorra` tiene el mínimo y el sugerido, `price` es el
 * sugerido (solo para mostrar) y `fondo` es 0: el monto lo elige la persona al comprar.
 *
 * `closesAt`: cierre propio del tipo (`close` en el frontmatter; por ejemplo, la anticipada cierra
 * antes), o `null` si cierra con el evento.
 *
 * @typedef {{ id: string, name: string, price: number, fondo: number, capacity: number,
 *   gorra: { min: number, suggested: number } | null, closesAt?: number | null }} TicketType
 */
/** @typedef {'mercadopago' | 'transferencia'} PaymentMethod */
/** @typedef {{ name: string, pronouns: string }} Holder */
/** @typedef {{ name: string, pronouns: string, email: string, dni: string }} Buyer */
/**
 * @typedef {{
 *   types: TicketType[],
 *   fondoEnabled: boolean,
 *   fondoPercent: number | null,
 *   paymentMethods: PaymentMethod[],
 *   mpFeeBasisPoints: number | null,
 *   opensAt: number | null,
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
	MAX_TICKETS_PER_FORM,
	ORDER_MAX_MESSAGE,
	ORDER_MAX_TOTAL,
	exceedsOrderMax,
	PAYMENT_METHODS,
	defaultFondoOption,
	isFondoOption,
	normalizeDni,
	parseAmount,
	parseFeePercent,
	parseSaleTime
} from '$lib/utils/tickets.js';
import {
	KINKYVIBE_TAG,
	TYPE_ID_RE,
	isKinkyVibeEvent,
	isOnlineEvent
} from '$lib/utils/ticketsEditor.js';

// Viven en $lib/utils/ticketsEditor.js (el editor de eventos también las usa en el navegador).
export { KINKYVIBE_TAG, isKinkyVibeEvent, isOnlineEvent };
export { formatARS } from '$lib/utils/money.js';
export { MAX_TICKETS_PER_FORM };

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
 * `options.fondoPercent` es el porcentaje del Fondo KinkyVibe (ver fondo.js; el mismo para todos
 * los eventos, sigue a fondo.kinkyvibe.ar): se aplica a todos los tipos con precio. Sin él, sin
 * descuento del fondo. No hay fondo por evento ni por tipo (`fondo_percent` o `fondo` en el
 * frontmatter se ignoran).
 *
 * El Fondo (descuento, aportes y las opciones de "¿Cómo querés pagar tu entrada?") solo aplica a
 * eventos con la etiqueta KinkyVibe (`fondoEnabled`); en los demás, precio de lista y nada más.
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
	const fondoEnabled = isKinkyVibeEvent(meta);
	/** @type {number | null} */
	let fondoPercent = null;
	if (
		fondoEnabled &&
		options.fondoPercent !== undefined &&
		options.fondoPercent !== null &&
		Number.isInteger(options.fondoPercent) &&
		options.fondoPercent >= 0 &&
		options.fondoPercent <= 100
	) {
		fondoPercent = options.fondoPercent;
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
			if (!Number.isSafeInteger(suggested) || suggested < min || suggested > ORDER_MAX_TOTAL) {
				throw new TypeError(
					`\`a_la_gorra.sugerido\` inválido para "${id}": un entero entre el mínimo y ${ORDER_MAX_TOTAL}`
				);
			}
			// Sin fondo: quien paga elige el monto (el fondo no aplica a la gorra).
			types.push({
				id,
				name,
				price: suggested,
				fondo: 0,
				capacity,
				gorra: { min, suggested },
				closesAt: typeClose(raw, id)
			});
			continue;
		}
		const price = Number(raw.price);
		if (!Number.isSafeInteger(price) || price <= 0 || price > ORDER_MAX_TOTAL) {
			throw new TypeError(`Precio inválido para "${id}": tiene que ser un entero mayor a 0`);
		}
		// El fondo es siempre el porcentaje vigente (sin la etiqueta KinkyVibe, `fondoPercent` es
		// null: sin fondo). Un `fondo` en pesos en el tipo ya no existe y se ignora.
		const fondo = fondoPercent !== null ? Math.round((price * fondoPercent) / 100) : 0;
		types.push({ id, name, price, fondo, capacity, gorra: null, closesAt: typeClose(raw, id) });
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
	const opensAt = saleTime(meta.tickets_open, '`tickets_open`');
	const closesAt = saleTime(meta.tickets_close, '`tickets_close`', true) ?? toTime(meta.start);
	if (opensAt !== null && closesAt !== null && opensAt >= closesAt) {
		throw new TypeError('La venta tiene que abrir (`tickets_open`) antes de cerrar');
	}
	return {
		types,
		fondoEnabled,
		fondoPercent,
		paymentMethods,
		mpFeeBasisPoints,
		opensAt,
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
 * @param {unknown} value
 * @param {string} what nombre del campo, para el error
 * @param {boolean} [endOfDay] ver parseSaleTime
 */
function saleTime(value, what, endOfDay = false) {
	try {
		return parseSaleTime(value, { endOfDay });
	} catch (error) {
		throw new TypeError(`${what}: ${/** @type {Error} */ (error).message}`);
	}
}

/** @param {any} raw @param {string} id */
const typeClose = (raw, id) => saleTime(raw?.close, `\`close\` de "${id}"`, true);

/**
 * ¿Se pueden comprar entradas ahora? Devuelve el motivo si no. Los horarios son instantes
 * (ms): abre en `opensAt` (inclusive) y cierra en `closesAt` (a partir de ese instante ya no).
 * Si todos los tipos cerraron por su cuenta, la venta está cerrada.
 *
 * @param {EventTickets} config
 * @param {number} [now]
 * @returns {{ open: true } | { open: false, reason: 'cancelled' | 'soldout' | 'closed' | 'notyet' }}
 */
export function salesState(config, now = Date.now()) {
	if (config.status === 'cancelado') return { open: false, reason: 'cancelled' };
	if (config.status === 'agotadas') return { open: false, reason: 'soldout' };
	if (config.closesAt !== null && now >= config.closesAt) return { open: false, reason: 'closed' };
	if (config.opensAt != null && now < config.opensAt) return { open: false, reason: 'notyet' };
	if (config.types.length && config.types.every((t) => !typeOpen(config, t, now)))
		return { open: false, reason: 'closed' };
	return { open: true };
}

/**
 * Cierre efectivo de un tipo: el propio si cierra antes que el evento.
 * @param {EventTickets} config
 * @param {TicketType} type
 */
export function typeClosesAt(config, type) {
	const own = type.closesAt ?? null;
	if (own === null) return config.closesAt;
	return config.closesAt === null ? own : Math.min(own, config.closesAt);
}

/**
 * ¿Este tipo se puede comprar ahora (por horario)?
 * @param {EventTickets} config
 * @param {TicketType} type
 * @param {number} [now]
 */
export function typeOpen(config, type, now = Date.now()) {
	const closes = typeClosesAt(config, type);
	return closes === null || now < closes;
}

/**
 * Texto de una línea: sin caracteres de control ni de dirección (bidi, ancho cero), espacios
 * colapsados.
 * @param {unknown} raw
 */
function cleanText(raw) {
	return typeof raw === 'string'
		? raw
				// eslint-disable-next-line no-control-regex -- se sacan a propósito
				.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ')
				.trim()
				.replace(/\s+/g, ' ')
		: '';
}

/**
 * Los nombres van en mails y en el admin: sin links ni etiquetas.
 * @param {string} text
 */
const looksLikeLink = (text) =>
	/https?:|www\.|[<>]|\b[a-z0-9-]+\.(com|net|org|ar|io|ly|me|xyz)\b/i.test(text);

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
	else if (looksLikeLink(name)) errors.name = 'El nombre no puede tener links.';
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
	else if (looksLikeLink(name)) errors.name = 'El nombre no puede tener links.';
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
 * del tipo; sin máximo de producto, solo el tope técnico ORDER_MAX_TOTAL para el total de la
 * orden); vacío = el sugerido. La opción queda `gorra` (sin fondo).
 *
 * @param {EventTickets} config
 * @param {{
 *   type: unknown, quantity: unknown, accept: unknown,
 *   buyer: { name?: unknown, pronouns?: unknown, email?: unknown, dni?: unknown },
 *   holders: { name?: unknown, pronouns?: unknown }[],
 *   method?: unknown,
 *   option?: unknown,
 *   amount?: unknown,
 *   now?: number
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
	else if (!typeOpen(config, type, input.now ?? Date.now()))
		errors.type = `La venta de «${type.name}» ya cerró.`;
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
		} else if (exceedsOrderMax(amount, errors.quantity ? 1 : quantity)) {
			errors.amount = ORDER_MAX_MESSAGE;
		} else {
			unitPrice = amount;
		}
		option = 'gorra';
	} else if (!config.fondoEnabled) {
		// Evento sin la etiqueta KinkyVibe: sin Fondo. Se ignora cualquier opción que llegue en el
		// POST (aunque sea "fondo" o una solidaria): precio de lista.
		option = 'completo';
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

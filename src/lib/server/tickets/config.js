/**
 * Configuración de venta de entradas de un evento, leída del frontmatter del markdown.
 *
 * Es la ÚNICA fuente de verdad de precios y cupos: el formulario de compra solo manda el id del
 * tipo de entrada y la cantidad, nunca un precio.
 *
 * ```yaml
 * tags: [KinkyVibe, ...]  # el Fondo Kinky Vibe solo aplica a eventos con la etiqueta KinkyVibe
 * tickets:
 *   - id: general
 *     name: General
 *     price: 10000       # ARS, entero: precio completo de la entrada
 *     capacity: 40       # opcional: sin `capacity` (o vacío) = sin límite de entradas
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
 * mp_fee_percent: 2      # opcional; si falta: /admin/ajustes/cobros, TICKETS_MP_FEE_PERCENT o 2 %
 * puerta: true           # opcional (eventos presenciales): true = también hay entradas en la
 *                        # puerta (la página lo dice); false = "Solo anticipadas" y el modo puerta
 *                        # no vende. Si falta: se vende en la puerta y la página no dice nada.
 * puerta_precio: $ 12.000 en efectivo   # opcional (con `puerta: true`): nota para la página
 *                                       # (solo se muestra; lo que se cobra es `door_price`)
 * ```
 *
 * Preventas escalonadas y tipos encadenados (ver $lib/utils/ticketTiers.js):
 *
 * ```yaml
 * tickets:
 *   - id: general
 *     name: General
 *     capacity: 40              # opcional, como siempre: el cupo total del tipo
 *     tiers:                    # en lugar de `price`: tramos de precio, en orden
 *       - { id: preventa-1, name: Preventa 1, price: 8000, quantity: 5 }    # los primeros 5
 *       - { id: preventa-2, name: Preventa 2, price: 9000, until: 2026-10-09T23:59-03:00 }
 *       - { id: general, name: General, price: 10000 }   # sin cantidad ni fecha: el resto
 *   - id: ultima-tanda
 *     name: Última tanda
 *     price: 12000
 *     after: general            # se habilita cuando «general» se agota o cierra
 *     door_price: 14000         # opcional: precio en la puerta y en la carga a mano. Si falta,
 *                               # el del último tramo o el precio fijo (ver `doorPrice`)
 * ```
 */

/**
 * Tipo de entrada. En los tipos "a la gorra" `gorra` tiene el mínimo y el sugerido, `price` es el
 * sugerido (solo para mostrar) y `fondo` es 0: el monto lo elige la persona al comprar.
 *
 * `closesAt`: cierre propio del tipo (`close` en el frontmatter; por ejemplo, la anticipada cierra
 * antes), o `null` si cierra con el evento.
 *
 * `capacity`: cupo del tipo, o `null` si no tiene límite (sin `capacity` en el frontmatter).
 *
 * `tiers`: tramos de precio (preventas escalonadas), o `null`. En un tipo con tramos, `price` y
 * `fondo` son los del ÚLTIMO tramo (el precio "pleno": lo usan la venta en la puerta y el panel);
 * la compra online usa el tramo vigente (`currentTier` de $lib/utils/ticketTiers.js).
 *
 * `after`: id del tipo que se tiene que agotar o cerrar para que este se habilite, o `null`.
 *
 * `door` (solo si el tipo tiene `door_price`): precio en la puerta y en la carga a mano, con su
 * Fondo. Sin `door`, en la puerta se cobra `price` (ver `doorPrice` en ticketTiers.js).
 *
 * `tier` (solo en el tipo "efectivo" que arma la compra, ver `withTier`): el tramo con el que se
 * reserva, con su cantidad y su fecha para controlarlos en la misma sentencia.
 *
 * @typedef {{ id: string, name: string, price: number, fondo: number, capacity: number | null,
 *   gorra: Gorra | null, closesAt?: number | null,
 *   tiers?: import('$lib/utils/ticketTiers.js').Tier[] | null, after?: string | null,
 *   door?: { price: number, fondo: number },
 *   tier?: { id: string, name: string, quantity: number | null, until: number | null } | null
 * }} TicketType
 */
/**
 * @typedef {{ min: number, suggested: number }} Gorra
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
 *   door: { on: boolean, explicit: boolean, price: string } | null,
 *   reminders: boolean,
 *   status: string | undefined,
 *   title: string,
 *   start: string | undefined,
 *   location: string | undefined,
 *   location_name: string | undefined,
 *   goal: import('$lib/utils/salesGoal.js').SalesGoal | null,
 *   fields?: import('$lib/utils/signupFields.js').SignupField[]
 * }} EventTickets
 *
 * `goal`: la meta de venta (`meta_venta`, ver $lib/utils/salesGoal.js), o `null`. Una meta que no
 * se entiende es `null`: nunca frena la venta.
 */

import {
	MAX_TICKETS_PER_FORM,
	ORDER_MAX_MESSAGE,
	ORDER_MAX_TOTAL,
	exceedsOrderMax,
	PAYMENT_METHODS,
	defaultFondoOption,
	isFondoOption,
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
import { validateAnswers } from '$lib/utils/signupFields.js';
import { GOAL_KEY, parseSalesGoal } from '$lib/utils/salesGoal.js';
import { validateBuyer, validateHolder, validateHolders } from '$lib/utils/ticketBuyer.js';

// Viven en $lib/utils/ticketBuyer.js (la página de compra valida cada paso en el navegador con
// las mismas reglas).
export { validateBuyer, validateHolder, validateHolders };

// Viven en $lib/utils/ticketsEditor.js (el editor de eventos también las usa en el navegador).
export { KINKYVIBE_TAG, isKinkyVibeEvent, isOnlineEvent };
import { formatARS } from '$lib/utils/money.js';
import { availabilityOf, chainCycle, unreachableAfter } from '$lib/utils/ticketTiers.js';
export { formatARS };
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
 * `options.fondoPercent` es el porcentaje del Fondo Kinky Vibe (ver fondo.js; el mismo para todos
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
		const capacity = parseCapacity(raw.capacity, id);
		const after = parseAfter(raw.after, id);
		const door = parseDoorPrice(raw.door_price, id, fondoPercent);
		const hasTiers = raw.tiers !== undefined && raw.tiers !== null;
		if (raw.a_la_gorra !== undefined && raw.a_la_gorra !== null) {
			if (raw.price !== undefined && raw.price !== null) {
				throw new TypeError(`"${id}" tiene \`price\` y \`a_la_gorra\`: usá uno de los dos`);
			}
			if (hasTiers) {
				throw new TypeError(`"${id}" es a la gorra: no puede tener tramos (\`tiers\`)`);
			}
			if (raw.door_price !== undefined && raw.door_price !== null && raw.door_price !== '') {
				throw new TypeError(
					`"${id}" es a la gorra: no puede tener \`door_price\` (el monto lo elige quien paga)`
				);
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
				closesAt: typeClose(raw, id),
				...(after ? { after } : {})
			});
			continue;
		}
		if (hasTiers) {
			if (raw.price !== undefined && raw.price !== null) {
				throw new TypeError(`"${id}" tiene \`price\` y \`tiers\`: usá uno de los dos`);
			}
			const tiers = parseTiers(raw.tiers, id, fondoPercent);
			const last = tiers[tiers.length - 1];
			types.push({
				id,
				name,
				price: last.price,
				fondo: last.fondo,
				capacity,
				gorra: null,
				closesAt: typeClose(raw, id),
				tiers,
				...(after ? { after } : {}),
				...(door ? { door } : {})
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
		types.push({
			id,
			name,
			price,
			fondo,
			capacity,
			gorra: null,
			closesAt: typeClose(raw, id),
			...(after ? { after } : {}),
			...(door ? { door } : {})
		});
	}
	for (const t of types) {
		if (t.after && !types.some((o) => o.id === t.after)) {
			throw new TypeError(`"${t.id}" se habilita después de "${t.after}", que no existe`);
		}
	}
	const cycle = chainCycle(types);
	if (cycle) {
		throw new TypeError(`"${cycle}": los tipos encadenados (\`after\`) forman un círculo`);
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
		// Entradas en la puerta (solo eventos presenciales; en los online no hay puerta).
		door: isOnlineEvent(meta) ? null : parseDoor(meta),
		// `recordatorios: false` en el frontmatter: este evento no manda recordatorios por mail.
		reminders: meta.recordatorios !== false,
		status: meta.status,
		title: String(meta.title ?? ''),
		start: meta.start instanceof Date ? meta.start.toISOString() : meta.start,
		location: meta.location,
		location_name: meta.location_name,
		goal: parseSalesGoal(meta[GOAL_KEY])
	};
}

/**
 * Cupo de un tipo: entero desde 0, o `null` (sin límite) si falta o está vacío.
 *
 * @param {unknown} raw
 * @param {string} id
 * @returns {number | null}
 */
export function parseCapacity(raw, id) {
	if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return null;
	const capacity = Number(raw);
	if (!Number.isSafeInteger(capacity) || capacity < 0) {
		throw new TypeError(`Cupo inválido para "${id}": tiene que ser un entero (o nada, sin límite)`);
	}
	return capacity;
}

/**
 * `door_price` de un tipo: precio en la puerta y en la carga a mano (entero desde 0, con el mismo
 * tope que `price`), con el Fondo calculado como en un tipo con precio; `null` si falta (se cobra
 * el del último tramo o el precio fijo).
 *
 * @param {unknown} raw
 * @param {string} id
 * @param {number | null} fondoPercent
 * @returns {{ price: number, fondo: number } | null}
 */
export function parseDoorPrice(raw, id, fondoPercent) {
	if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return null;
	const price = Number(raw);
	if (!Number.isSafeInteger(price) || price < 0 || price > ORDER_MAX_TOTAL) {
		throw new TypeError(
			`\`door_price\` inválido para "${id}": un entero desde 0 (o nada, el precio de siempre)`
		);
	}
	const fondo = fondoPercent !== null ? Math.round((price * fondoPercent) / 100) : 0;
	return { price, fondo };
}

/**
 * `after` de un tipo: id de otro tipo, o `null`.
 *
 * @param {unknown} raw
 * @param {string} id
 * @returns {string | null}
 */
function parseAfter(raw, id) {
	if (raw === undefined || raw === null || raw === '') return null;
	const after = String(raw).trim();
	if (!TYPE_ID_RE.test(after)) throw new TypeError(`\`after\` inválido en "${id}": "${after}"`);
	if (after === id) throw new TypeError(`"${id}" no puede habilitarse después de sí mismo`);
	return after;
}

/** Máximo de tramos por tipo (más no tiene sentido y complica la compra). */
export const MAX_TIERS = 10;

/**
 * `tiers` de un tipo: lista de 1 a `MAX_TIERS` tramos `{ id, name, price, quantity?, until? }`.
 * El fondo se calcula como en un tipo con precio. Un tramo sin cantidad ni fecha tiene que ser el
 * último (si no, los que siguen no se venderían nunca).
 *
 * @param {unknown} raw
 * @param {string} typeId
 * @param {number | null} fondoPercent
 * @returns {import('$lib/utils/ticketTiers.js').Tier[]}
 */
export function parseTiers(raw, typeId, fondoPercent) {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TIERS) {
		throw new TypeError(`\`tiers\` de "${typeId}": una lista de 1 a ${MAX_TIERS} tramos`);
	}
	/** @type {import('$lib/utils/ticketTiers.js').Tier[]} */
	const tiers = [];
	for (const item of raw) {
		const id = String(item?.id ?? '');
		if (!TYPE_ID_RE.test(id)) throw new TypeError(`Id de tramo inválido en "${typeId}": "${id}"`);
		if (tiers.some((t) => t.id === id)) {
			throw new TypeError(`Id de tramo repetido en "${typeId}": "${id}"`);
		}
		const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
		const price = Number(item.price);
		if (!Number.isSafeInteger(price) || price <= 0 || price > ORDER_MAX_TOTAL) {
			throw new TypeError(`Precio inválido en el tramo "${id}" de "${typeId}"`);
		}
		let quantity = null;
		if (item.quantity !== undefined && item.quantity !== null && item.quantity !== '') {
			quantity = Number(item.quantity);
			if (!Number.isSafeInteger(quantity) || quantity < 1) {
				throw new TypeError(
					`Cantidad inválida en el tramo "${id}" de "${typeId}": un entero desde 1 (o nada)`
				);
			}
		}
		const until = saleTime(item.until, `\`until\` del tramo "${id}" de "${typeId}"`, true);
		const fondo = fondoPercent !== null ? Math.round((price * fondoPercent) / 100) : 0;
		tiers.push({ id, name, price, fondo, quantity, until });
	}
	const stuck = unreachableAfter(tiers);
	if (stuck !== -1) {
		throw new TypeError(
			`El tramo "${tiers[stuck].id}" de "${typeId}" no tiene cantidad ni fecha: los que siguen nunca se venderían`
		);
	}
	return tiers;
}

/**
 * El tipo "efectivo" para comprar con un tramo: precio y fondo del tramo, y el tramo (para
 * controlarlo al reservar). Sin tramo, el tipo tal cual (con `tier: null`).
 *
 * @param {TicketType} type
 * @param {import('$lib/utils/ticketTiers.js').Tier | null | undefined} tier
 * @returns {TicketType}
 */
export function withTier(type, tier) {
	if (!tier) return { ...type, tier: null };
	return {
		...type,
		price: tier.price,
		fondo: tier.fondo,
		tier: { id: tier.id, name: tier.name, quantity: tier.quantity, until: tier.until }
	};
}

/** Largo máximo del texto `puerta_precio`. */
export const DOOR_PRICE_MAX = 120;

/**
 * `puerta` / `puerta_precio` del frontmatter. Tres estados:
 * - sin `puerta` (eventos de antes): se vende en la puerta (`on`) pero la página pública no dice
 *   nada (`explicit: false`);
 * - `puerta: true`: se vende y la página dice "También hay entradas en la puerta" (con el precio);
 * - `puerta: false`: no se vende en la puerta y la página dice "Solo anticipadas".
 * Cualquier otro valor cuenta como si faltara.
 *
 * @param {Record<string, any>} meta
 * @returns {{ on: boolean, explicit: boolean, price: string }}
 */
export function parseDoor(meta) {
	const explicit = typeof meta.puerta === 'boolean';
	const on = meta.puerta !== false;
	let price =
		meta.puerta === true && meta.puerta_precio !== undefined && meta.puerta_precio !== null
			? String(meta.puerta_precio).trim().slice(0, DOOR_PRICE_MAX)
			: '';
	// Solo un número ("12000"): se muestra como plata ("$ 12.000").
	if (/^\d{1,9}$/.test(price)) price = formatARS(Number(price));
	return { on, explicit, price };
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
 * Estado de un tipo para la compra online ahora: cerrado por horario, esperando a que se agote o
 * cierre el tipo anterior (encadenado), agotado (cupo o tramos) o abierto con su tramo vigente.
 * Ver `availabilityOf` en $lib/utils/ticketTiers.js.
 *
 * @param {EventTickets} config
 * @param {TicketType} type
 * @param {import('$lib/utils/ticketTiers.js').TakenCounts} taken lo de `getTaken` (orders.js)
 * @param {number} [now]
 */
export function typeAvailability(config, type, taken, now = Date.now()) {
	return availabilityOf(config.types, type, taken, now, (t) => !typeOpen(config, t, now));
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
 * Preguntas de inscripción (`config.fields`, interruptor `personas_eventos`): las respuestas
 * llegan en `answers` (por `name` del campo) y sus errores van con ese mismo `name`. Solo se
 * piden las que aplican al tipo elegido; las de "una vez por entrada", una vez por entrada.
 *
 * @param {EventTickets} config
 * @param {{
 *   type: unknown, quantity: unknown, accept: unknown,
 *   buyer: { name?: unknown, pronouns?: unknown, email?: unknown, dni?: unknown },
 *   holders: { name?: unknown, pronouns?: unknown }[],
 *   method?: unknown,
 *   option?: unknown,
 *   amount?: unknown,
 *   answers?: Record<string, unknown>,
 *   now?: number
 * }} input
 * @returns {{ ok: true, type: TicketType, quantity: number, buyer: Buyer, holders: Holder[],
 *     method: PaymentMethod, option: import('$lib/utils/tickets.js').PriceOption,
 *     unitPrice: number, answers: import('$lib/utils/signupFields.js').Answer[] }
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
	let holders = [];
	if (!errors.quantity) {
		const h = validateHolders(input.buyer, input.holders, quantity);
		holders = h.holders;
		Object.assign(errors, h.errors);
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
	/** @type {import('$lib/utils/signupFields.js').Answer[]} */
	let answers = [];
	if (config.fields?.length) {
		// Solo las que aplican a este tipo; las de "una vez por entrada", una por entrada.
		const a = validateAnswers(config.fields, input.answers ?? {}, {
			typeId: type?.id,
			quantity: errors.quantity ? 1 : quantity
		});
		if (a.ok) answers = a.answers;
		else Object.assign(errors, a.errors);
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
		unitPrice,
		answers
	};
}

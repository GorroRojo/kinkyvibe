/**
 * Reglas de entradas que se usan en el servidor Y en el navegador (sin secretos ni base de
 * datos). El navegador las usa solo para mostrar; el servidor siempre recalcula.
 */

/**
 * Cuántos bloques de datos por entrada se muestran como máximo en el formulario. No es un
 * límite de negocio (ese es el cupo): es para que el formulario siga siendo usable. Para
 * compras más grandes, la persona escribe a la organización.
 */
export const MAX_TICKETS_PER_FORM = 20;

/**
 * Cuántas entradas quedan de un tipo, o `null` si el tipo no tiene cupo (sin límite).
 *
 * @param {{ capacity: number | null }} type
 * @param {{ sold: number, held: number } | undefined} counts vendidas y reservadas vigentes
 * @returns {number | null}
 */
export function remainingOf(type, counts) {
	if (type.capacity === null || type.capacity === undefined) return null;
	return Math.max(0, type.capacity - (counts ? counts.sold + counts.held : 0));
}

/** Por debajo de cuántas entradas disponibles la página pública dice cuántas quedan. */
export const LOW_STOCK = 10;

/**
 * Lo que se muestra en público de lo que queda: el número solo si el tipo tiene cupo y quedan
 * menos de `LOW_STOCK` (y alguna). Si no, `null` (no se muestran números: ni el cupo ni lo
 * vendido). Agotado (0) se muestra aparte.
 *
 * @param {number | null} remaining lo que da `remainingOf`
 * @returns {number | null}
 */
export function publicLeft(remaining) {
	return remaining !== null && remaining > 0 && remaining < LOW_STOCK ? remaining : null;
}

/**
 * "Quedan 7" / "¡Últimas 3!" / "¡Última!" para lo que da `publicLeft`.
 *
 * @param {number} n
 */
export function leftText(n) {
	if (n === 1) return '¡Última!';
	if (n <= 3) return `¡Últimas ${n}!`;
	return `Quedan ${n}`;
}

/**
 * Qué dice la página pública sobre las entradas en la puerta (`door` de la configuración:
 * `puerta` / `puerta_precio`). `null` en los eventos online (no hay puerta).
 *
 * @param {{ on: boolean, price: string } | null | undefined} door
 * @returns {string | null}
 */
export function doorText(door) {
	if (!door) return null;
	if (!door.on) return 'Solo anticipadas: no hay entradas en la puerta.';
	return door.price
		? `También hay entradas en la puerta: ${door.price}.`
		: 'También hay entradas en la puerta.';
}

/** Medios de pago que puede habilitar un evento en su frontmatter. */
export const PAYMENT_METHODS = /** @type {const} */ (['mercadopago', 'transferencia']);

/** @typedef {'percent' | 'fixed'} DiscountKind */

/**
 * Descuento en pesos enteros para un subtotal.
 *
 * - `percent`: `value`% del subtotal, redondeado al peso más cercano (0,5 hacia arriba).
 * - `fixed`: `value` pesos por compra (no por entrada).
 * - Nunca más que el subtotal: el total nunca queda negativo.
 *
 * @param {number} subtotal pesos enteros
 * @param {{ kind: DiscountKind, value: number } | null | undefined} discount
 * @returns {{ subtotal: number, discount: number, total: number }}
 */
export function applyDiscount(subtotal, discount) {
	let amount = 0;
	if (discount && Number.isFinite(discount.value) && discount.value > 0) {
		amount =
			discount.kind === 'percent'
				? Math.round((subtotal * Math.min(discount.value, 100)) / 100)
				: Math.round(discount.value);
	}
	amount = Math.max(0, Math.min(amount, subtotal));
	return { subtotal, discount: amount, total: subtotal - amount };
}

/**
 * Recargo para que, después de la comisión de Mercado Pago, quede `base`:
 * `bruto = ⌈base / (1 − tasa)⌉` en pesos enteros; recargo = bruto − base.
 *
 * La tasa va en centésimos de punto porcentual (773 = 7,73 %) para hacer la cuenta con enteros:
 * con decimales, 8000 / 0,8 da 10000,000000000002 y el redondeo hacia arriba sumaría un peso.
 *
 * @param {number} base pesos enteros (ya con fondo y descuento)
 * @param {number} feeBasisPoints 0 a 4999
 */
export function mpSurcharge(base, feeBasisPoints) {
	if (!(base > 0) || !(feeBasisPoints > 0) || feeBasisPoints >= 5000) return 0;
	const keep = 10000 - Math.round(feeBasisPoints);
	const gross = Math.floor((base * 10000 + keep - 1) / keep);
	return gross - base;
}

/**
 * Comisión de Mercado Pago por defecto (%), si no hay ninguna configurada (ni en el evento, ni en
 * /admin/entradas/ajustes, ni en TICKETS_MP_FEE_PERCENT). Decisión de la organización: 2 %; la
 * real depende del plan de la cuenta y se ajusta en /admin/entradas/ajustes.
 */
export const DEFAULT_MP_FEE_PERCENT = 2;

/**
 * "7.73" / "7,73" / 7.73 → 773 centésimos de punto. `null` si no es un porcentaje válido
 * (0 a 49,99 %).
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseFeePercent(raw) {
	if (raw === undefined || raw === null || raw === '') return null;
	const n = Number(String(raw).trim().replace(',', '.'));
	if (!Number.isFinite(n) || n < 0 || n >= 50) return null;
	return Math.round(n * 100);
}

/**
 * Cómo paga cada entrada la persona, respecto del Fondo KinkyVibe ("¿Cómo querés pagar tu
 * entrada?"). `percent` es lo que se suma sobre el precio COMPLETO y va al Fondo KinkyVibe.
 *
 * - `fondo`: precio − lo que cubre el fondo (la opción por defecto; solo si el evento tiene fondo);
 * - `completo`: precio completo (por defecto si el evento no tiene fondo);
 * - `solidaria`, `muy-solidaria`, `sugar`: precio completo + 10 / 30 / 50 % para el fondo.
 */
export const FONDO_OPTIONS = /** @type {const} */ ([
	{ id: 'fondo', label: 'Con el descuento del fondo', percent: 0 },
	{ id: 'completo', label: 'Precio completo', percent: 0 },
	{ id: 'solidaria', label: 'Entrada solidaria', percent: 10 },
	{ id: 'muy-solidaria', label: 'Entrada muy solidaria', percent: 30 },
	{ id: 'sugar', label: 'Entrada Sugar', percent: 50 }
]);

/** @typedef {(typeof FONDO_OPTIONS)[number]['id']} FondoOption */
/**
 * Opción de precio de una orden: una de las del fondo, o `gorra` para los tipos "a la gorra"
 * (la persona elige el monto; sin fondo, sin aportes y sin códigos de descuento).
 *
 * @typedef {FondoOption | 'gorra'} PriceOption
 */

/**
 * Nombre de una opción para mostrar ("Entrada solidaria (+10 %)").
 *
 * @param {string} id
 */
export function fondoOptionLabel(id) {
	if (id === 'gorra') return 'A la gorra';
	const o = FONDO_OPTIONS.find((x) => x.id === id);
	if (!o) return id;
	return o.percent ? `${o.label} (+${o.percent} %)` : o.label;
}

/**
 * Horas de una reserva (para los textos "te reservamos el lugar N horas…").
 *
 * @param {{ created_at: number, expires_at: number }} order
 */
export function holdHours(order) {
	return Math.max(1, Math.round((order.expires_at - order.created_at) / 3600000));
}

/** @param {unknown} id @returns {id is FondoOption} */
export function isFondoOption(id) {
	return FONDO_OPTIONS.some((o) => o.id === id);
}

/**
 * Opción por defecto: con el descuento del fondo si el tipo de entrada tiene fondo; si no,
 * precio completo.
 *
 * @param {number} fondo lo que cubre el fondo por entrada
 * @returns {FondoOption}
 */
export function defaultFondoOption(fondo) {
	return fondo > 0 ? 'fondo' : 'completo';
}

/**
 * Opciones que se ofrecen para un tipo de entrada (sin fondo, no aparece "Con el descuento del
 * fondo").
 *
 * @param {number} fondo
 */
export function fondoOptionsFor(fondo) {
	return FONDO_OPTIONS.filter((o) => o.id !== 'fondo' || fondo > 0);
}

/**
 * Precio de UNA entrada según la opción: `fondo` que se descuenta y `contribution` que se suma
 * (porcentaje sobre el precio completo, redondeado al peso: 0,5 hacia arriba).
 *
 * @param {number} price precio completo
 * @param {number} fondo lo que cubre el fondo por entrada
 * @param {FondoOption} option
 */
export function unitPrice(price, fondo, option) {
	const def = FONDO_OPTIONS.find((o) => o.id === option) ?? FONDO_OPTIONS[1];
	const fondoUsed = def.id === 'fondo' ? Math.max(0, Math.min(fondo, price)) : 0;
	const contribution = Math.round((price * def.percent) / 100);
	return { fondo: fondoUsed, contribution, price: price - fondoUsed + contribution };
}

/**
 * Precio completo de una compra. Orden de las cuentas:
 *
 * 1. lista = precio completo × cantidad
 * 2. según la opción del fondo, por entrada (y × cantidad):
 *    - `fondo`: se resta lo que cubre el Fondo KinkyVibe;
 *    - `solidaria` / `muy-solidaria` / `sugar`: se suma el 10 / 30 / 50 % del precio completo,
 *      redondeado al peso, como aporte al fondo;
 * 3. subtotal = lista − fondo + aporte
 * 4. descuento (código) sobre el subtotal, redondeado al peso, nunca más que el subtotal
 * 5. recargo de Mercado Pago sobre lo que queda (solo con Mercado Pago y si queda algo)
 * 6. total = subtotal − descuento + recargo
 *
 * Sin `option`, se usa la opción por defecto (con fondo si hay fondo).
 *
 * "A la gorra" (`option: 'gorra'`): `price` es el monto por entrada que eligió la persona (ya
 * validado en el servidor); no hay fondo, ni aporte, ni código de descuento (se ignora). El
 * recargo de Mercado Pago sí se suma.
 *
 * @param {{
 *   price: number,
 *   fondo?: number,
 *   option?: PriceOption,
 *   quantity: number,
 *   discount?: { kind: DiscountKind, value: number } | null,
 *   method?: string,
 *   feeBasisPoints?: number
 * }} input
 */
export function computePrice({
	price,
	fondo = 0,
	option,
	quantity,
	discount,
	method,
	feeBasisPoints = 0
}) {
	const gorra = option === 'gorra';
	/** @type {PriceOption} */
	const chosen = gorra ? 'gorra' : (option ?? defaultFondoOption(fondo));
	const unit = gorra
		? { fondo: 0, contribution: 0, price }
		: unitPrice(price, fondo, /** @type {FondoOption} */ (chosen));
	const list = price * quantity;
	const fondoAmount = unit.fondo * quantity;
	const contribution = unit.contribution * quantity;
	const d = applyDiscount(list - fondoAmount + contribution, gorra ? null : discount);
	const surcharge = method === 'mercadopago' ? mpSurcharge(d.total, feeBasisPoints) : 0;
	return {
		option: chosen,
		unit: unit.price,
		list,
		fondo: fondoAmount,
		contribution,
		subtotal: d.subtotal,
		discount: d.discount,
		surcharge,
		total: d.total + surcharge
	};
}

/**
 * Normaliza un DNI: acepta puntos y espacios ("12.345.678") y devuelve solo los dígitos, o
 * `null` si no tiene entre 7 y 9 dígitos.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeDni(raw) {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!/^[0-9.\s]+$/.test(trimmed)) return null;
	const digits = trimmed.replace(/[.\s]/g, '');
	return /^\d{7,9}$/.test(digits) ? digits : null;
}

/**
 * Normaliza un código de descuento (mayúsculas, sin espacios alrededor). `null` si el formato
 * no es válido: 3 a 32 letras, números, - o _.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeCode(raw) {
	if (typeof raw !== 'string') return null;
	const code = raw.trim().toUpperCase();
	return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null;
}

/**
 * Referencia corta de una orden para poner en el concepto de la transferencia.
 *
 * @param {string} orderId
 */
export function orderReference(orderId) {
	return `KV-${orderId.slice(0, 8).toUpperCase()}`;
}

/** Contacto público de la organización (TICKETS_CONTACT_EMAIL lo reemplaza). */
export const DEFAULT_CONTACT_EMAIL = 'kinkyvibe.talleres@gmail.com';

/**
 * Política de devoluciones y cambios de titular de la organización, en párrafos (va en el
 * formulario, como parte de las condiciones, y al pie de los mails). Reescrita para que se lea
 * más clara, con el mismo sentido que el texto original de la organización.
 *
 * @param {string} contactEmail
 */
export function refundPolicy(contactEmail) {
	return {
		title: 'Devoluciones y cambios',
		paragraphs: [
			'Si no podés venir, avisanos hasta 5 días hábiles antes del evento y te devolvemos lo que pagaste. Si preferís, en lugar de la devolución te ofrecemos un taller grabado de los que haya en la tienda en ese momento.',
			`Si le pasás tu entrada a otra persona, escribinos a ${contactEmail} con su nombre, sus pronombres y su email.`
		]
	};
}

/**
 * Todas las condiciones de compra, en una sola lista con el mismo formato (el formulario las
 * muestra en "Condiciones de compra y devoluciones").
 *
 * @param {{ contactEmail: string, transferHoldHours: number, methods: readonly string[], online?: boolean }} input
 * @returns {string[]}
 */
export function purchaseConditions({ contactEmail, transferHoldHours, methods, online = false }) {
	const list = [
		'Actividad solo para personas mayores de 18 años.' +
			(online ? '' : ' Puede pedirse documento en la puerta.'),
		online
			? 'Cada entrada es para una persona. El link de la transmisión es personal: no lo compartas.'
			: 'Cada entrada tiene un QR y un código que sirven para una sola persona y un solo ingreso.',
		'Te mandamos las entradas por email apenas se acredita el pago.'
	];
	/** @type {string[]} */
	const holds = [];
	if (methods.includes('mercadopago')) {
		holds.push('Con Mercado Pago te reservamos el lugar 20 minutos mientras pagás.');
	}
	if (methods.includes('transferencia')) {
		holds.push(
			`Con transferencia te reservamos el lugar ${transferHoldHours} horas mientras mandás el comprobante por mail (confirmando la reserva con el link que te llega por mail; si no, se libera a las 2 horas).`
		);
	}
	if (holds.length) list.push(`${holds.join(' ')} Si no se completa el pago, el lugar se libera.`);
	return [...list, ...refundPolicy(contactEmail).paragraphs];
}

/**
 * Tope técnico del total de una orden, en pesos: no es un precio máximo (a la gorra cada quien
 * paga lo que quiere), solo una red contra errores de tipeo con muchos ceros y contra números
 * que ya no son montos razonables. También es el máximo de `a_la_gorra.sugerido`.
 */
export const ORDER_MAX_TOTAL = 100_000_000;

/**
 * "A la gorra": ¿el monto por entrada × cantidad pasa el tope técnico de la orden?
 *
 * @param {number} amount monto por entrada (pesos enteros)
 * @param {number} quantity
 */
export function exceedsOrderMax(amount, quantity) {
	return amount * Math.max(1, quantity) > ORDER_MAX_TOTAL;
}

/** Mensaje (para quien compra) cuando un monto a la gorra pasa el tope técnico. */
export const ORDER_MAX_MESSAGE = `Ese monto parece un error de tipeo: el total de la compra no puede pasar de $ ${ORDER_MAX_TOTAL.toLocaleString('es-AR')}. Revisá que no sobre ningún cero.`;

/**
 * "A la gorra": montos de los botones rápidos, de menor a mayor y sin repetidos: el mínimo (solo
 * si es mayor a 0), el sugerido, 1,5 × el sugerido (redondeado a los $ 100) y el doble.
 *
 * @param {number} min
 * @param {number} suggested
 * @returns {number[]}
 */
export function gorraQuickAmounts(min, suggested) {
	const amounts = [suggested, Math.round((suggested * 1.5) / 100) * 100, suggested * 2];
	if (min > 0) amounts.push(min);
	return [...new Set(amounts)]
		.filter((n) => n >= min && n <= ORDER_MAX_TOTAL)
		.sort((a, b) => a - b);
}

/**
 * Monto "a la gorra" escrito por la persona → pesos enteros, o `null` si no es un número válido.
 * Acepta "5000", "5.000", "$ 5.000" y "5000,00"; no acepta centavos distintos de cero ni negativos.
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseAmount(raw) {
	if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
	if (typeof raw !== 'string') return null;
	let s = raw
		.trim()
		.replace(/^\$\s*/, '')
		.replace(/\s/g, '');
	s = s.replace(/,0{1,2}$/, '');
	if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(s)) return null;
	const n = Number(s.replaceAll('.', ''));
	return Number.isSafeInteger(n) ? n : null;
}

/* ------------------------------------------------------------------------------------------ */
/*  Horarios de venta (apertura y cierre), siempre en hora de Argentina                        */
/* ------------------------------------------------------------------------------------------ */

/** Zona horaria de todos los horarios de venta. Argentina no tiene horario de verano: UTC−3. */
export const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Horario de venta del frontmatter (`tickets_open`, `tickets_close`, `close` de un tipo) →
 * milisegundos, o `null` si falta. Tira un error si está pero no se entiende.
 *
 * - Con zona (`2026-10-02T20:00-03:00`, `…Z`): ese instante.
 * - Sin zona (`2026-10-02T20:00`, `2026-10-02 20:00`): hora de Argentina.
 * - Solo fecha (`2026-10-02`): el fin de ese día en Argentina (23:59:59.999) si `endOfDay` (los
 *   cierres, compatible con cómo se usaba antes), o el principio (00:00) si no (la apertura).
 * - Un `Date` (algunos lectores de YAML convierten las fechas): si es medianoche UTC exacta se toma
 *   como "solo fecha".
 *
 * @param {unknown} value
 * @param {{ endOfDay?: boolean }} [opts]
 * @returns {number | null}
 */
export function parseSaleTime(value, { endOfDay = false } = {}) {
	if (value === undefined || value === null || value === '') return null;
	/** @param {number} y @param {number} m @param {number} d */
	const dayBound = (y, m, d) =>
		(endOfDay ? Date.UTC(y, m - 1, d, 23, 59, 59, 999) : Date.UTC(y, m - 1, d)) + AR_OFFSET_MS;
	if (value instanceof Date) {
		const t = value.getTime();
		if (Number.isNaN(t)) throw new TypeError('Fecha inválida');
		if (t % 86400000 === 0) {
			return dayBound(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
		}
		return t;
	}
	const s = String(value).trim();
	let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (m) {
		const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const check = new Date(Date.UTC(y, mo - 1, d));
		if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d)
			throw new TypeError(`Fecha inválida: "${s}"`);
		return dayBound(y, mo, d);
	}
	m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
	const iso = m ? `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}-03:00` : s;
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(iso))
		throw new TypeError(`Fecha y hora inválida: "${s}" (usá 2026-10-02T20:00-03:00)`);
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) throw new TypeError(`Fecha y hora inválida: "${s}"`);
	return t;
}

/**
 * Milisegundos → "jueves 2/10 a las 20:00" (hora de Argentina).
 * @param {number} ms
 */
export function formatSaleTime(ms) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('es-AR', {
			timeZone: AR_TIMEZONE,
			weekday: 'long',
			day: 'numeric',
			month: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(new Date(ms))
			.map((p) => [p.type, p.value])
	);
	return `${parts.weekday} ${parts.day}/${parts.month} a las ${parts.hour}:${parts.minute}`;
}

/**
 * Milisegundos → valor de un `<input type="datetime-local">` en hora de Argentina.
 * @param {number} ms
 */
export function toArgentinaLocalInput(ms) {
	return new Date(ms - AR_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * Texto del horario de venta para el público: "Abre el jueves 2/10 a las 20:00", "La venta
 * cierra el …" o "Venta cerrada".
 *
 * @param {{ opensAt?: number | null, closesAt?: number | null }} window
 * @param {number} [now]
 * @returns {string | null}
 */
export function saleWindowText({ opensAt, closesAt }, now = Date.now()) {
	if (opensAt && now < opensAt) return `Abre el ${formatSaleTime(opensAt)}`;
	if (closesAt && now >= closesAt) return 'Venta cerrada';
	if (closesAt) return `La venta cierra el ${formatSaleTime(closesAt)}`;
	return null;
}

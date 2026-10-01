/**
 * Venta de entradas en el editor de eventos (/admin/eventos/nuevo y /admin/eventos/<slug>/editar):
 * leer el frontmatter de entradas a un estado de formulario, validarlo y volver a escribirlo.
 *
 * Es código puro (sin red ni SvelteKit): corre igual en el navegador (validación en vivo), en el
 * servidor (validación antes de guardar) y en vitest. Las reglas de fondo son las de
 * `parseTicketConfig` (src/lib/server/tickets/config.js), que además se corre en el servidor
 * sobre el archivo final.
 *
 * Campos del frontmatter que maneja (ver docs/tickets.md):
 * - `tickets`: lista de tipos `{ id, name, price | a_la_gorra: { minimo, minimo_recomendado?,
 *   sugerido } | tiers, capacity, after }` (`capacity` es opcional: sin cupo = sin límite;
 *   `tiers`: tramos de preventa `{ id, name, price, quantity?, until? }`; `after`: id del tipo que
 *   se tiene que agotar o cerrar para que este se habilite);
 * - `payment_methods`, `tickets_open`, `tickets_close`, `modalidad`, `recordatorios`,
 *   `mp_fee_percent`, `puerta`, `puerta_precio`; y `close` (cierre propio) en cada tipo.
 * Los horarios se editan como `datetime-local` en hora de Argentina y se guardan con zona
 * (`2026-10-02T20:00-03:00`).
 * Nada del Fondo: es automático (solo en eventos con la etiqueta KinkyVibe).
 */
import { isMap, isSeq, parseDocument } from 'yaml';
import { joinMarkdown, serializeFrontmatter, splitMarkdown } from './eventDraft.js';
import tagsFactory from './tags.js';
import { formatARS } from './money.js';
import { chainCycle, unreachableAfter } from './ticketTiers.js';
import {
	ORDER_MAX_TOTAL,
	PAYMENT_METHODS,
	parseAmount,
	parseFeePercent,
	parseSaleTime,
	toArgentinaLocalInput
} from './tickets.js';

/** Id de la etiqueta que marca los eventos de KinkyVibe (src/lib/utils/hardcodedTags.js). */
export const KINKYVIBE_TAG = 'KinkyVibe';

/** Mismo formato que valida parseTicketConfig. */
export const TYPE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Claves de primer nivel que son solo de la venta de entradas. */
export const TICKET_KEYS = [
	'tickets',
	'payment_methods',
	'tickets_open',
	'tickets_close',
	'modalidad',
	'recordatorios',
	'mp_fee_percent',
	'puerta',
	'puerta_precio'
];

/** Largo máximo del precio en la puerta (texto libre). Igual que en config.js. */
export const DOOR_PRICE_MAX = 120;

/** Nombre que se propone para el primer tipo de entrada. */
export const FIRST_TYPE_NAME = 'General';

/** Máximo de tramos por tipo (igual que `MAX_TIERS` de config.js). */
export const MAX_TIERS = 10;

export const PAYMENT_METHOD_LABELS = /** @type {const} */ ({
	mercadopago: 'Mercado Pago',
	transferencia: 'Transferencia (se confirma a mano)'
});

/** @type {ReturnType<typeof tagsFactory> | undefined} */
let tagManager;

/**
 * ¿El evento tiene la etiqueta KinkyVibe? Resuelve los alias con el tag manager (así "kinkyvibe"
 * o "Kinkyvibe" también cuentan), no comparando texto.
 *
 * @param {{ tags?: unknown } | undefined} meta
 */
export function isKinkyVibeEvent(meta) {
	const tags = meta?.tags;
	if (!Array.isArray(tags)) return false;
	tagManager ??= tagsFactory();
	const tm = tagManager;
	return tags.some((t) => typeof t === 'string' && tm.get(t.trim())?.id === KINKYVIBE_TAG);
}

/**
 * ¿El evento es online? `modalidad: online | presencial` en el frontmatter manda; si falta, es
 * online si tiene la etiqueta "Online" y no tiene `location`. En los eventos online las entradas
 * llevan el link de la transmisión en lugar de un QR, y no hay control de ingreso.
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
 * @typedef {object} TicketTypeForm
 * @prop {string} key identificador local (para el `{#each}`), no se guarda
 * @prop {string | null} origId el `id` que ya tenía en el archivo (`null` = tipo nuevo). Nunca
 *   cambia: las órdenes guardan el id del tipo.
 * @prop {string} id
 * @prop {string} name
 * @prop {'price' | 'gorra' | 'tiers'} mode precio fijo, a la gorra o preventas (tramos)
 * @prop {string} price
 * @prop {string} min
 * @prop {string} recommended mínimo recomendado ('' = no hay; se muestra pero no se exige)
 * @prop {string} suggested
 * @prop {string} capacity '' = sin cupo (sin límite)
 * @prop {string} close cierre propio (datetime-local, hora de Argentina); '' = cierra con el evento
 * @prop {TierForm[]} tiers tramos de preventa (con `mode: 'tiers'`)
 * @prop {string} after `key` del tipo que se tiene que agotar o cerrar para que este se habilite
 *   ('' = siempre a la venta). Es la `key` local (no el id) porque los tipos nuevos todavía no
 *   tienen id; al guardar se escribe el id.
 */

/**
 * Un tramo de preventa en el formulario. Como los tipos, el `id` sale del nombre al crearlo y no
 * cambia nunca (las órdenes guardan el tramo).
 *
 * @typedef {object} TierForm
 * @prop {string} key
 * @prop {string | null} origId
 * @prop {string} id
 * @prop {string} name
 * @prop {string} price
 * @prop {string} quantity '' = sin cantidad (el resto, o hasta la fecha)
 * @prop {string} until datetime-local (hora de Argentina); '' = sin fecha
 */

/**
 * @typedef {object} TicketsForm
 * @prop {boolean} enabled
 * @prop {TicketTypeForm[]} types
 * @prop {{ mercadopago: boolean, transferencia: boolean }} methods
 * @prop {boolean} customOpen
 * @prop {string} openAt datetime-local (hora de Argentina)
 * @prop {boolean} customClose
 * @prop {string} closeAt datetime-local (hora de Argentina)
 * @prop {'' | 'online' | 'presencial'} modalidad '' = automático
 * @prop {boolean} reminders
 * @prop {string} mpFee '' = el de Ajustes de venta
 * @prop {boolean} door hay entradas en la puerta (`puerta`; solo eventos presenciales). Si el
 *   archivo no tiene `puerta`, arranca prendido (como se comportan esos eventos).
 * @prop {boolean} doorSet el archivo ya tiene `puerta: true | false` (si no, al guardar se escribe)
 * @prop {string} doorPrice precio en la puerta, texto libre ('' = no se muestra)
 */

let keyCounter = 0;
const newKey = () => `t${++keyCounter}`;

/** @param {unknown} v */
const str = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * Un tipo de entrada vacío (nuevo). El primero de un evento se propone como «General».
 *
 * @param {{ first?: boolean }} [opts]
 */
export function emptyTicketType({ first = false } = {}) {
	return /** @type {TicketTypeForm} */ ({
		key: newKey(),
		origId: null,
		id: '',
		name: first ? FIRST_TYPE_NAME : '',
		mode: 'price',
		price: '',
		min: '0',
		recommended: '',
		suggested: '',
		capacity: '',
		close: '',
		tiers: [],
		after: ''
	});
}

/**
 * Un tramo vacío. Se propone "Preventa N" (el último, "General": ver el componente).
 *
 * @param {number} index posición (desde 0)
 * @returns {TierForm}
 */
export function emptyTier(index) {
	return {
		key: newKey(),
		origId: null,
		id: '',
		name: `Preventa ${index + 1}`,
		price: '',
		quantity: '',
		until: ''
	};
}

/**
 * Tramos para un tipo que recién pasa a "Preventas": si ya tenía tramos, esos; si no, dos para
 * empezar: «Preventa 1» y «General» (el resto), con el precio que tenía el tipo en el último.
 *
 * @param {Pick<TicketTypeForm, 'tiers' | 'price'>} t
 * @returns {TierForm[]}
 */
export function tiersForMode(t) {
	if (t.tiers?.length) return t.tiers;
	return [emptyTier(0), { ...emptyTier(1), name: FIRST_TYPE_NAME, price: t.price ?? '' }];
}

/**
 * Una línea que explica cómo van a verse los tramos: "Preventa 1 ($ 8.000, las primeras 5) →
 * Preventa 2 ($ 9.000, hasta el 9/10) → General ($ 10.000, el resto)". Quien compra ve solo el
 * tramo vigente.
 *
 * @param {TierForm[]} tiers
 */
export function tierPreview(tiers) {
	if (!tiers.length) return '';
	const steps = tiers.map((tr, j) => {
		const p = parseAmount(tr.price);
		const q = tr.quantity.trim() && /^\d+$/.test(tr.quantity.trim()) ? Number(tr.quantity) : null;
		const until = LOCAL_RE.test(tr.until.trim())
			? `hasta el ${Number(tr.until.slice(8, 10))}/${Number(tr.until.slice(5, 7))}`
			: '';
		const first = j === 0 ? 'primeras' : 'siguientes';
		const parts = [
			p === null ? '$ ?' : formatARS(p),
			q !== null ? (q === 1 ? (j === 0 ? 'la primera' : 'la siguiente') : `las ${first} ${q}`) : '',
			until,
			q === null && !until ? 'el resto' : ''
		].filter(Boolean);
		return `${tr.name.trim() || `Tramo ${j + 1}`} (${parts.join(', ')})`;
	});
	return `Quien compra ve solo el tramo vigente: ${steps.join(' → ')}.`;
}

/**
 * Horario del frontmatter → valor de un datetime-local en hora de Argentina ('' si falta; el
 * texto tal cual si no se entiende, para que la validación lo marque).
 * @param {unknown} value
 * @param {boolean} endOfDay
 */
function toLocalInput(value, endOfDay) {
	try {
		const ms = parseSaleTime(value, { endOfDay });
		return ms === null ? '' : toArgentinaLocalInput(ms);
	} catch {
		return str(value);
	}
}

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
/** datetime-local → lo que se guarda (con la zona de Argentina). @param {string} v */
const withZone = (v) => `${v}-03:00`;
/** @param {string} v */
const localMs = (v) => (LOCAL_RE.test(v) ? new Date(withZone(v)).getTime() : NaN);

/**
 * Estado del formulario a partir del frontmatter (ya parseado). Tolera datos raros: los muestra
 * tal cual para que la validación diga qué está mal.
 *
 * @param {Record<string, any>} meta
 * @returns {TicketsForm}
 */
export function readTicketsForm(meta) {
	const list = Array.isArray(meta?.tickets) ? meta.tickets : [];
	/** @type {string[]} */
	const afterIds = [];
	const types = list.map((raw) => {
		const gorra = raw?.a_la_gorra !== undefined && raw?.a_la_gorra !== null;
		const tiered = !gorra && Array.isArray(raw?.tiers);
		const id = str(raw?.id);
		afterIds.push(str(raw?.after).trim());
		return /** @type {TicketTypeForm} */ ({
			key: newKey(),
			origId: id || null,
			id,
			name: str(raw?.name),
			mode: gorra ? 'gorra' : tiered ? 'tiers' : 'price',
			price: gorra || tiered ? '' : str(raw?.price),
			min: gorra ? str(raw.a_la_gorra?.minimo) : '0',
			recommended: gorra ? str(raw.a_la_gorra?.minimo_recomendado) : '',
			suggested: gorra ? str(raw.a_la_gorra?.sugerido) : '',
			capacity: str(raw?.capacity),
			close: toLocalInput(raw?.close, true),
			tiers: tiered
				? raw.tiers.map((/** @type {any} */ tr) => {
						const tid = str(tr?.id);
						return {
							key: newKey(),
							origId: tid || null,
							id: tid,
							name: str(tr?.name),
							price: str(tr?.price),
							quantity: str(tr?.quantity),
							until: toLocalInput(tr?.until, true)
						};
					})
				: [],
			after: ''
		});
	});
	// `after` (id) → la key local del tipo al que apunta. Si no existe, queda el id tal cual (la
	// validación dice que no existe).
	types.forEach((t, i) => {
		const target = afterIds[i];
		if (!target) return;
		t.after = types.find((o) => o.origId === target)?.key ?? `missing:${target}`;
	});
	const methodList =
		meta?.payment_methods === undefined || meta?.payment_methods === null
			? ['mercadopago']
			: (Array.isArray(meta.payment_methods) ? meta.payment_methods : [meta.payment_methods]).map(
					(m) => str(m).trim().toLowerCase()
				);
	const openAt = toLocalInput(meta?.tickets_open, false);
	const closeAt = toLocalInput(meta?.tickets_close, true);
	const modalidad = str(meta?.modalidad).trim().toLowerCase();
	return {
		enabled: meta?.tickets !== undefined && meta?.tickets !== null,
		types,
		methods: {
			mercadopago: methodList.includes('mercadopago'),
			transferencia: methodList.includes('transferencia')
		},
		customOpen: Boolean(openAt),
		openAt,
		customClose: Boolean(closeAt),
		closeAt,
		modalidad:
			modalidad === 'online' || modalidad === 'virtual'
				? 'online'
				: modalidad === 'presencial'
					? 'presencial'
					: '',
		reminders: meta?.recordatorios !== false,
		mpFee:
			meta?.mp_fee_percent === undefined || meta?.mp_fee_percent === null
				? ''
				: str(meta.mp_fee_percent),
		door: meta?.puerta !== false,
		doorSet: typeof meta?.puerta === 'boolean',
		doorPrice: str(meta?.puerta_precio)
	};
}

/**
 * Nombre → id para un tipo nuevo ("Anticipada 2x1" → "anticipada-2x1"), sin repetir.
 *
 * @param {string} name
 * @param {Iterable<string>} taken
 */
export function typeIdFor(name, taken) {
	const used = new Set(taken);
	let base =
		String(name ?? '')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 36)
			.replace(/-+$/, '') || 'entrada';
	if (!/^[a-z0-9]/.test(base)) base = `e-${base}`;
	if (!used.has(base)) return base;
	for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Los ids de los tipos nuevos se derivan del nombre; los que ya existían no cambian nunca.
 *
 * @param {TicketTypeForm[]} types
 * @returns {TicketTypeForm[]}
 */
export function withTypeIds(types) {
	const fixed = types.filter((t) => t.origId).map((t) => /** @type {string} */ (t.origId));
	const taken = new Set(fixed);
	return types.map((t) => {
		const tiers = withTierIds(t.tiers ?? []);
		if (t.origId) return { ...t, id: t.origId, tiers };
		const id = typeIdFor(t.name, taken);
		taken.add(id);
		return { ...t, id, tiers };
	});
}

/**
 * Lo mismo para los tramos de un tipo: los que ya existían no cambian de id.
 *
 * @param {TierForm[]} tiers
 * @returns {TierForm[]}
 */
export function withTierIds(tiers) {
	const taken = new Set(tiers.filter((t) => t.origId).map((t) => /** @type {string} */ (t.origId)));
	return tiers.map((t) => {
		if (t.origId) return { ...t, id: t.origId };
		const id = typeIdFor(t.name, taken);
		taken.add(id);
		return { ...t, id };
	});
}

/**
 * Id del tipo al que apunta `after` (con los ids ya calculados), o '' si no apunta a ninguno.
 *
 * @param {TicketTypeForm[]} types con ids (`withTypeIds`)
 * @param {string} after
 */
function afterId(types, after) {
	if (!after) return '';
	if (after.startsWith('missing:')) return after.slice('missing:'.length);
	return types.find((t) => t.key === after)?.id ?? '';
}

/**
 * @typedef {Record<string, { sold: number, held: number, tiers?: Record<string, number> }>}
 *   SalesByType vendidas y reservadas por id de tipo (lo que ya hay en la base); `tiers`: lo
 *   tomado (vendidas + reservadas) por id de tramo
 */

/** @param {SalesByType | undefined} sales @param {string | null} id */
const salesOf = (sales, id) => {
	const s = id && sales ? sales[id] : undefined;
	return s ? s.sold + s.held : 0;
};

/**
 * Valida el formulario con las mismas reglas que la venta (pesos enteros, mínimo ≤ sugerido,
 * ...). Con `sales` (al editar un evento que ya vendió), además bloquea lo que rompería órdenes
 * existentes y avisa de lo que no las cambia.
 *
 * @param {TicketsForm} form
 * @param {{ sales?: SalesByType }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateTicketsForm(form, { sales } = {}) {
	/** @type {string[]} */
	const errors = [];
	/** @type {string[]} */
	const warnings = [];
	const soldTotal = sales ? Object.values(sales).reduce((s, x) => s + x.sold + x.held, 0) : 0;
	if (!form.enabled) {
		if (soldTotal > 0)
			errors.push(
				`No se puede apagar la venta: ya hay ${soldTotal} entradas vendidas o reservadas. Para cortar la venta, cambiá el estado a «Agotadas» o poné una fecha de cierre.`
			);
		return { errors, warnings };
	}
	if (!form.types.length) errors.push('Agregá al menos un tipo de entrada.');
	const types = withTypeIds(form.types);
	types.forEach((t, i) => {
		const label = `Entrada ${i + 1}${t.name.trim() ? ` («${t.name.trim()}»)` : ''}`;
		if (!t.name.trim()) errors.push(`${label}: falta el nombre.`);
		else if (t.name.trim().length > 60) errors.push(`${label}: el nombre es muy largo (hasta 60).`);
		if (!TYPE_ID_RE.test(t.id)) errors.push(`${label}: el id «${t.id}» no es válido.`);
		// Cupo vacío = sin límite.
		const capacity = t.capacity.trim() ? parseCount(t.capacity) : null;
		if (t.capacity.trim() && capacity === null)
			errors.push(
				`${label}: el cupo tiene que ser un número entero (0 o más), o quedar vacío para no tener límite.`
			);
		const taken = salesOf(sales, t.origId);
		if (capacity !== null && taken > capacity)
			errors.push(
				`${label}: ya hay ${taken} entradas vendidas o reservadas, el cupo no puede ser menor.`
			);
		if (t.mode === 'gorra') {
			const min = parseAmount(t.min.trim() === '' ? '0' : t.min);
			const suggested = parseAmount(t.suggested);
			if (min === null)
				errors.push(`${label}: el mínimo tiene que ser en pesos enteros (0 o más).`);
			if (suggested === null)
				errors.push(`${label}: el monto sugerido tiene que ser en pesos enteros.`);
			else if (min !== null && suggested < min)
				errors.push(`${label}: el sugerido no puede ser menor que el mínimo.`);
			else if (suggested > ORDER_MAX_TOTAL)
				errors.push(`${label}: el sugerido es demasiado alto (¿sobra un cero?).`);
			if (t.recommended.trim()) {
				const rec = parseAmount(t.recommended);
				if (rec === null)
					errors.push(`${label}: el mínimo recomendado tiene que ser en pesos enteros.`);
				else if (min !== null && rec < min)
					errors.push(`${label}: el mínimo recomendado no puede ser menor que el mínimo.`);
				else if (suggested !== null && rec > suggested)
					errors.push(`${label}: el mínimo recomendado no puede ser mayor que el sugerido.`);
			}
		} else if (t.mode === 'tiers') {
			validateTiers(t, label, sales, errors);
		} else {
			const price = parseAmount(t.price);
			if (price === null || price <= 0)
				errors.push(`${label}: el precio tiene que ser en pesos enteros, mayor a 0.`);
			else if (price > ORDER_MAX_TOTAL)
				errors.push(`${label}: el precio es demasiado alto (¿sobra un cero?).`);
		}
		if (t.mode !== 'tiers' && sales && t.origId) {
			const tierSales = Object.values(sales[t.origId]?.tiers ?? {}).reduce((a, b) => a + b, 0);
			if (tierSales > 0)
				warnings.push(
					`${label}: ya se vendieron entradas en preventa. Sin tramos, las compras nuevas pagan el precio fijo; las hechas no cambian.`
				);
		}
		/* Encadenado: se habilita cuando otro tipo se agota o cierra. */
		if (t.after) {
			const target = types.find((o) => o.key === t.after);
			if (!target) errors.push(`${label}: el tipo del que depende ya no existe.`);
			else if (target.key === t.key)
				errors.push(`${label}: no puede habilitarse después de sí mismo.`);
			else if (neverEnds(target))
				warnings.push(
					`${label}: se habilita cuando se agote o cierre «${target.name.trim() || target.id}», pero ese tipo no tiene cupo, ni tramos con cantidad, ni cierre propio: puede que no se habilite nunca antes del evento.`
				);
		}
	});
	if (chainCycle(types.map((t) => ({ id: t.key, after: t.after || null }))))
		errors.push('Los tipos encadenados forman un círculo: revisá «Se habilita cuando…».');
	const ids = types.map((t) => t.id);
	if (new Set(ids).size !== ids.length) errors.push('Hay dos tipos de entrada con el mismo id.');
	if (sales) {
		for (const [id, s] of Object.entries(sales)) {
			if (s.sold + s.held > 0 && !types.some((t) => t.origId === id))
				errors.push(
					`No se puede borrar el tipo «${id}»: ya tiene ${s.sold + s.held} entradas vendidas o reservadas.`
				);
		}
		const changed = types.filter((t) => salesOf(sales, t.origId) > 0);
		if (changed.length)
			warnings.push(
				'Las entradas ya vendidas mantienen el precio con el que se compraron: los cambios de precio valen para las compras nuevas.'
			);
	}
	if (!form.methods.mercadopago && !form.methods.transferencia)
		errors.push('Elegí al menos un medio de pago.');
	const openMs = form.customOpen ? localMs(form.openAt) : null;
	const closeMs = form.customClose ? localMs(form.closeAt) : null;
	if (form.customOpen && Number.isNaN(openMs))
		errors.push('Completá el día y la hora en que abre la venta.');
	if (form.customClose && Number.isNaN(closeMs))
		errors.push('Completá el día y la hora en que cierra la venta.');
	if (
		openMs !== null &&
		closeMs !== null &&
		!Number.isNaN(openMs) &&
		openMs >= /** @type {number} */ (closeMs)
	)
		errors.push('La venta tiene que abrir antes de cerrar.');
	types.forEach((t, i) => {
		if (t.close.trim() && Number.isNaN(localMs(t.close.trim())))
			errors.push(
				`Entrada ${i + 1}: completá el día y la hora del cierre propio (o dejalo vacío).`
			);
	});

	if (form.mpFee.trim() && parseFeePercent(form.mpFee) === null)
		errors.push('La comisión de Mercado Pago tiene que ser un porcentaje entre 0 y 49,99.');
	if (form.door && form.doorPrice.trim().length > DOOR_PRICE_MAX)
		errors.push(`El precio en la puerta es muy largo (hasta ${DOOR_PRICE_MAX} caracteres).`);
	return { errors, warnings };
}

/**
 * Valida los tramos de un tipo (preventas).
 *
 * @param {TicketTypeForm} t con ids (`withTypeIds`)
 * @param {string} label
 * @param {SalesByType | undefined} sales
 * @param {string[]} errors
 */
function validateTiers(t, label, sales, errors) {
	if (!t.tiers.length) {
		errors.push(`${label}: agregá al menos un tramo de preventa (o elegí precio fijo).`);
		return;
	}
	if (t.tiers.length > MAX_TIERS) errors.push(`${label}: hasta ${MAX_TIERS} tramos.`);
	const tierSales = (t.origId && sales?.[t.origId]?.tiers) || {};
	/** @type {{ quantity: number | null, until: number | null }[]} */
	const shape = [];
	t.tiers.forEach((tr, j) => {
		const tl = `${label}, tramo ${j + 1}${tr.name.trim() ? ` («${tr.name.trim()}»)` : ''}`;
		if (!tr.name.trim()) errors.push(`${tl}: falta el nombre.`);
		else if (tr.name.trim().length > 60) errors.push(`${tl}: el nombre es muy largo (hasta 60).`);
		if (!TYPE_ID_RE.test(tr.id)) errors.push(`${tl}: el id «${tr.id}» no es válido.`);
		const price = parseAmount(tr.price);
		if (price === null || price <= 0)
			errors.push(`${tl}: el precio tiene que ser en pesos enteros, mayor a 0.`);
		else if (price > ORDER_MAX_TOTAL)
			errors.push(`${tl}: el precio es demasiado alto (¿sobra un cero?).`);
		const quantity = tr.quantity.trim() ? parseCount(tr.quantity) : null;
		if (tr.quantity.trim() && (quantity === null || quantity < 1))
			errors.push(`${tl}: la cantidad tiene que ser un número entero desde 1, o quedar vacía.`);
		const taken = tr.origId ? (tierSales[tr.origId] ?? 0) : 0;
		if (quantity !== null && taken > quantity)
			errors.push(
				`${tl}: ya hay ${taken} entradas vendidas o reservadas en este tramo, la cantidad no puede ser menor.`
			);
		const until = tr.until.trim() ? localMs(tr.until.trim()) : null;
		if (until !== null && Number.isNaN(until))
			errors.push(`${tl}: completá el día y la hora (o dejalo vacío).`);
		shape.push({ quantity, until: until !== null && !Number.isNaN(until) ? until : null });
	});
	const stuck = unreachableAfter(shape);
	if (stuck !== -1)
		errors.push(
			`${label}: el tramo ${stuck + 1} no tiene cantidad ni fecha, así que los que siguen nunca se venderían. Poné una cantidad o una fecha, o movelo al final.`
		);
	const ids = t.tiers.map((tr) => tr.id);
	if (new Set(ids).size !== ids.length) errors.push(`${label}: hay dos tramos con el mismo id.`);
	for (const [id, n] of Object.entries(tierSales)) {
		if (n > 0 && !t.tiers.some((tr) => tr.origId === id))
			errors.push(
				`${label}: no se puede borrar el tramo «${id}»: ya tiene ${n} entradas vendidas o reservadas.`
			);
	}
}

/**
 * ¿Un tipo puede no agotarse ni cerrar nunca antes del evento? (sin cupo, sin cierre propio y sin
 * un último tramo con cantidad). Solo para avisar en los encadenados.
 *
 * @param {TicketTypeForm} t
 */
function neverEnds(t) {
	if (t.capacity.trim() || t.close.trim()) return false;
	if (t.mode === 'tiers') {
		const last = t.tiers[t.tiers.length - 1];
		return !last || !last.quantity.trim();
	}
	return true;
}

/** @param {string} raw @returns {number | null} */
function parseCount(raw) {
	const s = String(raw ?? '').trim();
	if (!/^\d+$/.test(s)) return null;
	const n = Number(s);
	return Number.isSafeInteger(n) ? n : null;
}

/** @param {TierForm} tr */
const normalizedTier = (tr) => ({
	id: tr.id,
	name: tr.name.trim(),
	price: parseAmount(tr.price) ?? tr.price,
	quantity: tr.quantity.trim() ? (parseCount(tr.quantity) ?? tr.quantity) : null,
	until: tr.until.trim()
});

/**
 * @param {TicketTypeForm} t con ids (`withTypeIds`)
 * @param {TicketTypeForm[]} all todos los tipos, con ids (para escribir `after` como id)
 */
const normalizedType = (t, all) => ({
	id: t.id,
	name: t.name.trim(),
	mode: t.mode,
	price: t.mode === 'price' ? (parseAmount(t.price) ?? t.price) : null,
	min: t.mode === 'gorra' ? (parseAmount(t.min || '0') ?? t.min) : null,
	recommended:
		t.mode === 'gorra' && t.recommended.trim()
			? (parseAmount(t.recommended) ?? t.recommended)
			: null,
	suggested: t.mode === 'gorra' ? (parseAmount(t.suggested) ?? t.suggested) : null,
	capacity: t.capacity.trim() ? (parseCount(t.capacity) ?? t.capacity) : null,
	close: t.close.trim(),
	tiers: t.mode === 'tiers' ? (t.tiers ?? []).map(normalizedTier) : null,
	after: afterId(all, t.after ?? '')
});

/** @param {TicketTypeForm[]} types */
const normalizedTypes = (types) => {
	const all = withTypeIds(types);
	return all.map((t) => normalizedType(t, all));
};

/**
 * Forma "normalizada" del formulario, para saber si algo cambió.
 * @param {TicketsForm} f
 */
function normalized(f) {
	return JSON.stringify({
		enabled: f.enabled,
		types: f.enabled ? normalizedTypes(f.types) : [],
		methods: f.enabled ? f.methods : null,
		open: f.enabled && f.customOpen ? f.openAt : '',
		close: f.enabled && f.customClose ? f.closeAt : '',
		modalidad: f.enabled ? f.modalidad : '',
		reminders: f.enabled ? f.reminders : true,
		mpFee: f.enabled ? f.mpFee.trim() : '',
		door: f.enabled ? f.door : true,
		doorPrice: f.enabled && f.door ? f.doorPrice.trim() : ''
	});
}

/**
 * ¿El formulario cambió respecto del inicial?
 * @param {TicketsForm} initial
 * @param {TicketsForm} current
 */
export function ticketsFormChanged(initial, current) {
	return normalized(initial) !== normalized(current);
}

/** @param {string} v */
const amount = (v) => /** @type {number} */ (parseAmount(v.trim() === '' ? '0' : v));

/**
 * Aplica el formulario al frontmatter (texto YAML), tocando solo lo que cambió respecto de
 * `initial` y conservando comentarios, orden y las claves que el editor no conoce (también dentro
 * de cada tipo de entrada). Suponé que el formulario ya pasó `validateTicketsForm`.
 *
 * @param {string} frontmatter
 * @param {TicketsForm} form
 * @param {TicketsForm} initial el estado leído de este mismo frontmatter
 * @returns {string}
 */
export function applyTicketsForm(frontmatter, form, initial) {
	const formChanged = ticketsFormChanged(initial, form);
	// Un evento con venta y sin `puerta` recibe la clave explícita al guardarlo (ver abajo).
	if (!formChanged && !needsDoorKey(form, initial)) return frontmatter;
	const doc = parseDocument(frontmatter.replace(/\r\n?/g, '\n'));
	if (doc.errors.length) throw new Error(doc.errors[0].message);
	// @ts-ignore frontmatter vacío
	if (doc.contents === null) doc.contents = doc.createNode({});
	if (!form.enabled) {
		for (const key of TICKET_KEYS) doc.delete(key);
		return serializeFrontmatter(doc);
	}

	/* tickets: se actualiza cada tipo en su lugar (así quedan sus comentarios y claves extra). */
	const types = withTypeIds(form.types);
	const current = doc.get('tickets', true);
	/** @type {Map<string, any>} */
	const byId = new Map();
	if (isSeq(current)) {
		for (const item of current.items) {
			if (isMap(item)) byId.set(String(item.get('id')), item);
		}
	}
	/** @type {Map<string, string>} */
	const initialTypes = new Map(
		normalizedTypes(initial.enabled ? initial.types : []).map((n) => [n.id, JSON.stringify(n)])
	);
	const items = types.map((t) => {
		const existing = t.origId ? byId.get(t.origId) : undefined;
		const norm = normalizedType(t, types);
		// Un tipo que no cambió queda tal cual (con sus comentarios y claves viejas).
		if (existing && initialTypes.get(t.id) === JSON.stringify(norm)) return existing;
		const node = existing ?? doc.createNode({ id: t.id });
		node.set('name', t.name.trim());
		const nodeMode = node.has('tiers') ? 'tiers' : node.has('a_la_gorra') ? 'gorra' : 'price';
		const modeChanged = existing ? nodeMode !== t.mode : false;
		if (t.mode === 'gorra') {
			node.delete('price');
			node.delete('tiers');
			const gorra = doc.createNode(
				t.recommended.trim()
					? {
							minimo: amount(t.min),
							minimo_recomendado: amount(t.recommended),
							sugerido: amount(t.suggested)
						}
					: { minimo: amount(t.min), sugerido: amount(t.suggested) }
			);
			gorra.flow = true;
			node.set('a_la_gorra', gorra);
		} else if (t.mode === 'tiers') {
			node.delete('price');
			node.delete('a_la_gorra');
			node.set(
				'tiers',
				doc.createNode(
					t.tiers.map((tr) => {
						/** @type {Record<string, string | number>} */
						const out = { id: tr.id, name: tr.name.trim(), price: amount(tr.price) };
						if (tr.quantity.trim()) out.quantity = Number(tr.quantity.trim());
						if (tr.until.trim()) out.until = withZone(tr.until.trim());
						return out;
					})
				)
			);
		} else {
			node.delete('a_la_gorra');
			node.delete('tiers');
			node.set('price', amount(t.price));
		}
		// El fondo en pesos por tipo ya no existe (el Fondo es automático).
		node.delete('fondo');
		// `capacity` después del precio, como en la documentación (en su lugar si ya estaba). Sin
		// cupo (vacío): sin `capacity`, sin límite.
		if (modeChanged || !node.has('capacity')) node.delete('capacity');
		if (t.capacity.trim()) node.set('capacity', Number(t.capacity.trim()));
		else node.delete('capacity');
		// Cierre propio del tipo (opcional).
		if (t.close.trim()) node.set('close', withZone(t.close.trim()));
		else node.delete('close');
		// Encadenado (opcional): el id del tipo que se tiene que agotar o cerrar.
		if (norm.after) node.set('after', norm.after);
		else node.delete('after');
		return node;
	});
	if (isSeq(current)) current.items = items;
	else doc.set('tickets', doc.createNode(items));

	/* Claves de primer nivel: solo si cambiaron; los valores por defecto se borran. */
	const methods = PAYMENT_METHODS.filter((m) => form.methods[m]);
	const initialMethods = PAYMENT_METHODS.filter((m) => initial.methods[m]);
	if (!initial.enabled || methods.join() !== initialMethods.join()) {
		if (methods.length === 1 && methods[0] === 'mercadopago') doc.delete('payment_methods');
		else {
			const node = doc.createNode(methods);
			node.flow = true;
			doc.set('payment_methods', node);
		}
	}
	for (const [key, on, value, wasOn, was] of /** @type {const} */ ([
		['tickets_open', form.customOpen, form.openAt, initial.customOpen, initial.openAt],
		['tickets_close', form.customClose, form.closeAt, initial.customClose, initial.closeAt]
	])) {
		const next = on ? value : '';
		if (next !== (wasOn ? was : '')) {
			if (next) doc.set(key, withZone(next));
			else doc.delete(key);
		}
	}
	if (form.modalidad !== initial.modalidad) {
		if (form.modalidad) doc.set('modalidad', form.modalidad);
		else doc.delete('modalidad');
	}
	if (form.reminders !== initial.reminders || !initial.enabled) {
		if (form.reminders) doc.delete('recordatorios');
		else doc.set('recordatorios', false);
	}
	if (form.mpFee.trim() !== initial.mpFee.trim()) {
		if (form.mpFee.trim())
			doc.set('mp_fee_percent', Number(form.mpFee.trim().replace(',', '.').replace(/\s*%$/, '')));
		else doc.delete('mp_fee_percent');
	}
	/* Entradas en la puerta (eventos presenciales): siempre `puerta: true | false` explícito al
	   guardar (también en los eventos que no lo tenían), y el precio solo si está prendido. */
	const doorPrice = form.door ? form.doorPrice.trim() : '';
	const initialDoorPrice = initial.enabled && initial.door ? initial.doorPrice.trim() : '';
	const setDoor =
		!isOnlineEvent(/** @type {Record<string, any>} */ (doc.toJS() ?? {})) &&
		(!initial.enabled || !initial.doorSet || form.door !== initial.door);
	if (setDoor) doc.set('puerta', form.door);
	// Sin cambios en el formulario y evento online: no hay nada que escribir.
	if (!formChanged && !setDoor) return frontmatter;
	if (doorPrice !== initialDoorPrice) {
		if (doorPrice) doc.set('puerta_precio', doorPrice);
		else doc.delete('puerta_precio');
	}
	return serializeFrontmatter(doc);
}

/**
 * ¿Hay que escribir `puerta` aunque el formulario no cambió? Sí si el evento vende y el archivo
 * todavía no tiene `puerta: true | false` (así cada evento que se guarda queda con una elección
 * explícita). En los online no se escribe (lo decide `applyTicketsForm`).
 *
 * @param {TicketsForm} form
 * @param {TicketsForm} initial
 */
function needsDoorKey(form, initial) {
	return form.enabled && initial.enabled && !initial.doorSet;
}

/**
 * Lo mismo que `applyTicketsForm`, sobre el archivo completo (frontmatter + texto).
 *
 * @param {string} raw
 * @param {TicketsForm} form
 * @param {TicketsForm} initial
 */
export function applyTicketsToMarkdown(raw, form, initial) {
	if (!ticketsFormChanged(initial, form) && !needsDoorKey(form, initial)) return raw;
	const { frontmatter, body } = splitMarkdown(raw);
	return joinMarkdown(applyTicketsForm(frontmatter, form, initial), body);
}

/**
 * Resumen corto para la revisión: "General $ 10.000 (40) · A la gorra (sugerido $ 5.000, 100)".
 * @param {TicketsForm} form
 * @param {(n: number) => string} formatARS
 */
export function describeTicketsForm(form, formatARS) {
	if (!form.enabled) return 'Sin venta de entradas por el sitio';
	const door =
		form.modalidad === 'online'
			? ''
			: !form.door
				? ' · Solo anticipadas'
				: form.doorPrice.trim()
					? ` · También en la puerta (${form.doorPrice.trim()})`
					: '';
	const all = withTypeIds(form.types);
	return (
		all
			.map((t) => {
				const cap = t.capacity.trim() ? `, cupo ${t.capacity.trim()}` : ', sin cupo';
				const after = t.after
					? ` (cuando se agote «${all.find((o) => o.key === t.after)?.name.trim() ?? '?'}»)`
					: '';
				if (t.mode === 'tiers') {
					const steps = t.tiers
						.map((tr) => {
							const p = parseAmount(tr.price);
							const extra = [
								tr.quantity.trim() ? `${tr.quantity.trim()}` : '',
								tr.until.trim() && LOCAL_RE.test(tr.until.trim())
									? `hasta ${tr.until.trim().slice(8, 10)}/${tr.until.trim().slice(5, 7)}`
									: ''
							]
								.filter(Boolean)
								.join(', ');
							return `${tr.name.trim() || '?'} ${p === null ? '?' : formatARS(p)}${extra ? ` (${extra})` : ''}`;
						})
						.join(' → ');
					return `${t.name.trim() || t.id}: ${steps}${cap}${after}`;
				}
				if (t.mode === 'gorra') {
					const s = parseAmount(t.suggested);
					const m = parseAmount(t.min || '0');
					const r = t.recommended.trim() ? parseAmount(t.recommended) : null;
					return `${t.name.trim() || t.id}: a la gorra (sugerido ${s === null ? '?' : formatARS(s)}${
						r ? `, mínimo recomendado ${formatARS(r)}` : ''
					}${m ? `, mínimo ${formatARS(m)}` : ''}${cap})`;
				}
				const p = parseAmount(t.price);
				return `${t.name.trim() || t.id}: ${p === null ? '?' : formatARS(p)}${cap}${after}`;
			})
			.join(' · ') + door
	);
}

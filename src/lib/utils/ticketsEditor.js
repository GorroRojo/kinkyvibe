/**
 * Venta de entradas en el editor de eventos (/admin/eventos/nuevo y /edit/calendario/<slug>):
 * leer el frontmatter de entradas a un estado de formulario, validarlo y volver a escribirlo.
 *
 * Es código puro (sin red ni SvelteKit): corre igual en el navegador (validación en vivo), en el
 * servidor (validación antes de guardar) y en vitest. Las reglas de fondo son las de
 * `parseTicketConfig` (src/lib/server/tickets/config.js), que además se corre en el servidor
 * sobre el archivo final.
 *
 * Campos del frontmatter que maneja (ver docs/tickets.md):
 * - `tickets`: lista de tipos `{ id, name, price | a_la_gorra: { minimo, sugerido }, capacity }`;
 * - `payment_methods`, `tickets_open`, `tickets_close`, `modalidad`, `recordatorios`,
 *   `mp_fee_percent`; y `close` (cierre propio) en cada tipo.
 * Los horarios se editan como `datetime-local` en hora de Argentina y se guardan con zona
 * (`2026-10-02T20:00-03:00`).
 * Nada del Fondo: es automático (solo en eventos con la etiqueta KinkyVibe).
 */
import { isMap, isSeq, parseDocument } from 'yaml';
import { joinMarkdown, serializeFrontmatter, splitMarkdown } from './eventDraft.js';
import tagsFactory from './tags.js';
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
	'mp_fee_percent'
];

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
 * @prop {'price' | 'gorra'} mode
 * @prop {string} price
 * @prop {string} min
 * @prop {string} suggested
 * @prop {string} capacity
 * @prop {string} close cierre propio (datetime-local, hora de Argentina); '' = cierra con el evento
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
 */

let keyCounter = 0;
const newKey = () => `t${++keyCounter}`;

/** @param {unknown} v */
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** Un tipo de entrada vacío (nuevo). */
export function emptyTicketType() {
	return /** @type {TicketTypeForm} */ ({
		key: newKey(),
		origId: null,
		id: '',
		name: '',
		mode: 'price',
		price: '',
		min: '0',
		suggested: '',
		capacity: '',
		close: ''
	});
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
	const types = list.map((raw) => {
		const gorra = raw?.a_la_gorra !== undefined && raw?.a_la_gorra !== null;
		const id = str(raw?.id);
		return /** @type {TicketTypeForm} */ ({
			key: newKey(),
			origId: id || null,
			id,
			name: str(raw?.name),
			mode: gorra ? 'gorra' : 'price',
			price: gorra ? '' : str(raw?.price),
			min: gorra ? str(raw.a_la_gorra?.minimo) : '0',
			suggested: gorra ? str(raw.a_la_gorra?.sugerido) : '',
			capacity: str(raw?.capacity),
			close: toLocalInput(raw?.close, true)
		});
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
				: str(meta.mp_fee_percent)
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
		if (t.origId) return { ...t, id: t.origId };
		const id = typeIdFor(t.name, taken);
		taken.add(id);
		return { ...t, id };
	});
}

/**
 * @typedef {Record<string, { sold: number, held: number }>} SalesByType vendidas y reservadas
 *   por id de tipo (lo que ya hay en la base)
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
		const capacity = parseCount(t.capacity);
		if (capacity === null)
			errors.push(`${label}: el cupo tiene que ser un número entero (0 o más).`);
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
		} else {
			const price = parseAmount(t.price);
			if (price === null || price <= 0)
				errors.push(`${label}: el precio tiene que ser en pesos enteros, mayor a 0.`);
			else if (price > ORDER_MAX_TOTAL)
				errors.push(`${label}: el precio es demasiado alto (¿sobra un cero?).`);
		}
	});
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
	return { errors, warnings };
}

/** @param {string} raw @returns {number | null} */
function parseCount(raw) {
	const s = String(raw ?? '').trim();
	if (!/^\d+$/.test(s)) return null;
	const n = Number(s);
	return Number.isSafeInteger(n) ? n : null;
}

/** @param {TicketTypeForm} t */
const normalizedType = (t) => ({
	id: t.id,
	name: t.name.trim(),
	mode: t.mode,
	price: t.mode === 'price' ? (parseAmount(t.price) ?? t.price) : null,
	min: t.mode === 'gorra' ? (parseAmount(t.min || '0') ?? t.min) : null,
	suggested: t.mode === 'gorra' ? (parseAmount(t.suggested) ?? t.suggested) : null,
	capacity: parseCount(t.capacity) ?? t.capacity,
	close: t.close.trim()
});

/**
 * Forma "normalizada" del formulario, para saber si algo cambió.
 * @param {TicketsForm} f
 */
function normalized(f) {
	return JSON.stringify({
		enabled: f.enabled,
		types: f.enabled ? withTypeIds(f.types).map(normalizedType) : [],
		methods: f.enabled ? f.methods : null,
		open: f.enabled && f.customOpen ? f.openAt : '',
		close: f.enabled && f.customClose ? f.closeAt : '',
		modalidad: f.enabled ? f.modalidad : '',
		reminders: f.enabled ? f.reminders : true,
		mpFee: f.enabled ? f.mpFee.trim() : ''
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
	if (!ticketsFormChanged(initial, form)) return frontmatter;
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
		withTypeIds(initial.enabled ? initial.types : []).map((t) => [
			t.id,
			JSON.stringify(normalizedType(t))
		])
	);
	const items = types.map((t) => {
		const existing = t.origId ? byId.get(t.origId) : undefined;
		// Un tipo que no cambió queda tal cual (con sus comentarios y claves viejas).
		if (existing && initialTypes.get(t.id) === JSON.stringify(normalizedType(t))) return existing;
		const node = existing ?? doc.createNode({ id: t.id });
		node.set('name', t.name.trim());
		const modeChanged = t.mode === 'gorra' ? node.has('price') : node.has('a_la_gorra');
		if (t.mode === 'gorra') {
			node.delete('price');
			const gorra = doc.createNode({ minimo: amount(t.min), sugerido: amount(t.suggested) });
			gorra.flow = true;
			node.set('a_la_gorra', gorra);
		} else {
			node.delete('a_la_gorra');
			node.set('price', amount(t.price));
		}
		// El fondo en pesos por tipo ya no existe (el Fondo es automático).
		node.delete('fondo');
		// `capacity` después del precio, como en la documentación (en su lugar si ya estaba).
		if (modeChanged || !node.has('capacity')) node.delete('capacity');
		node.set('capacity', Number(t.capacity.trim()));
		// Cierre propio del tipo (opcional).
		if (t.close.trim()) node.set('close', withZone(t.close.trim()));
		else node.delete('close');
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
	return serializeFrontmatter(doc);
}

/**
 * Lo mismo que `applyTicketsForm`, sobre el archivo completo (frontmatter + texto).
 *
 * @param {string} raw
 * @param {TicketsForm} form
 * @param {TicketsForm} initial
 */
export function applyTicketsToMarkdown(raw, form, initial) {
	if (!ticketsFormChanged(initial, form)) return raw;
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
	return withTypeIds(form.types)
		.map((t) => {
			const cap = t.capacity.trim() ? `, cupo ${t.capacity.trim()}` : '';
			if (t.mode === 'gorra') {
				const s = parseAmount(t.suggested);
				const m = parseAmount(t.min || '0');
				return `${t.name.trim() || t.id}: a la gorra (sugerido ${s === null ? '?' : formatARS(s)}${
					m ? `, mínimo ${formatARS(m)}` : ''
				}${cap})`;
			}
			const p = parseAmount(t.price);
			return `${t.name.trim() || t.id}: ${p === null ? '?' : formatARS(p)}${cap}`;
		})
		.join(' · ');
}

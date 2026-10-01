/**
 * Preguntas de inscripción (B8): funciones puras, sin base. Las usan el servidor (validar al
 * comprar, guardar las preguntas desde el panel), el formulario de compra y el panel.
 *
 * Una pregunta es de un evento (la pestaña Preguntas de su ficha) o general (Ajustes → Personas
 * y preguntas: se define una vez y cada evento elige si la usa). Tipos: texto, opciones (una de
 * una lista) o casilla. Obligatoria u opcional.
 *
 * Las respuestas son datos de quien compra: se guardan con la orden (tabla `order_answers`) y las
 * ven solo les admins (Órdenes y su CSV). Se guarda la pregunta como estaba al comprar.
 *
 * Alcance (migración 0026): cada pregunta aplica a todos los tipos de entrada o a algunos
 * (`ticketTypes`, `[]` = todos) y se pregunta una vez por compra o una vez por entrada
 * (`perTicket`: si alguien compra 3, responde 3 veces). Una compra es de un solo tipo de entrada.
 */

export const FIELD_KINDS = /** @type {const} */ (['text', 'choice', 'checkbox']);
/** @typedef {typeof FIELD_KINDS[number]} FieldKind */

/** Nombres para el panel. */
export const FIELD_KIND_LABELS = Object.freeze({
	text: 'Texto',
	choice: 'Opciones (elegir una)',
	checkbox: 'Casilla (sí / no)'
});

export const LABEL_MIN = 2;
export const LABEL_MAX = 120;
export const OPTION_MAX = 80;
export const MAX_OPTIONS = 12;
/** Largo máximo de una respuesta de texto. */
export const ANSWER_MAX = 500;
/** Preguntas propias por evento (más las generales que elija). */
export const MAX_EVENT_FIELDS = 10;
export const MAX_GENERAL_FIELDS = 30;
/** Lo que se guarda como respuesta de una casilla marcada. */
export const CHECKBOX_YES = 'Sí';
/** Tipos de entrada que puede nombrar una pregunta (y largo de cada id). */
export const MAX_SCOPE_TYPES = 20;
const TYPE_ID_MAX = 60;

/**
 * `perTicket` y `ticketTypes` son opcionales: sin ellos, una vez por compra y para todos los
 * tipos (como antes de la migración 0026).
 *
 * @typedef {{ id: number, label: string, kind: FieldKind, required: boolean, options: string[],
 *   perTicket?: boolean, ticketTypes?: string[] }} SignupField
 * @typedef {{ id: number, label: string, value: string, ticket?: number }} Answer
 *   `ticket`: en las preguntas "una vez por entrada", qué entrada de la compra (1, 2, 3…)
 */

/**
 * El `name` del campo en el formulario de compra. Con `ticket` (0, 1, 2…), el de esa entrada en
 * una pregunta "una vez por entrada".
 * @param {number} id
 * @param {number | null} [ticket]
 */
export function fieldInputName(id, ticket = null) {
	return ticket === null ? `campo_${id}` : `campo_${id}_${ticket}`;
}

/**
 * Los ids de tipos de entrada de una pregunta: JSON guardado o una lista. Sin vacíos ni
 * repetidos.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseTicketTypes(raw) {
	let list = raw;
	if (typeof raw === 'string') {
		try {
			list = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(list)) return [];
	/** @type {string[]} */
	const out = [];
	for (const item of list) {
		const id = typeof item === 'string' ? item.trim() : '';
		if (id && id.length <= TYPE_ID_MAX && !out.includes(id)) out.push(id);
	}
	return out.slice(0, MAX_SCOPE_TYPES);
}

/**
 * ¿La pregunta aplica a una compra de este tipo de entrada?
 * @param {Pick<SignupField, 'ticketTypes'>} field
 * @param {string} typeId
 */
export function fieldAppliesTo(field, typeId) {
	return !field.ticketTypes?.length || field.ticketTypes.includes(typeId);
}

/**
 * Las preguntas que se hacen en una compra de este tipo de entrada (en su orden).
 * @template {Pick<SignupField, 'ticketTypes'>} F
 * @param {readonly F[]} fields
 * @param {string} typeId
 * @returns {F[]}
 */
export function fieldsForTicketType(fields, typeId) {
	return fields.filter((f) => fieldAppliesTo(f, typeId));
}

/**
 * Las veces que se responde una pregunta en una compra de `quantity` entradas: `[null]` si es
 * una vez por compra; `[0, 1, …]` (una por entrada) si es una vez por entrada.
 * @param {Pick<SignupField, 'perTicket'>} field
 * @param {number} quantity
 * @returns {(number | null)[]}
 */
export function answerSlots(field, quantity) {
	if (!field.perTicket) return [null];
	const n = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
	return Array.from({ length: n }, (_, i) => i);
}

/**
 * Cuántas respuestas (conjuntos) pide una compra: las de una vez por compra cuentan una, las de
 * una vez por entrada, una por entrada. Solo las preguntas que aplican a ese tipo.
 * @param {readonly SignupField[]} fields
 * @param {string} typeId
 * @param {number} quantity
 */
export function answerSetCount(fields, typeId, quantity) {
	return fieldsForTicketType(fields, typeId).reduce(
		(n, f) => n + answerSlots(f, quantity).length,
		0
	);
}

/**
 * Valida el alcance que elige le admin: "todos los tipos" o algunos (de los que tiene el
 * evento), y una vez por compra o por entrada. Para las generales no hay tipos (`typeIds` vacío):
 * aplican a todos (cada evento puede acotarlas al elegirlas).
 *
 * @param {{ perTicket?: unknown, scope?: unknown, ticketTypes?: unknown }} raw `scope`: `some`
 *   si eligió algunos tipos
 * @param {readonly string[]} typeIds los tipos de entrada del evento
 * @returns {{ ok: true, perTicket: boolean, ticketTypes: string[] }
 *   | { ok: false, errors: { ticketTypes: string } }}
 */
export function validateFieldScope(raw, typeIds = []) {
	const perTicket = raw.perTicket === true || raw.perTicket === 'on' || raw.perTicket === '1';
	if (raw.scope !== 'some' || !typeIds.length) return { ok: true, perTicket, ticketTypes: [] };
	const chosen = parseTicketTypes(raw.ticketTypes).filter((id) => typeIds.includes(id));
	if (!chosen.length) {
		return { ok: false, errors: { ticketTypes: 'Elegí al menos un tipo de entrada.' } };
	}
	// Todos elegidos = todos (así un tipo nuevo también la pregunta).
	const ticketTypes =
		chosen.length === typeIds.length ? [] : typeIds.filter((id) => chosen.includes(id));
	return { ok: true, perTicket, ticketTypes };
}

/**
 * Texto corto del alcance para el panel: "Todas las entradas · una vez por compra".
 * @param {Pick<SignupField, 'perTicket' | 'ticketTypes'>} field
 * @param {readonly { id: string, name: string }[]} [types] los del evento, para los nombres
 */
export function scopeText(field, types = []) {
	const which = field.ticketTypes?.length
		? `Solo ${field.ticketTypes.map((id) => types.find((t) => t.id === id)?.name ?? id).join(', ')}`
		: 'Todas las entradas';
	return `${which} · ${field.perTicket ? 'una vez por entrada' : 'una vez por compra'}`;
}

/**
 * Texto de una línea: sin caracteres de control, espacios de más afuera.
 * @param {unknown} raw
 */
function line(raw) {
	return typeof raw === 'string'
		? raw
				.normalize('NFC')
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f]+/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
		: '';
}

/**
 * Texto de una respuesta: deja los saltos de línea (hasta dos seguidos), saca el resto de los
 * caracteres de control.
 * @param {unknown} raw
 */
function answerText(raw) {
	if (typeof raw !== 'string') return '';
	return (
		raw
			.normalize('NFC')
			.replace(/\r\n?/g, '\n')
			// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
			.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
			.replace(/[ \t]+/g, ' ')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}

/** @param {unknown} kind @returns {kind is FieldKind} */
export function isFieldKind(kind) {
	return /** @type {readonly unknown[]} */ (FIELD_KINDS).includes(kind);
}

/**
 * Las opciones de una pregunta: una por renglón (lo que escribe le admin) o una lista. Sin
 * vacías ni repetidas.
 * @param {unknown} raw
 */
export function parseOptions(raw) {
	const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : [];
	/** @type {string[]} */
	const out = [];
	for (const item of list) {
		const o = line(item);
		if (o && !out.includes(o)) out.push(o);
	}
	return out;
}

/**
 * Valida una pregunta que arma le admin.
 *
 * @param {{ label?: unknown, kind?: unknown, required?: unknown, options?: unknown }} raw
 * @returns {{ ok: true, field: Omit<SignupField, 'id'> }
 *   | { ok: false, errors: { label?: string, kind?: string, options?: string } }}
 */
export function validateFieldDef(raw) {
	/** @type {{ label?: string, kind?: string, options?: string }} */
	const errors = {};
	const label = line(raw.label);
	if (label.length < LABEL_MIN || label.length > LABEL_MAX) {
		errors.label = `Escribí la pregunta (entre ${LABEL_MIN} y ${LABEL_MAX} letras).`;
	}
	const kind = raw.kind;
	if (!isFieldKind(kind)) errors.kind = 'Elegí el tipo de pregunta.';
	/** @type {string[]} */
	let options = [];
	if (kind === 'choice') {
		options = parseOptions(raw.options);
		if (options.length < 2) errors.options = 'Poné al menos dos opciones, una por renglón.';
		else if (options.length > MAX_OPTIONS) errors.options = `Hasta ${MAX_OPTIONS} opciones.`;
		else if (options.some((o) => o.length > OPTION_MAX))
			errors.options = `Cada opción, hasta ${OPTION_MAX} letras.`;
	}
	const required = raw.required === true || raw.required === 'on' || raw.required === '1';
	if (Object.keys(errors).length || !isFieldKind(kind)) return { ok: false, errors };
	return { ok: true, field: { label, kind, required, options } };
}

/**
 * Valida las respuestas del formulario de compra contra las preguntas del evento. Las
 * respuestas vacías de preguntas opcionales no se guardan. Los errores van por `name` del campo
 * ({@link fieldInputName}), igual que el resto de los errores de la compra.
 *
 * Con `typeId`, solo las preguntas que aplican a ese tipo de entrada; las de "una vez por
 * entrada" se validan `quantity` veces (una por entrada, `ticket` 1, 2, 3… en la respuesta).
 *
 * @param {readonly SignupField[]} fields
 * @param {Record<string, unknown>} raw por `name` del campo
 * @param {{ typeId?: string, quantity?: number }} [scope]
 * @returns {{ ok: true, answers: Answer[] } | { ok: false, errors: Record<string, string> }}
 */
export function validateAnswers(fields, raw, { typeId, quantity = 1 } = {}) {
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {Answer[]} */
	const answers = [];
	const asked = typeId === undefined ? fields : fieldsForTicketType(fields, typeId);
	for (const f of asked) {
		for (const slot of answerSlots(f, quantity)) {
			const name = fieldInputName(f.id, slot);
			const r = validateOne(f, raw?.[name]);
			if ('error' in r && r.error) errors[name] = r.error;
			else if ('value' in r && r.value !== null) {
				answers.push({
					id: f.id,
					label: f.label,
					value: r.value,
					...(slot === null ? {} : { ticket: slot + 1 })
				});
			}
		}
	}
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/**
 * Una respuesta: `{ value }` (o `null` si quedó vacía y es opcional) o `{ error }`.
 * @param {SignupField} f
 * @param {unknown} value
 * @returns {{ value: string | null } | { error: string }}
 */
function validateOne(f, value) {
	if (f.kind === 'checkbox') {
		const checked = value === 'on' || value === '1' || value === true;
		if (f.required && !checked) return { error: 'Marcá esta casilla para seguir.' };
		return { value: checked ? CHECKBOX_YES : null };
	}
	if (f.kind === 'choice') {
		const chosen = line(value);
		if (!chosen) return f.required ? { error: 'Elegí una opción.' } : { value: null };
		if (!f.options.includes(chosen)) return { error: 'Elegí una de las opciones.' };
		return { value: chosen };
	}
	const text = answerText(value);
	if (!text) return f.required ? { error: 'Completá esta respuesta.' } : { value: null };
	if (text.length > ANSWER_MAX) return { error: `Hasta ${ANSWER_MAX} letras.` };
	return { value: text };
}

/**
 * Lo que se guardó en `order_answers.answers` (JSON), sin confiar en la forma.
 * @param {unknown} json
 * @returns {Answer[]}
 */
export function parseStoredAnswers(json) {
	let list;
	try {
		list = typeof json === 'string' ? JSON.parse(json) : json;
	} catch {
		return [];
	}
	if (!Array.isArray(list)) return [];
	return list
		.filter((a) => a && typeof a === 'object' && Number.isSafeInteger(a.id))
		.map((a) => ({
			id: Number(a.id),
			label: String(a.label ?? ''),
			value: String(a.value ?? ''),
			...(Number.isSafeInteger(a.ticket) && a.ticket > 0 ? { ticket: Number(a.ticket) } : {})
		}));
}

/**
 * Las columnas de respuestas para una tabla o un CSV: primero las preguntas actuales del evento
 * (en su orden), después las que aparecen solo en respuestas viejas (una pregunta borrada), en
 * el orden en que aparecen. Una columna por pregunta (por id).
 *
 * @param {readonly (readonly Answer[])[]} answerLists
 * @param {readonly Pick<SignupField, 'id' | 'label'>[]} [fields]
 * @returns {{ id: number, label: string }[]}
 */
export function answerColumns(answerLists, fields = []) {
	/** @type {Map<number, string>} */
	const cols = new Map(fields.map((f) => [f.id, f.label]));
	for (const list of answerLists) {
		for (const a of list) if (!cols.has(a.id)) cols.set(a.id, a.label);
	}
	return [...cols].map(([id, label]) => ({ id, label }));
}

/**
 * La respuesta a una pregunta, o `''`. Las de "una vez por entrada" van juntas, con su entrada:
 * "Entrada 1: Vegana | Entrada 2: Sin TACC".
 * @param {readonly Answer[] | undefined} answers
 * @param {number} id
 */
export function answerFor(answers, id) {
	const found = answers?.filter((a) => a.id === id) ?? [];
	if (found.length === 1 && !found[0].ticket) return found[0].value;
	return found
		.map((a) => (a.ticket ? `${answerTicketLabel(a.ticket)}: ${a.value}` : a.value))
		.join(' | ');
}

/** "Entrada 2" (la de una respuesta "una vez por entrada"). @param {number} ticket */
export function answerTicketLabel(ticket) {
	return `Entrada ${ticket}`;
}

/**
 * Columnas del CSV de una lista de preguntas (panel).
 * @type {readonly import('$lib/admin/csv.js').CsvColumn<SignupField>[]}
 */
export const FIELD_CSV_COLUMNS = Object.freeze([
	{ key: 'id', label: 'id' },
	{ key: 'label', label: 'pregunta' },
	{ label: 'tipo', value: (/** @type {SignupField} */ f) => FIELD_KIND_LABELS[f.kind] },
	{ label: 'obligatoria', value: (/** @type {SignupField} */ f) => f.required },
	{ label: 'opciones', value: (/** @type {SignupField} */ f) => f.options.join(' | ') },
	{
		label: 'se pregunta',
		value: (/** @type {SignupField} */ f) =>
			f.perTicket ? 'una vez por entrada' : 'una vez por compra'
	},
	{
		label: 'tipos de entrada',
		value: (/** @type {SignupField} */ f) =>
			f.ticketTypes?.length ? f.ticketTypes.join(' | ') : 'todos'
	}
]);

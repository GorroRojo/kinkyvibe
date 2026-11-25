/**
 * Preguntas de inscripción (B8): funciones puras, sin base. Las usan el servidor (validar al
 * comprar, guardar las preguntas desde el panel), el formulario de compra y el panel.
 *
 * Una pregunta es de un evento (la pestaña Preguntas de su ficha) o general (Eventos › Roles
 * y preguntas: se define una vez y cada evento elige si la usa). Los tipos son los de los
 * formularios menos «Foto» (`SIGNUP_KINDS`), con la misma validación y el mismo componente para
 * responder (src/lib/utils/questions.js, en común). Obligatoria u opcional.
 *
 * Las respuestas son datos de quien compra: se guardan con la orden (tabla `order_answers`) y las
 * ven solo les admins (Órdenes y su CSV). Se guarda la pregunta como estaba al comprar.
 *
 * Alcance (migración 0026): cada pregunta aplica a todos los tipos de entrada o a algunos
 * (`ticketTypes`, `[]` = todos) y se pregunta una vez por compra o una vez por entrada
 * (`perTicket`: si alguien compra 3, responde 3 veces). Una compra es de un solo tipo de entrada.
 */

import {
	QUESTION_KIND_LABELS,
	SIGNUP_KINDS,
	oneLine,
	showAnswer,
	validateAnswerValue,
	validateQuestion
} from './questions.js';

export {
	CHECKBOX_YES,
	LABEL_MAX,
	LABEL_MIN,
	MAX_OPTIONS,
	OPTION_MAX,
	parseOptions
} from './questions.js';

/** Los tipos de las preguntas de inscripción: los de los formularios menos «Foto». */
export const FIELD_KINDS = SIGNUP_KINDS;
/** @typedef {typeof SIGNUP_KINDS[number]} FieldKind */

/** Nombres para el panel (los mismos que en los formularios). */
export const FIELD_KIND_LABELS = QUESTION_KIND_LABELS;

/**
 * Los tipos de antes (migración 0018): sus respuestas se guardan sin `kind`, como siempre. Las de
 * los demás tipos lo llevan, así cada lugar que las muestra (bot, Mi rincón, la ficha) sabe leer
 * un número o una fecha aunque la pregunta ya no esté.
 */
const PLAIN_KINDS = ['text', 'choice', 'checkbox'];

/** Etiqueta corta opcional (para el panel de Órdenes). */
export const SHORT_LABEL_MAX = 24;
/** Largo máximo de una respuesta de texto. */
export const ANSWER_MAX = 500;
/** Preguntas propias por evento (más las generales que elija). */
export const MAX_EVENT_FIELDS = 10;
export const MAX_GENERAL_FIELDS = 30;
/** Tipos de entrada que puede nombrar una pregunta (y largo de cada id). */
export const MAX_SCOPE_TYPES = 20;
const TYPE_ID_MAX = 60;

/**
 * `perTicket` y `ticketTypes` son opcionales: sin ellos, una vez por compra y para todos los
 * tipos (como antes de la migración 0026).
 *
 * @typedef {{ id: number, label: string, kind: FieldKind, required: boolean, options: string[],
 *   perTicket?: boolean, ticketTypes?: string[], shortLabel?: string, help?: string,
 *   low?: string, high?: string, min?: number, max?: number }} SignupField
 *   `shortLabel`: etiqueta corta opcional (migración 0083) para el panel de Órdenes; sin ella se
 *   usa `label`. Quien compra siempre ve `label`. `help`, `low`/`high` (puntaje) y `min`/`max`
 *   (número): como en los formularios (columna `settings`, migración 0084).
 * @typedef {{ id: number, label: string, value: string, ticket?: number, kind?: string }} Answer
 *   `ticket`: en las preguntas "una vez por entrada", qué entrada de la compra (1, 2, 3…).
 *   `kind`: el tipo de la pregunta, solo en los tipos nuevos (no en texto, opciones ni casilla).
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

/** @param {unknown} kind @returns {kind is FieldKind} */
export function isFieldKind(kind) {
	return /** @type {readonly unknown[]} */ (SIGNUP_KINDS).includes(kind);
}

/**
 * Valida una pregunta que arma le admin: lo de los formularios (`validateQuestion`, con los tipos
 * de inscripción) más la etiqueta corta.
 *
 * @param {Record<string, unknown>} raw `label`, `shortLabel`, `kind`, `required`, `options` y,
 *   según el tipo, `help`, `low`, `high`, `min` y `max`
 * @returns {{ ok: true, field: Omit<SignupField, 'id'> }
 *   | { ok: false, errors: Record<string, string> }}
 */
export function validateFieldDef(raw) {
	const r = validateQuestion(raw, SIGNUP_KINDS);
	/** @type {Record<string, string>} */
	const errors = r.ok ? {} : { ...r.errors };
	const shortLabel = oneLine(raw.shortLabel);
	if (shortLabel.length > SHORT_LABEL_MAX) {
		errors.shortLabel = `La etiqueta corta, hasta ${SHORT_LABEL_MAX} letras.`;
	}
	if (!r.ok || Object.keys(errors).length) return { ok: false, errors };
	const field = /** @type {Omit<SignupField, 'id'>} */ ({
		...r.question,
		...(shortLabel ? { shortLabel } : {})
	});
	return { ok: true, field };
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
			const r = validateAnswerValue(f, raw?.[name], { textMax: ANSWER_MAX });
			if ('error' in r) errors[name] = r.error;
			else if (r.value !== null) {
				answers.push({
					id: f.id,
					label: f.label,
					value: r.value,
					...(slot === null ? {} : { ticket: slot + 1 }),
					...(PLAIN_KINDS.includes(f.kind) ? {} : { kind: f.kind })
				});
			}
		}
	}
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
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
			...(Number.isSafeInteger(a.ticket) && a.ticket > 0 ? { ticket: Number(a.ticket) } : {}),
			...(isFieldKind(a.kind) && !PLAIN_KINDS.includes(a.kind) ? { kind: a.kind } : {})
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
 * "Entrada 1: Vegana | Entrada 2: Sin TACC". En «Varias opciones» las elegidas ya van con « | »:
 * ahí las entradas se separan con « · » ("Entrada 1: Soga | Látex · Entrada 2: Soga").
 *
 * Con `show`, cada respuesta como se lee (un número con coma, una fecha `dd/mm/aaaa`:
 * `showAnswer`); sin él, lo guardado (los CSV).
 * @param {readonly Answer[] | undefined} answers
 * @param {number} id
 * @param {{ show?: boolean }} [opts]
 */
export function answerFor(answers, id, { show = false } = {}) {
	const found = answers?.filter((a) => a.id === id) ?? [];
	/** @param {Answer} a */
	const value = (a) => (show ? showAnswer(a.kind, a.value) : a.value);
	if (found.length === 1 && !found[0].ticket) return value(found[0]);
	return found
		.map((a) => (a.ticket ? `${answerTicketLabel(a.ticket)}: ${value(a)}` : value(a)))
		.join(found.some((a) => a.kind === 'multi') ? ' · ' : ' | ');
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

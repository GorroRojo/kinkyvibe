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

/**
 * @typedef {{ id: number, label: string, kind: FieldKind, required: boolean, options: string[] }} SignupField
 * @typedef {{ id: number, label: string, value: string }} Answer
 */

/** El `name` del campo en el formulario de compra. @param {number} id */
export function fieldInputName(id) {
	return `campo_${id}`;
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
 * @param {readonly SignupField[]} fields
 * @param {Record<string, unknown>} raw por `name` del campo
 * @returns {{ ok: true, answers: Answer[] } | { ok: false, errors: Record<string, string> }}
 */
export function validateAnswers(fields, raw) {
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {Answer[]} */
	const answers = [];
	for (const f of fields) {
		const name = fieldInputName(f.id);
		const value = raw?.[name];
		if (f.kind === 'checkbox') {
			const checked = value === 'on' || value === '1' || value === true;
			if (f.required && !checked) errors[name] = 'Marcá esta casilla para seguir.';
			else if (checked) answers.push({ id: f.id, label: f.label, value: CHECKBOX_YES });
			continue;
		}
		if (f.kind === 'choice') {
			const chosen = line(value);
			if (!chosen) {
				if (f.required) errors[name] = 'Elegí una opción.';
			} else if (!f.options.includes(chosen)) errors[name] = 'Elegí una de las opciones.';
			else answers.push({ id: f.id, label: f.label, value: chosen });
			continue;
		}
		const text = answerText(value);
		if (!text) {
			if (f.required) errors[name] = 'Completá esta respuesta.';
		} else if (text.length > ANSWER_MAX) errors[name] = `Hasta ${ANSWER_MAX} letras.`;
		else answers.push({ id: f.id, label: f.label, value: text });
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
		.map((a) => ({ id: Number(a.id), label: String(a.label ?? ''), value: String(a.value ?? '') }));
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
 * La respuesta a una pregunta, o `''`.
 * @param {readonly Answer[] | undefined} answers
 * @param {number} id
 */
export function answerFor(answers, id) {
	return answers?.find((a) => a.id === id)?.value ?? '';
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
	{ label: 'opciones', value: (/** @type {SignupField} */ f) => f.options.join(' | ') }
]);

/**
 * Las preguntas, en común para los dos sistemas (funciones puras, sin base): los formularios
 * (src/lib/utils/formularios.js, docs/formularios.md) y las preguntas de inscripción que se hacen
 * al comprar una entrada (src/lib/utils/signupFields.js, docs/personas-eventos.md). Una sola lista
 * de tipos con sus nombres, una sola validación de cada pregunta que arma le admin y de cada
 * respuesta, y cómo se lee una respuesta guardada. El editor (QuestionEditor.svelte) y lo que ve
 * quien responde (FormQuestions.svelte) son los mismos en los dos.
 *
 * Los tipos son todos los de los formularios; las de inscripción tienen todos menos «Foto»
 * (`SIGNUP_KINDS`: el formulario de compra no manda archivos y pasa por Mercado Pago o PayPal).
 * Cada respuesta se guarda como texto: la de «Varias opciones» con las elegidas en el orden de la
 * lista, separadas por « | » (`MULTI_SEPARATOR`); la de un número, el número con punto decimal; la
 * de una fecha, `aaaa-mm-dd`; la de un puntaje, del 1 al 5; la de una casilla, «Sí».
 */

export const QUESTION_KINDS = /** @type {const} */ ([
	'text',
	'short',
	'choice',
	'multi',
	'select',
	'checkbox',
	'rating',
	'number',
	'date',
	'photo'
]);
/** @typedef {typeof QUESTION_KINDS[number]} QuestionKind */

/** Los tipos de las preguntas de inscripción: todos menos «Foto». */
export const SIGNUP_KINDS = /** @type {readonly Exclude<QuestionKind, 'photo'>[]} */ (
	QUESTION_KINDS.filter((k) => k !== 'photo')
);

/** Nombres para el panel. */
export const QUESTION_KIND_LABELS = Object.freeze({
	text: 'Texto',
	short: 'Texto corto',
	choice: 'Opciones (elegir una)',
	multi: 'Varias opciones (elegir las que quieras)',
	select: 'Lista desplegable',
	checkbox: 'Casilla (sí / no)',
	rating: 'Puntaje de 1 a 5',
	number: 'Número',
	date: 'Fecha',
	photo: 'Foto'
});

/** @param {unknown} kind @returns {kind is QuestionKind} */
export function isQuestionKind(kind) {
	return /** @type {readonly unknown[]} */ (QUESTION_KINDS).includes(kind);
}

export const LABEL_MIN = 2;
export const LABEL_MAX = 120;
export const OPTION_MAX = 80;
/** Opciones de «Opciones (elegir una)». */
export const MAX_OPTIONS = 12;
/** Opciones de «Varias opciones» y «Lista desplegable». */
export const MAX_MULTI_OPTIONS = 40;
/** Lo que se guarda como respuesta de una casilla marcada. */
export const CHECKBOX_YES = 'Sí';
/** Largo de la ayuda de una pregunta y de los extremos del puntaje. */
export const HELP_MAX = 200;
export const SCALE_LABEL_MAX = 30;
/** Extremos del puntaje si no se escriben otros. */
export const DEFAULT_LOW = 'Mal';
export const DEFAULT_HIGH = 'Re bien';
/** El mayor número (en valor absoluto) de una respuesta o un límite de «Número». */
export const NUMBER_ABS_MAX = 1e12;
/**
 * Lo que separa las opciones elegidas en la respuesta guardada de «Varias opciones». Por eso
 * ninguna opción de esas preguntas puede tener «|»: así la respuesta se lee sin dudas.
 */
export const MULTI_SEPARATOR = ' | ';

/** ¿El tipo lleva una lista de opciones? @param {unknown} kind */
export const hasOptions = (kind) => kind === 'choice' || kind === 'multi' || kind === 'select';

/** Cuántas opciones acepta el tipo. @param {unknown} kind */
export const maxOptionsFor = (kind) =>
	kind === 'multi' || kind === 'select' ? MAX_MULTI_OPTIONS : MAX_OPTIONS;

/**
 * ¿Las respuestas se cuentan por opción (barras en los resúmenes)? Las de opciones, la casilla y
 * el puntaje; las de texto, número y fecha se listan.
 * @param {unknown} kind
 */
export const isCountedKind = (kind) => hasOptions(kind) || kind === 'checkbox' || kind === 'rating';

/**
 * Las opciones que se cuentan de una pregunta (las barras, en su orden): las de la lista, «Sí» de
 * una casilla, del 1 al 5 de un puntaje; `[]` si no se cuenta por opción.
 * @param {{ kind: unknown, options?: readonly string[] }} q
 * @returns {string[]}
 */
export function countedOptions(q) {
	if (q.kind === 'checkbox') return [CHECKBOX_YES];
	if (q.kind === 'rating') return ['1', '2', '3', '4', '5'];
	return hasOptions(q.kind) ? [...(q.options ?? [])] : [];
}

/**
 * Cuántas veces se eligió cada opción (las barras de los resúmenes): primero las de la pregunta,
 * en su orden (`defined`), después las respuestas que ya no son una opción, en el orden en que
 * aparecen. En «Varias opciones», cada respuesta cuenta en cada opción que eligió.
 * @param {{ kind: unknown, options?: readonly string[] }} q
 * @param {readonly string[]} values las respuestas guardadas (sin las vacías)
 * @returns {{ option: string, count: number, defined: boolean }[]}
 */
export function tallyOptions(q, values) {
	const defined = countedOptions(q);
	const picks = values.map((v) => (q.kind === 'multi' ? splitMulti(v) : [v]));
	const options = [...defined];
	for (const p of picks) for (const o of p) if (!options.includes(o)) options.push(o);
	return options.map((option) => ({
		option,
		count: picks.filter((p) => p.includes(option)).length,
		defined: defined.includes(option)
	}));
}

/**
 * Texto de una línea: sin caracteres de control ni espacios de más.
 * @param {unknown} raw
 */
export function oneLine(raw) {
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
 * Texto largo: deja los saltos de línea (hasta dos seguidos).
 * @param {unknown} raw
 */
export function longText(raw) {
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
		const o = oneLine(item);
		if (o && !out.includes(o)) out.push(o);
	}
	return out;
}

/**
 * Un número escrito (acepta coma decimal): el número, `null` si está vacío o `NaN` si no es un
 * número válido.
 * @param {unknown} raw
 */
export function parseNumber(raw) {
	const v = oneLine(typeof raw === 'number' ? String(raw) : raw).replace(',', '.');
	if (!v) return null;
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(v)) return NaN;
	const n = Number(v);
	return Number.isFinite(n) && Math.abs(n) <= NUMBER_ABS_MAX ? n : NaN;
}

/** Un número como lo lee una persona (coma decimal). @param {number} n */
export const showNumber = (n) => String(n).replace('.', ',');

/**
 * ¿Es una fecha `aaaa-mm-dd` que existe (lo que manda `<input type="date">`)?
 * @param {string} v
 */
export function isIsoDate(v) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
	const [y, m, d] = v.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d));
	return y >= 1000 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Una respuesta guardada como se lee en el panel: un número con coma decimal, una fecha
 * `dd/mm/aaaa`; lo demás, igual. Los CSV llevan lo guardado.
 * @param {string | undefined} kind @param {string} value
 */
export function showAnswer(kind, value) {
	if (kind === 'photo') return 'Foto';
	if (kind === 'number' && /^-?[\d.e+-]+$/.test(value)) return value.replace('.', ',');
	if (kind === 'date' && isIsoDate(value)) return value.split('-').reverse().join('/');
	return value;
}

/**
 * Las opciones elegidas en una respuesta de «Varias opciones»: lo guardado (un texto con
 * « | ») o lo que llegó del formulario (una lista).
 * @param {unknown} value
 * @returns {string[]}
 */
export function splitMulti(value) {
	if (Array.isArray(value)) return value.map(String);
	return typeof value === 'string' && value ? value.split(MULTI_SEPARATOR) : [];
}

/**
 * @typedef {{
 *   kind: QuestionKind,
 *   label: string,
 *   required: boolean,
 *   options: string[],
 *   help?: string,
 *   low?: string,
 *   high?: string,
 *   min?: number,
 *   max?: number
 * }} QuestionDef
 *   Lo que define una pregunta en los dos sistemas (cada uno le suma su id y lo suyo).
 */

/**
 * Valida una pregunta que arma le admin. `kinds`: los tipos que se aceptan (las de inscripción,
 * `SIGNUP_KINDS`).
 *
 * @param {Record<string, unknown>} raw
 * @param {readonly string[]} [kinds]
 * @returns {{ ok: true, question: QuestionDef } | { ok: false, errors: Record<string, string> }}
 */
export function validateQuestion(raw, kinds = QUESTION_KINDS) {
	/** @type {Record<string, string>} */
	const errors = {};
	const label = oneLine(raw?.label);
	if (label.length < LABEL_MIN || label.length > LABEL_MAX) {
		errors.label = `Escribí la pregunta (entre ${LABEL_MIN} y ${LABEL_MAX} letras).`;
	}
	const kind = raw?.kind;
	if (!isQuestionKind(kind) || !kinds.includes(kind)) errors.kind = 'Elegí el tipo de pregunta.';
	/** @type {string[]} */
	let options = [];
	if (hasOptions(kind)) {
		options = parseOptions(raw?.options);
		const max = maxOptionsFor(kind);
		if (options.length < 2) errors.options = 'Poné al menos dos opciones.';
		else if (options.length > max) errors.options = `Hasta ${max} opciones.`;
		else if (options.some((o) => o.length > OPTION_MAX))
			errors.options = `Cada opción, hasta ${OPTION_MAX} letras.`;
		else if (kind === 'multi' && options.some((o) => o.includes('|')))
			errors.options = 'Las opciones no pueden tener «|» (separa las elegidas en las respuestas).';
	}
	const help = oneLine(raw?.help);
	if (help.length > HELP_MAX) errors.help = `La ayuda, hasta ${HELP_MAX} letras.`;
	const low = oneLine(raw?.low);
	const high = oneLine(raw?.high);
	if (low.length > SCALE_LABEL_MAX || high.length > SCALE_LABEL_MAX)
		errors.scale = `Cada extremo, hasta ${SCALE_LABEL_MAX} letras.`;
	const min = kind === 'number' ? parseNumber(raw?.min) : null;
	const max = kind === 'number' ? parseNumber(raw?.max) : null;
	if (Number.isNaN(min) || Number.isNaN(max)) errors.range = 'El mínimo y el máximo, números.';
	else if (min !== null && max !== null && min > max)
		errors.range = 'El mínimo no puede ser más que el máximo.';
	if (Object.keys(errors).length || !isQuestionKind(kind)) return { ok: false, errors };
	const required = raw?.required === true || raw?.required === 'on' || raw?.required === '1';
	/** @type {QuestionDef} */
	const question = { kind, label, required, options };
	if (help) question.help = help;
	if (kind === 'rating') {
		question.low = low || DEFAULT_LOW;
		question.high = high || DEFAULT_HIGH;
	}
	if (min !== null) question.min = min;
	if (max !== null) question.max = max;
	return { ok: true, question };
}

/**
 * Lo propio de cada tipo guardado aparte de la pregunta (ayuda, extremos del puntaje, mínimo y
 * máximo), sin confiar en la forma: lo que no corresponde al tipo no vuelve.
 * @param {QuestionKind} kind
 * @param {unknown} raw un objeto (o JSON)
 * @returns {Pick<QuestionDef, 'help' | 'low' | 'high' | 'min' | 'max'>}
 */
export function parseQuestionSettings(kind, raw) {
	let s = raw;
	if (typeof raw === 'string') {
		try {
			s = JSON.parse(raw);
		} catch {
			s = null;
		}
	}
	const o = s && typeof s === 'object' ? /** @type {Record<string, unknown>} */ (s) : {};
	/** @type {Pick<QuestionDef, 'help' | 'low' | 'high' | 'min' | 'max'>} */
	const out = {};
	if (typeof o.help === 'string' && o.help) out.help = o.help;
	if (kind === 'rating') {
		out.low = typeof o.low === 'string' && o.low ? o.low : DEFAULT_LOW;
		out.high = typeof o.high === 'string' && o.high ? o.high : DEFAULT_HIGH;
	}
	if (kind === 'number') {
		if (typeof o.min === 'number' && Number.isFinite(o.min)) out.min = o.min;
		if (typeof o.max === 'number' && Number.isFinite(o.max)) out.max = o.max;
	}
	return out;
}

/**
 * Lo propio de cada tipo, para guardarlo aparte (la columna `settings` de las preguntas de
 * inscripción): solo lo que hay.
 * @param {Partial<QuestionDef>} q
 */
export function questionSettings(q) {
	/** @type {Record<string, string | number>} */
	const out = {};
	if (q.help) out.help = q.help;
	if (q.kind === 'rating') {
		if (q.low) out.low = q.low;
		if (q.high) out.high = q.high;
	}
	if (q.kind === 'number') {
		if (q.min !== undefined) out.min = q.min;
		if (q.max !== undefined) out.max = q.max;
	}
	return out;
}

/**
 * Valida la respuesta a una pregunta (todos los tipos menos «Foto», que valida cada sistema). Un
 * `value` `null` es una respuesta vacía a una pregunta opcional (no se guarda).
 *
 * @param {Pick<QuestionDef, 'kind' | 'required' | 'options' | 'min' | 'max'>} q
 * @param {unknown} raw lo que llegó: un texto o, en «Varias opciones», la lista de las marcadas
 * @param {{ textMax: number }} opts el largo máximo de un texto (cada sistema tiene el suyo)
 * @returns {{ value: string | null } | { error: string }}
 */
export function validateAnswerValue(q, raw, { textMax }) {
	const first = Array.isArray(raw) ? raw[0] : raw;
	if (q.kind === 'checkbox') {
		const checked = first === 'on' || first === '1' || first === true;
		if (q.required && !checked) return { error: 'Marcá esta casilla para seguir.' };
		return { value: checked ? CHECKBOX_YES : null };
	}
	if (q.kind === 'choice' || q.kind === 'select') {
		const chosen = oneLine(first);
		if (!chosen) return q.required ? { error: 'Elegí una opción.' } : { value: null };
		if (!q.options.includes(chosen)) return { error: 'Elegí una de las opciones.' };
		return { value: chosen };
	}
	if (q.kind === 'multi') {
		const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
		const chosen = new Set(list.map(oneLine).filter(Boolean));
		if (!chosen.size) return q.required ? { error: 'Elegí al menos una opción.' } : { value: null };
		if ([...chosen].some((o) => !q.options.includes(o)))
			return { error: 'Elegí entre las opciones de la lista.' };
		// En el orden de la lista, sin repetidas.
		return { value: q.options.filter((o) => chosen.has(o)).join(MULTI_SEPARATOR) };
	}
	if (q.kind === 'rating') {
		const v = oneLine(first);
		const n = Number(v);
		if (!v) return q.required ? { error: 'Elegí un puntaje.' } : { value: null };
		if (!Number.isInteger(n) || n < 1 || n > 5) return { error: 'Elegí un puntaje de 1 a 5.' };
		return { value: String(n) };
	}
	if (q.kind === 'number') {
		const n = parseNumber(first);
		if (n === null) return q.required ? { error: 'Escribí un número.' } : { value: null };
		if (Number.isNaN(n)) return { error: 'Escribí solo un número (por ejemplo 12 o 3,5).' };
		if (q.min !== undefined && q.max !== undefined && (n < q.min || n > q.max))
			return { error: `Tiene que ser entre ${showNumber(q.min)} y ${showNumber(q.max)}.` };
		if (q.min !== undefined && n < q.min)
			return { error: `Tiene que ser ${showNumber(q.min)} o más.` };
		if (q.max !== undefined && n > q.max)
			return { error: `Tiene que ser ${showNumber(q.max)} o menos.` };
		return { value: String(n) };
	}
	if (q.kind === 'date') {
		const v = oneLine(first);
		if (!v) return q.required ? { error: 'Elegí una fecha.' } : { value: null };
		if (!isIsoDate(v)) return { error: 'Elegí una fecha válida.' };
		return { value: v };
	}
	const text = q.kind === 'short' ? oneLine(first) : longText(first);
	if (!text) return q.required ? { error: 'Completá esta respuesta.' } : { value: null };
	if (text.length > textMax) return { error: `Hasta ${textMax} letras.` };
	return { value: text };
}

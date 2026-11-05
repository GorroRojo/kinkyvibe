/**
 * El editor compartido de preguntas (QuestionEditor.svelte; docs/formularios.md): lo usan los
 * formularios y las preguntas de inscripción. Acá las cuentas puras (armar la lista que se edita,
 * moverla, duplicar, y lo que se manda al guardar), con sus pruebas al lado.
 *
 * Cada pregunta del editor lleva una `key` propia (para el `#each` y el arrastre) además de su
 * `id` guardado (string en los formularios, número en las de inscripción; vacío si es nueva).
 */

/**
 * @typedef {{
 *   key: string,
 *   id: string | number | null,
 *   kind: string,
 *   label: string,
 *   required: boolean,
 *   optionsText: string,
 *   help: string,
 *   low: string,
 *   high: string,
 *   perTicket: boolean,
 *   scope: 'all' | 'some',
 *   ticketTypes: string[]
 * }} EditorQuestion
 */

let counter = 0;
/** Una clave nueva para el `#each`. */
export const newKey = () => `q${Date.now().toString(36)}${(++counter).toString(36)}`;

/**
 * La lista que se edita, a partir de las preguntas guardadas (de un formulario o de inscripción).
 *
 * @param {readonly Record<string, any>[]} questions
 * @returns {EditorQuestion[]}
 */
export function toEditorItems(questions) {
	return questions.map((q) => ({
		key: newKey(),
		id: q.id ?? null,
		kind: String(q.kind ?? 'text'),
		label: String(q.label ?? ''),
		required: Boolean(q.required),
		optionsText: Array.isArray(q.options) ? q.options.join('\n') : String(q.options ?? ''),
		help: String(q.help ?? ''),
		low: String(q.low ?? ''),
		high: String(q.high ?? ''),
		perTicket: Boolean(q.perTicket),
		scope: q.ticketTypes?.length ? 'some' : 'all',
		ticketTypes: Array.isArray(q.ticketTypes) ? [...q.ticketTypes] : []
	}));
}

/** Una pregunta vacía (de texto). @returns {EditorQuestion} */
export function blankItem() {
	return {
		key: newKey(),
		id: null,
		kind: 'text',
		label: '',
		required: false,
		optionsText: '',
		help: '',
		low: '',
		high: '',
		perTicket: false,
		scope: 'all',
		ticketTypes: []
	};
}

/**
 * La lista con la pregunta de `from` en `to` (las demás corridas). Fuera de rango: igual.
 *
 * @template T
 * @param {readonly T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(list, from, to) {
	if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
		return [...list];
	const out = [...list];
	const [item] = out.splice(from, 1);
	out.splice(to, 0, item);
	return out;
}

/**
 * La lista con una copia de la pregunta `index` justo abajo (sin id: es una pregunta nueva).
 *
 * @param {readonly EditorQuestion[]} list
 * @param {number} index
 * @returns {EditorQuestion[]}
 */
export function duplicateItem(list, index) {
	const q = list[index];
	if (!q) return [...list];
	const copy = {
		...q,
		key: newKey(),
		id: null,
		label: q.label ? `${q.label} (copia)`.slice(0, 120) : '',
		ticketTypes: [...q.ticketTypes]
	};
	return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}

/**
 * Lo que se manda al guardar (JSON en el campo `questions`), en el orden de la lista. Las de
 * inscripción llevan también su alcance; las de formularios, ayuda y extremos del puntaje.
 *
 * @param {readonly EditorQuestion[]} list
 * @param {{ signup?: boolean }} [opts]
 */
export function toPayload(list, { signup = false } = {}) {
	return list.map((q) => {
		const options = q.kind === 'choice' ? q.optionsText.split('\n') : [];
		if (signup) {
			return {
				id: q.id,
				kind: q.kind,
				label: q.label,
				required: q.required,
				options,
				perTicket: q.perTicket,
				scope: q.scope,
				ticketTypes: q.scope === 'some' ? q.ticketTypes : []
			};
		}
		return {
			id: q.id,
			kind: q.kind,
			label: q.label,
			required: q.required,
			options,
			help: q.help,
			...(q.kind === 'rating' ? { low: q.low, high: q.high } : {})
		};
	});
}

/**
 * Lo mismo que ve quien responde, para la vista previa (preguntas con id).
 *
 * @param {readonly EditorQuestion[]} list
 * @returns {import('$lib/utils/formularios.js').Question[]}
 */
export function previewQuestions(list) {
	return list.map((q) => ({
		id: q.key,
		kind: /** @type {any} */ (q.kind),
		label: q.label,
		required: q.required,
		options:
			q.kind === 'choice'
				? [...new Set(q.optionsText.split('\n').map((o) => o.trim()))].filter(Boolean)
				: [],
		...(q.help ? { help: q.help } : {}),
		...(q.kind === 'rating' ? { low: q.low || 'Mal', high: q.high || 'Re bien' } : {})
	}));
}

/**
 * Cómo se muestran las respuestas a las preguntas de inscripción en el panel (Órdenes): las de
 * «una vez por entrada» como columnas de la tabla de personas (cada fila se lee de corrido), las de
 * «una vez por compra» en una línea aparte, y un resumen arriba con cuántas personas eligieron
 * cada opción en las preguntas de pocas respuestas posibles.
 *
 * Las respuestas no traen el tipo de pregunta (se guardan como texto, ver signupFields.js): el
 * resumen se arma solo con las preguntas que tienen pocas respuestas distintas y cortas.
 */

/** @typedef {import('./signupFields.js').Answer} Answer */

/** Hasta cuántas respuestas distintas tiene una pregunta para entrar en el resumen. */
export const TALLY_MAX_OPTIONS = 6;
/** Hasta qué largo una respuesta cuenta como opción (más largo, es texto libre). */
export const TALLY_MAX_LENGTH = 60;

/**
 * Las preguntas «una vez por entrada» de una compra, en el orden en que aparecen: las columnas.
 *
 * @param {readonly Answer[]} answers
 * @returns {{ id: number, label: string }[]}
 */
export function ticketQuestions(answers) {
	/** @type {Map<number, string>} */
	const out = new Map();
	for (const a of answers) if (a.ticket && !out.has(a.id)) out.set(a.id, a.label);
	return [...out].map(([id, label]) => ({ id, label }));
}

/**
 * La respuesta de la entrada `index` (desde 0) a la pregunta `id`; '' si no contestó.
 *
 * @param {readonly Answer[]} answers
 * @param {number} id
 * @param {number} index
 */
export function ticketAnswer(answers, id, index) {
	return answers.find((a) => a.id === id && a.ticket === index + 1)?.value ?? '';
}

/**
 * Las respuestas «una vez por compra» (sin `ticket`).
 *
 * @param {readonly Answer[]} answers
 * @returns {Answer[]}
 */
export function orderAnswers(answers) {
	return answers.filter((a) => !a.ticket);
}

/**
 * Resumen de las preguntas de pocas respuestas posibles: por pregunta, cuántas veces se eligió
 * cada respuesta (de más a menos). Cuenta respuestas, o sea personas en las de «una vez por
 * entrada» y compras en las de «una vez por compra». Las preguntas con respuestas largas o muy
 * variadas (texto libre) no entran.
 *
 * @param {readonly (readonly Answer[])[]} lists las respuestas de cada compra
 * @returns {{ id: number, label: string, perTicket: boolean,
 *   counts: { value: string, n: number }[] }[]}
 */
export function answerTallies(lists) {
	/** @type {Map<number, { label: string, perTicket: boolean, counts: Map<string, number> }>} */
	const byId = new Map();
	for (const list of lists) {
		for (const a of list) {
			const value = String(a.value ?? '').trim();
			if (!value) continue;
			const q = byId.get(a.id) ?? { label: a.label, perTicket: false, counts: new Map() };
			if (a.ticket) q.perTicket = true;
			q.counts.set(value, (q.counts.get(value) ?? 0) + 1);
			byId.set(a.id, q);
		}
	}
	return [...byId]
		.filter(
			([, q]) =>
				q.counts.size <= TALLY_MAX_OPTIONS &&
				[...q.counts.keys()].every((v) => v.length <= TALLY_MAX_LENGTH)
		)
		.map(([id, q]) => ({
			id,
			label: q.label,
			perTicket: q.perTicket,
			counts: [...q.counts]
				.map(([value, n]) => ({ value, n }))
				.sort((x, y) => y.n - x.n || x.value.localeCompare(y.value))
		}));
}

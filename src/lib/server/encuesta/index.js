/**
 * Encuesta después del evento (PROTOTIPO, interruptor `encuesta_post_evento`; docs/mails.md,
 * «Encuesta después del evento (prototipo)»).
 *
 * - Un día después de que termina un evento con entradas ({@link SURVEY_DELAY_MS}), a cada orden
 *   aprobada le llega un mail con un link firmado a `/encuesta/<orden>.<firma>` (send.js).
 * - La encuesta es anónima: la respuesta se guarda sin la orden. Aparte queda solo la marca «esta
 *   orden ya contestó», para que el link sirva una sola vez (store.js).
 * - Cada evento la apaga con `encuesta: false` (editor de entradas, «Mandar la encuesta…»).
 *
 * Todo lo de acá es código puro salvo el link (signedLinks.js, la misma clave al azar en D1 que los
 * demás links firmados).
 */
import { signLink, verifyLink } from '$lib/server/signedLinks.js';
import { isValidOrderId } from '$lib/server/tickets/orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cuánto después del fin del evento sale el mail. */
export const SURVEY_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pasado esto desde que tocaba, ya no sale (así, al prender el interruptor, no les llega la encuesta
 * de eventos viejos a todes, y un evento que se pasó por alto no la manda semanas después).
 */
export const SURVEY_MAX_LATE_MS = 3 * 24 * 60 * 60 * 1000;

/** Id del envío en `reminder_sends` (una vez por orden). */
export const SURVEY_SEND_KEY = 'encuesta';

/** Clave de `ticket_settings` que firma los links de la encuesta (se crea sola). */
const SURVEY_LINK_KEY = 'survey_link_key';

/** Largo máximo de cada respuesta de texto. */
export const SURVEY_TEXT_MAX = 1000;

/**
 * Las preguntas (fijas en el prototipo). `rating`: de 1 a 5; `choice`: una de `options`; `text`:
 * texto libre. Todas opcionales: se puede mandar con una sola contestada.
 *
 * @typedef {{ id: string, kind: 'rating', label: string, low: string, high: string }
 *   | { id: string, kind: 'choice', label: string, options: { value: string, label: string }[] }
 *   | { id: string, kind: 'text', label: string, hint?: string }} SurveyQuestion
 */

/** @type {readonly SurveyQuestion[]} */
export const SURVEY_QUESTIONS = Object.freeze([
	{ id: 'puntaje', kind: 'rating', label: '¿Cómo la pasaste?', low: 'Mal', high: 'Re bien' },
	{ id: 'gusto', kind: 'text', label: '¿Qué te gustó?' },
	{ id: 'mejorar', kind: 'text', label: '¿Qué podríamos mejorar?' },
	{
		id: 'volver',
		kind: 'choice',
		label: '¿Volverías a venir?',
		options: [
			{ value: 'si', label: 'Sí' },
			{ value: 'tal_vez', label: 'Tal vez' },
			{ value: 'no', label: 'No' }
		]
	},
	{
		id: 'comentario',
		kind: 'text',
		label: '¿Algo más que nos quieras contar?',
		hint: 'Si querés que te respondamos, dejá tu contacto acá (si no, queda anónima).'
	}
]);

/**
 * Link de la encuesta de una orden: `<origin>/encuesta/<orden>.<firma>`.
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} orderId
 */
export async function surveyUrl(db, origin, orderId) {
	return `${origin}/encuesta/${orderId}.${await signLink(db, SURVEY_LINK_KEY, `encuesta:${orderId}`)}`;
}

/**
 * La orden del link, o `null` si el link no es válido.
 *
 * @param {D1Database} db
 * @param {unknown} token `<orden>.<firma>`
 */
export async function checkSurveyToken(db, token) {
	if (typeof token !== 'string') return null;
	const dot = token.lastIndexOf('.');
	if (dot < 1) return null;
	const orderId = token.slice(0, dot);
	if (!isValidOrderId(orderId)) return null;
	return (await verifyLink(db, SURVEY_LINK_KEY, `encuesta:${orderId}`, token.slice(dot + 1)))
		? orderId
		: null;
}

/** @typedef {Record<string, string | number>} SurveyAnswers */

/**
 * Valida lo que llegó del formulario. Lo que no es una respuesta válida se descarta; si no queda
 * ninguna, error.
 *
 * @param {FormData | Map<string, unknown>} form
 * @returns {{ ok: true, answers: SurveyAnswers } | { ok: false, error: string }}
 */
export function validateSurveyAnswers(form) {
	/** @type {SurveyAnswers} */
	const answers = {};
	for (const q of SURVEY_QUESTIONS) {
		const raw = form.get(q.id);
		if (typeof raw !== 'string') continue;
		const v = raw.trim();
		if (!v) continue;
		if (q.kind === 'rating') {
			const n = Number(v);
			if (Number.isInteger(n) && n >= 1 && n <= 5) answers[q.id] = n;
		} else if (q.kind === 'choice') {
			if (q.options.some((o) => o.value === v)) answers[q.id] = v;
		} else {
			if (v.length > SURVEY_TEXT_MAX)
				return { ok: false, error: `«${q.label}»: hasta ${SURVEY_TEXT_MAX} caracteres.` };
			answers[q.id] = v;
		}
	}
	if (!Object.keys(answers).length)
		return { ok: false, error: 'Contestá al menos una pregunta para mandarla.' };
	return { ok: true, answers };
}

/**
 * @typedef {{ answers: SurveyAnswers, day: string }} SurveyResponse `day`: solo la fecha
 *   (AAAA-MM-DD, hora de Argentina), nunca la hora: con la hora exacta se podría cruzar con quién
 *   abrió el link.
 */

/**
 * Resumen para el panel: cuántas respuestas, el promedio y la distribución del puntaje, cuántes
 * volverían y los textos de cada pregunta (en orden de llegada).
 *
 * @param {SurveyResponse[]} responses
 */
export function summarizeSurvey(responses) {
	/** @type {number[]} */
	const ratings = [];
	/** @type {Record<string, Record<string, number>>} */
	const choices = {};
	/** @type {Record<string, string[]>} */
	const texts = {};
	for (const q of SURVEY_QUESTIONS) {
		if (q.kind === 'choice') choices[q.id] = Object.fromEntries(q.options.map((o) => [o.value, 0]));
		if (q.kind === 'text') texts[q.id] = [];
	}
	for (const r of responses) {
		for (const q of SURVEY_QUESTIONS) {
			const v = r.answers[q.id];
			if (v === undefined) continue;
			if (q.kind === 'rating' && typeof v === 'number') ratings.push(v);
			else if (q.kind === 'choice' && typeof v === 'string' && v in choices[q.id])
				choices[q.id][v]++;
			else if (q.kind === 'text' && typeof v === 'string') texts[q.id].push(v);
		}
	}
	const distribution = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length);
	return {
		total: responses.length,
		ratingCount: ratings.length,
		ratingAverage: ratings.length
			? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
			: null,
		distribution,
		choices,
		texts
	};
}

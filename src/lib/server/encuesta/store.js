/**
 * Dónde se guardan las respuestas de la encuesta (PROTOTIPO).
 *
 * Todavía no hay tabla: ninguna de las que existen sirve sin forzarla (`ticket_settings` se lee
 * entera en cada venta; `order_answers` va atada a la orden y la encuesta es anónima). Hasta que
 * gorrite decida y haya migración (la propuesta está en el PR y en docs/mails.md), las respuestas
 * viven **en memoria y solo en `vite dev`**: se pierden al reiniciar el servidor. Fuera de dev no
 * hay almacén (`null`), así que con el interruptor prendido en producción no sale ningún mail ni
 * se abre la página.
 *
 * Dos cosas separadas a propósito, como irían en la base:
 * - `answered`: qué órdenes ya contestaron (para que el link sirva una vez);
 * - `responses`: las respuestas por evento, sin la orden y solo con el día.
 */
import { dev } from '$app/environment';

/** @typedef {import('./index.js').SurveyAnswers} SurveyAnswers */
/** @typedef {import('./index.js').SurveyResponse} SurveyResponse */

/**
 * @typedef {{
 *   hasAnswered: (orderId: string) => Promise<boolean>,
 *   save: (input: { orderId: string, eventSlug: string, answers: SurveyAnswers, day: string }) => Promise<'ok' | 'repeated'>,
 *   list: (eventSlug: string) => Promise<SurveyResponse[]>
 * }} SurveyStore
 */

/** @returns {SurveyStore} */
export function memorySurveyStore() {
	/** @type {Set<string>} */
	const answered = new Set();
	/** @type {Map<string, SurveyResponse[]>} */
	const responses = new Map();
	return {
		hasAnswered: async (orderId) => answered.has(orderId),
		save: async ({ orderId, eventSlug, answers, day }) => {
			// Primero la marca (en la base, un INSERT … ON CONFLICT DO NOTHING en la misma tanda).
			if (answered.has(orderId)) return 'repeated';
			answered.add(orderId);
			const list = responses.get(eventSlug) ?? [];
			list.push({ answers, day });
			responses.set(eventSlug, list);
			return 'ok';
		},
		list: async (eventSlug) => [...(responses.get(eventSlug) ?? [])]
	};
}

/** @type {SurveyStore | null} */
let devStore = null;

/**
 * El almacén, o `null` si no hay (fuera de `vite dev`).
 *
 * @returns {SurveyStore | null}
 */
export function surveyStore() {
	if (!dev) return null;
	devStore ??= memorySurveyStore();
	return devStore;
}

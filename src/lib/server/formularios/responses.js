/**
 * Lo que muestra la página de respuestas de un formulario (panel y Mi rincón de les
 * organizadores; docs/formularios.md): el resumen por pregunta y la lista de respuestas, con la
 * identidad solo si la privacidad de hoy la deja ver (`showsIdentity`) y mezcladas si alguna no
 * muestra quién la mandó (así el orden no ayuda a adivinar). Todas, siempre: sin mínimo.
 */
import { showsIdentity, shuffled, summarize } from '$lib/utils/formularios.js';
import { listResponses } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @param {D1Database} db
 * @param {import('./store.js').Form} form
 * @param {{ emails?: boolean, random?: () => number }} [opts] `emails`: les organizadores no ven
 *   mails (como en las respuestas de inscripción)
 */
export async function responsesView(db, form, { emails = true, random } = {}) {
	const stored = await listResponses(db, form.id);
	const rows = stored.map((r) => {
		const show = showsIdentity(form.privacy, r);
		return {
			answers: r.answers,
			anonymous: r.anonymous,
			day: r.day,
			name: show ? r.name : null,
			email: show && emails ? r.email : null,
			hidden: !show
		};
	});
	const mixed = rows.some((r) => r.hidden);
	return {
		total: rows.length,
		summary: summarize(form.questions, rows),
		responses: mixed ? shuffled(rows, random) : rows.reverse(),
		shuffled: mixed
	};
}

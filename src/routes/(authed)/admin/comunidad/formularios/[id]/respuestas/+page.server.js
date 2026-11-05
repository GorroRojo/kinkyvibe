/**
 * Comunidad › Formularios › un formulario › Respuestas (docs/formularios.md): promedios de los
 * puntajes, cuántas veces se eligió cada opción, la lista de textos y cada respuesta (con nombre
 * solo si la privacidad de hoy lo deja ver; mezcladas si hay anónimas). Todas, sin mínimo. Abrirla
 * queda en Actividad (sin las respuestas). Solo admins y con el interruptor `formularios`.
 */
import { error } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { formOr404, requireFormsAdmin } from '$lib/server/formularios/admin.js';
import { responsesView } from '$lib/server/formularios/responses.js';
import { getEventMeta } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requireFormsAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const form = await formOr404(db, event.params.id);
	if (form.kind === 'template') error(404, 'Las plantillas no tienen respuestas.');
	const [view, meta] = await Promise.all([
		responsesView(db, form),
		form.eventSlug ? getEventMeta(form.eventSlug) : null
	]);
	await logAdminAction(db, event.locals, {
		action: 'form.responses.view',
		targetType: 'form',
		targetId: String(form.id),
		summary: `Miró las respuestas de «${form.title}»`
	});
	return {
		form: {
			id: form.id,
			kind: form.kind,
			title: form.title,
			privacy: form.privacy,
			questions: form.questions.length
		},
		eventTitle: typeof meta?.title === 'string' ? meta.title : (form.eventSlug ?? null),
		...view
	};
}

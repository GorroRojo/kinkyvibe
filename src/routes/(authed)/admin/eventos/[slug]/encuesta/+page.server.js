/**
 * Ficha del evento › Mails › Encuesta (docs/formularios.md; reusa el prototipo #566): cuándo sale
 * la encuesta de después del evento, a cuántas personas les llegó, cuántas respondieron, el mail y
 * prenderla o apagarla para este evento. Las preguntas y las respuestas se ven en Comunidad ›
 * Formularios (el mismo formulario). Solo admins y con el interruptor `formularios`.
 *
 * El `load` solo lee: la encuesta se crea (copiando la plantilla) recién al apagarla, al editarla
 * o cuando el cron la manda.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { requireFormsAdmin } from '$lib/server/formularios/admin.js';
import { buildFormEmail } from '$lib/server/formularios/email.js';
import { SEND_MAX_LATE_MS, surveyDueAt } from '$lib/server/formularios/send.js';
import {
	ensureEventSurvey,
	getEventSurvey,
	responseCount,
	sendStats,
	setFormOpen
} from '$lib/server/formularios/store.js';
import { FORM_TEMPLATES, SURVEY_TEMPLATE_SLUG } from '$lib/server/formularios/templates.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { contactEmail, siteOrigin } from '$lib/server/tickets/index.js';

/** @param {string} slug */
async function ticketedOr404(slug) {
	const config = await getEventTickets(slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	return config;
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requireFormsAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const config = await ticketedOr404(event.params.slug);
	const survey = await getEventSurvey(db, event.params.slug);
	const [responses, stats] = survey
		? await Promise.all([responseCount(db, survey.id), sendStats(db, survey.id)])
		: [0, { sent: 0, failed: 0, pending: 0, used: 0 }];
	const due = surveyDueAt(config);
	const now = Date.now();
	const questions =
		survey?.questions.length ??
		FORM_TEMPLATES.find((t) => t.slug === SURVEY_TEMPLATE_SLUG)?.questions.length ??
		0;
	const origin = siteOrigin(event.url);
	const mail = buildFormEmail({
		survey: true,
		formTitle: survey?.title ?? '',
		eventTitle: config.title || event.params.slug,
		questions,
		anonymous: (survey?.privacy ?? 'anonymous') === 'anonymous',
		url: `${origin}/calendario/${encodeURIComponent(event.params.slug)}/encuesta#ejemplo`,
		origin,
		contactEmail: contactEmail()
	});
	return {
		survey: survey
			? {
					id: survey.id,
					open: survey.open,
					privacy: survey.privacy,
					questions: survey.questions.length
				}
			: null,
		on: survey ? survey.open : true,
		cancelled: config.status === 'cancelado',
		due,
		late: due !== null && now - due > SEND_MAX_LATE_MS,
		started: due !== null && now >= due,
		responses,
		stats,
		mail: { subject: mail.subject, html: mail.html }
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	setOpen: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		await ticketedOr404(event.params.slug);
		const open = (await event.request.formData()).get('open') === 'on';
		const survey = await ensureEventSurvey(db, event.params.slug, { by: admin.login, open });
		if (!survey) return fail(500, { open: { ok: false, message: 'No se pudo guardar.' } });
		if (survey.open !== open) await setFormOpen(db, survey.id, open, { by: admin.login });
		await logAdminAction(db, event.locals, {
			action: open ? 'form.open' : 'form.close',
			targetType: 'event',
			targetId: event.params.slug,
			summary: `${open ? 'Prendió' : 'Apagó'} la encuesta de después del evento`
		});
		return { open: { ok: true } };
	},
	edit: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		await ticketedOr404(event.params.slug);
		const survey = await ensureEventSurvey(db, event.params.slug, { by: admin.login });
		if (!survey) return fail(500, { edit: { ok: false, message: 'No se pudo abrir.' } });
		redirect(303, `/admin/comunidad/formularios/${survey.id}`);
	}
};

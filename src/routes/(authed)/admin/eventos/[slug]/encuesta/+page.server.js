/**
 * Ficha del evento › Mails › Encuesta (docs/formularios.md; reusa el prototipo #566): cuándo sale
 * la encuesta de después del evento, a cuántas personas les llegó, cuántas respondieron, prenderla
 * o apagarla para este evento, su mail (asunto y texto, con vista previa) y borrarla. Las preguntas
 * y las respuestas se ven en Comunidad › Formularios (el mismo formulario). Solo admins y con el
 * interruptor `formularios`.
 *
 * El `load` solo lee: la encuesta se crea (copiando la plantilla) recién al prenderla o apagarla,
 * al editarla, al guardar su mail o cuando el cron la manda.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { requireFormsAdmin } from '$lib/server/formularios/admin.js';
import { mailTexts } from '$lib/server/formularios/email.js';
import { mailAction, mailPreview } from '$lib/server/formularios/mailAdmin.js';
import { delayText, getFormDefaults, surveyDelayMs } from '$lib/server/formularios/defaults.js';
import { surveyDueAt, surveysSinceValue } from '$lib/server/formularios/send.js';
import {
	deleteForm,
	ensureEventSurvey,
	eventSurveyDeleted,
	getEventSurvey,
	responseCount,
	sendStats,
	setFormOpen
} from '$lib/server/formularios/store.js';
import { FORM_TEMPLATES, SURVEY_TEMPLATE_SLUG } from '$lib/server/formularios/templates.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { siteOrigin } from '$lib/server/tickets/index.js';

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
	const [survey, defaults, deletedId, since] = await Promise.all([
		getEventSurvey(db, event.params.slug),
		getFormDefaults(db),
		eventSurveyDeleted(db, event.params.slug),
		surveysSinceValue(db)
	]);
	const [responses, stats] = survey
		? await Promise.all([responseCount(db, survey.id), sendStats(db, survey.id)])
		: [0, { sent: 0, failed: 0, pending: 0, used: 0 }];
	const due = surveyDueAt(config, surveyDelayMs(defaults));
	const now = Date.now();
	const template = FORM_TEMPLATES.find((t) => t.slug === SURVEY_TEMPLATE_SLUG);
	const eventTitle = config.title || event.params.slug;
	const privacy = survey?.privacy ?? defaults.surveyPrivacy;
	const preview = mailPreview(
		{
			kind: 'survey',
			title: survey?.title ?? template?.title ?? '',
			privacy,
			questions: survey?.questions.length ?? template?.questions.length ?? 0,
			mailSubject: survey?.mailSubject ?? '',
			mailBody: survey?.mailBody ?? '',
			eventSlug: event.params.slug
		},
		{ eventTitle, origin: siteOrigin(event.url), defaults }
	);
	return {
		survey: survey
			? {
					id: survey.id,
					open: survey.open,
					privacy: survey.privacy,
					questions: survey.questions.length,
					mailSubject: survey.mailSubject,
					mailBody: survey.mailBody
				}
			: null,
		deleted: !survey && deletedId !== null,
		on: survey ? survey.open : !deletedId && defaults.surveyAuto,
		cancelled: config.status === 'cancelado',
		due,
		// Tocaba antes de que se prendieran los formularios: esa no sale (send.js, `surveysSince`).
		before: due !== null && since !== null && due < since,
		started: due !== null && now >= due,
		privacy,
		audience: survey?.audience ?? defaults.surveyAudience,
		delayText: delayText(defaults.surveyDelayDays),
		responses,
		stats,
		mail: preview,
		fallback: mailTexts({ kind: 'survey' }, defaults)
	};
}

/**
 * La encuesta del evento para cambiarla (se crea copiando la plantilla si no estaba). Si está
 * borrada, 409.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {{ by: string, open?: boolean }} opts
 */
async function surveyFor(db, slug, opts) {
	const survey = await ensureEventSurvey(db, slug, opts);
	if (!survey && (await eventSurveyDeleted(db, slug)))
		error(409, 'La encuesta de este evento está borrada: recuperala desde Ajustes › Actividad.');
	return survey;
}

/**
 * @param {import('./$types').RequestEvent} event
 * @param {boolean} save
 */
async function mailFor(event, save) {
	const { admin, db } = await requireFormsAdmin(event);
	const config = await ticketedOr404(event.params.slug);
	const defaults = await getFormDefaults(db);
	// La vista previa no crea nada; guardar sí (la encuesta se crea copiando la plantilla).
	const survey = save
		? await surveyFor(db, event.params.slug, { by: admin.login })
		: await getEventSurvey(db, event.params.slug);
	if (save && !survey) return fail(500, { mail: { ok: false, message: 'No se pudo guardar.' } });
	const template = FORM_TEMPLATES.find((t) => t.slug === SURVEY_TEMPLATE_SLUG);
	const form = survey ?? {
		id: 0,
		kind: 'survey',
		title: template?.title ?? '',
		privacy: defaults.surveyPrivacy,
		questions: template?.questions ?? [],
		eventSlug: event.params.slug,
		mailSubject: '',
		mailBody: ''
	};
	return mailAction(/** @type {any} */ (form), event, {
		admin,
		db,
		eventTitle: config.title || event.params.slug,
		defaults,
		save
	});
}

/** @type {import('./$types').Actions} */
export const actions = {
	setOpen: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		await ticketedOr404(event.params.slug);
		const open = (await event.request.formData()).get('open') === 'on';
		const survey = await surveyFor(db, event.params.slug, { by: admin.login, open });
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
		const survey = await surveyFor(db, event.params.slug, { by: admin.login });
		if (!survey) return fail(500, { edit: { ok: false, message: 'No se pudo abrir.' } });
		redirect(303, `/admin/comunidad/formularios/${survey.id}`);
	},
	previewMail: (event) => mailFor(event, false),
	saveMail: (event) => mailFor(event, true),
	delete: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const survey = await getEventSurvey(db, event.params.slug);
		if (!survey)
			return fail(404, { remove: { ok: false, message: 'No hay encuesta para borrar.' } });
		await deleteForm(db, survey, { by: admin.login });
		await logAdminAction(db, event.locals, {
			action: 'form.delete',
			targetType: 'event',
			targetId: event.params.slug,
			summary: 'Borró la encuesta de después del evento (se recupera desde Actividad)',
			detail: { id: survey.id }
		});
		return { remove: { ok: true } };
	}
};

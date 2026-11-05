/**
 * El mail con el link personal en el panel (docs/formularios.md, «El mail»): la vista previa y
 * guardar el asunto y el texto de una encuesta o un formulario. Lo usan el editor del formulario,
 * la ficha del evento › Mails › Encuesta y «Cómo salen por defecto».
 */
import { fail } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { contactEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { buildFormEmail, mailTextError, mailTexts } from './email.js';
import { saveFormMail } from './store.js';

/**
 * La vista previa del mail, con un link de ejemplo.
 *
 * @param {{ kind: string, title: string, privacy: string, questions: number,
 *   mailSubject?: string, mailBody?: string, eventSlug?: string | null }} form
 * @param {{ eventTitle: string, origin: string,
 *   defaults: import('./defaults.js').FormDefaults | null }} ctx
 */
export function mailPreview(form, { eventTitle, origin, defaults }) {
	const texts = mailTexts(form, defaults);
	const survey = form.kind === 'survey';
	const path = survey
		? `/calendario/${encodeURIComponent(form.eventSlug ?? 'evento')}/encuesta#ejemplo`
		: '/formularios/ejemplo#ejemplo';
	const mail = buildFormEmail({
		...texts,
		survey,
		formTitle: form.title,
		eventTitle,
		questions: form.questions,
		anonymous: form.privacy === 'anonymous',
		url: `${origin}${path}`,
		origin,
		contactEmail: contactEmail()
	});
	return { subject: mail.subject, html: mail.html };
}

/**
 * El asunto y el texto que llegaron del formulario del panel, validados.
 *
 * @param {FormData} data
 * @param {string} [prefix] `mail` (una encuesta o un formulario) o el de «Cómo salen por defecto»
 */
export function readMailForm(data, prefix = 'mail') {
	const subject = String(data.get(`${prefix}Subject`) ?? '')
		.slice(0, 1000)
		.trim();
	const body = String(data.get(`${prefix}Body`) ?? '')
		.slice(0, 10_000)
		.replace(/\r\n?/g, '\n')
		.trim();
	/** @type {Record<string, string>} */
	const errors = {};
	const se = mailTextError(subject, 'subject');
	const be = mailTextError(body, 'body');
	if (se) errors.subject = se;
	if (be) errors.body = be;
	return { subject, body, errors };
}

/**
 * Las dos acciones del mail de un formulario: `previewMail` (sin guardar) y `saveMail`.
 *
 * @param {import('./store.js').Form} form
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {{ admin: { login: string }, db: import('@cloudflare/workers-types').D1Database,
 *   eventTitle: string, defaults: import('./defaults.js').FormDefaults, save: boolean }} ctx
 */
export async function mailAction(form, event, { admin, db, eventTitle, defaults, save }) {
	const { subject, body, errors } = readMailForm(await event.request.formData());
	if (Object.keys(errors).length) {
		return fail(400, { mail: { ok: false, message: 'Revisá lo marcado.', errors, subject, body } });
	}
	const preview = mailPreview(
		{ ...form, questions: form.questions.length, mailSubject: subject, mailBody: body },
		{ eventTitle, origin: siteOrigin(event.url), defaults }
	);
	if (!save) return { mail: { ok: true, preview, subject, body, message: '' } };
	await saveFormMail(db, form.id, { subject, body }, { by: admin.login });
	await logAdminAction(db, event.locals, {
		action: 'form.mail',
		targetType: form.kind === 'survey' ? 'event' : 'form',
		targetId: form.kind === 'survey' ? String(form.eventSlug) : String(form.id),
		summary:
			form.kind === 'survey'
				? `Cambió el mail de la encuesta de ${form.eventSlug}`
				: `Cambió el mail de «${form.title}»`
	});
	return { mail: { ok: true, preview, subject, body, message: 'Guardado.' } };
}

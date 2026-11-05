/**
 * Comunidad › Formularios › Cómo salen por defecto (docs/formularios.md): la encuesta de después de
 * cada evento (si sale sola, cuántos días después, privacidad, quién ve las respuestas y su mail),
 * los formularios nuevos (quién responde y privacidad) y el mail con el link de un formulario
 * «quienes tenían entrada». Se guarda en `ticket_settings` (`defaults.js`). Solo admins y con el
 * interruptor `formularios`.
 */
import { fail } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import { requireFormsAdmin } from '$lib/server/formularios/admin.js';
import {
	FORM_DEFAULTS,
	getFormDefaults,
	saveFormDefaults,
	validateFormDefaults
} from '$lib/server/formularios/defaults.js';
import { mailTexts } from '$lib/server/formularios/email.js';
import { mailPreview } from '$lib/server/formularios/mailAdmin.js';
import { SURVEY_TEMPLATE_SLUG, ensureTemplates } from '$lib/server/formularios/templates.js';
import { siteOrigin } from '$lib/server/tickets/index.js';

/** El evento de ejemplo de la vista previa (inventado). */
const SAMPLE_EVENT = 'Fiesta de ejemplo';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requireFormsAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	await ensureTemplates(db);
	const [defaults, template] = await Promise.all([
		getFormDefaults(db),
		db
			.prepare("SELECT id FROM forms WHERE slug = ?1 AND kind = 'template' AND deleted_at IS NULL")
			.bind(SURVEY_TEMPLATE_SLUG)
			.first()
	]);
	return {
		defaults,
		builtIn: FORM_DEFAULTS,
		surveyTemplateId: template ? Number(template.id) : null,
		fallback: {
			survey: mailTexts({ kind: 'survey' }),
			form: mailTexts({ kind: 'form' })
		}
	};
}

/** @param {FormData} fd */
function readTexts(fd) {
	/** @param {string} k */
	const get = (k) => String(fd.get(k) ?? '').trim();
	return {
		surveyMailSubject: get('surveyMailSubject'),
		surveyMailBody: get('surveyMailBody'),
		formMailSubject: get('formMailSubject'),
		formMailBody: get('formMailBody')
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const fd = await event.request.formData();
		const checked = validateFormDefaults(fd);
		if (!checked.ok) {
			return fail(400, {
				save: { ok: false, message: 'Revisá lo marcado.', errors: checked.errors },
				texts: readTexts(fd)
			});
		}
		try {
			await saveFormDefaults(db, checked.value, { by: admin.login });
		} catch (e) {
			logDBError('guardar cómo salen los formularios', e);
			return fail(500, { save: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
		}
		await logAdminAction(db, event.locals, {
			action: 'form.defaults',
			targetType: 'settings',
			targetId: 'forms_defaults',
			summary: 'Cambió cómo salen por defecto los formularios',
			detail: {
				surveyAuto: checked.value.surveyAuto,
				surveyDelayDays: checked.value.surveyDelayDays,
				surveyPrivacy: checked.value.surveyPrivacy,
				surveyAudience: checked.value.surveyAudience,
				formAccess: checked.value.formAccess,
				formPrivacy: checked.value.formPrivacy
			}
		});
		return { save: { ok: true, message: 'Guardado. Vale para lo que se cree desde ahora.' } };
	},
	// «Ver cómo queda» de un mail, sin guardar.
	previewMail: async (event) => {
		await requireFormsAdmin(event);
		const fd = await event.request.formData();
		const kind = fd.get('previewKind') === 'form' ? 'form' : 'survey';
		const checked = validateFormDefaults(fd);
		const texts = readTexts(fd);
		const prefix = kind === 'survey' ? 'surveyMail' : 'formMail';
		const errors = checked.ok ? {} : checked.errors;
		/** @type {Record<string, string>} */
		const mailErrors = {};
		const se = errors[/** @type {'surveyMailSubject'} */ (`${prefix}Subject`)];
		const be = errors[/** @type {'surveyMailBody'} */ (`${prefix}Body`)];
		if (se) mailErrors.subject = se;
		if (be) mailErrors.body = be;
		if (se || be) return fail(400, { preview: { kind, errors: mailErrors }, texts });
		const subject = kind === 'survey' ? texts.surveyMailSubject : texts.formMailSubject;
		const body = kind === 'survey' ? texts.surveyMailBody : texts.formMailBody;
		const preview = mailPreview(
			{
				kind,
				title: kind === 'survey' ? '¿Cómo la pasaste?' : 'Formulario de ejemplo',
				privacy: kind === 'survey' ? 'anonymous' : 'named',
				questions: 5,
				mailSubject: subject,
				mailBody: body,
				eventSlug: 'fiesta-de-ejemplo'
			},
			{ eventTitle: SAMPLE_EVENT, origin: siteOrigin(event.url), defaults: null }
		);
		return { preview: { kind, mail: preview }, texts };
	}
};

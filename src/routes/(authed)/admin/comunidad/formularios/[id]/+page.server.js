/**
 * Comunidad › Formularios › un formulario (docs/formularios.md): el editor (nombre, dirección,
 * quién responde, privacidad, quién ve las respuestas y las preguntas con el editor compartido),
 * abrirlo o cerrarlo y, en uno «quienes tenían entrada», mandar el link y su mail. Lo mismo para la
 * encuesta de un evento y para las plantillas. Borrar (suave): vuelve desde Actividad. Solo admins
 * y con el interruptor `formularios`.
 */
import { fail, redirect } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import {
	formOr404,
	requireFormsAdmin,
	ticketedEventChoices
} from '$lib/server/formularios/admin.js';
import { delayText, getFormDefaults } from '$lib/server/formularios/defaults.js';
import { mailTexts } from '$lib/server/formularios/email.js';
import { mailAction, mailPreview } from '$lib/server/formularios/mailAdmin.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import {
	deleteForm,
	requestFormSend,
	responseCount,
	saveForm,
	sendStats,
	setFormOpen
} from '$lib/server/formularios/store.js';
import { getEventMeta, getEventTickets } from '$lib/server/tickets/events.js';
import {
	PRIVACY_LABELS,
	formPath,
	validateFormSettings,
	validateQuestions
} from '$lib/utils/formularios.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requireFormsAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const form = await formOr404(db, event.params.id);
	const [responses, events, stats, defaults] = await Promise.all([
		responseCount(db, form.id),
		ticketedEventChoices(),
		form.access === 'ticket' && form.kind !== 'template' ? sendStats(db, form.id) : null,
		getFormDefaults(db)
	]);
	// El mail con el link personal: en la encuesta y en los «quienes tenían entrada».
	const mails = form.kind === 'survey' || (form.kind === 'form' && form.access === 'ticket');
	const eventTitle = events.find((e) => e.slug === form.eventSlug)?.title ?? form.eventSlug ?? '';
	return {
		form,
		path: form.kind === 'template' ? null : formPath(form),
		responses,
		events,
		stats,
		delayText: delayText(defaults.surveyDelayDays),
		mail: mails
			? {
					preview: mailPreview(
						{ ...form, questions: form.questions.length },
						{ eventTitle, origin: siteOrigin(event.url), defaults }
					),
					fallback: mailTexts({ kind: form.kind }, defaults)
				}
			: null
	};
}

/**
 * @param {import('./$types').RequestEvent} event
 * @param {boolean} save
 */
async function mailFor(event, save) {
	const { admin, db } = await requireFormsAdmin(event);
	const form = await formOr404(db, event.params.id);
	if (form.kind === 'template' || (form.kind === 'form' && form.access !== 'ticket'))
		return fail(400, { mail: { ok: false, message: 'Este formulario no se manda por mail.' } });
	const [events, defaults] = await Promise.all([ticketedEventChoices(), getFormDefaults(db)]);
	const eventTitle = events.find((e) => e.slug === form.eventSlug)?.title ?? form.eventSlug ?? '';
	return mailAction(form, event, { admin, db, eventTitle, defaults, save });
}

/** @type {import('./$types').Actions} */
export const actions = {
	previewMail: (event) => mailFor(event, false),
	saveMail: (event) => mailFor(event, true),
	delete: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const form = await formOr404(db, event.params.id);
		if (form.kind === 'template')
			return fail(400, { remove: { ok: false, message: 'Las plantillas no se borran.' } });
		await deleteForm(db, form, { by: admin.login });
		await logAdminAction(db, event.locals, {
			action: 'form.delete',
			targetType: form.kind === 'survey' ? 'event' : 'form',
			targetId: form.kind === 'survey' ? String(form.eventSlug) : String(form.id),
			summary:
				form.kind === 'survey'
					? `Borró la encuesta de ${form.eventSlug} (se recupera desde Actividad)`
					: `Borró el formulario «${form.title}» (se recupera desde Actividad)`,
			detail: { id: form.id }
		});
		redirect(303, '/admin/comunidad/formularios?borrado=1');
	},
	save: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const form = await formOr404(db, event.params.id);
		const data = await event.request.formData();
		const raw = {
			title: String(data.get('title') ?? '').slice(0, 500),
			intro: String(data.get('intro') ?? '').slice(0, 5000),
			slug: String(data.get('slug') ?? '').slice(0, 200),
			access: data.get('access'),
			privacy: data.get('privacy'),
			audience: data.get('audience'),
			eventSlug: String(data.get('eventSlug') ?? '').slice(0, 200)
		};
		const settings = validateFormSettings(raw, { kind: form.kind });
		const questions = validateQuestions(String(data.get('questions') ?? '[]').slice(0, 300_000));
		/** @type {Record<string, string>} */
		const errors = settings.ok ? {} : { ...settings.errors };
		if (settings.ok && settings.settings.eventSlug) {
			const evt = settings.settings.eventSlug;
			const exists =
				settings.settings.access === 'ticket' || form.kind === 'survey'
					? Boolean(await getEventTickets(evt))
					: Boolean(await getEventMeta(evt));
			if (!exists) errors.eventSlug = 'Ese evento no existe o no vende entradas.';
		}
		if (!settings.ok || !questions.ok || Object.keys(errors).length) {
			return fail(400, {
				save: {
					ok: false,
					message: !questions.ok ? questions.message : 'Revisá lo marcado.',
					errors,
					questionErrors: questions.ok ? {} : questions.errors
				}
			});
		}
		const s = settings.settings;
		let result;
		try {
			result = await saveForm(
				db,
				form.id,
				{ ...s, questions: questions.questions },
				{ by: admin.login }
			);
		} catch (e) {
			logDBError('guardar formulario', e);
			return fail(500, { save: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
		}
		if (result === 'slug') {
			return fail(400, {
				save: {
					ok: false,
					message: 'Revisá lo marcado.',
					errors: { slug: 'Esa dirección ya la usa otro formulario: elegí otra.' }
				}
			});
		}
		if (result === 'missing')
			return fail(404, { save: { ok: false, message: 'Ese formulario ya no existe.' } });
		const privacyChanged = form.privacy !== s.privacy;
		await logAdminAction(db, event.locals, {
			action: 'form.save',
			targetType: 'form',
			targetId: String(form.id),
			summary: `Guardó el formulario «${s.title}»${privacyChanged ? ` (privacidad: ${PRIVACY_LABELS[form.privacy]} → ${PRIVACY_LABELS[s.privacy]})` : ''}`,
			detail: {
				slug: s.slug,
				access: s.access,
				privacy: s.privacy,
				audience: s.audience,
				eventSlug: s.eventSlug,
				questions: questions.questions.length
			}
		});
		return { save: { ok: true, message: 'Guardado.' } };
	},
	setOpen: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const form = await formOr404(db, event.params.id);
		const open = (await event.request.formData()).get('open') === 'on';
		if (form.kind === 'template')
			return fail(400, { open: { ok: false, message: 'Las plantillas no se abren.' } });
		if (open && !form.questions.length) {
			return fail(400, {
				open: { ok: false, message: 'Agregá al menos una pregunta (y guardá) antes de abrirlo.' }
			});
		}
		await setFormOpen(db, form.id, open, { by: admin.login });
		await logAdminAction(db, event.locals, {
			action: open ? 'form.open' : 'form.close',
			targetType: 'form',
			targetId: String(form.id),
			summary:
				form.kind === 'survey'
					? `${open ? 'Prendió' : 'Apagó'} la encuesta de ${form.eventSlug}`
					: `${open ? 'Abrió' : 'Cerró'} el formulario «${form.title}»`
		});
		return { open: { ok: true } };
	},
	send: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const form = await formOr404(db, event.params.id);
		if (form.kind !== 'form' || form.access !== 'ticket' || !form.eventSlug) {
			return fail(400, { send: { ok: false, message: 'Este formulario no se manda por mail.' } });
		}
		if (!form.questions.length) {
			return fail(400, { send: { ok: false, message: 'Agregá al menos una pregunta y guardá.' } });
		}
		await requestFormSend(db, form.id, { by: admin.login });
		await logAdminAction(db, event.locals, {
			action: 'form.send',
			targetType: 'form',
			targetId: String(form.id),
			summary: `Pidió mandar «${form.title}» a quienes tienen entrada para ${form.eventSlug}`
		});
		return {
			send: {
				ok: true,
				message: 'Listo: sale en tandas en los próximos minutos (cada persona lo recibe una vez).'
			}
		};
	}
};

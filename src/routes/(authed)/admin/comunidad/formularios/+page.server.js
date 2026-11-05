/**
 * Comunidad › Formularios (docs/formularios.md): la lista de formularios, las encuestas de los
 * eventos y las plantillas; «Formulario nuevo» y «Usar esta plantilla» (una copia que se edita).
 * Solo admins y con el interruptor `formularios` (si no, 404).
 */
import { fail, redirect } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import { requireFormsAdmin } from '$lib/server/formularios/admin.js';
import { copyForm, createForm, getForm, listForms } from '$lib/server/formularios/store.js';
import { ensureTemplates } from '$lib/server/formularios/templates.js';
import { delayText, getFormDefaults } from '$lib/server/formularios/defaults.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { formPath, oneLine } from '$lib/utils/formularios.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requireFormsAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	await ensureTemplates(db);
	const [forms, events, defaults] = await Promise.all([
		listForms(db),
		listTicketedEvents(),
		getFormDefaults(db)
	]);
	const titles = new Map(events.map((e) => [e.slug, e.config.title || e.slug]));
	const rows = forms.map((f) => ({
		id: f.id,
		kind: f.kind,
		title: f.title,
		slug: f.slug,
		path: f.kind === 'template' ? null : formPath(f),
		access: f.access,
		privacy: f.privacy,
		audience: f.audience,
		open: f.open,
		questions: f.questions.length,
		responses: f.responses,
		eventSlug: f.eventSlug,
		eventTitle: f.eventSlug ? (titles.get(f.eventSlug) ?? f.eventSlug) : null,
		updatedAt: f.updatedAt
	}));
	return {
		surveyText: defaults.surveyAuto
			? `Cada evento con entradas manda su encuesta ${delayText(defaults.surveyDelayDays)}, a quienes tenían entrada.`
			: `La encuesta sale solo en los eventos que la prenden, ${delayText(defaults.surveyDelayDays)}.`,
		deleted: event.url.searchParams.has('borrado'),
		forms: rows.filter((f) => f.kind === 'form'),
		surveys: rows.filter((f) => f.kind === 'survey'),
		templates: rows.filter((f) => f.kind === 'template')
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	create: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const title = oneLine((await event.request.formData()).get('title')).slice(0, 120);
		if (title.length < 2) {
			return fail(400, { create: { ok: false, message: 'Poné un nombre (al menos 2 letras).' } });
		}
		let id;
		try {
			id = await createForm(db, { title }, { by: admin.login });
		} catch (e) {
			logDBError('crear formulario', e);
			return fail(500, { create: { ok: false, message: 'No se pudo crear. Probá de nuevo.' } });
		}
		await logAdminAction(db, event.locals, {
			action: 'form.create',
			targetType: 'form',
			targetId: String(id),
			summary: `Creó el formulario «${title}»`
		});
		redirect(303, `/admin/comunidad/formularios/${id}`);
	},
	copy: async (event) => {
		const { admin, db } = await requireFormsAdmin(event);
		const sourceId = Number((await event.request.formData()).get('id'));
		const source = Number.isSafeInteger(sourceId) ? await getForm(db, sourceId) : null;
		if (!source) return fail(404, { create: { ok: false, message: 'Ese formulario no existe.' } });
		let id;
		try {
			id = await copyForm(db, sourceId, { by: admin.login });
		} catch (e) {
			logDBError('copiar formulario', e);
			return fail(500, { create: { ok: false, message: 'No se pudo copiar. Probá de nuevo.' } });
		}
		if (!id) return fail(500, { create: { ok: false, message: 'No se pudo copiar.' } });
		await logAdminAction(db, event.locals, {
			action: 'form.copy',
			targetType: 'form',
			targetId: String(id),
			summary: `Copió «${source.title}»${source.kind === 'template' ? ' (plantilla)' : ''}`,
			detail: { from: sourceId }
		});
		redirect(303, `/admin/comunidad/formularios/${id}`);
	}
};

/**
 * Agenda: los eventos en un calendario (mes, semana, lista) y en una tabla editable como la
 * planilla de planificación. Cada fila (o cada evento arrastrado a otro día) se guarda sola, con un
 * commit por el mismo camino que el editor de eventos (`getRepoClient()`: GitHub, el mock de
 * `npm run dev:admin` o la capa demo de los previews), con la action `save`.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import { getEventAdmin, getRepoClient, isMockMode } from '$lib/server/eventos';
import { saveAgendaRow } from '$lib/server/eventos/agenda.js';
import { agendaRows } from '$lib/server/eventos/panel.js';
import { eventTagGroups } from '$lib/utils/adminTags.js';
import { shiftMonth, todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const today = todayInArgentina();
	return {
		// Desde el mes pasado, para que el calendario no arranque con el mes a medias. La planilla
		// muestra solo desde hoy.
		rows: await agendaRows({ today: `${shiftMonth(today.slice(0, 7), -1)}-01` }),
		today,
		places: eventTagGroups().places,
		// Lo mismo que pide la action `save` (sin esto el arrastre se muestra apagado).
		canEdit: Boolean(getEventAdmin(locals)),
		mock: isMockMode()
	};
}

/** @param {FormDataEntryValue | null} v */
function parseJson(v) {
	try {
		const parsed = JSON.parse(String(v ?? ''));
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch (e) {
		return {};
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, request, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { save: { ok: false, message: 'No tenés permiso.' } });
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '').slice(0, 200);
		const before = parseJson(data.get('before'));
		const after = parseJson(data.get('after'));
		const r = await saveAgendaRow({
			client: await getRepoClient(),
			token: admin.token,
			author: admin.name,
			slug,
			before,
			after,
			places: eventTagGroups().places
		});
		if (r.ok && r.changed?.length) {
			await logAdminAction(getDB(platform), locals, {
				action: 'event.agenda',
				targetType: 'event',
				targetId: slug,
				summary: `Editó calendario/${slug} desde la agenda: ${r.message.replace(/^Guardado \(|\)\.$/g, '')}`,
				detail: {
					changed: r.changed,
					before: Object.fromEntries(r.changed.map((f) => [f, before[f] ?? null])),
					after: Object.fromEntries(r.changed.map((f) => [f, after[f] ?? null])),
					commit: r.commitUrl ?? null
				}
			});
		}
		const payload = { save: { ...r, slug } };
		return r.ok ? payload : fail(r.status, payload);
	}
};

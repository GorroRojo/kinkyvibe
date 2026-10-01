/**
 * Agenda: los eventos en un calendario (mes, semana, lista) y en una tabla editable como la
 * planilla de planificación. Se guarda por el mismo camino que el editor de eventos
 * (`getRepoClient()`: GitHub, el mock de `npm run dev:admin` o la capa demo de los previews):
 * - action `save`: una fila (Enter en la planilla), un commit;
 * - action `saveMany`: varias filas en un commit ("Guardar N filas" de la planilla y "Guardar
 *   cambios" de los eventos movidos en el calendario), con la misma validación fila por fila.
 * Las notas de los días (tabla `agenda_day_notes`, solo admins) van a D1, no a GitHub:
 * - action `noteSave`: agrega una nota o cambia una (con `id`);
 * - action `noteDelete`: borra una.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	addDayNote,
	deleteDayNote,
	getDayNote,
	listDayNotes,
	updateDayNote
} from '$lib/server/admin/dayNotes.js';
import { getDB } from '$lib/server/db';
import { getEventAdmin, getRepoClient, isMockMode } from '$lib/server/eventos';
import { saveAgendaRow, saveAgendaRows } from '$lib/server/eventos/agenda.js';
import { agendaRows } from '$lib/server/eventos/panel.js';
import { eventTagGroups } from '$lib/utils/adminTags.js';
import { validateDayNote } from '$lib/utils/dayNotes.js';
import { shiftMonth, todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, setHeaders, platform }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const today = todayInArgentina();
	// Desde el mes pasado, para que el calendario no arranque con el mes a medias. La planilla
	// muestra solo desde hoy.
	const from = `${shiftMonth(today.slice(0, 7), -1)}-01`;
	const db = getDB(platform);
	return {
		rows: await agendaRows({ today: from }),
		notes: await listDayNotes(db, { from }),
		// Sin base de datos (algunos previews) no se pueden cargar notas.
		notesEnabled: Boolean(db),
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

/**
 * Deja en el registro del panel un cambio guardado desde la agenda.
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @param {string} slug
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 * @param {import('$lib/server/eventos/agenda.js').AgendaSaveResult} r
 */
async function logAgendaEdit(platform, locals, slug, before, after, r) {
	const changed = r.changed ?? [];
	await logAdminAction(getDB(platform), locals, {
		action: 'event.agenda',
		targetType: 'event',
		targetId: slug,
		summary: `Editó calendario/${slug} desde la agenda: ${r.message.replace(/^Guardado \(|\)\.$/g, '')}`,
		detail: {
			changed,
			before: Object.fromEntries(changed.map((f) => [f, before[f] ?? null])),
			after: Object.fromEntries(changed.map((f) => [f, after[f] ?? null])),
			commit: r.commitUrl ?? null
		}
	});
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
		if (r.ok && r.changed?.length) await logAgendaEdit(platform, locals, slug, before, after, r);
		const payload = { save: { ...r, slug } };
		return r.ok ? payload : fail(r.status, payload);
	},

	saveMany: async ({ locals, url, request, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin)
			return fail(403, {
				saveMany: { ok: false, status: 403, message: 'No tenés permiso.', results: [] }
			});
		const data = await request.formData();
		/** @type {unknown} */
		let parsed;
		try {
			parsed = JSON.parse(String(data.get('rows') ?? ''));
		} catch (e) {
			parsed = null;
		}
		if (!Array.isArray(parsed)) {
			return fail(400, {
				saveMany: { ok: false, status: 400, message: 'Pedido inválido.', results: [] }
			});
		}
		const rows = parsed.map((/** @type {any} */ x) => ({
			slug: String(x?.slug ?? '').slice(0, 200),
			before: x?.before && typeof x.before === 'object' ? x.before : {},
			after: x?.after && typeof x.after === 'object' ? x.after : {}
		}));
		const r = await saveAgendaRows({
			client: await getRepoClient(),
			token: admin.token,
			author: admin.name,
			rows,
			places: eventTagGroups().places
		});
		for (const [i, res] of r.results.entries()) {
			if (res.ok && res.changed?.length)
				await logAgendaEdit(platform, locals, res.slug, rows[i].before, rows[i].after, res);
		}
		const payload = { saveMany: r };
		return r.ok ? payload : fail(r.status, payload);
	},

	noteSave: async ({ locals, url, request, platform }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { note: { ok: false, message: 'Sin base de datos.' } });
		const data = await request.formData();
		const rawId = String(data.get('id') ?? '');
		const id = rawId ? Number(rawId) : null;
		if (id !== null && !(Number.isSafeInteger(id) && id > 0)) {
			return fail(400, { note: { ok: false, message: 'Pedido inválido.' } });
		}
		const v = validateDayNote({
			date: String(data.get('date') ?? '').slice(0, 20),
			body: String(data.get('body') ?? '').slice(0, 1000),
			color: String(data.get('color') ?? '').slice(0, 40)
		});
		if (!v.ok) {
			return fail(400, {
				note: { ok: false, message: 'Revisá los campos marcados.', errors: v.errors }
			});
		}
		if (id === null) {
			const note = await addDayNote(db, { ...v.value, by: admin.login });
			await logAdminAction(db, locals, {
				action: 'agenda.note.add',
				targetType: 'agenda-day',
				targetId: note.date,
				summary: `Agregó una nota al ${note.date} en la agenda: «${note.body}»`,
				detail: { id: note.id, date: note.date, body: note.body, color: note.color }
			});
			return { note: { ok: true, message: 'Nota guardada.', note } };
		}
		const before = await getDayNote(db, id);
		const note = before && (await updateDayNote(db, { id, ...v.value, by: admin.login }));
		if (!before || !note)
			return fail(404, { note: { ok: false, message: 'Esa nota ya no está.' } });
		await logAdminAction(db, locals, {
			action: 'agenda.note.edit',
			targetType: 'agenda-day',
			targetId: note.date,
			summary: `Cambió una nota del ${before.date} en la agenda: «${note.body}»`,
			detail: {
				id,
				before: { date: before.date, body: before.body, color: before.color },
				after: { date: note.date, body: note.body, color: note.color }
			}
		});
		return { note: { ok: true, message: 'Nota guardada.', note } };
	},

	noteDelete: async ({ locals, url, request, platform }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { note: { ok: false, message: 'Sin base de datos.' } });
		const id = Number((await request.formData()).get('id'));
		const before = Number.isSafeInteger(id) && id > 0 ? await getDayNote(db, id) : null;
		if (!before || !(await deleteDayNote(db, id))) {
			return fail(404, { note: { ok: false, message: 'Esa nota ya no está.' } });
		}
		await logAdminAction(db, locals, {
			action: 'agenda.note.delete',
			targetType: 'agenda-day',
			targetId: before.date,
			summary: `Borró una nota del ${before.date} en la agenda: «${before.body}»`,
			detail: { id, date: before.date, body: before.body, color: before.color }
		});
		return { note: { ok: true, message: 'Nota borrada.', id } };
	}
};

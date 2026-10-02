/**
 * Guardar cambios de la agenda desde el navegador, por las actions de /admin/eventos/agenda:
 * - `postAgendaSave`: una fila (action `save`, Enter en la planilla);
 * - `postAgendaSaveMany`: varias filas en un solo commit (action `saveMany`: "Guardar N filas" de
 *   la planilla y "Guardar cambios" de los eventos movidos en el calendario);
 * - `postDayNote` / `postDayNoteDelete`: guardar o borrar una nota de un día (actions `noteSave` y
 *   `noteDelete`, en D1).
 * Devuelven lo que respondió el servidor, o null si la sesión venció y se fue a /login.
 */
import { deserialize } from '$app/forms';

/**
 * @typedef {import('$lib/server/eventos/agenda.js').AgendaSaveResult & { slug?: string }} AgendaSaveResponse
 * @typedef {import('$lib/server/eventos/agenda.js').AgendaBatchResult} AgendaBatchResponse
 * @typedef {{ slug: string, before: import('$lib/utils/agenda.js').AgendaValues, after: import('$lib/utils/agenda.js').AgendaValues }} AgendaChange
 */

const OFFLINE = 'Sin conexión. Probá de nuevo.';
const SERVER_ERROR = 'Error del servidor. Probá de nuevo.';

/**
 * @param {string} action
 * @param {FormData} body
 * @returns {Promise<{ status: number, data: any } | { status: 0, data: null } | null>}
 */
async function postAction(action, body) {
	let res;
	try {
		res = await fetch(`/admin/eventos/agenda?/${action}`, {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	} catch (e) {
		return { status: 0, data: null };
	}
	/** @type {any} */
	let r;
	try {
		r = deserialize(await res.text());
	} catch (e) {
		return { status: res.status, data: null };
	}
	if (r.type === 'redirect') {
		location.href = r.location;
		return null;
	}
	return { status: res.status, data: r.data ?? null };
}

/**
 * @param {string} slug
 * @param {import('$lib/utils/agenda.js').AgendaValues} before lo que la persona vio
 * @param {import('$lib/utils/agenda.js').AgendaValues} after lo que quiere guardar
 * @returns {Promise<AgendaSaveResponse | null>}
 */
export async function postAgendaSave(slug, before, after) {
	const body = new FormData();
	body.set('slug', slug);
	body.set('before', JSON.stringify(before));
	body.set('after', JSON.stringify(after));
	const r = await postAction('save', body);
	if (!r) return null;
	return (
		r.data?.save ?? {
			status: r.status,
			ok: false,
			message: r.status ? SERVER_ERROR : OFFLINE
		}
	);
}

/**
 * @param {AgendaChange[]} changes
 * @returns {Promise<AgendaBatchResponse | null>} `results` vacío si no llegó al servidor
 */
export async function postAgendaSaveMany(changes) {
	const body = new FormData();
	body.set('rows', JSON.stringify(changes));
	const r = await postAction('saveMany', body);
	if (!r) return null;
	return (
		r.data?.saveMany ?? {
			status: r.status,
			ok: false,
			message: r.status ? SERVER_ERROR : OFFLINE,
			results: []
		}
	);
}

/**
 * @typedef {{
 *   ok: boolean,
 *   message: string,
 *   note?: import('$lib/utils/dayNotes.js').DayNote,
 *   id?: number,
 *   errors?: { date?: string, body?: string, color?: string }
 * }} DayNoteResponse
 */

/**
 * Agrega una nota (sin `id`) o cambia una.
 * @param {{ id?: number | null, date: string, body: string, color: string }} note
 * @returns {Promise<DayNoteResponse | null>}
 */
export async function postDayNote({ id, date, body, color }) {
	const form = new FormData();
	if (id) form.set('id', String(id));
	form.set('date', date);
	form.set('body', body);
	form.set('color', color);
	const r = await postAction('noteSave', form);
	if (!r) return null;
	return r.data?.note ?? { ok: false, message: r.status ? SERVER_ERROR : OFFLINE };
}

/**
 * @param {number} id
 * @returns {Promise<DayNoteResponse | null>}
 */
export async function postDayNoteDelete(id) {
	const form = new FormData();
	form.set('id', String(id));
	const r = await postAction('noteDelete', form);
	if (!r) return null;
	return r.data?.note ?? { ok: false, message: r.status ? SERVER_ERROR : OFFLINE };
}

/**
 * Guardar un cambio de la agenda desde el navegador: la action `save` de
 * /admin/eventos/agenda (la que usan la planilla y el arrastre del calendario). Devuelve el
 * `AgendaSaveResult` del servidor (con `slug`), o null si la sesión venció y se fue a /login.
 */
import { deserialize } from '$app/forms';

/**
 * @typedef {import('$lib/server/eventos/agenda.js').AgendaSaveResult & { slug?: string }} AgendaSaveResponse
 */

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
	let res;
	try {
		res = await fetch('/admin/eventos/agenda?/save', {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	} catch (e) {
		return { status: 0, ok: false, message: 'Sin conexión. Probá de nuevo.' };
	}
	/** @type {any} */
	const r = deserialize(await res.text());
	if (r.type === 'redirect') {
		location.href = r.location;
		return null;
	}
	return (
		r.data?.save ?? {
			status: res.status,
			ok: false,
			message: 'Error del servidor. Probá de nuevo.'
		}
	);
}

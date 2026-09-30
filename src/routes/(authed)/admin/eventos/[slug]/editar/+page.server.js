/**
 * Ficha del evento, pestaña Editar: el editor de /edit (datos, imagen, etiquetas, entradas y texto)
 * dentro del panel. Mismo load y mismas acciones (guarda con un commit por el mismo camino, así
 * que en los previews va a la capa demo), con la categoría fija en `calendario`.
 */
import { requireAdmin } from '$lib/server/auth';
import {
	_editActions,
	_editLoad
} from '../../../../edit/[category=category]/[postID]/+page.server.js';

/**
 * @template {{ params: { slug: string } }} E
 * @param {E} event
 */
function asEventEdit(event) {
	return Object.assign(Object.create(Object.getPrototypeOf(event)), event, {
		params: { category: 'calendario', postID: event.params.slug }
	});
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	return _editLoad(asEventEdit(event));
}

/** @type {import('./$types').Actions} */
export const actions = Object.fromEntries(
	Object.entries(_editActions).map(([name, action]) => [
		name,
		/** @param {import('./$types').RequestEvent} event */
		(event) => action(asEventEdit(event))
	])
);

import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { EDITOR_KINDS, createProfileAction, dbMode } from '$lib/server/admin/amiguesRoutes.js';
import { emptyFormValues } from '$lib/server/amigues/editor.js';

/**
 * Perfil nuevo: en la base (se publica al guardar). Sin base no hay dónde guardarlo («solo
 * base»: ya no se crean fichas .md).
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	if (!(await dbMode(event.platform)))
		error(503, 'Sin base de datos: no hay dónde guardar perfiles.');
	const kind = event.url.searchParams.get('tipo') ?? 'persona';
	return {
		editor: /** @type {const} */ ('db'),
		values: emptyFormValues(kind in EDITOR_KINDS ? kind : 'persona'),
		kinds: EDITOR_KINDS
	};
}

/** @type {import('./$types').Actions} */
export const actions = { crearPerfil: createProfileAction };

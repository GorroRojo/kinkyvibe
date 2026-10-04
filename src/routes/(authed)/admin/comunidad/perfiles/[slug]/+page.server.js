import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import {
	NOT_IN_DB,
	confirmKindAction,
	editorPageData,
	saveProfileAction
} from '$lib/server/admin/amiguesRoutes.js';

/**
 * El editor de un perfil, solo en la base («solo base»: publica al toque, con control de versión):
 * los creados en el panel, los de las cuentas, los lugares y las fichas importadas. Un perfil que
 * la base no tiene (una ficha del repo sin importar) da 404 con el aviso de importarla primero.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	const data = await editorPageData(event.platform, event.params.slug, event.locals);
	if (!data) error(404, NOT_IN_DB);
	return data;
}

/** @type {import('./$types').Actions} */
export const actions = {
	guardarPerfil: saveProfileAction,
	confirmarTipo: confirmKindAction
};

import { editorActions, editLoad } from '$lib/server/admin/contentRoutes.js';
import { requireAdmin } from '$lib/server/auth';
import {
	confirmKindAction,
	editorPageData,
	saveProfileAction
} from '$lib/server/admin/amiguesRoutes.js';

const mdLoad = editLoad('amigues');

/**
 * El editor de la base (publica al toque, con control de versión) para los perfiles que solo están
 * en la base y, con el interruptor `perfiles_publicos` prendido, para las fichas importadas. Si no,
 * el editor del .md de siempre (cambios por PR).
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	const data = await editorPageData(event.platform, event.params.slug);
	if (data) return data;
	return { editor: /** @type {const} */ ('md'), ...(await mdLoad(event)) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	...editorActions('amigues'),
	guardarPerfil: saveProfileAction,
	confirmarTipo: confirmKindAction
};

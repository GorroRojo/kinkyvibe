import { editorActions, newLoad } from '$lib/server/admin/contentRoutes.js';
import { requireAdmin } from '$lib/server/auth';
import { EDITOR_KINDS, createProfileAction, dbMode } from '$lib/server/admin/amiguesRoutes.js';
import { emptyFormValues } from '$lib/server/amigues/editor.js';

const mdLoad = newLoad('amigues');

/**
 * Perfil nuevo: con el interruptor `perfiles_publicos` prendido, en la base (se publica al
 * guardar); si no, una ficha .md como siempre.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	if (await dbMode(event.platform)) {
		const kind = event.url.searchParams.get('tipo') ?? 'persona';
		return {
			editor: /** @type {const} */ ('db'),
			values: emptyFormValues(kind in EDITOR_KINDS ? kind : 'persona'),
			kinds: EDITOR_KINDS
		};
	}
	return { editor: /** @type {const} */ ('md'), ...(await mdLoad(event)) };
}

/** @type {import('./$types').Actions} */
export const actions = { ...editorActions('amigues'), crearPerfil: createProfileAction };

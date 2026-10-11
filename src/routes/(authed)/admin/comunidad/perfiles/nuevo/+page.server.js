import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { EDITOR_KINDS, createProfileAction, dbMode } from '$lib/server/admin/amiguesRoutes.js';
import { emptyFormValues } from '$lib/server/amigues/editor.js';

/** Largo máximo de lo que llega en la URL para completar el formulario. */
const PREFILL_MAX = 200;

/**
 * Perfil nuevo: en la base (se publica al guardar). Sin base no hay dónde guardarlo («solo
 * base»: ya no se crean fichas .md).
 *
 * `?tipo=lugar&nombre=…&direccion=…` arranca el formulario con ese nombre y esa dirección (lo usa
 * «Crear lugar nuevo» de Lugares → Vincular lugares, con el «Dónde» de los eventos). Solo completa
 * el formulario: nada se guarda hasta «Crear y publicar».
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	if (!(await dbMode(event.platform)))
		error(503, 'Sin base de datos: no hay dónde guardar perfiles.');
	const params = event.url.searchParams;
	const kind = params.get('tipo') ?? 'persona';
	const values = emptyFormValues(kind in EDITOR_KINDS ? kind : 'persona');
	/** @param {string} name */
	const prefill = (name) => (params.get(name) ?? '').trim().slice(0, PREFILL_MAX);
	values.title = prefill('nombre');
	if (values.kind === 'lugar') values.text.address = prefill('direccion');
	return { editor: /** @type {const} */ ('db'), values, kinds: EDITOR_KINDS };
}

/** @type {import('./$types').Actions} */
export const actions = { crearPerfil: createProfileAction };

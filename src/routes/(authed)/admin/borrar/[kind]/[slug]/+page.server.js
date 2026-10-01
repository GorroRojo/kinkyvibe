/**
 * Borrar una publicación desde el panel (eventos, material, amigues): confirmación en la página,
 * con lo que lo impide o depende de ella, y «Deshacer» después. Ver
 * src/lib/server/admin/deletions.js. Interruptor `borrar_desde_panel`.
 */
import { deleteAction, deletePageLoad, undoAction } from '$lib/server/admin/deletionRoutes.js';

export const load = deletePageLoad;

/** @type {import('./$types').Actions} */
export const actions = { borrar: deleteAction, deshacer: undoAction };

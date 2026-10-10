/**
 * Textos de borrar y deshacer del panel, compartidos por la página de borrar y Actividad.
 */

/**
 * Aviso después de deshacer un borrado. `immediate`: ya está (un perfil que vive solo en la
 * base), no hay nada que publicar.
 * @param {{ mode: 'cancelled' | 'restored', title: string, immediate?: boolean }} undone
 */
export function undoneMessage({ mode, title, immediate = false }) {
	if (mode === 'cancelled')
		return `Listo: «${title}» no se borró (se canceló el cambio antes de publicarse).`;
	return immediate
		? `Listo: «${title}» vuelve a estar.`
		: `Listo: «${title}» vuelve a estar. Se publica en unos minutos.`;
}

/** Las filas de la biblioteca en «Recuperar» (ver `libraryPath` de src/lib/server/admin/deletions.js). */
const LIBRARY_ROW = /^objeto:(imagen|archivo):[1-9]\d*$/;
/** Las etiquetas y las series (ver `tagDeletionPath` de src/lib/server/admin/deletions.js). */
const TAG_ROW = /^objeto:(etiqueta|serie):[1-9]\d*$/;
/** El texto propio de un mail de un evento (ver `templateDeletionPath`). */
const TEMPLATE_ROW = /^plantilla:[^:]+:[a-z_]+$/;

const KIND_LABELS = /** @type {Record<string, string>} */ ({
	calendario: 'Evento',
	material: 'Material',
	amigues: 'Amigues'
});

/**
 * Qué es cada borrado en «Borrados que podés recuperar»: «Evento», «Material», «Amigues»,
 * «Etiqueta», «Serie», «Mail del evento» (con la dirección del evento) o, para la biblioteca,
 * «Biblioteca · imagen» / «Biblioteca · archivo» (sin la dirección: es el hash del archivo).
 * @param {{ kind: string, path?: string }} row
 * @returns {{ label: string, library: boolean }}
 */
export function deletionLabel({ kind, path = '' }) {
	const m = LIBRARY_ROW.exec(path);
	if (m) return { label: `Biblioteca · ${m[1]}`, library: true };
	const tag = TAG_ROW.exec(path);
	if (tag) return { label: tag[1] === 'serie' ? 'Serie' : 'Etiqueta', library: false };
	if (TEMPLATE_ROW.test(path)) return { label: 'Mail del evento', library: false };
	return { label: KIND_LABELS[kind] ?? kind, library: false };
}

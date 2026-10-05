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

const KIND_LABELS = /** @type {Record<string, string>} */ ({
	calendario: 'Evento',
	material: 'Material',
	amigues: 'Amigues'
});

/**
 * Qué es cada borrado en «Borrados que podés recuperar»: «Evento», «Material», «Amigues» o, para
 * la biblioteca, «Biblioteca · imagen» / «Biblioteca · archivo» (sin la dirección: es el hash del
 * archivo).
 * @param {{ kind: string, path?: string }} row
 * @returns {{ label: string, library: boolean }}
 */
export function deletionLabel({ kind, path = '' }) {
	const m = LIBRARY_ROW.exec(path);
	if (m) return { label: `Biblioteca · ${m[1]}`, library: true };
	return { label: KIND_LABELS[kind] ?? kind, library: false };
}

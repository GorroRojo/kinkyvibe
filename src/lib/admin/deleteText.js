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

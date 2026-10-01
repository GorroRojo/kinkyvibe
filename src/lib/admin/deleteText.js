/**
 * Textos de borrar y deshacer del panel, compartidos por la página de borrar y Actividad.
 */

/**
 * Aviso después de deshacer un borrado.
 * @param {{ mode: 'cancelled' | 'restored', title: string }} undone
 */
export function undoneMessage({ mode, title }) {
	return mode === 'cancelled'
		? `Listo: «${title}» no se borró (se canceló el cambio antes de publicarse).`
		: `Listo: «${title}» vuelve a estar. Se publica en unos minutos.`;
}

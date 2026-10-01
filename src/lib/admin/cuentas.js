/**
 * Textos y pestañas compartidos de la sección Cuentas del panel (/admin/cuentas).
 */

/** Pestañas de la sección: las cuentas y todos los perfiles. */
export const CUENTAS_TABS = Object.freeze([
	{ href: '/admin/cuentas', label: 'Cuentas' },
	{ href: '/admin/cuentas/perfiles', label: 'Perfiles' }
]);

/** @type {Record<string, string>} */
export const VISIBILITY_LABELS = {
	public: 'Público',
	members: 'Solo con cuenta',
	hidden: 'Oculto'
};

/**
 * Quién creó o editó un objeto, para mostrar: une admin (login de GitHub), una cuenta
 * (`cuenta:<id>`) o una cuenta borrada.
 * @param {string} actor
 */
export function actorLabel(actor) {
	if (actor === 'cuenta:borrada') return 'una cuenta borrada';
	if (actor.startsWith('cuenta:')) return 'una cuenta';
	return actor ? `@${actor}` : '—';
}

/**
 * Textos compartidos de Cuentas (/admin/comunidad/cuentas) y de Comunidad › Perfiles (/admin/comunidad/perfiles).
 */

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

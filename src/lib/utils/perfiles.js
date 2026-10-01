/**
 * Textos de las páginas de perfiles (Mi rincón → Perfiles), compartidos entre páginas.
 */

/** @type {Record<string, string>} */
export const KIND_LABELS = { persona: 'Persona', proyecto: 'Proyecto' };

/** @type {Record<string, string>} */
export const ROLE_LABELS = { owner: 'Dueñe', manager: 'Gestiona' };

/** Visibilidades de un perfil (las del modelo de objetos), con su explicación. */
export const VISIBILITY_OPTIONS = Object.freeze([
	{ value: 'public', label: 'Público', hint: '(lo puede ver cualquiera)' },
	{ value: 'members', label: 'Solo personas con cuenta', hint: '(hay que ingresar para verlo)' },
	{
		value: 'hidden',
		label: 'Oculto',
		hint: '(no aparece en ningún lado; lo ven solo quienes lo gestionan y les admins del sitio)'
	}
]);

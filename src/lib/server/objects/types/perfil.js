/**
 * Tipo núcleo `perfil`: una persona o un grupo, con nombre (el `title` del objeto: no hay
 * "nombre para mostrar" aparte, decisión E1) y pocos campos más.
 *
 * - Una cuenta puede tener varios perfiles (decisión A2). Quién gestiona cada uno NO está acá:
 *   las cuentas no son objetos, así que va en la tabla `profile_managers` (migración 0014). Ver
 *   src/lib/server/cuentas/perfiles.js y docs/cuentas.md («Perfiles»).
 * - Integrantes de un grupo: edges `es_integrante_de` desde el perfil de una persona hacia el del
 *   grupo. Que el origen sea persona y el destino grupo lo controla perfiles.js (el registro solo
 *   sabe de tipos, no de `kind`).
 * - `kind` no se cambia después de crear el perfil (lo controla perfiles.js).
 * - Más adelante, los lugares (decisión B3) pueden sumarse como otro `kind` con sus campos extra;
 *   nada de acá lo impide.
 *
 * Todavía no hay página pública de perfiles: los de amigues siguen siendo archivos .md.
 */

/**
 * @typedef {{
 *   kind: 'persona' | 'grupo',
 *   bio?: string,
 *   pronouns?: string,
 *   links?: string[],
 *   avatar?: string,
 *   show_members?: boolean
 * }} PerfilData
 */

export const PROFILE_KINDS = /** @type {const} */ (['persona', 'grupo']);

/** Cuántos links como mucho (web, redes…). */
export const LINKS_MAX = 8;
export const LINK_MAX_LENGTH = 300;
export const BIO_MAX = 1000;

/**
 * Referencia a una imagen de NUESTRO almacenamiento de medios (clave del bucket, P6.3), nunca un
 * link a otro sitio: una imagen externa avisaría a ese sitio cada vez que alguien mira el perfil.
 * Todavía no hay subidas; el campo queda listo.
 */
const AVATAR_KEY = /^[a-z0-9][a-z0-9/_.-]{0,199}$/;

/** @param {string} text */
function linkProblem(text) {
	let url;
	try {
		url = new URL(text);
	} catch {
		return 'no es un link válido (tiene que empezar con https://)';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		return 'tiene que ser un link web (https://)';
	}
	if (url.username || url.password) return 'no puede llevar usuario ni contraseña';
	if (text.length > LINK_MAX_LENGTH) return 'es demasiado largo';
	return null;
}

/** @type {import('./index.js').CoreType} */
const perfil = {
	type: 'perfil',
	label: 'Perfil',
	fields: {
		kind: { kind: 'option', label: 'Tipo de perfil', options: PROFILE_KINDS, required: true },
		bio: { kind: 'longtext', label: 'Presentación', max: BIO_MAX },
		pronouns: { kind: 'text', label: 'Pronombres', max: 40 },
		links: { kind: 'list', label: 'Links', max: LINKS_MAX },
		avatar: { kind: 'text', label: 'Imagen', max: 200 },
		show_members: { kind: 'boolean', label: 'Mostrar integrantes' }
	},
	edges: {
		es_integrante_de: { label: 'Integrante de', to: ['perfil'] }
	},
	check(data) {
		/** @type {import('../fields.js').FieldError[]} */
		const errors = [];
		for (const link of /** @type {string[]} */ (data.links ?? [])) {
			const problem = linkProblem(link);
			if (problem) errors.push({ path: 'links', message: `Links: «${link}» ${problem}` });
		}
		if (data.avatar !== undefined && !AVATAR_KEY.test(String(data.avatar))) {
			errors.push({ path: 'avatar', message: 'Imagen: tiene que ser una imagen subida al sitio' });
		}
		if (data.kind !== 'grupo' && data.show_members !== undefined) {
			errors.push({
				path: 'show_members',
				message: 'Mostrar integrantes: solo para perfiles de grupo'
			});
		}
		return errors;
	},
	searchText(data) {
		return [data.pronouns, data.bio].filter(Boolean).join('\n');
	}
};

export default perfil;

/**
 * Tipo núcleo `perfil`: una persona, un proyecto o un lugar, con nombre (el `title` del objeto: no hay
 * "nombre para mostrar" aparte, decisión E1) y pocos campos más.
 *
 * - Una cuenta puede tener varios perfiles (decisión A2). Quién gestiona cada uno NO está acá:
 *   las cuentas no son objetos, así que va en la tabla `profile_managers` (migración 0014). Ver
 *   src/lib/server/cuentas/perfiles.js y docs/cuentas.md («Perfiles»).
 * - Proyecto: lo que no es una persona (marcas, productoras, emprendimientos, colectivos, fiestas),
 *   con une o varies integrantes. Hasta la migración 0023 se llamaba `grupo`: ese valor viejo se
 *   sigue aceptando y se lee como `proyecto` ({@link normalizeProfileKind}).
 * - Integrantes de un proyecto: edges `es_integrante_de` desde el perfil de una persona hacia el
 *   del proyecto. Que el origen sea persona y el destino proyecto lo controla perfiles.js (el
 *   registro solo sabe de tipos, no de `kind`).
 * - `kind` no se cambia después de crear el perfil (lo controla perfiles.js).
 * - Los lugares (decisión B3) son perfiles de `kind` 'lugar', con campos propios (dirección,
 *   barrio, ciudad, ubicación, accesibilidad, cómo llegar y su privacidad por defecto). Esos
 *   campos solo valen para lugares (`check`).
 * - Las fichas de amigues (.md) se importan a perfiles (src/lib/server/amigues/importer.js): por
 *   eso están también sus campos (resumen en `bio`, cuerpo, link, contacto, etiquetas, autores,
 *   imágenes de la carpeta de medios y fechas), con los mismos nombres que en el frontmatter.
 *   Ver docs/amigues.md.
 *
 * La página pública es /amigues/<slug>.
 */

/**
 * @typedef {{
 *   kind: ProfileKind,
 *   bio?: string,
 *   body?: string,
 *   pronouns?: string,
 *   pronouns_url?: string,
 *   links?: string[],
 *   link_text?: string,
 *   avatar?: string,
 *   featured?: string,
 *   photo?: string,
 *   logo?: string,
 *   email?: string,
 *   tel?: string,
 *   bday?: string,
 *   gender_identity?: string,
 *   job_title?: string,
 *   tags?: string[],
 *   authors?: string[],
 *   published_date?: string,
 *   updated_date?: string,
 *   unlisted?: boolean,
 *   show_members?: boolean,
 *   address?: string,
 *   area?: string,
 *   city?: string,
 *   lat?: number,
 *   lng?: number,
 *   accessibility?: string,
 *   how_to_get_there?: string,
 *   venue_privacy?: 'public' | 'name' | 'address' | 'area' | 'hidden'
 * }} PerfilData
 */

/**
 * Privacidad de la dirección de un lugar (decisión B3), de más a menos visible. El lugar tiene
 * una por defecto (`venue_privacy`; sin elegir: `public`, ver DEFAULT_VENUE_PRIVACY en
 * src/lib/utils/venues.js) y cada evento la puede cambiar (`data.privacy` del edge `lugar` del
 * evento).
 * - public: nombre, dirección, barrio, ciudad y mapa;
 * - name: solo el nombre (con el link a su página);
 * - address: la dirección (calle y número, barrio, ciudad) y el mapa, sin el nombre (una casa
 *   particular, por ejemplo);
 * - area: solo el barrio y la ciudad (ni el nombre: lo identificaría);
 * - hidden: nada (quien compra entrada recibe la dirección completa igual).
 * Los mismos que VENUE_PRIVACY_LEVELS en src/lib/utils/venues.js (lo revisa types.test.js).
 */
export const VENUE_PRIVACY = /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden']);

/** Campos que solo tienen los lugares. */
export const VENUE_FIELDS = Object.freeze([
	'address',
	'area',
	'city',
	'lat',
	'lng',
	'accessibility',
	'how_to_get_there',
	'venue_privacy'
]);

export const PROFILE_KINDS = /** @type {const} */ (['persona', 'proyecto', 'lugar']);

/** @typedef {(typeof PROFILE_KINDS)[number]} ProfileKind */

/**
 * El nombre viejo de `proyecto` (hasta la migración 0023_perfil_proyecto). No se escribe más:
 * si aparece en una fila, se lee como `proyecto`.
 */
export const LEGACY_PROJECT_KIND = 'grupo';

/**
 * El único lugar que decide qué `kind` es un valor guardado o recibido: `proyecto` (también el
 * viejo `grupo`), `persona`, `lugar`, o `null` si no es ninguno.
 *
 * @param {unknown} value
 * @returns {ProfileKind | null}
 */
export function normalizeProfileKind(value) {
	if (value === LEGACY_PROJECT_KIND) return 'proyecto';
	return PROFILE_KINDS.find((k) => k === value) ?? null;
}

/**
 * El `kind` de los datos de un perfil ya guardado. Lo que no se reconoce cuenta como persona
 * (como hasta ahora).
 *
 * @param {Record<string, unknown> | null | undefined} data
 * @returns {ProfileKind}
 */
export function profileKindOf(data) {
	return normalizeProfileKind(data?.kind) ?? 'persona';
}

/** Cuántos links como mucho (web, redes…). */
export const LINKS_MAX = 8;
export const LINK_MAX_LENGTH = 300;
export const BIO_MAX = 1000;
export const BODY_MAX = 20_000;
export const TAGS_MAX = 40;

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

/** @param {string} key */
function venueLabel(key) {
	return perfil.fields[key]?.label ?? key;
}

/** @type {import('./index.js').CoreType} */
const perfil = {
	type: 'perfil',
	label: 'Perfil',
	fields: {
		kind: { kind: 'option', label: 'Tipo de perfil', options: PROFILE_KINDS, required: true },
		bio: { kind: 'longtext', label: 'Presentación', max: BIO_MAX },
		body: { kind: 'longtext', label: 'Texto de la página', max: BODY_MAX },
		pronouns: { kind: 'text', label: 'Pronombres', max: 40 },
		pronouns_url: { kind: 'url', label: 'Link de pronombres', max: LINK_MAX_LENGTH },
		links: { kind: 'list', label: 'Links', max: LINKS_MAX },
		link_text: { kind: 'text', label: 'Texto del botón del link', max: 80 },
		avatar: { kind: 'text', label: 'Imagen', max: 200 },
		// Imágenes de la ficha importada: número (o nombre) de archivo en
		// src/lib/posts/amigues/media/<dirección vieja>/, como en el frontmatter.
		featured: { kind: 'text', label: 'Imagen principal (ficha vieja)', max: 40 },
		photo: { kind: 'text', label: 'Foto (ficha vieja)', max: 40 },
		logo: { kind: 'text', label: 'Logo (ficha vieja)', max: 40 },
		// Datos de contacto que cada amigue cargó en su ficha pública (decisión de gorrite: son
		// públicos a propósito). La página pública muestra lo mismo que antes (ver docs/amigues.md).
		email: { kind: 'text', label: 'Mail', max: 254 },
		tel: { kind: 'text', label: 'Teléfono', max: 40 },
		bday: { kind: 'text', label: 'Cumpleaños', max: 40 },
		gender_identity: { kind: 'text', label: 'Identidad de género', max: 100 },
		job_title: { kind: 'text', label: 'Ocupación', max: 100 },
		tags: { kind: 'list', label: 'Etiquetas', max: TAGS_MAX },
		authors: { kind: 'list', label: 'Autores', max: 20 },
		// Fechas como estaban escritas en la ficha (algunas no son fechas ISO válidas).
		published_date: { kind: 'text', label: 'Publicado', max: 40 },
		updated_date: { kind: 'text', label: 'Actualizado', max: 40 },
		unlisted: { kind: 'boolean', label: 'No listado' },
		show_members: { kind: 'boolean', label: 'Mostrar integrantes' },
		// Solo lugares.
		address: { kind: 'text', label: 'Dirección', max: 300 },
		area: { kind: 'text', label: 'Barrio', max: 100 },
		city: { kind: 'text', label: 'Ciudad', max: 100 },
		lat: { kind: 'number', label: 'Latitud', min: -90, max: 90 },
		lng: { kind: 'number', label: 'Longitud', min: -180, max: 180 },
		accessibility: { kind: 'longtext', label: 'Accesibilidad', max: 2000 },
		how_to_get_there: { kind: 'longtext', label: 'Cómo llegar', max: 2000 },
		venue_privacy: {
			kind: 'option',
			label: 'Privacidad de la dirección',
			options: VENUE_PRIVACY
		}
	},
	edges: {
		es_integrante_de: { label: 'Integrante de', to: ['perfil'] },
		// La imagen del perfil (docs/imagenes.md). El campo `avatar` (texto) quedó sin uso.
		avatar: { label: 'Imagen', to: ['imagen'], max: 1 }
	},
	normalize(data) {
		// Una fila con el `kind` viejo se guarda (editada, borrada…) ya como `proyecto`.
		if (data && typeof data === 'object' && !Array.isArray(data)) {
			const kind = /** @type {Record<string, unknown>} */ (data).kind;
			if (kind === LEGACY_PROJECT_KIND) return { ...data, kind: normalizeProfileKind(kind) };
		}
		return data;
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
		if (data.kind !== 'proyecto' && data.show_members !== undefined) {
			errors.push({
				path: 'show_members',
				message: 'Mostrar integrantes: solo para perfiles de proyecto'
			});
		}
		if (data.kind !== 'lugar') {
			for (const key of VENUE_FIELDS) {
				if (data[key] !== undefined) {
					errors.push({ path: key, message: `${venueLabel(key)}: solo para lugares` });
				}
			}
		}
		if ((data.lat === undefined) !== (data.lng === undefined)) {
			errors.push({ path: 'lat', message: 'Ubicación: hacen falta la latitud y la longitud' });
		}
		if (data.pronouns_url !== undefined) {
			const problem = linkProblem(String(data.pronouns_url));
			if (problem) errors.push({ path: 'pronouns_url', message: `Link de pronombres: ${problem}` });
		}
		return errors;
	},
	// Sin dirección, barrio ni ciudad (la privacidad de un lugar no puede depender de que nadie
	// busque su calle) y sin datos de contacto: solo lo que se ve en cualquier listado.
	searchText(data) {
		return [data.pronouns, data.bio, ...(Array.isArray(data.tags) ? data.tags : [])]
			.filter(Boolean)
			.join('\n');
	}
};

export default perfil;

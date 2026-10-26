/**
 * Autoría y frescura de una publicación, para lo que lee un buscador además de lo que se ve: la
 * fecha de actualización y `article:author`. Funciones puras (navegador, servidor y vitest).
 */
import { isoDay } from './dates.js';

/**
 * El día (`yyyy-MM-dd`, hora de Argentina) de la actualización, solo si es posterior al de la
 * publicación; si no (sin fecha, la misma o una anterior, como pasa en material importado),
 * `null` y no se muestra «actualizado el».
 *
 * @param {unknown} published
 * @param {unknown} updated
 * @returns {string | null}
 */
export function updatedDay(published, updated) {
	if (updated == null || updated === '') return null;
	const up = isoDay(/** @type {any} */ (updated));
	if (!up) return null;
	const pub =
		published == null || published === '' ? undefined : isoDay(/** @type {any} */ (published));
	return !pub || up > pub ? up : null;
}

/**
 * Los valores de `article:author` (Open Graph): por cada autore, la dirección entera de su perfil
 * si la página lo enlaza (`authorsProfiles`: los perfiles que quien mira puede ver, ya resueltos en
 * el servidor), o su nombre si no. Así no dice nada que la página no muestre.
 *
 * @param {unknown} authors los nombres, como en `meta.authors`
 * @param {unknown} profiles `authorsProfiles` (posts de perfil con `meta.postID` = el nombre)
 * @param {string} origin el del sitio (`$page.url.origin`)
 * @returns {string[]}
 */
export function articleAuthors(authors, profiles, origin) {
	if (!Array.isArray(authors)) return [];
	const list = Array.isArray(profiles) ? profiles : [];
	const base = String(origin ?? '').replace(/\/+$/, '');
	return authors
		.filter((a) => typeof a === 'string' && a.trim() !== '')
		.map((name) => {
			const profile = list.find((p) => p?.meta?.postID == name);
			return typeof profile?.path === 'string' && profile.path.startsWith('/')
				? base + profile.path
				: name;
		});
}

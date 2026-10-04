/**
 * ¿Guardar desde el panel va a la base? Para que los formularios muestren los textos que
 * corresponden ($lib/admin/saveCopy.js): con la base, «se ve enseguida»; con GitHub, el PR y
 * «tarda unos minutos».
 *
 * Es lo mismo que decide el cliente del repo al guardar (./repo.js, `withContentDb`): los eventos,
 * el material, los perfiles de amigues y la wiki van siempre a la base («solo base»).
 */
import { CONTENT_CATEGORIES } from './categories.js';
import { FICHA_CATEGORIES } from './fichas.js';

/**
 * @param {App.Platform | undefined} _platform
 * @param {string} category
 * @param {string} [_slug] el post que se edita; sin pasar, uno nuevo
 */
// eslint-disable-next-line no-unused-vars
export async function panelSavesToDb(_platform, category, _slug = '') {
	return (
		Object.hasOwn(CONTENT_CATEGORIES, category) ||
		/** @type {readonly string[]} */ (FICHA_CATEGORIES).includes(category)
	);
}

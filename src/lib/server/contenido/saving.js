/**
 * ¿Guardar desde el panel va a la base? Para que los formularios de eventos y material muestren
 * los textos que corresponden ($lib/admin/saveCopy.js): con la base, «se ve enseguida»; con
 * GitHub, el PR y «tarda unos minutos».
 *
 * Es lo mismo que decide el cliente del repo al guardar (./repo.js, `withContentDb`): con el
 * interruptor `contenido_db` prendido, va a la base un post nuevo de una categoría que pasa a la
 * base (eventos y material) y uno que ya está en la base; un .md que la base no tiene (no se
 * importó) sigue yendo al repo, igual que amigues y la wiki.
 */
import { contenidoDbEnabled } from '$lib/server/flags.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { CONTENT_CATEGORIES } from './categories.js';
import { readDbPostFile } from './repo.js';

/**
 * @param {App.Platform | undefined} platform
 * @param {string} category
 * @param {string} [slug] el post que se edita; sin pasar, uno nuevo
 */
export async function panelSavesToDb(platform, category, slug = '') {
	if (!Object.hasOwn(CONTENT_CATEGORIES, category)) return false;
	if (!(await contenidoDbEnabled(platform))) return false;
	if (!slug) return true;
	const path = postFilePath(category, slug);
	if (!path) return false;
	try {
		return Boolean(await readDbPostFile(path));
	} catch {
		return false;
	}
}

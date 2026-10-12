/**
 * Borrador de la página legal (/legales, docs/legales.md): SOLO en los deploys de preview y en
 * `vite dev`, igual que la galería /estilo. Las dos condiciones son constantes de compilación
 * (`import.meta.env.DEV` y `__DEPLOY_BRANCH__`, ver src/lib/server/deploy.js): en el build de
 * producción (rama `main`, o sin rama) esto es `if (false)`, el texto no entra en el bundle y la
 * página da 404. Publicarla, cuando esté revisada, es sacar esta condición (docs/legales.md).
 * Lo controlan src/lib/legales/legalesGuard.test.js, tests/smoke.spec.js y
 * `node scripts/demo/guard.js bundle`.
 */
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load() {
	if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {
		const { cargarLegales } = await import('$lib/legales/legales.js');
		return await cargarLegales();
	}
	error(404, 'Not found');
}

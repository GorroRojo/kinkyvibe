/**
 * Borradores de las páginas legales (/legales, docs/legales.md): SOLO en los deploys de preview y
 * en `vite dev`, igual que la galería /estilo. Las dos condiciones son constantes de compilación
 * (`import.meta.env.DEV` y `__DEPLOY_BRANCH__`, ver src/lib/server/deploy.js): en el build de
 * producción (rama `main`, o sin rama) esto es `if (false)`, los textos no entran en el bundle y
 * la página da 404. Publicarlas, cuando estén revisadas, es sacar esta condición (docs/legales.md).
 * Lo controlan src/lib/legales/legalesGuard.test.js, tests/smoke.spec.js y
 * `node scripts/demo/guard.js bundle`.
 */
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {
		const { cargarLegal } = await import('$lib/legales/paginas.js');
		const pagina = await cargarLegal(params.pagina);
		if (pagina) return pagina;
	}
	error(404, 'Not found');
}

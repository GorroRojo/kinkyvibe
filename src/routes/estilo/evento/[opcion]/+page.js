/**
 * Maquetas de la página de un evento (src/lib/estilo/evento/, pedido de gorrite): como la galería
 * /estilo, SOLO en los deploys de preview y en `vite dev`. Las dos condiciones son constantes de
 * compilación (`import.meta.env.DEV` y `__DEPLOY_BRANCH__`): en el build de producción esto es
 * `if (false)`, las maquetas no entran en el bundle y la página da 404.
 * Lo controlan src/lib/estilo/estiloGuard.test.js, tests/smoke.spec.js y
 * `node scripts/demo/guard.js bundle`.
 */
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {
		const [{ default: Mockup }, { OPCIONES }] = await Promise.all([
			import('$lib/estilo/evento/Mockup.svelte'),
			import('$lib/estilo/evento/opciones.js')
		]);
		if (OPCIONES.some((o) => o.id === params.opcion)) return { Mockup, opcion: params.opcion };
	}
	error(404, 'Not found');
}

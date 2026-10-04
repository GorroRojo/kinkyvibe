/**
 * Galería de componentes (/estilo, docs/estilo.md, «Componentes»): SOLO en los deploys de preview
 * y en `vite dev`. Las dos condiciones son constantes de compilación (`import.meta.env.DEV` y
 * `__DEPLOY_BRANCH__`, ver src/lib/server/deploy.js): en el build de producción (rama `main`, o
 * sin rama) esto es `if (false)`, la galería no entra en el bundle y la página da 404.
 * Lo controlan src/lib/estilo/estiloGuard.test.js, tests/smoke.spec.js y
 * `node scripts/demo/guard.js bundle`.
 */
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load() {
	if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {
		const { default: Galeria } = await import('$lib/estilo/Galeria.svelte');
		return { Galeria };
	}
	error(404, 'Not found');
}

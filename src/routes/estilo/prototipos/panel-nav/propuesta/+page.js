/**
 * Prototipo de /estilo/prototipos (para mirar y decidir, no para prender): SOLO en los deploys de
 * preview y en `vite dev`, con la misma condición de compilación que /estilo (ver
 * src/routes/estilo/+page.js). En producción esto es `if (false)`: el prototipo no entra en el
 * bundle y la página da 404. Lo controlan prototipos.test.js, tests/smoke.spec.js y
 * `node scripts/demo/guard.js bundle` (el marco del prototipo lleva la marca de la galería).
 */
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load() {
	if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {
		const { default: Prototipo } = await import('./Propuesta.svelte');
		return { Prototipo };
	}
	error(404, 'Not found');
}

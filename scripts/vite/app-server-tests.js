/**
 * Plugin de Vite solo para los tests (vitest): `$app/server` es `src/tests/app-server.js`, que
 * reexporta solo `getRequestEvent` (la misma función de SvelteKit). El de verdad arrastra el
 * manifiesto y la raíz generados de la app, que no hacen falta para eso y cuestan segundos en cada
 * archivo de pruebas que toca la base (`$lib/server/db/perRequest.js` lo importa). `vi.mock('$app/server')`
 * sigue andando igual: se resuelve al mismo archivo.
 */
import { fileURLToPath } from 'node:url';

const SHIM = fileURLToPath(new URL('../../src/tests/app-server.js', import.meta.url));

/** @returns {import('vite').Plugin} */
export function appServerForTests() {
	return {
		name: 'kinkyvibe:app-server-tests',
		enforce: 'pre',
		resolveId(id) {
			// `$app` ya viene reemplazado por el alias de SvelteKit (…/kit/src/runtime/app).
			if (
				id === '$app/server' ||
				/[\\/]@sveltejs[\\/]kit[\\/]src[\\/]runtime[\\/]app[\\/]server(?:[\\/]index\.js)?$/.test(id)
			)
				return SHIM;
		}
	};
}

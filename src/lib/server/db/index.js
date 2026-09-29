/**
 * Acceso a la base de datos D1 (binding `DB`, ver wrangler.toml).
 *
 * La base es opcional: durante el build/prerender, en `vite dev` sin wrangler.toml o en un
 * deploy donde todavía no se vinculó la base, `getDB` devuelve `null` y cada función que la
 * usa tiene que degradar con gracia (ocultar la funcionalidad, no romper la página).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Devuelve el binding D1 o `null` si no está disponible.
 *
 * @param {App.Platform | undefined} platform
 * @returns {D1Database | null}
 */
export function getDB(platform) {
	try {
		// En rutas prerenderizadas el adapter devuelve un `env` cuyos getters tiran error.
		return platform?.env?.DB ?? null;
	} catch {
		return null;
	}
}

/**
 * `true` si el error indica que faltan tablas, o sea que no se aplicaron las migraciones.
 *
 * @param {unknown} error
 */
export function isMissingTableError(error) {
	return error instanceof Error && /no such table/i.test(error.message);
}

let warnedMissingTables = false;

/**
 * Loguea un error de base de datos con una pista útil, sin tirar excepción.
 *
 * @param {string} context
 * @param {unknown} error
 */
export function logDBError(context, error) {
	if (isMissingTableError(error)) {
		if (!warnedMissingTables) {
			warnedMissingTables = true;
			console.warn(
				`[db] ${context}: faltan tablas en D1. ¿Aplicaste las migraciones? ` +
					'Local: `npm run db:migrate:local` · Producción: `npm run db:migrate:remote`'
			);
		}
		return;
	}
	console.error(`[db] ${context}:`, error);
}

/**
 * Pegamento entre «Lo que sigo» y SvelteKit: los interruptores (`lo_que_sigo` y `cuentas`, los
 * dos) y la cuenta de la sesión.
 */
import { error, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { cuentasEnabled, loQueSigoEnabled } from '$lib/server/flags.js';

/**
 * ¿Están prendidos «Lo que sigo» y las cuentas? Sin base, no.
 *
 * @param {App.Platform | undefined} platform
 */
export async function sigoEnabled(platform) {
	if (!getDB(platform)) return false;
	return (await loQueSigoEnabled(platform)) && (await cuentasEnabled(platform));
}

/**
 * Para las páginas y endpoints de «Lo que sigo»: 404 con un interruptor apagado (como si no
 * existieran). Devuelve la base.
 *
 * @param {App.Platform | undefined} platform
 */
export async function requireSigo(platform) {
	if (!(await sigoEnabled(platform))) error(404, 'Not found');
	return /** @type {import('@cloudflare/workers-types').D1Database} */ (getDB(platform));
}

/** Adónde vuelve /ingresar después de entrar. */
export const SIGO_PATH = '/mi-rincon/sigo';

/**
 * Lo mismo, y además la cuenta con sesión (si no hay, a /ingresar y de vuelta a `next`).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string} [next] adónde volver después de entrar (una ruta de este sitio)
 */
export async function requireSigoMember(event, next = SIGO_PATH) {
	const db = await requireSigo(event.platform);
	const member = event.locals.member;
	if (!member) redirect(303, `/ingresar?next=${encodeURIComponent(next)}`);
	return { db, member };
}

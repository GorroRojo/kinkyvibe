/**
 * Pegamento entre las cuentas y SvelteKit: cookies, `locals.member`, mails y la conexión.
 */
import { error } from '@sveltejs/kit';
import { getDB, logDBError } from '$lib/server/db';
import { cuentasEnabled } from '$lib/server/flags.js';
import { deliverEmail } from '$lib/server/tickets/index.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import {
	SESSION_COOKIE,
	createSession,
	destroySession,
	getSessionAccount,
	sessionCookieOptions
} from './session.js';

/**
 * Carga `locals.member` desde la cookie de sesión (en hooks.server.js). No toca `locals.user`
 * (admins con GitHub). Con el interruptor apagado, sin base o con la cookie inválida, queda
 * `undefined`; un error de base no rompe la página.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function loadMember(event) {
	event.locals.member = undefined;
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return;
	if (!(await cuentasEnabled(event.platform))) return;
	const db = getDB(event.platform);
	if (!db) return;
	try {
		const found = await getSessionAccount(db, token);
		if (!found) {
			// Sesión cerrada en otro lado o cuenta borrada: se saca la cookie.
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
			return;
		}
		event.locals.member = { id: found.id, email: found.email };
		// Renueva la cookie (los navegadores la topean en ~400 días; ver session.js).
		if (found.touched) event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url));
	} catch (e) {
		logDBError('member session', e);
	}
}

/**
 * Para las páginas de cuentas: 404 si el interruptor está apagado (como si no existieran).
 *
 * @param {App.Platform | undefined} platform
 */
export async function requireCuentas(platform) {
	if (!(await cuentasEnabled(platform))) error(404, 'Not found');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	return db;
}

/**
 * Abre una sesión y pone la cookie.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} accountId
 * @param {import('./session.js').LoginMethod} method
 */
export async function startSession(event, db, accountId, method) {
	// Si había otra sesión en este navegador, se cierra (no quedan tokens huérfanos).
	await destroySession(db, event.cookies.get(SESSION_COOKIE));
	const token = await createSession(db, accountId, method);
	event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url));
}

/**
 * Cierra la sesión de este navegador.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function endSession(event, db) {
	await destroySession(db, event.cookies.get(SESSION_COOKIE));
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	event.locals.member = undefined;
}

/**
 * Hash anónimo de la conexión (el mismo de las entradas).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export function clientOf(event) {
	return clientHash(clientAddress(event));
}

/**
 * Manda un mail con el mismo camino que los de entradas (Resend + filtro de previews).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @returns {import('./index.js').SendMail}
 */
export function mailSender(event, db) {
	return async (to, message, log) => {
		try {
			return await deliverEmail({ db, fetch: event.fetch, to, message, log });
		} catch (e) {
			console.error('[cuentas] no se pudo mandar el código:', e);
			return 'failed';
		}
	};
}

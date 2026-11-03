/**
 * Pegamento entre las cuentas y SvelteKit: cookies, `locals.member`, mails y la conexión.
 */
import { error } from '@sveltejs/kit';
import { getDB, logDBError } from '$lib/server/db';
import { deliverEmail } from '$lib/server/tickets/index.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { deviceLabel } from '$lib/utils/userAgent.js';
import {
	SESSION_COOKIE,
	createSession,
	destroySession,
	getSessionAccount,
	sessionCookieOptions
} from './session.js';

/**
 * Carga `locals.member` desde la cookie de sesión (en hooks.server.js). No toca `locals.user`
 * (admins con GitHub). Sin base o con la cookie inválida, queda
 * `undefined`; un error de base no rompe la página.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function loadMember(event) {
	event.locals.member = undefined;
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return;
	const db = getDB(event.platform);
	if (!db) return;
	try {
		const found = await getSessionAccount(db, token);
		if (!found) {
			// Sesión cerrada en otro lado o cuenta borrada: se saca la cookie.
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
			return;
		}
		// Con la velocidad de lectura y el permiso de perfiles de la misma consulta (el layout y Mi
		// rincón no vuelven a leer la fila). Sin `preferences`: el DNI guardado no pasa por acá.
		event.locals.member = {
			id: found.id,
			email: found.email,
			readingSpeed: found.readingSpeed,
			canHaveProfiles: found.canHaveProfiles
		};
		// Renueva la cookie (los navegadores la topean en ~400 días; ver session.js).
		if (found.touched) event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url));
	} catch (e) {
		logDBError('member session', e);
	}
}

/**
 * Para las páginas de cuentas: la base, o 503 sin base.
 *
 * @param {App.Platform | undefined} platform
 */
export async function requireCuentas(platform) {
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
	// Solo un nombre corto del navegador («Firefox en Android»), nunca el user agent entero.
	const device = deviceLabel(event.request?.headers.get('user-agent'));
	const token = await createSession(db, accountId, method, { device });
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
			console.error('[cuentas] no se pudo mandar el mail:', e);
			return 'failed';
		}
	};
}

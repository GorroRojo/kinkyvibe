/**
 * Pegamento entre las series y SvelteKit: la base, el envío de mails y la corrida del cron.
 */
import { error } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { deliverEmail } from '$lib/server/tickets/index.js';
import { siteTags } from './index.js';
import { runSeriesNotifications } from './notify.js';
import { accountSubscriptions } from './subscriptions.js';
import { avisameViaSigo } from '$lib/server/sigo/avisame.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Para las páginas y endpoints de series que escriben o leen la base: la base (503 si falta).
 * (El interruptor `series` quedó prendido para siempre.)
 *
 * @param {App.Platform | undefined} platform
 */
export async function requireSeriesDB(platform) {
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	return db;
}

/**
 * Manda los mails de series por el camino de siempre (`deliverEmail`: Resend, el filtro
 * `routeEmail` de los previews y el remitente de los ajustes).
 *
 * @param {D1Database} db
 * @param {typeof fetch} fetchFn
 * @returns {import('./subscriptions.js').SeriesSend}
 */
export function seriesSender(db, fetchFn) {
	return async (to, message, idempotencyKey) => {
		try {
			return await deliverEmail({ db, fetch: fetchFn, to, message, idempotencyKey });
		} catch (e) {
			console.error('[series] no se pudo mandar el mail:', e);
			return 'failed';
		}
	};
}

/**
 * La parte de series del cron de mails.
 *
 * @param {{ db: D1Database, origin: string, fetch: typeof fetch, now?: number }} input
 */
export async function runSeriesCron({ db, origin, fetch: fetchFn, now = Date.now() }) {
	return runSeriesNotifications({
		db,
		// Los eventos de la base.
		posts: await sitePosts(
			/** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: db } }))
		),
		tags: siteTags(),
		origin,
		send: seriesSender(db, fetchFn),
		now
	});
}

/**
 * Para los formularios de "Avisame si se repite": si hay una cuenta con sesión (se suscribe sin
 * mail), a qué series ya está suscripta y si con cuenta «Avisame» es seguir la serie en «Lo que
 * sigo» (`sigo`, interruptores `lo_que_sigo` y `cuentas`; sigo/avisame.js). Sin cuenta,
 * `{ member: false, subscribed: [], sigo: false, invite }`: `invite` dice si se invita a entrar
 * para seguir (los mismos interruptores prendidos; ver {@link followInvite}).
 *
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @returns {Promise<{ member: boolean, subscribed: string[], sigo: boolean, invite: boolean }>}
 */
export async function seriesAccountState(platform, locals) {
	const db = getDB(platform);
	if (!locals.member || !db) {
		return {
			member: false,
			subscribed: [],
			sigo: false,
			invite: await followInvite(platform, locals)
		};
	}
	try {
		return {
			member: true,
			subscribed: await accountSubscriptions(db, locals.member.id),
			sigo: await avisameViaSigo(db),
			invite: false
		};
	} catch (e) {
		console.error('[series] suscripciones de la cuenta:', e);
		return { member: true, subscribed: [], sigo: false, invite: false };
	}
}

/**
 * Sin sesión y con «Lo que sigo» y cuentas prendidos: invitar a entrar para seguir (debajo del
 * calendario de una serie o etiqueta; pedido de gorrite). Con sesión, o si algo falla, no.
 *
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 */
export async function followInvite(platform, locals) {
	const db = getDB(platform);
	if (locals.member || !db) return false;
	try {
		return await avisameViaSigo(db);
	} catch {
		return false;
	}
}

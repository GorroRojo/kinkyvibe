/**
 * Pegamento entre las series y SvelteKit: el interruptor, el envío de mails y la corrida del cron.
 */
import { error } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { isFlagOn, seriesEnabled } from '$lib/server/flags.js';
import { deliverEmail } from '$lib/server/tickets/index.js';
import { siteTags } from './index.js';
import { runSeriesNotifications } from './notify.js';
import { accountSubscriptions } from './subscriptions.js';
import { avisameViaSigo } from '$lib/server/sigo/avisame.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Para las páginas y endpoints de series: 404 con el interruptor apagado (como si no existieran).
 *
 * @param {App.Platform | undefined} platform
 */
export async function requireSeries(platform) {
	if (!(await seriesEnabled(platform))) error(404, 'Not found');
}

/**
 * Lo mismo, y además la base (503 si falta).
 *
 * @param {App.Platform | undefined} platform
 */
export async function requireSeriesDB(platform) {
	await requireSeries(platform);
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
 * La parte de series del cron de mails. Con el interruptor apagado no hace nada (`null`).
 *
 * @param {{ db: D1Database, origin: string, fetch: typeof fetch, now?: number }} input
 */
export async function runSeriesCron({ db, origin, fetch: fetchFn, now = Date.now() }) {
	if (!(await isFlagOn(db, 'series'))) return null;
	return runSeriesNotifications({
		db,
		// Con `contenido_db` prendido, los eventos de la base (también los creados en el panel).
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
 * `{ member: false, subscribed: [], sigo: false }`.
 *
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @returns {Promise<{ member: boolean, subscribed: string[], sigo: boolean }>}
 */
export async function seriesAccountState(platform, locals) {
	const db = getDB(platform);
	if (!locals.member || !db) return { member: false, subscribed: [], sigo: false };
	try {
		return {
			member: true,
			subscribed: await accountSubscriptions(db, locals.member.id),
			sigo: await avisameViaSigo(db)
		};
	} catch (e) {
		console.error('[series] suscripciones de la cuenta:', e);
		return { member: true, subscribed: [], sigo: false };
	}
}

/**
 * Pegamento entre las series y SvelteKit: la base, el envío de mails y la corrida del cron.
 */
import { error } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { deliverEmail } from '$lib/server/tickets/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { runSeriesNotifications } from './notify.js';
import { accountSubscriptions } from './subscriptions.js';
import { avisameViaSigo } from '$lib/server/sigo/avisame.js';
import { eventsForTag, seriesPage } from './index.js';
import { tagFeedPath, tagIdFromSlug } from '$lib/utils/series.js';

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
 * @param {string} [kind] el tipo de mail para Resend (`sendWithResend`); «Lo que sigo» pasa `sigo`
 * @returns {import('./subscriptions.js').SeriesSend}
 */
export function seriesSender(db, fetchFn, kind = 'serie') {
	return async (to, message, idempotencyKey) => {
		try {
			// Ninguno es de una compra: respetan «No fui yo» (email/suppressions.js).
			return await deliverEmail({
				db,
				fetch: fetchFn,
				to,
				message,
				idempotencyKey,
				optOut: true,
				kind
			});
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
	const platform = /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: db } }));
	return runSeriesNotifications({
		db,
		// Los eventos de la base.
		posts: await sitePosts(platform),
		// Las series de la base, leídas acá (no el árbol que dejó el último pedido): el cron no
		// depende de que hooks.server.js haya corrido en este isolate.
		tags: await siteTagManager(platform),
		origin,
		send: seriesSender(db, fetchFn),
		now
	});
}

/**
 * Para los formularios de "Avisame si se repite": si hay una cuenta con sesión (se suscribe sin
 * mail), a qué series ya está suscripta y si con cuenta «Avisame» es seguir la serie en «Lo que
 * sigo» (`sigo`, interruptor `lo_que_sigo`; sigo/avisame.js). Sin cuenta,
 * `{ member: false, subscribed: [], sigo: false, invite }`: `invite` dice si se invita a entrar
 * para seguir (el mismo interruptor prendido; ver {@link followInvite}).
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

/**
 * @typedef {{
 *   series: Awaited<ReturnType<typeof seriesPage>>,
 *   feed: string | null,
 *   account: { member: boolean, subscribed: boolean, sigo: boolean, invite: boolean }
 * }} SeriesTagInfo
 */

/**
 * Lo de series de la página de una etiqueta (/wiki/<etiqueta>; lo muestra
 * $lib/components/series/SeriesTagBlock.svelte): si la etiqueta es una serie, su imagen y sus
 * ediciones (próximas primero, después las pasadas); si tiene eventos, el link de su calendario
 * .ics; y si hay una cuenta con sesión, si ya está suscripta a los avisos (y si eso va por «Lo que
 * sigo»). `null` si no hay nada de series para esa etiqueta. Lo usan la carga de la página (así el
 * bloque llega con la página) y GET /api/series/<etiqueta>.
 *
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @param {string} segment la etiqueta: su nombre, un alias o la forma de la URL
 * @param {{ tags?: TagManager, posts?: ProcessedPost[] }} [loaded] lo que ya leyó quien llama
 * @returns {Promise<SeriesTagInfo | null>}
 */
export async function seriesTagInfo(platform, locals, segment, loaded = {}) {
	// «Rancheadita-Kinky», «Rancheadita Kinky» o un alias: la misma etiqueta (como /wiki/<término>).
	const [tags, posts] = await Promise.all([
		loaded.tags ?? siteTagManager(platform),
		loaded.posts ?? sitePosts(platform)
	]);
	const id = tagIdFromSlug(tags, segment) ?? segment;
	const [series, events] = await Promise.all([
		seriesPage(id, { tags, posts }),
		eventsForTag(id, { tags, posts })
	]);
	if (!series && !events.length) return null;
	const account = series
		? await seriesAccountState(platform, locals)
		: { member: false, subscribed: [], sigo: false, invite: await followInvite(platform, locals) };
	return {
		series,
		feed: events.length ? tagFeedPath(id) : null,
		account: {
			member: account.member,
			subscribed: account.subscribed.includes(id),
			// Con cuenta y «Lo que sigo», «Avisame» es seguir la serie (el botón «Seguir» de la página).
			sigo: account.sigo,
			// Sin sesión y con «Lo que sigo»: invitar a entrar para seguir.
			invite: account.invite
		}
	};
}

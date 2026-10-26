/**
 * Lo que necesitan las páginas para su vista previa al compartir (docs/compartir.md): los textos
 * del panel (Ajustes › Comunicación › Vistas previas al compartir) y la dirección de cada tarjeta
 * dibujada con las portadas de los próximos eventos (`/og/<tarjeta>/<hash>.jpg`).
 *
 * - **Textos**: en `ticket_settings` (la tabla clave → valor de los ajustes del panel, migración
 *   0002), en una sola fila `link_preview_texts` con un JSON de los textos cambiados. Sin tabla
 *   nueva ni migración. Sin fila (o si algo falla), los originales de src/lib/utils/previewTexts.js.
 * - **Portadas**: las de la biblioteca de los eventos listados, primero los próximos (por fecha) y
 *   después los más recientes, hasta {@link COLLAGE_TILES} distintas.
 * - **Hash**: de los textos de la tarjeta, sus portadas y la versión del dibujo. Si algo cambia,
 *   cambia la dirección y las apps piden la imagen nueva; si no, la imagen se guarda para siempre.
 *
 * Se lee una vez cada {@link LINK_PREVIEW_CACHE_MS} por isolate (como los interruptores, ver
 * src/lib/server/flags.js): las páginas no consultan la base por esto en cada pedido.
 */
import { getDB, logDBError } from '$lib/server/db';
import { readAndKeep } from '$lib/server/db/perRequest.js';
import { batchesReads } from '$lib/server/db/autoBatch.js';
import { parseSiteDate } from '$lib/utils/dates.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { isMediaPath, isPublicMediaUrl } from '$lib/utils/media.js';
import { mergePreviewTexts, previewTextOverrides } from '$lib/utils/previewTexts.js';
import { OG_CARDS, ogCardText } from '$lib/utils/ogCards.js';
import { COLLAGE_TILES, COLLAGE_VERSION, collageTiles } from '$lib/utils/ogCollage.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/ogCards.js').OgCardKey} OgCardKey */

/** La fila de `ticket_settings` con los textos cambiados (JSON). */
export const PREVIEW_TEXTS_SETTING = 'link_preview_texts';

/** Cuánto se recuerda lo leído (ms). */
export const LINK_PREVIEW_CACHE_MS = 30_000;

/** Cuántos lugares se corre el mosaico de cada tarjeta, así no son todas iguales. */
const TILE_OFFSET = Object.freeze({ default: 0, calendario: 3, material: 6, amigues: 9, wiki: 12 });

/**
 * Los textos cambiados guardados (solo claves conocidas; ver `mergePreviewTexts`). Sin base, sin
 * la fila o con un JSON roto: ninguno.
 * @param {D1Database | null | undefined} db
 * @returns {Promise<{ overrides: Record<string, string>, updatedAt: number | null, updatedBy: string | null }>}
 */
export async function readPreviewTextOverrides(db) {
	const none = { overrides: {}, updatedAt: null, updatedBy: null };
	if (!db) return none;
	try {
		const row = await db
			.prepare('SELECT value, updated_at, updated_by FROM ticket_settings WHERE key = ?1')
			.bind(PREVIEW_TEXTS_SETTING)
			.first();
		if (!row) return none;
		return {
			overrides: previewTextOverrides(JSON.parse(String(row.value))),
			updatedAt: Number(row.updated_at) || null,
			updatedBy: row.updated_by ? String(row.updated_by) : null
		};
	} catch (error) {
		logDBError('textos de la vista previa', error);
		return none;
	}
}

/**
 * Guarda los textos cambiados (todos juntos: lo que no viene vuelve al original). Sin cambios,
 * borra la fila.
 * @param {D1Database} db
 * @param {Record<string, string>} overrides ya validados (`validatePreviewTexts`)
 * @param {{ by: string, now?: number }} who
 */
export async function savePreviewTextOverrides(db, overrides, { by, now = Date.now() }) {
	if (!Object.keys(overrides).length) {
		await db
			.prepare('DELETE FROM ticket_settings WHERE key = ?1')
			.bind(PREVIEW_TEXTS_SETTING)
			.run();
	} else {
		await db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
				ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
					updated_by = excluded.updated_by`
			)
			.bind(PREVIEW_TEXTS_SETTING, JSON.stringify(overrides), now, by)
			.run();
	}
	clearLinkPreviewCache();
}

/**
 * Las portadas para el mosaico: las de la biblioteca (`/media/img/…`, o la del sitio público en
 * los eventos de demo de un preview) de los eventos listados y no cancelados; primero los
 * próximos, del más cercano al más lejano, y después los pasados, del más reciente. Sin repetir.
 * @param {Array<{ meta: Record<string, any> }>} posts
 * @param {number} [now]
 * @returns {string[]}
 */
export function collageCovers(posts, now = Date.now()) {
	const events = posts
		.filter((p) => p.meta?.layout === 'calendario' && p.meta?.status !== 'cancelado')
		.map((p) => ({ src: p.meta.featured, at: parseSiteDate(p.meta.start).getTime() }))
		.filter((e) => (isMediaPath(e.src) || isPublicMediaUrl(e.src)) && Number.isFinite(e.at));
	const upcoming = events.filter((e) => e.at >= now).sort((a, b) => a.at - b.at);
	const past = events.filter((e) => e.at < now).sort((a, b) => b.at - a.at);
	return [...new Set([...upcoming, ...past].map((e) => String(e.src)))].slice(0, COLLAGE_TILES);
}

/**
 * Lo que se dibuja en una tarjeta: el texto, el subtítulo y las portadas en su orden.
 * @param {OgCardKey} card
 * @param {Readonly<Record<string, string>>} texts
 * @param {string[]} covers
 */
export function cardSpec(card, texts, covers) {
	return { card, ...ogCardText(card, texts), tiles: collageTiles(covers, TILE_OFFSET[card]) };
}

/**
 * El hash de una tarjeta (16 caracteres hexadecimales del SHA-256 de lo que se dibuja y la versión
 * del dibujo).
 * @param {ReturnType<typeof cardSpec>} spec
 */
export async function cardHash(spec) {
	const bytes = new TextEncoder().encode(JSON.stringify({ v: COLLAGE_VERSION, ...spec }));
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @typedef {object} LinkPreviewState
 * @property {Readonly<Record<string, string>>} texts
 * @property {string[]} covers
 * @property {Partial<Record<OgCardKey, { spec: ReturnType<typeof cardSpec>, hash: string, url: string }>>} cards
 */

/**
 * Lo recordado (solo el estado ya leído: lo que está en camino se comparte solo dentro del pedido,
 * `readAndKeep` de src/lib/server/db/perRequest.js).
 * @type {{ db: D1Database, expires: number, state: LinkPreviewState } | null}
 */
let cached = null;

/** Olvida lo recordado (al guardar desde el panel, y en las pruebas). */
export function clearLinkPreviewCache() {
	cached = null;
}

/**
 * @param {App.Platform | undefined} platform
 * @param {D1Database} db
 * @returns {Promise<LinkPreviewState>}
 */
async function readState(platform, db) {
	const [{ overrides }, covers] = await Promise.all([
		readPreviewTextOverrides(db),
		sitePosts(platform)
			.then((posts) => collageCovers(posts))
			.catch((error) => {
				logDBError('portadas de la vista previa', error);
				return /** @type {string[]} */ ([]);
			})
	]);
	const texts = mergePreviewTexts(overrides);
	/** @type {LinkPreviewState['cards']} */
	const cards = {};
	for (const card of /** @type {OgCardKey[]} */ (Object.keys(OG_CARDS))) {
		const spec = cardSpec(card, texts, covers);
		const hash = await cardHash(spec);
		cards[card] = { spec, hash, url: `/og/${card}/${hash}.jpg` };
	}
	return { texts, covers, cards };
}

/**
 * Los textos y las tarjetas en uso (recordados {@link LINK_PREVIEW_CACHE_MS}). Sin base: los
 * textos originales y ninguna tarjeta dibujada (las páginas usan las de `static/`).
 * @param {App.Platform | undefined} platform
 * @param {number} [now]
 * @returns {Promise<LinkPreviewState>}
 */
export async function linkPreviewState(platform, now = Date.now()) {
	const db = getDB(platform);
	if (!db) return { texts: mergePreviewTexts(), covers: [], cards: {} };
	if (cached && cached.db === db && cached.expires > now) return cached.state;
	return readAndKeep(
		db,
		'link-preview',
		() => readState(platform, db),
		(state) => {
			cached = { db, expires: now + LINK_PREVIEW_CACHE_MS, state };
		}
	);
}

/**
 * Al empezar un pedido que va a esperar a la base de todos modos (src/lib/server/adelantarPedido.js):
 * si lo recordado venció, pide ya la fila de los textos, así sale en esa misma ida y no en la
 * siguiente. Es la misma sentencia que lee {@link readPreviewTextOverrides}: con las tandas
 * automáticas (src/lib/server/db/autoBatch.js), la de después recibe lo ya leído. Solo con tandas.
 * @param {D1Database | null | undefined} db
 * @param {number} [now]
 */
export function askLinkPreviewEarly(db, now = Date.now()) {
	if (!db || !batchesReads(db)) return;
	if (cached && cached.db === db && cached.expires > now) return;
	readPreviewTextOverrides(db).catch(() => {});
}

/**
 * Para los datos de las páginas: los textos y la dirección de cada tarjeta (lo que lee
 * `linkPreviewOf` de src/lib/utils/seo.js).
 * @param {App.Platform | undefined} platform
 * @returns {Promise<import('$lib/utils/seo.js').LinkPreview>}
 */
export async function linkPreviewData(platform) {
	try {
		const { texts, cards } = await linkPreviewState(platform);
		return {
			texts,
			images: Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, c?.url]))
		};
	} catch (error) {
		logDBError('vista previa', error);
		return { texts: mergePreviewTexts(), images: {} };
	}
}

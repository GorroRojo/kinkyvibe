/**
 * De dónde leen las páginas públicas el contenido: los .md o la base (interruptor `contenido_db`).
 *
 * Con el interruptor apagado, todo es exactamente lo de siempre (`fetchMarkdownPosts`,
 * `fetchPost` de $lib/utils). Prendido, los eventos salen de la base y se convierten en el mismo
 * `ProcessedPost` que da un .md ({@link eventToMeta} + `processPost`), así las listas, la página del
 * evento, el .ics, las etiquetas, la búsqueda, el RSS y el sitemap no cambian su código.
 *
 * Reglas (como los perfiles, docs/amigues.md):
 * - **La base decide** cada dirección que tiene: un evento importado (por su .md) o creado en la
 *   base. Si está oculto o borrado, para quien no lo puede ver es 404 aunque el .md siga en el repo.
 * - Un .md que no está en la base (no se importó todavía, o tuvo un error) sigue saliendo de su .md.
 * - Toda lectura de `objects` pasa por la visibilidad (`visibleWhere`/`getObject`): las listas,
 *   con la vista anónima (son las mismas para todes y se guardan en memoria); la página de un
 *   evento, con quien mira (les admins ven los ocultos).
 * - Las listas se recuerdan por isolate mientras la base no cambie: cada pedido mira solo cuántos
 *   eventos hay y cuándo cambió el último (una consulta chica, con índice).
 */
import { error } from '@sveltejs/kit';
import { fetchMarkdownPosts, fetchPost, processPost } from '$lib/utils';
import { isCurrent } from '$lib/utils/allPosts';
import { getDB } from '$lib/server/db';
import { contenidoDbEnabled } from '$lib/server/flags.js';
import { ANON, visibleWhere } from '$lib/server/objects/visibility.js';
import { getObject } from '$lib/server/objects/read.js';
import { EVENT_CATEGORY, EVENT_TYPE, eventToMeta } from './eventos.js';
import { renderContentBody } from './render.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */

/**
 * La base, si el contenido sale de ella (interruptor prendido y base disponible); si no, `null`.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<D1Database | null>}
 */
export async function contentDb(platform) {
	const db = getDB(platform);
	if (!db || !(await contenidoDbEnabled(platform))) return null;
	return db;
}

/**
 * @typedef {{
 *   stamp: string,
 *   claimed: Set<string>,
 *   listed: ProcessedPost[],
 *   unlisted: ProcessedPost[],
 *   bodies: Map<string, string>
 * }} DbState
 */

/** @type {{ stamp: string, state: Promise<DbState> } | null} */
let cached = null;

/** Olvida lo recordado (tests). */
export function clearContentCache() {
	cached = null;
}

/**
 * Cuántos eventos hay y cuándo cambió el último (objetos e importaciones): si no cambió, lo
 * recordado sigue valiendo.
 *
 * @param {D1Database} db
 */
async function contentStamp(db) {
	const row = await db
		.prepare(
			`SELECT (SELECT count(*) FROM objects WHERE type = ?1) AS n,
				(SELECT max(updated_at) FROM objects WHERE type = ?1) AS u,
				(SELECT count(*) FROM content_sources WHERE category = ?2) AS sn,
				(SELECT max(updated_at) FROM content_sources WHERE category = ?2) AS su`
		)
		.bind(EVENT_TYPE, EVENT_CATEGORY)
		.first();
	return `${row?.n}:${row?.u}:${row?.sn}:${row?.su}`;
}

/**
 * @param {D1Database} db
 * @returns {Promise<DbState>}
 */
async function dbState(db) {
	const stamp = await contentStamp(db);
	if (cached?.stamp === stamp) return cached.state;
	const state = loadDbState(db, stamp);
	cached = { stamp, state };
	state.catch(() => {
		if (cached?.state === state) cached = null;
	});
	return state;
}

/**
 * @param {D1Database} db
 * @param {string} stamp
 * @returns {Promise<DbState>}
 */
async function loadDbState(db, stamp) {
	const visible = visibleWhere(ANON, 'o');
	const [claimedRows, rows] = await Promise.all([
		// Qué direcciones decide la base (vivas, ocultas o borradas): esas no salen del .md.
		db
			.prepare(
				`SELECT o.slug, s.legacy_slug FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
				WHERE o.type = ?1`
			)
			.bind(EVENT_TYPE, EVENT_CATEGORY)
			.all(),
		db
			.prepare(
				`SELECT o.id, o.slug, o.title, o.data, o.visibility, s.legacy_slug FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?
				WHERE o.type = ? AND ${visible.sql}
				ORDER BY o.start_at DESC`
			)
			.bind(EVENT_CATEGORY, EVENT_TYPE, ...visible.params)
			.all()
	]);
	/** @type {Set<string>} */
	const claimed = new Set();
	for (const r of claimedRows.results) {
		claimed.add(String(r.slug));
		if (r.legacy_slug) claimed.add(String(r.legacy_slug));
	}
	/** @type {ProcessedPost[]} */
	const listed = [];
	/** @type {ProcessedPost[]} */
	const unlisted = [];
	/** @type {Map<string, string>} */
	const bodies = new Map();
	for (const r of rows.results) {
		let data = {};
		try {
			data = JSON.parse(String(r.data));
		} catch {
			data = {};
		}
		const object = {
			title: String(r.title),
			data: /** @type {Record<string, any>} */ (data),
			visibility: /** @type {import('$lib/server/objects/visibility.js').Visibility} */ (
				String(r.visibility)
			)
		};
		const postID = r.legacy_slug ? String(r.legacy_slug) : String(r.slug);
		const post = await processPost(
			undefined,
			postID,
			/** @type {any} */ (eventToMeta(object)),
			true
		);
		(post.meta.force_unlisted ? unlisted : listed).push(post);
		const body = /** @type {any} */ (data).body;
		if (typeof body === 'string' && body) bodies.set(post.path, body);
	}
	return { stamp, claimed, listed, unlisted, bodies };
}

/** Orden de las categorías cuando dos publicaciones tienen la misma fecha (como los .md). */
const CATEGORY_ORDER = ['calendario', 'amigues', 'material', 'wiki'];

/** @param {ProcessedPost} p */
export const postTime = (p) =>
	new Date(p.meta?.start ?? p.meta?.updated_date ?? p.meta?.published_date).getTime();

/**
 * El orden de las listas: lo más nuevo primero (inicio de los eventos; actualización o
 * publicación de lo demás), y a igual fecha, por categoría y dirección.
 *
 * @param {ProcessedPost} a
 * @param {ProcessedPost} b
 */
export function comparePosts(a, b) {
	const ta = postTime(a);
	const tb = postTime(b);
	if (ta !== tb && !(Number.isNaN(ta) && Number.isNaN(tb))) {
		if (Number.isNaN(ta)) return 1;
		if (Number.isNaN(tb)) return -1;
		return tb - ta;
	}
	const ca = CATEGORY_ORDER.indexOf(a.meta.category);
	const cb = CATEGORY_ORDER.indexOf(b.meta.category);
	if (ca !== cb) return ca - cb;
	return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Junta los .md con lo de la base: saca los .md cuya dirección decide la base y suma los de la
 * base. Pura (la prueba de paridad la usa directo).
 *
 * @param {ProcessedPost[]} md
 * @param {Pick<DbState, 'claimed'>} state
 * @param {ProcessedPost[]} fromDb
 */
export function mergePosts(md, state, fromDb) {
	const kept = md.filter(
		(p) => !(p.meta.category === EVENT_CATEGORY && state.claimed.has(String(p.meta.postID)))
	);
	return [...kept, ...fromDb].sort(comparePosts);
}

/**
 * Lo mismo que `fetchMarkdownPosts(wiki, unlisted)`, con los eventos de la base si el interruptor
 * está prendido.
 *
 * @param {App.Platform | undefined} platform
 * @param {boolean} [wiki]
 * @param {boolean} [unlisted]
 * @returns {Promise<ProcessedPost[]>}
 */
export async function sitePosts(platform, wiki = false, unlisted = false) {
	const md = await fetchMarkdownPosts(wiki, unlisted);
	if (wiki) return md;
	const db = await contentDb(platform);
	if (!db) return md;
	const state = await dbState(db);
	return mergePosts(md, state, unlisted ? state.unlisted : state.listed);
}

/**
 * Lo mismo que `fetchCurrentPosts()`: las listadas, sin los eventos que ya empezaron.
 *
 * @param {App.Platform | undefined} platform
 */
export async function currentSitePosts(platform) {
	const now = Date.now();
	return (await sitePosts(platform)).filter((p) => isCurrent(p, now));
}

/**
 * El cuerpo (markdown) de los eventos de la base por dirección (`/calendario/<slug>`), para el
 * índice de la búsqueda. Vacío con el interruptor apagado.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<Map<string, string>>}
 */
export async function siteBodies(platform) {
	const db = await contentDb(platform);
	if (!db) return new Map();
	return (await dbState(db)).bodies;
}

/**
 * A qué objeto lleva una dirección de evento (sin mirar visibilidad: es para decidir el camino).
 * Primero la dirección vieja de un .md importado (`todo-kink-…-BDSM-cuir`), después la del objeto.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<{ id: number, legacySlug: string | null } | null>}
 */
export async function resolveEventSlug(db, slug) {
	const row = await db
		.prepare(
			`SELECT o.id, s.legacy_slug FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
			WHERE o.type = ?1 AND (s.legacy_slug = ?3 OR o.slug = ?3)
			ORDER BY (s.legacy_slug = ?3) DESC LIMIT 1`
		)
		.bind(EVENT_TYPE, EVENT_CATEGORY, slug)
		.first();
	if (!row) return null;
	return { id: Number(row.id), legacySlug: row.legacy_slug ? String(row.legacy_slug) : null };
}

/**
 * @typedef {{ mode: 'md' } | { mode: 'db', post: (ProcessedPost & { html: string }) | null }} SitePost
 */

/**
 * Un evento para su página. `{ mode: 'md' }`: sale del .md como siempre (interruptor apagado o
 * dirección que la base no tiene). `{ mode: 'db', post: null }`: la base la tiene pero quien mira
 * no la puede ver → 404.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean, html?: boolean }} [opts]
 * @returns {Promise<SitePost>}
 */
export async function siteEvent(
	platform,
	slug,
	{ viewer = ANON, shallow = false, html = true } = {}
) {
	const db = await contentDb(platform);
	if (!db) return { mode: 'md' };
	const ref = await resolveEventSlug(db, slug);
	if (!ref) return { mode: 'md' };
	const object = await getObject(db, { id: ref.id }, viewer);
	if (!object) return { mode: 'db', post: null };
	const postID = ref.legacySlug ?? object.slug;
	const post = await processPost(
		undefined,
		postID,
		/** @type {any} */ (eventToMeta(object)),
		shallow
	);
	const body = html ? await renderContentBody(object.data.body, EVENT_CATEGORY, postID) : '';
	// El componente no existe (no hay .md): la página muestra `html`.
	// eslint-disable-next-line no-unused-vars
	const { content, ...rest } = post;
	return { mode: 'db', post: { ...rest, html: body } };
}

/**
 * Lo mismo que `fetchPost(category, slug, shallow)` (tira 404 si no existe), con los eventos de
 * la base si el interruptor está prendido. Para quien solo necesita la metadata.
 *
 * @param {App.Platform | undefined} platform
 * @param {'calendario' | 'amigues' | 'material' | 'wiki'} category
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean }} [opts]
 * @returns {Promise<ProcessedPost>}
 */
export async function sitePost(platform, category, slug, { viewer = ANON, shallow = true } = {}) {
	if (category === EVENT_CATEGORY) {
		const found = await siteEvent(platform, slug, { viewer, shallow, html: false });
		if (found.mode === 'db') {
			if (!found.post) error(404, 'Not found');
			return found.post;
		}
	}
	return fetchPost(category, slug, shallow);
}

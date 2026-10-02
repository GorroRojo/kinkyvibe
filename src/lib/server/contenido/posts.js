/**
 * De dónde leen las páginas públicas el contenido: los .md o la base (interruptor `contenido_db`).
 *
 * Con el interruptor apagado, todo es exactamente lo de siempre (`fetchMarkdownPosts`,
 * `fetchPost` de $lib/utils). Prendido, los eventos y el material salen de la base y se convierten
 * en el mismo `ProcessedPost` que da un .md (el `toMeta` de cada categoría, ./categories.js, +
 * `processPost`), así las listas, las páginas, el .ics, las etiquetas, la búsqueda, el RSS y el
 * sitemap no cambian su código.
 *
 * Reglas (como los perfiles, docs/amigues.md):
 * - **La base decide** cada dirección que tiene: un post importado (por su .md) o creado en la
 *   base. Si está oculto o borrado, para quien no lo puede ver es 404 aunque el .md siga en el repo.
 * - Un .md que no está en la base (no se importó todavía, o tuvo un error) sigue saliendo de su .md.
 * - Toda lectura de `objects` pasa por la visibilidad (`visibleWhere`/`getObject`): las listas,
 *   con la vista anónima (son las mismas para todes y se guardan en memoria); la página de cada
 *   post, con quien mira (les admins ven los ocultos).
 * - Las listas se recuerdan por isolate mientras la base no cambie: cada pedido mira solo cuántos
 *   objetos hay y cuándo cambió el último (una consulta chica, con índice).
 */
import { error } from '@sveltejs/kit';
import { fetchMarkdownPosts, fetchPost, processPost } from '$lib/utils';
import { isCurrent } from '$lib/utils/allPosts';
import { getDB } from '$lib/server/db';
import { contenidoDbEnabled } from '$lib/server/flags.js';
import { ANON, visibleWhere } from '$lib/server/objects/visibility.js';
import { getObject } from '$lib/server/objects/read.js';
import { CATEGORY_LIST, CONTENT_CATEGORIES, categoryOfType } from './categories.js';
import { EVENT_CATEGORY } from './eventos.js';
import { renderContentBody } from './render.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */

const TYPES = CATEGORY_LIST.map((c) => c.type);
const CATEGORIES = CATEGORY_LIST.map((c) => c.category);
/** `?, ?` para una lista de `n` valores. @param {number} n */
const marks = (n) => Array.from({ length: n }, () => '?').join(', ');

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
 *   claimed: Map<string, Set<string>>,
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
 * Cuántos objetos de contenido hay y cuándo cambió el último (objetos e importaciones): si no
 * cambió, lo recordado sigue valiendo.
 *
 * @param {D1Database} db
 */
async function contentStamp(db) {
	const t = marks(TYPES.length);
	const c = marks(CATEGORIES.length);
	const row = await db
		.prepare(
			`SELECT (SELECT count(*) FROM objects WHERE type IN (${t})) AS n,
				(SELECT max(updated_at) FROM objects WHERE type IN (${t})) AS u,
				(SELECT count(*) FROM content_sources WHERE category IN (${c})) AS sn,
				(SELECT max(updated_at) FROM content_sources WHERE category IN (${c})) AS su`
		)
		.bind(...TYPES, ...TYPES, ...CATEGORIES, ...CATEGORIES)
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
	const t = marks(TYPES.length);
	const [claimedRows, rows] = await Promise.all([
		// Qué direcciones decide la base (vivas, ocultas o borradas): esas no salen del .md.
		db
			.prepare(
				`SELECT o.type, o.slug, s.legacy_slug FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type IN (${t})`
			)
			.bind(...TYPES)
			.all(),
		db
			.prepare(
				`SELECT o.id, o.type, o.slug, o.title, o.data, o.visibility, s.legacy_slug FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type IN (${t}) AND ${visible.sql}
				ORDER BY o.id`
			)
			.bind(...TYPES, ...visible.params)
			.all()
	]);
	/** @type {Map<string, Set<string>>} */
	const claimed = new Map(CATEGORIES.map((c) => [c, new Set()]));
	for (const r of claimedRows.results) {
		const cat = categoryOfType(String(r.type));
		if (!cat) continue;
		const set = /** @type {Set<string>} */ (claimed.get(cat.category));
		set.add(String(r.slug));
		if (r.legacy_slug) set.add(String(r.legacy_slug));
	}
	/** @type {ProcessedPost[]} */
	const listed = [];
	/** @type {ProcessedPost[]} */
	const unlisted = [];
	/** @type {Map<string, string>} */
	const bodies = new Map();
	for (const r of rows.results) {
		const cat = categoryOfType(String(r.type));
		if (!cat) continue;
		let data = {};
		try {
			data = JSON.parse(String(r.data));
		} catch {
			data = {};
		}
		const object = {
			title: String(r.title),
			data: /** @type {Record<string, any>} */ (data),
			visibility: String(r.visibility)
		};
		const postID = r.legacy_slug ? String(r.legacy_slug) : String(r.slug);
		const post = await processPost(
			undefined,
			postID,
			/** @type {any} */ (cat.toMeta(object)),
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
		(p) => !state.claimed.get(String(p.meta.category))?.has(String(p.meta.postID))
	);
	return [...kept, ...fromDb].sort(comparePosts);
}

/**
 * Lo mismo que `fetchMarkdownPosts(wiki, unlisted)`, con los eventos y el material de la base si
 * el interruptor está prendido.
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
 * El cuerpo (markdown) de lo que sale de la base, por dirección (`/calendario/<slug>`,
 * `/material/<slug>`), para el índice de la búsqueda. Vacío con el interruptor apagado.
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
 * A qué objeto lleva una dirección de una categoría (sin mirar visibilidad: es para decidir el
 * camino). Primero la dirección vieja de un .md importado (`todo-kink-…-BDSM-cuir`), después la
 * del objeto.
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {string} slug
 * @returns {Promise<{ id: number, legacySlug: string | null } | null>}
 */
export async function resolveContentSlug(db, category, slug) {
	const cat = CONTENT_CATEGORIES[category];
	if (!cat) return null;
	const row = await db
		.prepare(
			`SELECT o.id, s.legacy_slug FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
			WHERE o.type = ?1 AND (s.legacy_slug = ?3 OR o.slug = ?3)
			ORDER BY (s.legacy_slug = ?3) DESC LIMIT 1`
		)
		.bind(cat.type, category, slug)
		.first();
	if (!row) return null;
	return { id: Number(row.id), legacySlug: row.legacy_slug ? String(row.legacy_slug) : null };
}

/**
 * Lo mismo para eventos.
 *
 * @param {D1Database} db
 * @param {string} slug
 */
export function resolveEventSlug(db, slug) {
	return resolveContentSlug(db, EVENT_CATEGORY, slug);
}

/**
 * @typedef {{ mode: 'md' } | { mode: 'db', post: (ProcessedPost & { html: string }) | null }} SitePost
 */

/**
 * Un post (evento o material) para su página. `{ mode: 'md' }`: sale del .md como siempre
 * (interruptor apagado o dirección que la base no tiene). `{ mode: 'db', post: null }`: la base la
 * tiene pero quien mira no la puede ver → 404.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} category
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean, html?: boolean }} [opts]
 * @returns {Promise<SitePost>}
 */
export async function siteContent(
	platform,
	category,
	slug,
	{ viewer = ANON, shallow = false, html = true } = {}
) {
	const cat = CONTENT_CATEGORIES[category];
	const db = cat ? await contentDb(platform) : null;
	if (!db || !cat) return { mode: 'md' };
	const ref = await resolveContentSlug(db, category, slug);
	if (!ref) return { mode: 'md' };
	const object = await getObject(db, { id: ref.id }, viewer);
	if (!object) return { mode: 'db', post: null };
	const postID = ref.legacySlug ?? object.slug;
	const post = await processPost(
		undefined,
		postID,
		/** @type {any} */ (cat.toMeta(object)),
		shallow
	);
	const body = html
		? await renderContentBody(
				object.data.body,
				/** @type {'calendario' | 'material'} */ (category),
				postID
			)
		: '';
	// El componente no existe (no hay .md): la página muestra `html`.
	// eslint-disable-next-line no-unused-vars
	const { content, ...rest } = post;
	return { mode: 'db', post: { ...rest, html: body } };
}

/**
 * Un evento para su página (ver {@link siteContent}).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean, html?: boolean }} [opts]
 * @returns {Promise<SitePost>}
 */
export function siteEvent(platform, slug, opts) {
	return siteContent(platform, EVENT_CATEGORY, slug, opts);
}

/**
 * Lo mismo que `fetchPost(category, slug, shallow)` (tira 404 si no existe), con lo de la base si
 * el interruptor está prendido. Para quien solo necesita la metadata.
 *
 * @param {App.Platform | undefined} platform
 * @param {'calendario' | 'amigues' | 'material' | 'wiki'} category
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean }} [opts]
 * @returns {Promise<ProcessedPost>}
 */
export async function sitePost(platform, category, slug, { viewer = ANON, shallow = true } = {}) {
	if (CONTENT_CATEGORIES[category]) {
		const found = await siteContent(platform, category, slug, { viewer, shallow, html: false });
		if (found.mode === 'db') {
			if (!found.post) error(404, 'Not found');
			return found.post;
		}
	}
	return fetchPost(category, slug, shallow);
}

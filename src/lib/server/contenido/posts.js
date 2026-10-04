/**
 * De dónde leen las páginas públicas los eventos y el material: de la base (decisión «Contenido
 * solo en la base»; el interruptor `contenido_db` quedó prendido para siempre).
 *
 * Los eventos y el material salen de la base y se convierten en el mismo `ProcessedPost` que
 * daba un .md (el `toMeta` de cada categoría, ./categories.js, + `processPost`), así las listas,
 * las páginas, el .ics, las etiquetas, la búsqueda, el RSS y el sitemap no cambian su código. Las
 * fichas de amigues (y la wiki) siguen saliendo de sus .md: no son de la base todavía.
 *
 * Reglas (como los perfiles, docs/amigues.md):
 * - **Solo la base**: una dirección de evento o material que la base no tiene es 404, aunque haya
 *   un .md en el repo (los .md quedan como respaldo hasta que se borren; 0004). Sin base (por
 *   ejemplo en el build), no hay eventos ni material.
 * - Toda lectura de `objects` pasa por la visibilidad (`visibleWhere`/`getObject`): las listas,
 *   con la vista anónima (son las mismas para todes y se guardan en memoria); la página de cada
 *   post, con quien mira (les admins ven los ocultos).
 * - Las listas se recuerdan por isolate mientras la base no cambie: cada pedido mira solo cuántos
 *   objetos hay y cuándo cambió el último (una consulta chica, con índice).
 * - Las listas no leen el cuerpo de los posts (`data.body`, la mayor parte de lo guardado): solo
 *   la metadata. El cuerpo lo lee aparte el índice de la búsqueda (`siteBodies`), una vez por
 *   cambio de la base.
 */
import { error } from '@sveltejs/kit';
import { fetchMarkdownPosts, fetchPost, processPost } from '$lib/utils';
import { isCurrent } from '$lib/utils/allPosts';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { getDB } from '$lib/server/db';
import { ANON, partVisibleWhere, visibleWhere } from '$lib/server/objects/visibility.js';
import { getObject } from '$lib/server/objects/read.js';
import { CATEGORY_LIST, CONTENT_CATEGORIES, categoryOfType } from './categories.js';
import { EVENT_CATEGORY, EVENT_TYPE } from './eventos.js';
import { renderContentBody } from './render.js';
import { personaEdgesColumn, personaEdgesFromColumn } from './personasEdges.js';
import { tagEdgesColumn, tagEdgesFromColumn } from './etiquetasEdges.js';
import { hydrateContent, withContentEdges } from './relaciones.js';
import { imageOf } from '$lib/server/media/library.js';
import { mediaPath } from '$lib/server/media/sniff.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */

/**
 * Lo que ve `viewer` de los posts de la base: su visibilidad y, si es una parte de un taller que
 * oculta sus partes, la del taller (docs/talleres-partes.md). Usa `?` sin número.
 *
 * @param {Viewer} viewer
 * @param {string} alias
 * @returns {{ sql: string, params: string[] }}
 */
function publicWhere(viewer, alias) {
	const own = visibleWhere(viewer, alias);
	const part = partVisibleWhere(viewer, alias);
	return { sql: `(${own.sql} AND ${part.sql})`, params: [...own.params, ...part.params] };
}

const TYPES = CATEGORY_LIST.map((c) => c.type);
const CATEGORIES = CATEGORY_LIST.map((c) => c.category);
/** `?, ?` para una lista de `n` valores. @param {number} n */
const marks = (n) => Array.from({ length: n }, () => '?').join(', ');

/**
 * La base de donde sale el contenido, o `null` si no hay (entonces no hay eventos ni material).
 *
 * @param {App.Platform | undefined} platform
 * @returns {D1Database | null}
 */
export function contentDb(platform) {
	return getDB(platform) ?? null;
}

/** ¿Esta publicación .md es de una categoría que sale de la base? @param {ProcessedPost} p */
const isDbCategory = (p) => Object.hasOwn(CONTENT_CATEGORIES, String(p.meta.category));

/**
 * @typedef {{
 *   stamp: string,
 *   listed: ProcessedPost[],
 *   unlisted: ProcessedPost[],
 *   paths: Map<number, string>,
 *   bodies?: Promise<Map<string, string>>
 * }} DbState
 */

/**
 * Lo recordado: por la marca de la base y por el árbol de etiquetas con que se limpiaron las
 * etiquetas de cada post (`processPost`): si cambia cualquiera de los dos, se vuelve a armar.
 * @type {{ stamp: string, tree: TagManager, state: Promise<DbState> } | null}
 */
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
				(SELECT max(updated_at) FROM content_sources WHERE category IN (${c})) AS su,
				(SELECT max(updated_at) FROM objects WHERE type = 'perfil') AS pu,
				(SELECT max(updated_at) FROM objects WHERE type = 'imagen') AS iu,
				(SELECT max(updated_at) FROM objects WHERE type = 'etiqueta') AS tu`
		)
		.bind(...TYPES, ...TYPES, ...CATEGORIES, ...CATEGORIES)
		.first();
	// `pu`: los perfiles de las personas son edges y la metadata lleva su dirección actual
	// (./personasEdges.js): si un perfil cambia, lo recordado se vuelve a armar. `tu`: lo mismo con
	// el `key` de las etiquetas (./etiquetasEdges.js).
	// `iu`: borrar (o volver a subir) una imagen cambia qué imagen muestra un post.
	return `${row?.n}:${row?.u}:${row?.sn}:${row?.su}:${row?.pu}:${row?.iu}:${row?.tu}`;
}

/**
 * @param {D1Database} db
 * @returns {Promise<DbState>}
 */
async function dbState(db) {
	const stamp = await contentStamp(db);
	const tree = currentSiteTags();
	if (cached?.stamp === stamp && cached.tree === tree) return cached.state;
	const state = loadDbState(db, stamp, tree);
	cached = { stamp, tree, state };
	state.catch(() => {
		if (cached?.state === state) cached = null;
	});
	return state;
}

/**
 * @param {D1Database} db
 * @param {string} stamp
 * @param {TagManager} tree el árbol de etiquetas en uso
 * @returns {Promise<DbState>}
 */
async function loadDbState(db, stamp, tree) {
	const visible = publicWhere(ANON, 'o');
	const visibleImage = visibleWhere(ANON, 'i');
	const t = marks(TYPES.length);
	// Sin el cuerpo: ninguna lista lo usa (`toMeta` no lo lee) y es casi todo lo que pesa `data`.
	// `cover`: la imagen de la biblioteca del post (edge `portada`, docs/imagenes.md), si tiene.
	const rows = await db
		.prepare(
			`SELECT o.id, o.type, o.slug, o.title, ${DATA_WITHOUT_BODY} AS data, o.visibility,
				s.legacy_slug, ${personaEdgesColumn('o')} AS persona_edges,
				${tagEdgesColumn('o')} AS tag_edges,
				(SELECT json_extract(i.data, '$.key') FROM edges e
					JOIN objects i ON i.id = e.to_id AND i.type = 'imagen'
					WHERE e.from_id = o.id AND e.kind = 'portada' AND ${visibleImage.sql}
					ORDER BY e.position LIMIT 1) AS cover
			FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id
			WHERE o.type IN (${t}) AND ${visible.sql}
			ORDER BY o.id`
		)
		.bind(...visibleImage.params, ...TYPES, ...visible.params)
		.all();
	/** @type {ProcessedPost[]} */
	const listed = [];
	/** @type {ProcessedPost[]} */
	const unlisted = [];
	/** @type {Map<number, string>} */
	const paths = new Map();
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
			// Los perfiles de `personas` y las etiquetas son edges (./relaciones.js), leídos en la
			// misma consulta: la metadata lleva las listas enteras.
			data: withContentEdges(String(r.type), /** @type {Record<string, any>} */ (data), {
				personas: r.type === EVENT_TYPE ? personaEdgesFromColumn(r.persona_edges) : [],
				tags: tagEdgesFromColumn(r.tag_edges)
			}),
			visibility: String(r.visibility)
		};
		const postID = r.legacy_slug ? String(r.legacy_slug) : String(r.slug);
		const post = await processPost(
			undefined,
			postID,
			/** @type {any} */ (
				withCover(cat.toMeta(object), typeof r.cover === 'string' ? r.cover : undefined)
			),
			true,
			tree
		);
		(post.meta.force_unlisted ? unlisted : listed).push(post);
		paths.set(Number(r.id), post.path);
	}
	return { stamp, listed, unlisted, paths };
}

/**
 * La metadata con la imagen de la biblioteca en `featured` (si tiene); si no, tal cual (la imagen
 * vieja del repo, que resuelve `processPost`).
 * @template {Record<string, any>} M
 * @param {M} meta
 * @param {string | undefined} key
 * @returns {M}
 */
export function withCover(meta, key) {
	return key ? { ...meta, featured: mediaPath(key) } : meta;
}

/**
 * `data` sin `body`, en la misma consulta (un `data` que no es JSON va tal cual: lo resuelve el
 * `JSON.parse` de siempre).
 */
const DATA_WITHOUT_BODY = `CASE WHEN json_valid(o.data) THEN json_remove(o.data, '$.body') ELSE o.data END`;

/**
 * El cuerpo de cada post de la lista, por dirección. Lo lee una vez por cambio de la base (lo
 * guarda en el mismo estado) y solo lo pide la búsqueda.
 *
 * @param {D1Database} db
 * @param {DbState} state
 * @returns {Promise<Map<string, string>>}
 */
function stateBodies(db, state) {
	if (!state.bodies) {
		const t = marks(TYPES.length);
		const visible = publicWhere(ANON, 'o');
		const loading = db
			.prepare(
				`SELECT o.id, CASE WHEN json_valid(o.data) AND json_type(o.data, '$.body') = 'text'
					THEN json_extract(o.data, '$.body') END AS body
				FROM objects o WHERE o.type IN (${t}) AND ${visible.sql} ORDER BY o.id`
			)
			.bind(...TYPES, ...visible.params)
			.all()
			.then(({ results }) => {
				/** @type {Map<string, string>} */
				const bodies = new Map();
				for (const r of results) {
					const path = state.paths.get(Number(r.id));
					if (path && typeof r.body === 'string' && r.body) bodies.set(path, r.body);
				}
				return bodies;
			});
		state.bodies = loading;
		loading.catch(() => {
			if (state.bodies === loading) delete state.bodies;
		});
	}
	return state.bodies;
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
 * Junta lo que sigue saliendo de los .md (amigues) con los eventos y el material de la base: de
 * los .md se descarta todo evento y material (la base es la única fuente). Pura.
 *
 * @param {ProcessedPost[]} md
 * @param {ProcessedPost[]} fromDb
 */
export function mergePosts(md, fromDb) {
	return [...md.filter((p) => !isDbCategory(p)), ...fromDb].sort(comparePosts);
}

/**
 * Lo mismo que `fetchMarkdownPosts(wiki, unlisted)`, con los eventos y el material de la base en
 * lugar de sus .md.
 *
 * @param {App.Platform | undefined} platform
 * @param {boolean} [wiki]
 * @param {boolean} [unlisted]
 * @returns {Promise<ProcessedPost[]>}
 */
export async function sitePosts(platform, wiki = false, unlisted = false) {
	const md = await fetchMarkdownPosts(wiki, unlisted);
	if (wiki) return md;
	const db = contentDb(platform);
	if (!db) return mergePosts(md, []);
	const state = await dbState(db);
	return mergePosts(md, unlisted ? state.unlisted : state.listed);
}

/**
 * Cuántas publicaciones no listadas hay (el contador «No listadas» del menú del panel): lo mismo
 * que `(await sitePosts(platform, false, true)).length`, sin armar las listas públicas. Una
 * consulta, para la tanda del layout del panel: las fichas .md no listadas (amigues) más lo no
 * listado de la base que ve cualquiera (la columna `unlisted`, migración 0031). `null` si la
 * consulta falla (el contador no aparece).
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<import('$lib/server/db/batch.js').BatchQuery<number | null>>}
 */
export async function unlistedCountQuery(platform) {
	const others = (await fetchMarkdownPosts(false, true)).filter((p) => !isDbCategory(p)).length;
	const what = 'contador de no listadas';
	if (!contentDb(platform)) {
		return { what, fallback: others, statements: () => [], read: () => others };
	}
	const t = marks(TYPES.length);
	const visible = publicWhere(ANON, 'o');
	return {
		what,
		fallback: null,
		statements: (db) => [
			db
				.prepare(
					`SELECT COUNT(*) AS db FROM objects o
					WHERE o.type IN (${t}) AND ${visible.sql} AND o.unlisted = 1`
				)
				.bind(...TYPES, ...visible.params)
		],
		read: (results) => others + Number(results[0]?.results?.[0]?.db ?? 0)
	};
}

/**
 * Las listadas, sin los eventos que ya empezaron.
 *
 * @param {App.Platform | undefined} platform
 */
export async function currentSitePosts(platform) {
	const now = Date.now();
	return (await sitePosts(platform)).filter((p) => isCurrent(p, now));
}

/**
 * El cuerpo (markdown) de lo que sale de la base, por dirección (`/calendario/<slug>`,
 * `/material/<slug>`), para el índice de la búsqueda. Vacío sin base.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<Map<string, string>>}
 */
export async function siteBodies(platform) {
	const db = contentDb(platform);
	if (!db) return new Map();
	return stateBodies(db, await dbState(db));
}

/**
 * La marca de cambios del contenido de la base (la misma con la que se recuerdan las listas). Para quien recuerda algo armado con las listas o los cuerpos
 * (el índice de la búsqueda): si la marca no cambió, lo armado sigue valiendo. `null` sin base.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<string | null>}
 */
export async function siteContentStamp(platform) {
	const db = contentDb(platform);
	return db ? contentStamp(db) : null;
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
	// Dos búsquedas por índices únicos ((category, legacy_slug) y (type, slug)); con un `OR` entre
	// las dos tablas, SQLite recorría todos los posts del tipo.
	const row = await db
		.prepare(
			`SELECT id, legacy_slug FROM (
				SELECT o.id, s.legacy_slug, 0 AS pri FROM content_sources s
				JOIN objects o ON o.id = s.object_id AND o.type = ?1
				WHERE s.category = ?2 AND s.legacy_slug = ?3
				UNION ALL
				SELECT o.id, s.legacy_slug, 1 AS pri FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
				WHERE o.type = ?1 AND o.slug = ?3
			) ORDER BY pri LIMIT 1`
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
 * @typedef {ProcessedPost & import('./render.js').RenderedBody} SitePost
 */

/**
 * Un post (evento o material) de la base para su página, o `null` si la base no lo tiene o quien
 * mira no lo puede ver (→ 404).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} category
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean, html?: boolean }} [opts]
 * @returns {Promise<SitePost | null>}
 */
export async function siteContent(
	platform,
	category,
	slug,
	{ viewer = ANON, shallow = false, html = true } = {}
) {
	const cat = CONTENT_CATEGORIES[category];
	const db = cat ? contentDb(platform) : null;
	if (!db || !cat) return null;
	const ref = await resolveContentSlug(db, category, slug);
	if (!ref) return null;
	const found = await getObject(db, { id: ref.id }, viewer);
	if (!found) return null;
	// Una parte de un taller que oculta sus partes, como el taller (docs/talleres-partes.md).
	const part = partVisibleWhere(viewer, 'o');
	const partOk = await db
		.prepare(`SELECT 1 AS ok FROM objects o WHERE o.id = ? AND ${part.sql}`)
		.bind(found.id, ...part.params)
		.first();
	if (!partOk) return null;
	const [object] = await hydrateContent(db, [found]);
	const postID = ref.legacySlug ?? object.slug;
	const cover = await imageOf(db, object.id, 'portada', viewer).catch(() => null);
	const post = await processPost(
		undefined,
		postID,
		/** @type {any} */ (withCover(cat.toMeta(object), cover?.key)),
		shallow
	);
	const body = html
		? await renderContentBody(
				object.data,
				/** @type {'calendario' | 'material'} */ (category),
				postID,
				{ vars: post.meta }
			)
		: { html: '', css: '', component: false };
	// El componente no viaja desde el servidor: con `component`, +page.js carga el que mdsvex
	// compiló del .md (el texto es el mismo); si no, la página muestra `html` (o `parts`, con
	// interactivos) y `css`, solo dentro del texto.
	// eslint-disable-next-line no-unused-vars
	const { content, ...rest } = post;
	return { ...rest, ...body };
}

/**
 * Un evento para su página (ver {@link siteContent}).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean, html?: boolean }} [opts]
 */
export function siteEvent(platform, slug, opts) {
	return siteContent(platform, EVENT_CATEGORY, slug, opts);
}

/**
 * Lo mismo que `fetchPost(category, slug, shallow)` (tira 404 si no existe): los eventos y el
 * material, de la base; amigues y wiki, de su .md. Para quien solo necesita la metadata.
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
		if (!found) error(404, 'Not found');
		return found;
	}
	return fetchPost(category, slug, shallow);
}

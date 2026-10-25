/**
 * De dónde leen las páginas públicas los eventos y el material: de la base (decisión «Contenido
 * solo en la base»; el interruptor `contenido_db` quedó prendido para siempre).
 *
 * Los eventos y el material salen de la base y se convierten en el mismo `ProcessedPost` que
 * daba un .md (el `toMeta` de cada categoría, ./categories.js, + `processPost`), así las listas,
 * las páginas, el .ics, las etiquetas, la búsqueda, el RSS y el sitemap no cambian su código. Los
 * perfiles de amigues también salen de la base (src/lib/server/amigues/asPost.js) y la wiki, de las
 * etiquetas (src/lib/server/wiki/site.js): ningún .md se lee («solo base»).
 *
 * Reglas (como los perfiles, docs/amigues.md):
 * - **Solo la base**: una dirección de evento o material que la base no tiene es 404, aunque haya
 *   un .md en el repo (los .md quedan como respaldo hasta que se borren; 0004). Sin base (por
 *   ejemplo en el build), no hay eventos ni material.
 * - Toda lectura de `objects` pasa por la visibilidad (`visibleWhere`, o `canSee` como en
 *   `getObject`): las listas, con la vista anónima (son las mismas para todes y se guardan en
 *   memoria); la página de cada post, con quien mira (les admins ven los ocultos).
 * - La metadata (listas y páginas) lleva solo los vínculos (`personas`, `tags`) a perfiles y
 *   etiquetas que ve cualquiera (./vinculosPublicos.js). El panel lee con ./repo.js: ve todo.
 * - Las listas se recuerdan por isolate mientras la base no cambie: cada pedido mira solo cuántos
 *   objetos hay y cuándo cambió el último (una consulta chica, con índice). Si el isolate no las
 *   tiene, las busca en la caché de Cloudflare del centro de datos (`caches.default`), con la marca
 *   como clave (`edgeState`): un isolate nuevo no las vuelve a armar si otro ya lo hizo.
 * - Las listas no leen el cuerpo de los posts (`data.body`, la mayor parte de lo guardado): solo
 *   la metadata. El cuerpo lo lee aparte el índice de la búsqueda (`siteBodies`), una vez por
 *   cambio de la base.
 */
import { error, redirect } from '@sveltejs/kit';
import { version } from '$app/environment';
import { parseSiteDate } from '$lib/utils/dates.js';
import { processPost } from '$lib/utils';
import { pronounLabel } from '$lib/utils/mentions';
import { isCurrent } from '$lib/utils/allPosts';
import { currentSiteTagList, currentSiteTags } from '$lib/utils/siteTags.js';
import { getDB } from '$lib/server/db';
import { oncePerRequest, readAndKeep } from '$lib/server/db/perRequest.js';
import { ANON, canSee, partVisibleWhere, visibleWhere } from '$lib/server/objects/visibility.js';
import { OBJECT_COLUMNS, forViewer, rowToObject } from '$lib/server/objects/read.js';
import { CATEGORY_LIST, CONTENT_CATEGORIES, categoryOfType } from './categories.js';
import { EVENT_CATEGORY } from './eventos.js';
import { renderContentBody } from './render.js';
import { personaEdgesColumn, personaEdgesFromColumn } from './personasEdges.js';
import { tagEdgesColumn, tagEdgesFromColumn } from './etiquetasEdges.js';
import { hydrateContent, withContentEdges } from './relaciones.js';
import { publicLinksOf } from './vinculosPublicos.js';
import { imageOf } from '$lib/server/media/library.js';
import { mediaPath } from '$lib/server/media/sniff.js';
import { authorProfilePosts, toPublic } from '$lib/server/amigues/asPost.js';
import { profileAsPost, shownProfileSql } from '$lib/server/amigues/profiles.js';
import { siteWikiPosts } from '$lib/server/wiki/site.js';
import { pageReadingMinutes, pageReadingWords } from '$lib/utils/readingTime.js';

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
 *   profiles: { listed: ProcessedPost[], unlisted: ProcessedPost[] },
 *   bodies?: Map<string, string>,
 *   pronouns?: Record<string, string>
 * }} DbState
 *   `profiles`: los perfiles de amigues que ve cualquiera, como posts (src/lib/server/amigues/asPost.js).
 */

/**
 * Lo recordado: por la marca de la base y por el árbol de etiquetas con que se limpiaron las
 * etiquetas de cada post (`processPost`): si cambia cualquiera de los dos, se vuelve a armar.
 * Solo el estado ya armado: lo que está en camino se comparte solo dentro del pedido
 * (`readAndKeep`, src/lib/server/db/perRequest.js).
 * @type {{ stamp: string, tree: TagManager, state: DbState } | null}
 */
let cached = null;

/** Olvida lo recordado (tests). */
export function clearContentCache() {
	cached = null;
}

/**
 * Cuántos objetos de contenido hay y cuándo cambió el último (objetos e importaciones): si no
 * cambió, lo recordado sigue valiendo. Una sola vez por pedido de lectura (la página, su layout,
 * los pronombres y el índice de la búsqueda la comparten; src/lib/server/db/perRequest.js).
 *
 * @param {D1Database} db
 * @returns {Promise<string>}
 */
function contentStamp(db) {
	return oncePerRequest(db, 'contentStamp', () => readContentStamp(db));
}

/** @param {D1Database} db */
async function readContentStamp(db) {
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
				(SELECT max(updated_at) FROM objects WHERE type = 'etiqueta') AS tu,
				(SELECT count(*) FROM objects WHERE type = 'perfil') AS pn,
				(SELECT count(*) FROM profile_approvals) AS an,
				(SELECT total(profile_id) FROM profile_approvals) AS ai,
				(SELECT count(*) FROM profile_sources) AS psn,
				(SELECT max(updated_at) FROM profile_sources) AS psu`
		)
		.bind(...TYPES, ...TYPES, ...CATEGORIES, ...CATEGORIES)
		.first();
	// `pu`: los perfiles de las personas son edges y la metadata lleva su dirección actual
	// (./personasEdges.js): si un perfil cambia, lo recordado se vuelve a armar. `tu`: lo mismo con
	// el `key` de las etiquetas (./etiquetasEdges.js).
	// `iu`: borrar (o volver a subir) una imagen cambia qué imagen muestra un post.
	// `pn`, `an`, `ai`, `psn`, `psu`: los perfiles de amigues de las listas (cuántos, aprobaciones
	// e importaciones; cualquier cambio de un perfil mueve `pu`).
	return [
		row?.n,
		row?.u,
		row?.sn,
		row?.su,
		row?.pu,
		row?.iu,
		row?.tu,
		row?.pn,
		row?.an,
		row?.ai,
		row?.psn,
		row?.psu
	].join(':');
}

/**
 * @param {D1Database} db
 * @returns {Promise<DbState>}
 */
async function dbState(db) {
	const stamp = await contentStamp(db);
	const tree = currentSiteTags();
	if (cached?.stamp === stamp && cached.tree === tree) return cached.state;
	return readAndKeep(
		db,
		`dbState\n${stamp}`,
		() => edgeState(db, stamp, tree),
		(state) => {
			cached = { stamp, tree, state };
		}
	);
}

/**
 * La caché de Cloudflare del centro de datos, o `null` donde no hay (vitest, el build, `vite dev`).
 * @returns {Cache | null}
 */
function edgeCache() {
	if (typeof caches === 'undefined') return null;
	const all = /** @type {any} */ (caches);
	return all.default ?? null;
}

/** Un día: la clave cambia con la marca, así que un guardado del panel no necesita purgar nada. */
const EDGE_MAX_AGE = 86400;

/** @type {WeakMap<TagManager, string>} */
const treeHashes = new WeakMap();

/**
 * Una huella corta de la lista de etiquetas con que se armó el estado (FNV-1a de su JSON), una vez
 * por árbol: cada isolate recuerda el árbol 30 s, así que un isolate con el árbol viejo no pisa lo
 * guardado con el nuevo (ni al revés).
 * @param {TagManager} tree
 */
function treeHash(tree) {
	let hash = treeHashes.get(tree);
	if (hash === undefined) {
		const text = JSON.stringify(currentSiteTagList());
		let h = 0x811c9dc5;
		for (let i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i);
			h = Math.imul(h, 0x01000193);
		}
		hash = (h >>> 0).toString(36);
		treeHashes.set(tree, hash);
	}
	return hash;
}

/**
 * La clave en la caché: la marca, el árbol de etiquetas y la versión del build (un deploy que
 * cambia cómo se arman las listas no lee lo guardado por el anterior). No es una dirección real.
 * @param {string} stamp
 * @param {TagManager} tree
 */
export function edgeStateKey(stamp, tree) {
	return `https://kinkyvibe.ar/__contenido/${encodeURIComponent(stamp)}?t=${treeHash(tree)}&v=${encodeURIComponent(version)}`;
}

/**
 * El estado de las listas desde la caché de Cloudflare; si no está, lo arma (`loadDbState`) y lo
 * guarda. Se guarda solo lo armado de la base (`listed`, `unlisted`, `paths`, `profiles`): los
 * cuerpos y los pronombres se derivan después, como siempre. Sin caché, como antes.
 *
 * @param {D1Database} db
 * @param {string} stamp
 * @param {TagManager} tree
 * @returns {Promise<DbState>}
 */
async function edgeState(db, stamp, tree) {
	const cache = edgeCache();
	const key = cache ? edgeStateKey(stamp, tree) : '';
	if (cache) {
		try {
			const hit = await cache.match(key);
			if (hit) {
				const saved = await hit.json();
				return {
					stamp,
					listed: saved.listed,
					unlisted: saved.unlisted,
					paths: new Map(saved.paths),
					profiles: saved.profiles
				};
			}
		} catch {
			// Una caché que falla no rompe la página: se arma de la base.
		}
	}
	const start = Date.now();
	const state = await loadDbState(db, stamp, tree);
	// Una línea por armado, para los registros del Worker (Workers Logs).
	console.log(`contenido: listas armadas (marca ${stamp}) en ${Date.now() - start} ms`);
	if (cache) {
		const body = JSON.stringify({
			listed: state.listed,
			unlisted: state.unlisted,
			paths: [...state.paths],
			profiles: state.profiles
		});
		try {
			await cache.put(
				key,
				new Response(body, {
					headers: {
						'content-type': 'application/json',
						'cache-control': `public, max-age=${EDGE_MAX_AGE}`
					}
				})
			);
		} catch {
			// Sin guardar: el próximo isolate la vuelve a armar.
		}
	}
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
	// `cover`: la imagen de la biblioteca del post (edge `portada`, docs/imagenes.md), si tiene; de un
	// perfil, su `avatar`. En la misma consulta, los perfiles de amigues aprobados y no ocultos («solo
	// base»: lo que las listas mostraban de las fichas .md).
	const rows = await db
		.prepare(
			`SELECT o.id, o.type, o.slug, o.title, ${DATA_WITHOUT_BODY} AS data, o.visibility,
				coalesce(s.legacy_slug, ps.legacy_slug) AS legacy_slug,
				${personaEdgesColumn('o')} AS persona_edges,
				${tagEdgesColumn('o')} AS tag_edges,
				(SELECT json_extract(i.data, '$.key') FROM edges e
					JOIN objects i ON i.id = e.to_id AND i.type = 'imagen'
					WHERE e.from_id = o.id
						AND e.kind = CASE WHEN o.type = 'perfil' THEN 'avatar' ELSE 'portada' END
						AND ${visibleImage.sql}
					ORDER BY e.position LIMIT 1) AS cover
			FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id
			LEFT JOIN profile_sources ps ON ps.profile_id = o.id
			WHERE (o.type IN (${t}) OR (o.type = 'perfil' AND ${shownProfileSql('o')}))
				AND ${visible.sql}
			ORDER BY o.id`
		)
		.bind(...visibleImage.params, ...TYPES, ...visible.params)
		.all();
	/** @type {ProcessedPost[]} */
	const listed = [];
	/** @type {ProcessedPost[]} */
	const unlisted = [];
	/** @type {{ listed: ProcessedPost[], unlisted: ProcessedPost[] }} */
	const profiles = { listed: [], unlisted: [] };
	/** @type {Map<number, string>} */
	const paths = new Map();
	/** @param {Record<string, unknown>} r */
	const parsed = (r) => {
		try {
			return JSON.parse(String(r.data));
		} catch {
			return {};
		}
	};
	// La metadata de cada evento y material, con sus listas enteras: los perfiles de `personas` y
	// las etiquetas son edges (./relaciones.js), leídos en la misma consulta. Después, sin los
	// vínculos a lo que no ve cualquiera (./vinculosPublicos.js, una vuelta más para todos).
	const content = rows.results.flatMap((r) => {
		const cat = r.type === 'perfil' ? null : categoryOfType(String(r.type));
		if (!cat) return [];
		const object = {
			title: String(r.title),
			data: withContentEdges(String(r.type), /** @type {Record<string, any>} */ (parsed(r)), {
				personas: personaEdgesFromColumn(r.persona_edges),
				tags: tagEdgesFromColumn(r.tag_edges)
			}),
			visibility: String(r.visibility)
		};
		return [{ r, meta: cat.toMeta(object) }];
	});
	const metas = await publicLinksOf(
		db,
		content.map((c) => c.meta)
	);
	/** @type {Map<Record<string, unknown>, Record<string, any>>} */
	const metaOf = new Map(content.map((c, i) => [c.r, metas[i]]));
	for (const r of rows.results) {
		if (r.type === 'perfil') {
			const data = parsed(r);
			const profile = /** @type {any} */ ({
				slug: String(r.slug),
				title: String(r.title),
				data,
				visibility: String(r.visibility)
			});
			const post = profileAsPost(
				await toPublic(
					profile,
					r.legacy_slug ? String(r.legacy_slug) : null,
					typeof r.cover === 'string' ? r.cover : undefined,
					tree
				)
			);
			(profile.data.unlisted === true ? profiles.unlisted : profiles.listed).push(post);
			continue;
		}
		const meta = metaOf.get(r);
		if (!meta) continue;
		const postID = r.legacy_slug ? String(r.legacy_slug) : String(r.slug);
		const post = await processPost(
			undefined,
			postID,
			/** @type {any} */ (withCover(meta, typeof r.cover === 'string' ? r.cover : undefined)),
			true,
			tree
		);
		(post.meta.force_unlisted ? unlisted : listed).push(post);
		paths.set(Number(r.id), post.path);
	}
	return { stamp, listed, unlisted, paths, profiles };
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
async function stateBodies(db, state) {
	if (state.bodies) return state.bodies;
	return readAndKeep(
		state,
		'bodies',
		() => readBodies(db, state),
		(bodies) => {
			state.bodies = bodies;
		}
	);
}

/**
 * @param {D1Database} db
 * @param {DbState} state
 * @returns {Promise<Map<string, string>>}
 */
function readBodies(db, state) {
	const t = marks(TYPES.length);
	const visible = publicWhere(ANON, 'o');
	return db
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
}

/** Orden de las categorías cuando dos publicaciones tienen la misma fecha (como los .md). */
const CATEGORY_ORDER = ['calendario', 'amigues', 'material', 'wiki'];

/** @param {ProcessedPost} p */
export const postTime = (p) =>
	parseSiteDate(p.meta?.start ?? p.meta?.updated_date ?? p.meta?.published_date).getTime();

/**
 * El orden de las listas: lo más nuevo primero (inicio de los eventos; actualización o
 * publicación de lo demás), y a igual fecha, por categoría y dirección.
 *
 * @param {ProcessedPost} a
 * @param {ProcessedPost} b
 */
export function comparePosts(a, b) {
	return compareByTime(a, b, postTime(a), postTime(b));
}

/**
 * {@link comparePosts} con las fechas ya leídas.
 * @param {ProcessedPost} a
 * @param {ProcessedPost} b
 * @param {number} ta
 * @param {number} tb
 */
function compareByTime(a, b, ta, tb) {
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
 * Junta los perfiles de amigues (de la base, como posts) con los eventos y el material de la
 * base: de los perfiles se descarta todo lo que diga ser un evento o material. Pura.
 *
 * @param {ProcessedPost[]} profiles
 * @param {ProcessedPost[]} fromDb
 */
export function mergePosts(profiles, fromDb) {
	const all = [...profiles.filter((p) => !isDbCategory(p)), ...fromDb];
	// La fecha de cada post se lee una vez (y no en cada comparación del orden: con ~600 posts eran
	// miles de `parseSiteDate`). Mismo orden que `comparePosts`.
	const times = new Map(all.map((p) => [p, postTime(p)]));
	return all.sort((a, b) => compareByTime(a, b, times.get(a) ?? NaN, times.get(b) ?? NaN));
}

/**
 * Las listas ya ordenadas de cada estado (`listed` y `unlisted`): mientras la base no cambie, el
 * mismo estado sirve muchos pedidos del isolate y el orden no cambia.
 * @type {WeakMap<DbState, { listed?: ProcessedPost[], unlisted?: ProcessedPost[] }>}
 */
const mergedOf = new WeakMap();

/**
 * @param {DbState} state
 * @param {boolean} unlisted
 */
function mergedFor(state, unlisted) {
	let merged = mergedOf.get(state);
	if (!merged) mergedOf.set(state, (merged = {}));
	if (unlisted) return (merged.unlisted ??= mergePosts(state.profiles.unlisted, state.unlisted));
	return (merged.listed ??= mergePosts(state.profiles.listed, state.listed));
}

/**
 * Para adelantar consultas (nunca para mostrar): la lista listada como la armó este isolate la
 * última vez, sin preguntar si la base cambió; `null` si todavía no armó ninguna. Quien adelanta
 * con esto vuelve a preguntar con la lista de verdad (src/lib/server/db/autoBatch.js: si es lo
 * mismo, no sale otra consulta).
 * @returns {ProcessedPost[] | null}
 */
export function peekListedPosts() {
	return cached ? mergedFor(cached.state, false) : null;
}

/**
 * Las publicaciones del sitio, todas de la base: los eventos, el material y los perfiles de
 * amigues listados (o, con `unlisted`, los no listados); con `wiki`, las páginas de la wiki. Sin
 * base, nada.
 *
 * @param {App.Platform | undefined} platform
 * @param {boolean} [wiki]
 * @param {boolean} [unlisted]
 * @returns {Promise<ProcessedPost[]>}
 */
export async function sitePosts(platform, wiki = false, unlisted = false) {
	if (wiki) return siteWikiPosts(platform);
	const db = contentDb(platform);
	if (!db) return [];
	const state = await dbState(db);
	// Una copia de la lista ordenada del estado: quien la recibe puede cambiarla sin tocar la de
	// los próximos pedidos.
	const posts = mergedFor(state, unlisted).slice();
	stateOfList.set(posts, state);
	return posts;
}

/**
 * De qué estado salió cada lista que dio {@link sitePosts}: quien ya tiene la lista pide lo demás
 * de ese mismo estado (los pronombres) sin volver a preguntar si cambió algo.
 * @type {WeakMap<object, DbState>}
 */
const stateOfList = new WeakMap();

/**
 * Cuántas publicaciones no listadas hay (el contador «No listadas» del menú del panel): lo mismo
 * que `(await sitePosts(platform, false, true)).length`, sin armar las listas públicas. Una
 * consulta, para la tanda del layout del panel: lo no listado de la base que ve cualquiera (la
 * columna `unlisted`, migración 0031) más los perfiles no listados (aprobados y no ocultos, como
 * los cuenta `listPublicProfiles`). `null` si la consulta falla (el contador no aparece).
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<import('$lib/server/db/batch.js').BatchQuery<number | null>>}
 */
export async function unlistedCountQuery(platform) {
	const what = 'contador de no listadas';
	if (!contentDb(platform)) {
		return { what, fallback: 0, statements: () => [], read: () => 0 };
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
					WHERE o.type IN (${t}) AND ${visible.sql} AND o.unlisted = 1
					AND (o.type != 'evento'
						OR COALESCE(json_extract(o.data, '$.extra.borrador'), json_extract(o.data, '$.borrador'), 0) = 1)`
				)
				.bind(...TYPES, ...visible.params),
			db
				.prepare(
					`SELECT COUNT(*) AS db FROM objects o
					WHERE o.type = 'perfil' AND ${visible.sql} AND ${shownProfileSql('o')}
					AND COALESCE(json_extract(o.data, '$.unlisted'), 0) = 1`
				)
				.bind(...visible.params)
		],
		read: (results) =>
			Number(results[0]?.results?.[0]?.db ?? 0) + Number(results[1]?.results?.[0]?.db ?? 0)
	};
}

/**
 * Los pronombres de los perfiles que ve cualquiera (listados o no), por su dirección de /amigues,
 * para las @menciones de los textos (src/lib/server/pronouns.js). Salen de las listas recordadas:
 * sin consultas de más (con `posts`, la lista que dio {@link sitePosts} en este pedido, ni
 * siquiera la de «¿cambió algo?»). Vacío sin base.
 *
 * @param {App.Platform | undefined} platform
 * @param {readonly ProcessedPost[]} [posts]
 * @returns {Promise<Record<string, string>>}
 */
export async function siteProfilePronouns(platform, posts) {
	const db = contentDb(platform);
	if (!db) return {};
	const state = (posts && stateOfList.get(posts)) || (await dbState(db));
	if (!state.pronouns) {
		/** @type {Record<string, string>} */
		const out = {};
		for (const p of [...state.profiles.listed, ...state.profiles.unlisted]) {
			const label = pronounLabel(p.meta.pronoun);
			if (label) out[String(p.meta.postID)] = label;
		}
		state.pronouns = out;
	}
	return state.pronouns;
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
 * La misma marca, con la base en la mano (/amigues recuerda su lista con ella: cubre los perfiles,
 * sus aprobaciones e importaciones y las imágenes).
 *
 * @param {D1Database} db
 * @returns {Promise<string>}
 */
export function contentStampOf(db) {
	return contentStamp(db);
}

/**
 * A qué objeto lleva una dirección (la de {@link resolveContentSlug}): dos búsquedas por índices
 * únicos ((category, legacy_slug) y (type, slug)); con un `OR` entre las dos tablas, SQLite
 * recorría todos los posts del tipo. Solo `?` sin número (se puede meter dentro de otra consulta):
 * los parámetros, {@link resolveContentParams}.
 */
const RESOLVE_CONTENT_SQL = `SELECT id, legacy_slug FROM (
	SELECT o.id, s.legacy_slug, 0 AS pri FROM content_sources s
	JOIN objects o ON o.id = s.object_id AND o.type = ?
	WHERE s.category = ? AND s.legacy_slug = ?
	UNION ALL
	SELECT o.id, s.legacy_slug, 1 AS pri FROM objects o
	LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?
	WHERE o.type = ? AND o.slug = ?
) ORDER BY pri LIMIT 1`;

/**
 * @param {{ type: string }} cat
 * @param {string} category
 * @param {string} slug
 */
const resolveContentParams = (cat, category, slug) => [
	cat.type,
	category,
	slug,
	category,
	cat.type,
	slug
];

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
		.prepare(RESOLVE_CONTENT_SQL)
		.bind(...resolveContentParams(cat, category, slug))
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
 * @typedef {ProcessedPost & import('./render.js').RenderedBody & { cover: import('$lib/utils/seo.js').ImageInfo | null, readingMinutes?: number, readingWords?: number }} SitePost
 *   `readingMinutes` y `readingWords`: solo el material (los eventos son cortos); 0 si el texto es
 *   corto.
 */

/**
 * Un post (evento o material) de la base para su página, o `null` si la base no lo tiene o quien
 * mira no lo puede ver (→ 404).
 *
 * Con `followRedirect` (la página de un material), un material que redirige (`redirect` con
 * `link`, por ejemplo a la tienda) tira la redirección 307 apenas leído el objeto: sin leer sus
 * relaciones, su portada, sus autores ni armar el texto (una tanda a la base en vez de cuatro).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} category
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean, html?: boolean, followRedirect?: boolean }} [opts]
 * @returns {Promise<SitePost | null>}
 */
export async function siteContent(
	platform,
	category,
	slug,
	{ viewer = ANON, shallow = false, html = true, followRedirect = false } = {}
) {
	const cat = CONTENT_CATEGORIES[category];
	const db = cat ? contentDb(platform) : null;
	if (!db || !cat) return null;
	// La dirección, el objeto y si es una parte de un taller que oculta sus partes (como el taller,
	// docs/talleres-partes.md), en una consulta: la base está lejos y cada consulta que espera a
	// otra es una ida y vuelta. Lo mismo que `resolveContentSlug` + `getObject` + esa regla.
	const part = partVisibleWhere(viewer, 'o');
	const row = await db
		.prepare(
			`SELECT r.legacy_slug AS ref_legacy_slug, ${OBJECT_COLUMNS.split(', ')
				.map((c) => `o.${c}`)
				.join(', ')}, (${part.sql}) AS part_ok
			FROM (${RESOLVE_CONTENT_SQL}) r JOIN objects o ON o.id = r.id`
		)
		.bind(...part.params, ...resolveContentParams(cat, category, slug))
		.first();
	if (!row) return null;
	const stored = rowToObject(row);
	if (!canSee(stored, viewer) || !row.part_ok) return null;
	const found = forViewer(stored, viewer);
	if (followRedirect && category === 'material') {
		// `redirect` y `link` salen tal cual de `data` (`materialToMeta`): no dependen de las
		// relaciones ni de la portada.
		const light = cat.toMeta(found);
		// Uno oculto (solo admins) sigue el camino de siempre: la página le pone `no-store`.
		if (light.redirect && !light.force_unpublished && typeof light.link === 'string' && light.link)
			redirect(307, light.link);
	}
	const legacySlug = row.ref_legacy_slug ? String(row.ref_legacy_slug) : null;
	// Sus relaciones y su portada, a la par.
	const [[object], cover] = await Promise.all([
		hydrateContent(db, [found]),
		imageOf(db, found.id, 'portada', viewer).catch(() => null)
	]);
	const postID = legacySlug ?? object.slug;
	const baseMeta = cat.toMeta(object);
	// Sin los vínculos a lo que no ve cualquiera, para todes (también con cuenta o admin): es la
	// página pública. El panel lee con ./repo.js. A la par, les autores con perfil (de la base,
	// como los ve quien mira): «Por …» y sus tarjetas (los vínculos públicos no tocan `authors`).
	const [linked, authors] = await Promise.all([
		publicLinksOf(db, [baseMeta]).then(
			([meta]) => ({ meta }),
			(error) => ({ error })
		),
		shallow
			? null
			: authorProfilePosts(db, baseMeta.authors, { postID, viewer }).then(
					(list) => ({ list }),
					(error) => ({ error })
				)
	]);
	// Los errores, en el orden de antes: primero el de los vínculos.
	if ('error' in linked) throw linked.error;
	if (authors && 'error' in authors) throw authors.error;
	const post = await processPost(
		undefined,
		postID,
		/** @type {any} */ (withCover(linked.meta, cover?.key)),
		shallow
	);
	if (authors) post.authorsProfiles = authors.list;
	// «X min de lectura» del material, del texto guardado ($lib/utils/readingTime.js).
	const reading =
		category === 'material' && !shallow
			? {
					readingMinutes: pageReadingMinutes(object.data?.body),
					// Las palabras, para recalcular con la velocidad de cada persona en el navegador.
					readingWords: pageReadingWords(object.data?.body)
				}
			: {};
	const body = html
		? await renderContentBody(
				object.data,
				/** @type {'calendario' | 'material'} */ (category),
				postID,
				{ vars: post.meta }
			)
		: { html: '', css: '' };
	// La página muestra `html` (o `parts`, con interactivos) y `css`, solo dentro del texto.
	// eslint-disable-next-line no-unused-vars
	const { content, ...rest } = post;
	return { ...rest, ...body, ...reading, cover: coverForPreview(cover) };
}

/**
 * Las medidas, el texto alternativo y el peso de la portada de la biblioteca, para la vista previa
 * al compartir (`og:image:width`, `og:image:alt` y si se achica; src/lib/utils/seo.js). `null`
 * sin portada de la biblioteca (la imagen vieja del repo no tiene medidas guardadas).
 * @param {{ width: number | null, height: number | null, alt: string, size: number } | null} cover
 * @returns {import('$lib/utils/seo.js').ImageInfo | null}
 */
function coverForPreview(cover) {
	if (!cover) return null;
	return { width: cover.width, height: cover.height, alt: cover.alt, size: cover.size || null };
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
 * La metadata de un evento o un material de la base (tira 404 si no existe o quien mira no lo
 * puede ver). Para quien solo necesita la metadata.
 *
 * @param {App.Platform | undefined} platform
 * @param {'calendario' | 'material'} category
 * @param {string} slug
 * @param {{ viewer?: Viewer, shallow?: boolean }} [opts]
 * @returns {Promise<ProcessedPost>}
 */
export async function sitePost(platform, category, slug, { viewer = ANON, shallow = true } = {}) {
	const found = CONTENT_CATEGORIES[category]
		? await siteContent(platform, category, slug, { viewer, shallow, html: false })
		: null;
	if (!found) error(404, 'Not found');
	return found;
}

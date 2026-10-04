/**
 * Guardar contenido (eventos y material) en la base desde el panel, sin cambiar las pantallas
 * (decisión «Contenido solo en la base»: el interruptor `contenido_db` quedó prendido para
 * siempre).
 *
 * Todo lo que el panel escribe pasa por un solo cliente del repo (`getRepoClient()`,
 * docs/publicar-contenido.md): el editor, cargar y duplicar eventos, la agenda, importar la
 * planilla, borrar, las etiquetas, las imágenes compartidas, el editor de material.
 * {@link withContentDb} envuelve ese cliente como lo hace el modo demo: el .md de un evento o un
 * material **siempre** se lee y se guarda en la base (nunca en GitHub); todo lo demás (imágenes,
 * amigues, la wiki) sigue yendo al repo como siempre.
 *
 * - **Leer**: el texto se arma desde el objeto ({@link postToMarkdown}), con un «sha» que es el de
 *   ese texto: si alguien guarda en el medio, el texto cambia y el próximo guardado con el sha
 *   viejo da `FileChangedError`, como con GitHub. Un evento o material que la base no tiene no
 *   existe (aunque su .md siga en el repo).
 * - **Guardar**: cada archivo va con saveObject() (versión nueva cada vez, con el número de versión
 *   que se leyó; el historial queda en `object_revisions`), después del commit al repo de lo que no
 *   es de la base (si eso falla, la base no se toca). Se valida todo antes de escribir nada.
 * - **Borrar** un archivo es el borrado suave del objeto; volver a crearlo, deshacerlo.
 * - Sin base no se puede guardar un evento ni un material ({@link NoContentDbError}).
 *
 * La base de este isolate la registra hooks.server.js en cada pedido ({@link setContentDB}), igual
 * que el modo demo: así el cliente sirve para cualquiera que llame a getRepoClient().
 */
import { getRequestEvent } from '$app/server';
import { FileChangedError, PathExistsError } from '$lib/server/eventos/github.js';
import { gitBlobSha } from '$lib/server/admin/posts.js';
import { ObjectError, VersionConflictError } from '$lib/server/objects/errors.js';
import { forViewer, OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { canSee } from '$lib/server/objects/visibility.js';
import { saveObject } from '$lib/server/objects/save.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { CONTENT_CATEGORIES } from './categories.js';
import { EVENT_CATEGORY, normalizeBody } from './eventos.js';
import { panelAuthor } from './author.js';
import { markdownToPost, postToMarkdown } from './markdown.js';
import { revisionStatement } from './revisions.js';
import { personaEdgesColumn, personaEdgesFromColumn } from './personasEdges.js';
import { linkedTagKeysOf, tagEdgesColumn, tagEdgesFromColumn } from './etiquetasEdges.js';
import { contentEdgesOf, dehydrateContent, withContentEdges } from './relaciones.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** @type {D1Database | null} */
let current = null;

/**
 * La base del isolate (la registra hooks.server.js en cada pedido; los tests, a mano).
 * @param {D1Database | null | undefined} db
 */
export function setContentDB(db) {
	current = db ?? null;
}

/** La base del contenido, o `null` si no hay. */
export function activeContentDB() {
	return current;
}

/** Sin base no hay dónde guardar eventos ni material (nunca van a GitHub). */
export class NoContentDbError extends Error {
	constructor() {
		super('No hay base de datos: los eventos y el material se guardan solo en la base.');
		this.name = 'NoContentDbError';
	}
}

/** Quién mira desde el panel: lo ve todo (también lo oculto y lo borrado, para no pisarlo). */
const PANEL = /** @type {const} */ ({ role: 'admin', id: 'panel' });

const POST_FILE = /^src\/lib\/posts\/([a-z]+)\/([^/_][^/]*)\.md$/;

/** @param {string} category */
const dirOf = (category) => `src/lib/posts/${category}`;

/**
 * La categoría (de las que van a la base) y la dirección de una ruta del repo
 * (`src/lib/posts/<categoría>/<slug>.md`), o null.
 *
 * @param {string} path
 * @returns {{ category: string, slug: string } | null}
 */
export function postOfPath(path) {
	const m = POST_FILE.exec(path);
	if (!m || !CONTENT_CATEGORIES[m[1]]) return null;
	return { category: m[1], slug: m[2] };
}

/**
 * La dirección del evento de una ruta del repo (`src/lib/posts/calendario/<slug>.md`), o null.
 * @param {string} path
 */
export function eventSlugOfPath(path) {
	const p = postOfPath(path);
	return p?.category === EVENT_CATEGORY ? p.slug : null;
}

/**
 * @typedef {{ category: string, object: StoredObject, urlSlug: string, raw: string, sha: string, deleted: boolean }} DbPostFile
 */

/**
 * @param {string} category
 * @param {StoredObject} object
 * @param {string} urlSlug
 * @returns {Promise<DbPostFile>}
 */
async function asFile(category, object, urlSlug) {
	const raw = postToMarkdown(category, object);
	return {
		category,
		object,
		urlSlug,
		raw,
		sha: await gitBlobSha(raw),
		deleted: object.deleted_at !== null
	};
}

/**
 * @typedef {{ category: string, object: StoredObject, urlSlug: string, legacySlug: string | null, deleted: boolean }} DbPostObject
 *   Un post de la base sin su texto (`raw`) ni su sha: lo que necesitan las listas y la metadata.
 *   Armar el texto y su sha de cada post es lo caro; solo hace falta para leerlo o guardarlo.
 */

/**
 * @param {string} category
 * @param {StoredObject} object
 * @param {string | null} legacySlug
 * @returns {DbPostObject}
 */
function asPostObject(category, object, legacySlug) {
	return {
		category,
		object,
		urlSlug: legacySlug ?? object.slug,
		legacySlug,
		deleted: object.deleted_at !== null
	};
}

/**
 * El post de la base en esa dirección (vieja o del objeto), también oculto o borrado, o null.
 * Sin el texto: para la metadata (ver {@link findDbPost}).
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {string} slug
 * @returns {Promise<DbPostObject | null>}
 */
export async function findDbPostObject(db, category, slug) {
	const cat = CONTENT_CATEGORIES[category];
	if (!cat) return null;
	// Una sola consulta, por los índices únicos (category, legacy_slug) y (type, slug): antes eran
	// dos (resolveContentSlug de ./posts.js + getObject) y la primera recorría todos los posts del
	// tipo por el `OR` entre las dos tablas. Mismo orden: primero la dirección vieja, después la del
	// objeto.
	// Panel (solo admins): ve todo, también lo oculto y lo borrado.
	// Los edges `persona` y `etiqueta` van en la misma consulta (./relaciones.js): las listas de
	// personas y de etiquetas enteras.
	const row = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS}, legacy_slug, persona_edges, tag_edges FROM (
				SELECT ${prefixed('o')}, s.legacy_slug, ${personaEdgesColumn('o')} AS persona_edges,
					${tagEdgesColumn('o')} AS tag_edges, 0 AS pri FROM content_sources s
				JOIN objects o ON o.id = s.object_id AND o.type = ?1
				WHERE s.category = ?2 AND s.legacy_slug = ?3
				UNION ALL
				SELECT ${prefixed('o')}, s.legacy_slug, ${personaEdgesColumn('o')} AS persona_edges,
					${tagEdgesColumn('o')} AS tag_edges, 1 AS pri FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
				WHERE o.type = ?1 AND o.slug = ?3
			) ORDER BY pri LIMIT 1`
		)
		.bind(cat.type, category, slug)
		.first();
	if (!row) return null;
	// El objeto como lo da getObject(): sin la dirección vieja.
	const { legacy_slug: legacy, persona_edges: personas, tag_edges: tags, ...columns } = row;
	const object = rowToObject(columns);
	if (!canSee(object, PANEL, { includeDeleted: true })) return null;
	const seen = forViewer(object, PANEL);
	const full = {
		...seen,
		data: withContentEdges(seen.type, seen.data, {
			personas: personaEdgesFromColumn(personas),
			tags: tagEdgesFromColumn(tags)
		})
	};
	return asPostObject(category, full, legacy ? String(legacy) : null);
}

/**
 * El post de la base en esa dirección (vieja o del objeto), también oculto o borrado, o null, con
 * su texto y su sha (para el editor y para guardar).
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {string} slug
 * @returns {Promise<DbPostFile | null>}
 */
export async function findDbPost(db, category, slug) {
	const found = await findDbPostObject(db, category, slug);
	return found ? asFile(category, found.object, found.urlSlug) : null;
}

/** @param {D1Database} db @param {string} slug */
export const findDbEvent = (db, slug) => findDbPost(db, EVENT_CATEGORY, slug);

/**
 * Todos los posts de una categoría en la base (también ocultos y borrados) por dirección, sin el
 * texto: una sola consulta, para las listas del panel y la metadata.
 *
 * @param {D1Database} db
 * @param {string} category
 * @returns {Promise<Map<string, DbPostObject>>}
 */
export async function allDbPostObjects(db, category) {
	const cat = CONTENT_CATEGORIES[category];
	if (!cat) return new Map();
	const stamp = await postsStamp(db, cat.type, category);
	let entry = postsCache.get(category);
	if (entry?.stamp !== stamp) {
		const rows = readDbPostRows(db, cat.type, category);
		entry = { stamp, rows };
		postsCache.set(category, entry);
		const mine = entry;
		rows.catch(() => {
			if (postsCache.get(category) === mine) postsCache.delete(category);
		});
	}
	/** @type {Map<string, DbPostObject>} */
	const out = new Map();
	// Objetos nuevos en cada llamada (como antes: quien llama los puede tocar sin cambiar lo
	// recordado), armados de las filas tal como vinieron de la base.
	for (const r of await entry.rows) {
		const e = asPostObject(category, rowToObject(r), r.legacy_slug ? String(r.legacy_slug) : null);
		out.set(e.urlSlug, e);
	}
	return out;
}

/** @param {string} alias */
const prefixed = (alias) =>
	OBJECT_COLUMNS.split(', ')
		.map((c) => `${alias}.${c}`)
		.join(', ');

/**
 * Lo que leyó {@link allDbPostObjects} por categoría, mientras la base no cambie (como las listas
 * públicas en ./posts.js): las páginas del panel piden todos los eventos en cada pedido (la lista,
 * el inicio, el editor, la agenda) y leerlos es traer el `data` (con el texto) de cada uno.
 * Se guardan las filas (texto y números, sin objetos compartidos).
 * @type {Map<string, { stamp: string, rows: Promise<Record<string, unknown>[]> }>}
 */
const postsCache = new Map();

/** Olvida lo recordado (tests). */
export function clearDbPostCache() {
	postsCache.clear();
}

/**
 * Cuántos posts de la categoría hay y cuándo cambió el último (saveObject() pone `updated_at` en
 * cada guardado), el último guardado del historial (cada guardado del panel y cada importación
 * escribe uno en `object_revisions`) y lo mismo de las importaciones: si nada de eso cambió, lo
 * leído sigue valiendo. Una fila, solo con índices (sin leer el `data` de ningún objeto).
 *
 * @param {D1Database} db
 * @param {string} type
 * @param {string} category
 * @returns {Promise<string>}
 */
function postsStamp(db, type, category) {
	// Dos lecturas a la par en el MISMO pedido (el Inicio pide los eventos y las entradas a la vez)
	// comparten la consulta: es la misma respuesta. Solo dentro del pedido: un pedido que acaba de
	// guardar nunca recibe la respuesta de una consulta que salió antes que su guardado.
	const request = currentRequest();
	if (!request) return readPostsStamp(db, type, category);
	const pending = stampsInFlight.get(request) ?? new Map();
	stampsInFlight.set(request, pending);
	const key = `${type}\n${category}`;
	const running = pending.get(key);
	if (running) return running;
	const mine = readPostsStamp(db, type, category);
	pending.set(key, mine);
	const forget = () => {
		if (pending.get(key) === mine) pending.delete(key);
	};
	mine.then(forget, forget);
	return mine;
}

/**
 * Las consultas de {@link postsStamp} que están en camino, por pedido.
 * @type {WeakMap<object, Map<string, Promise<string>>>}
 */
const stampsInFlight = new WeakMap();

/** El pedido en curso, o `null` fuera de un pedido (scripts, tests, crons). */
function currentRequest() {
	try {
		return getRequestEvent();
	} catch {
		return null;
	}
}

/**
 * @param {D1Database} db
 * @param {string} type
 * @param {string} category
 */
async function readPostsStamp(db, type, category) {
	const row = await db
		.prepare(
			`SELECT (SELECT count(*) FROM objects WHERE type = ?1) AS n,
				(SELECT max(updated_at) FROM objects WHERE type = ?1) AS u,
				(SELECT max(id) FROM object_revisions) AS v,
				(SELECT count(*) FROM content_sources WHERE category = ?2) AS sn,
				(SELECT max(updated_at) FROM content_sources WHERE category = ?2) AS su,
				(SELECT max(updated_at) FROM objects WHERE type = 'perfil') AS pu,
				(SELECT max(updated_at) FROM objects WHERE type = 'etiqueta') AS tu`
		)
		.bind(type, category)
		.first();
	// `pu`: la dirección de los perfiles de las personas (edges, ./personasEdges.js); `tu`: el `key`
	// de las etiquetas (edges, ./etiquetasEdges.js).
	return `${row?.n}:${row?.u}:${row?.v}:${row?.sn}:${row?.su}:${row?.pu}:${row?.tu}`;
}

/**
 * @param {D1Database} db
 * @param {string} type
 * @param {string} category
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function readDbPostRows(db, type, category) {
	// Panel (solo admins): ve todo, también lo oculto y lo borrado.
	const { results } = await db
		.prepare(
			`SELECT ${prefixed('o')}, s.legacy_slug FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
			WHERE o.type = ?1`
		)
		.bind(type, category)
		.all();
	// Con las listas de personas y de etiquetas enteras (los perfiles y las etiquetas son edges:
	// ./relaciones.js), en una consulta para todos. Guardar un edge pasa por saveObject(), que
	// cambia `updated_at`: la marca de arriba lo nota.
	const linked = await contentEdgesOf(
		db,
		results.map((r) => Number(r.id))
	);
	if (!linked.size) return results;
	return results.map((r) => {
		const edges = linked.get(Number(r.id));
		if (!edges) return r;
		let data;
		try {
			data = JSON.parse(String(r.data));
		} catch {
			return r;
		}
		return { ...r, data: JSON.stringify(withContentEdges(String(r.type), data, edges)) };
	});
}

/**
 * Buscar en lo que dio {@link allDbPostObjects} como lo hace {@link findDbPostObject} (sin
 * consultar de nuevo): primero la dirección vieja de un .md importado, después la del objeto.
 *
 * @param {Map<string, DbPostObject>} posts
 * @returns {(slug: string) => DbPostObject | null}
 */
export function dbPostFinder(posts) {
	/** @type {Map<string, DbPostObject>} */
	const byLegacy = new Map();
	/** @type {Map<string, DbPostObject>} */
	const byObjectSlug = new Map();
	for (const e of posts.values()) {
		if (e.legacySlug !== null && !byLegacy.has(e.legacySlug)) byLegacy.set(e.legacySlug, e);
		if (!byObjectSlug.has(e.object.slug)) byObjectSlug.set(e.object.slug, e);
	}
	return (slug) => byLegacy.get(slug) ?? byObjectSlug.get(slug) ?? null;
}

/**
 * Todos los posts de una categoría en la base (también ocultos y borrados) por dirección, con su
 * texto y su sha (para listar la carpeta en el editor o descargarlos). Para listas y metadata,
 * {@link allDbPostObjects}, que no arma los textos.
 *
 * @param {D1Database} db
 * @param {string} category
 * @returns {Promise<Map<string, DbPostFile>>}
 */
export async function allDbPosts(db, category) {
	/** @type {Map<string, DbPostFile>} */
	const out = new Map();
	for (const [urlSlug, e] of await allDbPostObjects(db, category)) {
		out.set(urlSlug, await asFile(category, e.object, urlSlug));
	}
	return out;
}

/** @param {D1Database} db */
export const allDbEvents = (db) => allDbPosts(db, EVENT_CATEGORY);

/** Los eventos de la base sin su texto (ver {@link allDbPostObjects}). @param {D1Database} db */
export const allDbEventObjects = (db) => allDbPostObjects(db, EVENT_CATEGORY);

/**
 * @typedef {{
 *   path: string, category: string, slug: string, existing: DbPostFile | null, remove: boolean,
 *   title?: string, data?: Record<string, unknown>, visibility?: 'public' | 'hidden',
 *   edges?: Record<string, import('$lib/server/objects/edges.js').EdgeInput[]>
 * }} PlannedWrite
 */

/**
 * Por dirección del .md, las etiquetas que cada post de la base (sin borrar) de esa carpeta nombra
 * por edge: esas cambian solas al renombrar la etiqueta y no se reescriben (etiquetas/rename.js).
 * Las carpetas que no son de la base, vacío.
 *
 * @param {string} dir
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function linkedTagsInDir(dir) {
	const clean = dir.replace(/\/+$/, '');
	const category = Object.keys(CONTENT_CATEGORIES).find((c) => dirOf(c) === clean);
	const db = category ? activeContentDB() : null;
	/** @type {Map<string, Set<string>>} */
	const out = new Map();
	if (!db || !category) return out;
	const posts = [...(await allDbPostObjects(db, category))].filter(([, e]) => !e.deleted);
	const linked = await linkedTagKeysOf(
		db,
		posts.map(([, e]) => Number(e.object.id))
	);
	for (const [slug, e] of posts) {
		const keys = linked.get(Number(e.object.id));
		if (keys) out.set(`${dirOf(category)}/${slug}.md`, keys);
	}
	return out;
}

/**
 * Envuelve un cliente del repo (GitHub, el mock de `dev:admin` o el modo demo): los .md de eventos
 * y material se leen y se guardan en la base; todo lo demás va al cliente, sin cambios.
 *
 * @template {Record<string, any>} C
 * @param {C} base
 * @returns {C}
 */
export function withContentDb(base) {
	/**
	 * @param {string} path
	 * @returns {Promise<DbPostFile | null>}
	 */
	async function postAt(path) {
		const p = postOfPath(path);
		const db = p ? activeContentDB() : null;
		return db && p ? findDbPost(db, p.category, p.slug) : null;
	}

	/**
	 * ¿La base tiene un post en esa ruta (también borrado)? Sin armar su texto.
	 * @param {string} path
	 */
	async function hasPostAt(path) {
		const p = postOfPath(path);
		const db = p ? activeContentDB() : null;
		return db && p ? (await findDbPostObject(db, p.category, p.slug)) !== null : false;
	}

	/** La categoría cuya carpeta es `dir` (sin la barra final), o null. @param {string} dir */
	const categoryOfDir = (dir) => {
		const clean = dir.replace(/\/+$/, '');
		return Object.keys(CONTENT_CATEGORIES).find((c) => dirOf(c) === clean) ?? null;
	};

	return {
		...base,

		/** @param {string} token @param {string} path */
		async getFile(token, path) {
			if (!postOfPath(path)) return base.getFile(token, path);
			const e = await postAt(path);
			return e && !e.deleted ? e.raw : null;
		},

		/** @param {string} token @param {string} path */
		async readFile(token, path) {
			if (!postOfPath(path)) return base.readFile ? base.readFile(token, path) : null;
			const e = await postAt(path);
			return e && !e.deleted ? { raw: e.raw, sha: e.sha, ref: 'base' } : null;
		},

		/** @param {string} token @param {string} path @param {...any} rest */
		async pathExists(token, path, ...rest) {
			// Un post borrado en la base sigue ocupando su dirección (se puede deshacer). El .md que
			// sigue en el repo como respaldo, también: su dirección no se reusa.
			if (await hasPostAt(path)) return true;
			return base.pathExists(token, path, ...rest);
		},

		/** @param {string} token @param {string[]} paths @param {...any} rest */
		async existingPaths(token, paths, ...rest) {
			const found = new Set(await base.existingPaths(token, paths, ...rest));
			for (const p of paths) if (!found.has(p) && (await hasPostAt(p))) found.add(p);
			return paths.filter((p) => found.has(p));
		},

		/**
		 * La carpeta de una categoría: sus posts son los de la base (los borrados no); de lo que
		 * hay en el repo quedan solo los archivos que no son posts (plantillas, carpetas de medios).
		 * @param {string} token @param {string} path @param {any} [opts]
		 */
		async listTree(token, path, opts) {
			const list = await base.listTree(token, path, opts);
			const category = categoryOfDir(path);
			if (!category) return list;
			const db = activeContentDB();
			const out = list.filter(
				(/** @type {{ path: string }} */ f) => postOfPath(f.path)?.category !== category
			);
			if (!db) return out;
			for (const [slug, e] of await allDbPosts(db, category)) {
				if (!e.deleted)
					out.push({ path: `${dirOf(category)}/${slug}.md`, sha: e.sha, type: 'blob' });
			}
			return out;
		},

		/**
		 * Los textos de la carpeta de una categoría: los de la base (y lo que no es un post).
		 * @param {string} token @param {string} dir
		 */
		async getDirTexts(token, dir) {
			const category = categoryOfDir(dir);
			if (!category) return base.getDirTexts(token, dir);
			const list = await base.getDirTexts(token, dir);
			const db = activeContentDB();
			/** @type {Array<{ path: string, sha: string, text: string }>} */
			const out = list.filter(
				(/** @type {{ path: string }} */ f) => postOfPath(f.path)?.category !== category
			);
			if (!db) return out;
			for (const [slug, e] of await allDbPosts(db, category)) {
				if (!e.deleted)
					out.push({ path: `${dirOf(category)}/${slug}.md`, sha: e.sha, text: e.raw });
			}
			return out;
		},

		/**
		 * Las etiquetas que los posts de la base de esa carpeta nombran por edge, por dirección.
		 * @param {string} _token @param {string} dir
		 */
		linkedTagsOf: (_token, dir) => linkedTagsInDir(dir),

		/**
		 * @param {string} token
		 * @param {{ files: import('$lib/server/eventos/github.js').CommitFile[], message: string, mustNotExist?: string[], unchanged?: Array<{path: string, sha: string}>, pr?: any, actor?: string, superadmin?: boolean, edges?: Record<string, Record<string, import('$lib/server/objects/edges.js').EdgeInput[]>> }} opts
		 *   `actor`/`superadmin`: solo fuera de un pedido del panel (pruebas); en el panel, ./author.js.
		 *   `edges`: por ruta, relaciones del post que cambian en el mismo guardado (por ejemplo la
		 *   imagen, `{ portada: [id] }`; docs/imagenes.md). Solo para posts de la base.
		 */
		async commitFiles(token, opts) {
			const { files, mustNotExist = [], unchanged = [] } = opts;
			const isPost = (/** @type {string} */ path) => postOfPath(path) !== null;
			if (!files.some((f) => isPost(f.path))) return base.commitFiles(token, opts);
			const db = activeContentDB();
			if (!db) throw new NoContentDbError();
			// Quién guarda: el login de GitHub de le admin de este pedido (./author.js); nunca el
			// nombre que se muestra (`pr.who`).
			const author = panelAuthor();
			const actor = String(author?.login || opts.actor || 'panel');
			const superadmin = author ? author.superadmin : opts.superadmin === true;

			// Todo .md de evento o material va a la base (nunca al repo).
			/** @type {PlannedWrite[]} */
			const writes = [];
			for (const f of files) {
				const p = postOfPath(f.path);
				if (!p) continue;
				const existing = await findDbPost(db, p.category, p.slug);
				if (f.delete) {
					// Borrar lo que la base no tiene: no hay nada que borrar.
					if (existing) writes.push({ path: f.path, ...p, existing, remove: true });
					continue;
				}
				if (f.content === undefined) {
					throw new Error(`No se puede guardar ${f.path} en la base: falta su texto.`);
				}
				const mapped = markdownToPost(p.category, p.slug, f.content);
				if (mapped.error && !existing) throw new Error(mapped.error);
				const def = /** @type {import('$lib/server/objects/types/index.js').CoreType} */ (
					coreTypes.get(CONTENT_CATEGORIES[p.category].type)
				);
				// `body_html` lo decide el guardado (bodyHtmlFor), no el texto.
				const fromText = { ...mapped.data };
				delete fromText.body_html;
				const valid = validateData(def, {
					...fromText,
					...bodyHtmlFor(existing, fromText.body, superadmin)
				});
				if (!valid.ok) {
					throw new Error(`Revisá los datos: ${valid.errors.map((e) => e.message).join('; ')}`);
				}
				writes.push({
					path: f.path,
					...p,
					existing,
					remove: false,
					title: mapped.title,
					data: valid.data,
					visibility: mapped.visibility,
					...(opts.edges?.[f.path] ? { edges: opts.edges[f.path] } : {})
				});
			}

			// Los mismos controles que un commit: lo que no tiene que existir y lo que no tiene que
			// haber cambiado desde que se leyó.
			for (const p of mustNotExist) {
				if (!isPost(p)) continue;
				const w = writes.find((x) => x.path === p);
				// Uno borrado (suave) no cuenta: volver a crearlo es deshacer el borrado (también
				// «Deshacer» de Borrar, que pide que no exista).
				if (w?.existing && !w.existing.deleted) throw new PathExistsError(p);
			}
			for (const u of unchanged) {
				if (!isPost(u.path)) continue;
				const w = writes.find((x) => x.path === u.path);
				const sha = w ? w.existing?.sha : (await postAt(u.path))?.sha;
				if (sha !== undefined && sha !== u.sha) throw new FileChangedError(u.path);
			}

			// Primero el repo (si algo falla ahí, la base no se toca), después la base.
			const rest = files.filter((f) => !isPost(f.path));
			const commit = rest.length
				? await base.commitFiles(token, {
						...opts,
						files: rest,
						mustNotExist: mustNotExist.filter((p) => !isPost(p)),
						unchanged: unchanged.filter((u) => !isPost(u.path))
					})
				: null;

			/** @type {string[]} */
			const saved = [];
			for (const w of writes) {
				try {
					await writePost(db, w, actor);
				} catch (error) {
					if (error instanceof VersionConflictError) throw new FileChangedError(w.path);
					if (error instanceof ObjectError) {
						const details = error.errors.map((e) => e.message).join(' ');
						throw new Error(details ? `${error.message} ${details}` : error.message);
					}
					throw error;
				}
				saved.push(`${w.category}/${w.slug}`);
			}
			const first = saved[0];
			return {
				...(commit ?? { sha: 'base', url: first ? `/${first}` : '/' }),
				db: saved
			};
		}
	};
}

/**
 * Cómo se muestra el texto que se guarda (decisión 0004, ver ./render.js): si el texto no cambió,
 * como estaba (la agenda, las etiquetas o borrar no lo tocan); si cambió, HTML libre si lo guarda
 * une superadmin y la lista corta si no.
 *
 * @param {DbPostFile | null} existing
 * @param {unknown} body el texto nuevo
 * @param {boolean} superadmin
 * @returns {{ body_html?: 'libre' | 'corta' }}
 */
export function bodyHtmlFor(existing, body, superadmin) {
	const text = normalizeBody(String(body ?? ''));
	if (!text) return {};
	const before = existing?.object.data;
	if (before && normalizeBody(String(before.body ?? '')) === text) {
		const kept = before.body_html;
		return kept === 'libre' || kept === 'corta' ? { body_html: kept } : { body_html: 'corta' };
	}
	return { body_html: superadmin ? 'libre' : 'corta' };
}

/**
 * Guarda un archivo en la base (con el historial en la misma tanda).
 *
 * @param {D1Database} db
 * @param {PlannedWrite} w
 * @param {string} actor
 */
async function writePost(db, w, actor) {
	const type = CONTENT_CATEGORIES[w.category].type;
	const also = (/** @type {import('$lib/server/objects/save.js').SavedRef} */ self) => [
		revisionStatement(db, self, 'panel')
	];
	if (w.remove) {
		const e = /** @type {DbPostFile} */ (w.existing);
		if (e.deleted) return e.object;
		return saveObject(
			db,
			{ id: e.object.id, type, version: e.object.version, deleted: true },
			{ actor, also }
		);
	}
	// Los perfiles de `personas` y las etiquetas van como edges, no en `data` (./relaciones.js).
	const { data, edges } = await dehydrateContent(
		db,
		w.category,
		/** @type {Record<string, unknown>} */ (w.data)
	);
	if (w.existing) {
		return saveObject(
			db,
			{
				id: w.existing.object.id,
				type,
				version: w.existing.object.version,
				title: w.title,
				data,
				// Los edges `persona` (de `personas`) y los que manda quien guarda (la `portada`).
				edges: { ...edges, ...w.edges },
				visibility: w.visibility,
				// Volver a crear un post borrado es deshacer el borrado.
				...(w.existing.deleted ? { deleted: false } : {})
			},
			{ actor, also }
		);
	}
	return saveObject(
		db,
		{
			type,
			slug: w.slug,
			title: w.title,
			data,
			edges: { ...edges, ...w.edges },
			visibility: w.visibility
		},
		{ actor, also }
	);
}

/**
 * Lo que la base dice de un post para quien lo vende o lo muestra en el panel (la configuración
 * de entradas, el título, la fecha): la metadata como la de un .md, `null` si la base lo tiene
 * oculto o borrado (no se vende), o `undefined` si la base no lo tiene (tampoco existe).
 *
 * @param {DbPostObject | null | undefined} e
 * @returns {Record<string, any> | null | undefined}
 */
function publicMetaOf(e) {
	if (!e) return undefined;
	if (e.deleted || e.object.visibility !== 'public') return null;
	return CONTENT_CATEGORIES[e.category].toMeta(e.object);
}

/**
 * {@link publicMetaOf} de un evento; `undefined` también sin base.
 *
 * @param {string} slug
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
export async function dbEventMeta(slug) {
	const db = activeContentDB();
	if (!db) return undefined;
	return publicMetaOf(await findDbPostObject(db, EVENT_CATEGORY, slug));
}

/**
 * Lo mismo para todos los eventos de la base de una vez (una consulta), por dirección; `null` sin
 * base.
 *
 * @returns {Promise<Map<string, Record<string, any> | null> | null>}
 */
export async function dbEventMetas() {
	const db = activeContentDB();
	if (!db) return null;
	/** @type {Map<string, Record<string, any> | null>} */
	const out = new Map();
	for (const [slug, e] of await allDbEventObjects(db)) out.set(slug, publicMetaOf(e) ?? null);
	return out;
}

/**
 * El texto de un post de la base para el editor (con el sha para guardar contra él); `null` si la
 * base no lo tiene (o no hay base); `{ deleted: true }` si está borrado.
 *
 * @param {string} path
 * @returns {Promise<{ raw: string, sha: string } | { deleted: true } | null>}
 */
export async function readDbPostFile(path) {
	const p = postOfPath(path);
	const db = p ? activeContentDB() : null;
	if (!db || !p) return null;
	const e = await findDbPost(db, p.category, p.slug);
	if (!e) return null;
	return e.deleted ? { deleted: true } : { raw: e.raw, sha: e.sha };
}

/** Lo mismo (nombre de la primera versión, solo eventos). */
export const readDbEventFile = readDbPostFile;

/** Un cambio que tocaría algo que no es un post de la base (amigues, la wiki, imágenes…). */
export class NotInContentDbError extends Error {
	/** @param {string} path */
	constructor(path) {
		super(`${path} no está en la base: este cambio solo puede tocar eventos y material.`);
		this.name = 'NotInContentDbError';
		this.path = path;
	}
}

/**
 * Un cliente del repo que solo ve y solo escribe los posts de la base (eventos y material), para
 * lo que tiene que quedarse en la base sí o sí (Eventos → Series: renombrar una serie reescribe
 * sus ediciones). Nunca llama a GitHub:
 * - `getDirTexts` arma la carpeta de una categoría de la base desde la base (sin leer el repo);
 *   las demás carpetas (amigues, la wiki) quedan vacías;
 * - `getFile` solo lee posts de la base;
 * - `commitFiles` tira {@link NotInContentDbError} si algún archivo no es un post de la base; si
 *   todos lo son, guarda por `client` (envuelto con {@link withContentDb}: va solo a la base).
 *
 * @param {{ getFile: Function, commitFiles: Function }} client lo de getRepoClient()
 */
export function dbPostsOnlyClient(client) {
	return {
		/** @param {string} token @param {string} dir */
		async getDirTexts(token, dir) {
			const clean = dir.replace(/\/+$/, '');
			const category = Object.keys(CONTENT_CATEGORIES).find((c) => dirOf(c) === clean);
			const db = category ? activeContentDB() : null;
			if (!db || !category) return [];
			/** @type {Array<{ path: string, sha: string, text: string }>} */
			const out = [];
			for (const [slug, e] of await allDbPosts(db, category)) {
				if (!e.deleted)
					out.push({ path: `${dirOf(category)}/${slug}.md`, sha: e.sha, text: e.raw });
			}
			return out;
		},

		/** @param {string} _token @param {string} dir */
		linkedTagsOf: (_token, dir) => linkedTagsInDir(dir),

		/** @param {string} token @param {string} path */
		async getFile(token, path) {
			return postOfPath(path) ? client.getFile(token, path) : null;
		},

		/**
		 * @param {string} token
		 * @param {{ files: import('$lib/server/eventos/github.js').CommitFile[], message: string } & Record<string, any>} opts
		 */
		async commitFiles(token, opts) {
			const outside = opts.files.find((f) => !postOfPath(f.path));
			if (outside) throw new NotInContentDbError(outside.path);
			return client.commitFiles(token, opts);
		}
	};
}

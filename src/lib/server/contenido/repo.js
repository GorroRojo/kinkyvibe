/**
 * Guardar eventos en la base desde el panel, sin cambiar las pantallas (interruptor `contenido_db`).
 *
 * Todo lo que el panel escribe pasa por un solo cliente del repo (`getRepoClient()`,
 * docs/publicar-contenido.md): el editor, cargar y duplicar eventos, la agenda, importar la
 * planilla, borrar, las etiquetas, las imágenes compartidas. {@link withContentDb} envuelve ese
 * cliente como lo hace el modo demo: con el interruptor prendido, el .md de un evento que está en
 * la base (o uno nuevo) se lee y se guarda en la base; todo lo demás (imágenes, el archivo de
 * etiquetas, material, los .md que la base no tiene) sigue yendo al repo como siempre.
 *
 * - **Leer**: el texto del evento se arma desde el objeto ({@link eventToMarkdown}), con un
 *   «sha» que es el de ese texto: si alguien guarda en el medio, el texto cambia y el próximo
 *   guardado con el sha viejo da `FileChangedError`, como con GitHub.
 * - **Guardar**: cada archivo de evento va con saveObject() (versión nueva cada vez, con el número
 *   de versión que se leyó; el historial queda en `object_revisions`), después del commit al repo
 *   de lo que no es de la base (si eso falla, la base no se toca). Se valida todo antes de
 *   escribir nada.
 * - **Borrar** un archivo de evento es el borrado suave del objeto; volver a crearlo, deshacerlo.
 * - Los eventos que la base no tiene y ya existen como .md siguen yendo al .md (lo que sale en el
 *   sitio para esa dirección es el .md).
 *
 * La base de este isolate la registra hooks.server.js en cada pedido ({@link setContentDB}), igual
 * que el modo demo: así el cliente sirve para cualquiera que llame a getRepoClient().
 */
import { FileChangedError, PathExistsError } from '$lib/server/eventos/github.js';
import { POSTS_DIR } from '$lib/server/eventos/images.js';
import { gitBlobSha } from '$lib/server/admin/posts.js';
import { isFlagOn } from '$lib/server/flags.js';
import { ObjectError, VersionConflictError } from '$lib/server/objects/errors.js';
import { getObject, OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { saveObject } from '$lib/server/objects/save.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { EVENT_CATEGORY, EVENT_TYPE, eventToMeta, normalizeBody } from './eventos.js';
import { panelAuthor } from './author.js';
import { eventToMarkdown, markdownToEvent } from './markdown.js';
import { revisionStatement } from './revisions.js';
import { resolveEventSlug } from './posts.js';

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

/** La base, si el interruptor `contenido_db` está prendido; si no, `null`. */
export async function activeContentDB() {
	if (!current) return null;
	return (await isFlagOn(current, 'contenido_db')) ? current : null;
}

/** Quién mira desde el panel: lo ve todo (también lo oculto y lo borrado, para no pisarlo). */
const PANEL = /** @type {const} */ ({ role: 'admin', id: 'panel' });

const EVENT_FILE = /^src\/lib\/posts\/calendario\/([^/_][^/]*)\.md$/;

/**
 * La dirección del evento de una ruta del repo (`src/lib/posts/calendario/<slug>.md`), o null.
 * @param {string} path
 */
export function eventSlugOfPath(path) {
	return EVENT_FILE.exec(path)?.[1] ?? null;
}

/**
 * @typedef {{ object: StoredObject, urlSlug: string, raw: string, sha: string, deleted: boolean }} DbEventFile
 */

/**
 * @param {StoredObject} object
 * @param {string} urlSlug
 * @returns {Promise<DbEventFile>}
 */
async function asFile(object, urlSlug) {
	const raw = eventToMarkdown(object);
	return { object, urlSlug, raw, sha: await gitBlobSha(raw), deleted: object.deleted_at !== null };
}

/**
 * El evento de la base en esa dirección (vieja o del objeto), también oculto o borrado, o null.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<DbEventFile | null>}
 */
export async function findDbEvent(db, slug) {
	const ref = await resolveEventSlug(db, slug);
	if (!ref) return null;
	const object = await getObject(db, { id: ref.id }, PANEL, { includeDeleted: true });
	return object ? asFile(object, ref.legacySlug ?? object.slug) : null;
}

/**
 * Todos los eventos de la base (también ocultos y borrados) por dirección, para el panel.
 *
 * @param {D1Database} db
 * @returns {Promise<Map<string, DbEventFile>>}
 */
export async function allDbEvents(db) {
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c}`)
		.join(', ');
	// Panel (solo admins): ve todo, también lo oculto y lo borrado.
	const { results } = await db
		.prepare(
			`SELECT ${cols}, s.legacy_slug FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
			WHERE o.type = ?1`
		)
		.bind(EVENT_TYPE, EVENT_CATEGORY)
		.all();
	/** @type {Map<string, DbEventFile>} */
	const out = new Map();
	for (const r of results) {
		const object = rowToObject(r);
		const urlSlug = r.legacy_slug ? String(r.legacy_slug) : object.slug;
		out.set(urlSlug, await asFile(object, urlSlug));
	}
	return out;
}

/** @param {string} slug */
const pathOf = (slug) => `${POSTS_DIR}/${slug}.md`;

/**
 * @typedef {{
 *   path: string, slug: string, existing: DbEventFile | null, remove: boolean,
 *   title?: string, data?: Record<string, unknown>, visibility?: 'public' | 'hidden'
 * }} PlannedWrite
 */

/**
 * Envuelve un cliente del repo (GitHub, el mock de `dev:admin` o el modo demo). Con el interruptor
 * apagado o sin base, cada función es la del cliente, sin cambios.
 *
 * @template {Record<string, any>} C
 * @param {C} base
 * @returns {C}
 */
export function withContentDb(base) {
	/**
	 * @param {string} path
	 * @returns {Promise<DbEventFile | null>}
	 */
	async function eventAt(path) {
		const slug = eventSlugOfPath(path);
		if (!slug) return null;
		const db = await activeContentDB();
		return db ? findDbEvent(db, slug) : null;
	}

	return {
		...base,

		/** @param {string} token @param {string} path */
		async getFile(token, path) {
			const e = await eventAt(path);
			if (e) return e.deleted ? null : e.raw;
			return base.getFile(token, path);
		},

		/** @param {string} token @param {string} path */
		async readFile(token, path) {
			const e = await eventAt(path);
			if (e) return e.deleted ? null : { raw: e.raw, sha: e.sha, ref: 'base' };
			return base.readFile ? base.readFile(token, path) : null;
		},

		/** @param {string} token @param {string} path @param {...any} rest */
		async pathExists(token, path, ...rest) {
			// Un evento borrado en la base sigue ocupando su dirección (se puede deshacer).
			if (await eventAt(path)) return true;
			return base.pathExists(token, path, ...rest);
		},

		/** @param {string} token @param {string[]} paths @param {...any} rest */
		async existingPaths(token, paths, ...rest) {
			const found = new Set(await base.existingPaths(token, paths, ...rest));
			for (const p of paths) if (!found.has(p) && (await eventAt(p))) found.add(p);
			return paths.filter((p) => found.has(p));
		},

		/**
		 * La carpeta de eventos incluye los de la base (los borrados no).
		 * @param {string} token @param {string} path @param {any} [opts]
		 */
		async listTree(token, path, opts) {
			const list = await base.listTree(token, path, opts);
			const db = await activeContentDB();
			if (!db || path.replace(/\/+$/, '') !== POSTS_DIR) return list;
			const events = await allDbEvents(db);
			const out = list.filter(
				(/** @type {{ path: string }} */ f) => !events.get(eventSlugOfPath(f.path) ?? '')?.deleted
			);
			const have = new Set(out.map((/** @type {{ path: string }} */ f) => f.path));
			for (const [slug, e] of events) {
				const p = pathOf(slug);
				if (!e.deleted && !have.has(p)) out.push({ path: p, sha: e.sha, type: 'blob' });
			}
			return out;
		},

		/**
		 * Los textos de la carpeta de eventos, con los de la base en lugar de sus .md.
		 * @param {string} token @param {string} dir
		 */
		async getDirTexts(token, dir) {
			const list = await base.getDirTexts(token, dir);
			const db = await activeContentDB();
			if (!db || dir.replace(/\/+$/, '') !== POSTS_DIR) return list;
			const events = await allDbEvents(db);
			/** @type {Array<{ path: string, sha: string, text: string }>} */
			const out = [];
			const seen = new Set();
			for (const f of list) {
				const e = events.get(eventSlugOfPath(f.path) ?? '');
				seen.add(f.path);
				if (!e) out.push(f);
				else if (!e.deleted) out.push({ path: f.path, sha: e.sha, text: e.raw });
			}
			for (const [slug, e] of events) {
				const p = pathOf(slug);
				if (!e.deleted && !seen.has(p)) out.push({ path: p, sha: e.sha, text: e.raw });
			}
			return out;
		},

		/**
		 * @param {string} token
		 * @param {{ files: import('$lib/server/eventos/github.js').CommitFile[], message: string, mustNotExist?: string[], unchanged?: Array<{path: string, sha: string}>, pr?: any, actor?: string, superadmin?: boolean }} opts
		 *   `actor`/`superadmin`: solo fuera de un pedido del panel (pruebas); en el panel, ./author.js
		 */
		async commitFiles(token, opts) {
			const db = await activeContentDB();
			if (!db) return base.commitFiles(token, opts);
			const { files, mustNotExist = [], unchanged = [] } = opts;
			// Quién guarda: el login de GitHub de le admin de este pedido (./author.js); nunca el
			// nombre que se muestra (`pr.who`).
			const author = panelAuthor();
			const actor = String(author?.login || opts.actor || 'panel');
			const superadmin = author ? author.superadmin : opts.superadmin === true;

			// Qué archivos de evento van a la base: los que la base tiene, y los nuevos.
			/** @type {PlannedWrite[]} */
			const writes = [];
			/** @type {Set<string>} */
			const toDb = new Set();
			for (const f of files) {
				const slug = eventSlugOfPath(f.path);
				if (!slug) continue;
				const existing = await findDbEvent(db, slug);
				if (!existing && (await base.pathExists(token, f.path))) continue; // solo .md: al repo
				if (!existing && f.delete) continue;
				toDb.add(f.path);
				if (f.delete) {
					writes.push({ path: f.path, slug, existing, remove: true });
					continue;
				}
				if (f.content === undefined) {
					throw new Error(`No se puede copiar ${f.path} a la base: falta su texto.`);
				}
				const mapped = markdownToEvent(slug, f.content);
				const def = /** @type {import('$lib/server/objects/types/index.js').CoreType} */ (
					coreTypes.get(EVENT_TYPE)
				);
				// `body_html` lo decide el guardado (bodyHtmlFor), no el texto.
				const fromText = { ...mapped.data };
				delete fromText.body_html;
				const valid = validateData(def, {
					...fromText,
					...bodyHtmlFor(existing, fromText.body, superadmin)
				});
				if (!valid.ok) {
					throw new Error(`Revisá el evento: ${valid.errors.map((e) => e.message).join('; ')}`);
				}
				writes.push({
					path: f.path,
					slug,
					existing,
					remove: false,
					title: mapped.title,
					data: valid.data,
					visibility: mapped.visibility
				});
			}
			if (!writes.length) return base.commitFiles(token, opts);

			// Los mismos controles que un commit: lo que no tiene que existir y lo que no tiene que
			// haber cambiado desde que se leyó.
			for (const p of mustNotExist) {
				if (!toDb.has(p)) continue;
				const w = writes.find((x) => x.path === p);
				// Uno borrado (suave) no cuenta: volver a crearlo es deshacer el borrado (también
				// «Deshacer» de Borrar, que pide que no exista).
				if (w?.existing && !w.existing.deleted) throw new PathExistsError(p);
			}
			for (const u of unchanged) {
				if (!toDb.has(u.path)) continue;
				const w = writes.find((x) => x.path === u.path);
				if (w?.existing && w.existing.sha !== u.sha) throw new FileChangedError(u.path);
			}

			// Primero el repo (si algo falla ahí, la base no se toca), después la base.
			const rest = files.filter((f) => !toDb.has(f.path));
			const commit = rest.length
				? await base.commitFiles(token, {
						...opts,
						files: rest,
						mustNotExist: mustNotExist.filter((p) => !toDb.has(p)),
						unchanged: unchanged.filter((u) => !toDb.has(u.path))
					})
				: null;

			/** @type {string[]} */
			const saved = [];
			for (const w of writes) {
				try {
					await writeEvent(db, w, actor);
				} catch (error) {
					if (error instanceof VersionConflictError) throw new FileChangedError(w.path);
					if (error instanceof ObjectError) {
						const details = error.errors.map((e) => e.message).join(' ');
						throw new Error(details ? `${error.message} ${details}` : error.message);
					}
					throw error;
				}
				saved.push(w.slug);
			}
			const first = saved[0];
			return {
				...(commit ?? { sha: 'base', url: first ? `/calendario/${first}` : '/calendario' }),
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
 * @param {DbEventFile | null} existing
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
 * Guarda un archivo de evento en la base (con el historial en la misma tanda).
 *
 * @param {D1Database} db
 * @param {PlannedWrite} w
 * @param {string} actor
 */
async function writeEvent(db, w, actor) {
	const also = (/** @type {import('$lib/server/objects/save.js').SavedRef} */ self) => [
		revisionStatement(db, self, 'panel')
	];
	if (w.remove) {
		const e = /** @type {DbEventFile} */ (w.existing);
		if (e.deleted) return e.object;
		return saveObject(
			db,
			{ id: e.object.id, type: EVENT_TYPE, version: e.object.version, deleted: true },
			{ actor, also }
		);
	}
	if (w.existing) {
		return saveObject(
			db,
			{
				id: w.existing.object.id,
				type: EVENT_TYPE,
				version: w.existing.object.version,
				title: w.title,
				data: w.data,
				visibility: w.visibility,
				// Volver a crear un evento borrado es deshacer el borrado.
				...(w.existing.deleted ? { deleted: false } : {})
			},
			{ actor, also }
		);
	}
	return saveObject(
		db,
		{ type: EVENT_TYPE, slug: w.slug, title: w.title, data: w.data, visibility: w.visibility },
		{ actor, also }
	);
}

/**
 * Lo que la base dice de un evento para quien lo vende o lo muestra en el panel (la
 * configuración de entradas, el título, la fecha): la metadata como la de un .md (`eventToMeta`),
 * `null` si la base lo tiene oculto o borrado (no se vende: «la base decide»), o `undefined` si la
 * base no lo tiene: entonces vale el .md.
 *
 * @param {DbEventFile | null | undefined} e
 * @returns {Record<string, any> | null | undefined}
 */
function publicMetaOf(e) {
	if (!e) return undefined;
	if (e.deleted || e.object.visibility !== 'public') return null;
	return eventToMeta(e.object);
}

/**
 * {@link publicMetaOf} de un evento; `undefined` también con el interruptor apagado.
 *
 * @param {string} slug
 * @returns {Promise<Record<string, any> | null | undefined>}
 */
export async function dbEventMeta(slug) {
	const db = await activeContentDB();
	if (!db) return undefined;
	return publicMetaOf(await findDbEvent(db, slug));
}

/**
 * Lo mismo para todos los eventos de la base de una vez (una consulta), por dirección; `null` con
 * el interruptor apagado.
 *
 * @returns {Promise<Map<string, Record<string, any> | null> | null>}
 */
export async function dbEventMetas() {
	const db = await activeContentDB();
	if (!db) return null;
	/** @type {Map<string, Record<string, any> | null>} */
	const out = new Map();
	for (const [slug, e] of await allDbEvents(db)) out.set(slug, publicMetaOf(e) ?? null);
	return out;
}

/**
 * El texto de un evento de la base para el editor (con el sha para guardar contra él); `null` si
 * la base no lo tiene o el interruptor está apagado; `{ deleted: true }` si está borrado.
 *
 * @param {string} path
 * @returns {Promise<{ raw: string, sha: string } | { deleted: true } | null>}
 */
export async function readDbEventFile(path) {
	const slug = eventSlugOfPath(path);
	const db = slug ? await activeContentDB() : null;
	if (!db || !slug) return null;
	const e = await findDbEvent(db, slug);
	if (!e) return null;
	return e.deleted ? { deleted: true } : { raw: e.raw, sha: e.sha };
}

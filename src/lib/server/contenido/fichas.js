/**
 * Las fichas de amigues y las páginas de la wiki como archivos .md, leídos y guardados en la base
 * («solo base», paso 2: amigues y la wiki dejan de pasar por GitHub).
 *
 * - `src/lib/posts/amigues/<dirección>.md` es el perfil de la base con esa dirección (la vieja de
 *   una ficha importada, `profile_sources.legacy_slug`, o la del objeto), armado con
 *   `profileToMarkdown` (src/lib/server/amigues/markdown.js).
 * - `src/lib/posts/wiki/<dirección>.md` es la página de la wiki de la etiqueta cuya dirección es esa
 *   (`tagSlug(key)`), armada con `wikiToMarkdown` (src/lib/server/etiquetas/wikiPages.js).
 *
 * El cliente del repo (./repo.js, `withContentDb`) usa este módulo para que lo que todavía trabaja
 * con el texto de un .md (renombrar etiquetas en todas las publicaciones, el editor de texto de
 * /edit/wiki/…) lea y guarde en la base, nunca en GitHub. Como con los eventos, el «sha» de un
 * archivo es el de su texto: si alguien guardó en el medio, el texto cambió y guardar con el sha
 * viejo da `FileChangedError`.
 *
 * Reglas:
 * - Un perfil que la base no tiene no existe (aunque su .md siga en el repo): se importa primero
 *   (Comunidad → Perfiles → Importar y clasificar). Un perfil nuevo se crea en el panel, no con un
 *   .md.
 * - Una página de la wiki es de una etiqueta que ya existe; guardarla no cambia la etiqueta (ni su
 *   nombre ni sus relaciones), solo su texto de la wiki. Borrarla le saca el texto.
 * - Todo se escribe con saveObject() (versión nueva, con su revisión en `object_revisions`).
 */
import { gitBlobSha } from '$lib/server/admin/posts.js';
import { getObject, OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { saveObject } from '$lib/server/objects/save.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { TAG_TYPE } from '$lib/server/objects/types/etiqueta.js';
import { mdToProfile } from '$lib/server/amigues/importer.js';
import { profileToMarkdown, profileToMeta } from '$lib/server/amigues/markdown.js';
import { resolveProfileSlug, urlSlugOf } from '$lib/server/amigues/profiles.js';
import {
	hasWikiPage,
	markdownToWiki,
	wikiBodyHtmlFor,
	wikiEntryOf,
	wikiToMarkdown,
	withWikiPage
} from '$lib/server/etiquetas/wikiPages.js';
import { clearTagSourceCache } from '$lib/server/etiquetas/source.js';
import { tagSlug } from '$lib/utils/tagSlug.js';
import { revisionStatement } from './revisions.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** Las categorías de .md que son fichas de la base (además de los eventos y el material). */
export const FICHA_CATEGORIES = Object.freeze(/** @type {const} */ (['amigues', 'wiki']));

/** @typedef {(typeof FICHA_CATEGORIES)[number]} FichaCategory */

const FICHA_FILE = /^src\/lib\/posts\/(amigues|wiki)\/([^/_][^/]*)\.md$/;

/** Les admins del panel: ven todo (también lo oculto y lo borrado, para no pisarlo). */
const PANEL = /** @type {const} */ ({ role: 'admin', id: 'panel' });

/**
 * La categoría y la dirección de una ficha (`src/lib/posts/{amigues,wiki}/<dirección>.md`), o null.
 *
 * @param {string} path
 * @returns {{ category: FichaCategory, slug: string } | null}
 */
export function fichaOfPath(path) {
	const m = FICHA_FILE.exec(path);
	return m ? { category: /** @type {FichaCategory} */ (m[1]), slug: m[2] } : null;
}

/** @param {FichaCategory} category */
export const fichaDir = (category) => `src/lib/posts/${category}`;

/**
 * La categoría de fichas cuya carpeta es `dir` (sin la barra final), o null.
 * @param {string} dir
 * @returns {FichaCategory | null}
 */
export function fichaCategoryOfDir(dir) {
	const clean = dir.replace(/\/+$/, '');
	return FICHA_CATEGORIES.find((c) => fichaDir(c) === clean) ?? null;
}

/**
 * @typedef {{
 *   category: FichaCategory, slug: string, object: StoredObject, raw: string, sha: string,
 *   deleted: boolean
 * }} FichaFile
 *   `deleted`: un perfil borrado (suave), o una etiqueta sin página de la wiki.
 */

/**
 * @param {FichaCategory} category
 * @param {StoredObject} object
 * @param {string} slug
 * @returns {Promise<FichaFile>}
 */
async function asFicha(category, object, slug) {
	const raw =
		category === 'amigues'
			? profileToMarkdown(object)
			: wikiToMarkdown(String(object.data.key), object.data);
	const deleted = object.deleted_at !== null || (category === 'wiki' && !hasWikiPage(object.data));
	return { category, object, slug, raw, sha: await gitBlobSha(raw), deleted };
}

/**
 * Las etiquetas vivas (también ocultas) con la dirección de su página.
 *
 * @param {D1Database} db
 * @returns {Promise<{ object: StoredObject, slug: string }[]>}
 */
async function liveTags(db) {
	const { results } = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS} FROM objects WHERE type = ?1 AND deleted_at IS NULL ORDER BY id`
		)
		.bind(TAG_TYPE)
		.all();
	return results
		.map((r) => rowToObject(r))
		.filter((o) => typeof o.data.key === 'string' && o.data.key)
		.map((object) => ({ object, slug: tagSlug(String(object.data.key)) }));
}

/**
 * La ficha en esa dirección (también oculta o borrada), o null si la base no la tiene.
 *
 * @param {D1Database} db
 * @param {FichaCategory} category
 * @param {string} slug
 * @returns {Promise<FichaFile | null>}
 */
export async function readFicha(db, category, slug) {
	if (category === 'amigues') {
		const ref = await resolveProfileSlug(db, slug);
		if (!ref) return null;
		const object = await getObject(db, { id: ref.id }, PANEL, { includeDeleted: true });
		if (!object || object.type !== PROFILE_TYPE) return null;
		return asFicha(category, object, urlSlugOf(object, ref.legacySlug));
	}
	const tags = await liveTags(db);
	// Una etiqueta con página de la wiki gana sobre otra con la misma dirección (solo difieren en
	// mayúsculas o en espacios y guiones).
	const found =
		tags.find((t) => t.slug === slug && hasWikiPage(t.object.data)) ??
		tags.find((t) => t.slug === slug);
	return found ? asFicha(category, found.object, found.slug) : null;
}

/**
 * Todas las fichas vivas de una categoría (los perfiles no borrados, también ocultos; las páginas
 * de la wiki), por dirección.
 *
 * @param {D1Database} db
 * @param {FichaCategory} category
 * @returns {Promise<FichaFile[]>}
 */
export async function listFichas(db, category) {
	/** @type {Map<string, FichaFile>} */
	const out = new Map();
	if (category === 'amigues') {
		const { results } = await db
			.prepare(
				`SELECT ${OBJECT_COLUMNS.split(', ')
					.map((c) => `o.${c}`)
					.join(', ')}, s.legacy_slug AS legacy_slug FROM objects o
				LEFT JOIN profile_sources s ON s.profile_id = o.id
				WHERE o.type = ?1 AND o.deleted_at IS NULL ORDER BY o.id`
			)
			.bind(PROFILE_TYPE)
			.all();
		for (const r of results) {
			const object = rowToObject(r);
			const slug = urlSlugOf(object, r.legacy_slug == null ? null : String(r.legacy_slug));
			if (!out.has(slug)) out.set(slug, await asFicha(category, object, slug));
		}
	} else {
		for (const t of await liveTags(db)) {
			if (hasWikiPage(t.object.data) && !out.has(t.slug))
				out.set(t.slug, await asFicha(category, t.object, t.slug));
		}
	}
	return [...out.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * La metadata de cada ficha viva (como el frontmatter de su .md), para las listas y los selectores
 * del panel (src/lib/server/admin/content.js).
 *
 * @param {D1Database} db
 * @returns {Promise<{ category: FichaCategory, slug: string, meta: Record<string, unknown> }[]>}
 */
export async function fichaMetas(db) {
	/** @type {{ category: FichaCategory, slug: string, meta: Record<string, unknown> }[]} */
	const out = [];
	for (const f of await listFichas(db, 'amigues')) {
		out.push({ category: 'amigues', slug: f.slug, meta: profileToMeta(f.object) });
	}
	for (const f of await listFichas(db, 'wiki')) {
		const e = wikiEntryOf(String(f.object.data.key), f.object.title, f.object.data);
		out.push({
			category: 'wiki',
			slug: f.slug,
			meta: {
				title: e.title,
				wiki: e.key,
				summary: e.summary,
				tags: e.tags,
				authors: e.authors,
				layout: 'wiki',
				category: 'wiki'
			}
		});
	}
	return out;
}

/**
 * @typedef {{
 *   path: string, category: FichaCategory, slug: string, existing: FichaFile | null,
 *   remove: boolean, title?: string, data?: Record<string, unknown>,
 *   visibility?: 'public' | 'members' | 'hidden'
 * }} FichaWrite
 */

/**
 * Lo que va a guardar un archivo (sin escribir nada todavía): tira, en castellano, si no se puede.
 *
 * @param {D1Database} db
 * @param {{ path: string, content?: string, delete?: boolean }} file
 * @param {{ superadmin: boolean }} opts
 * @returns {Promise<FichaWrite | null>} `null`: borrar algo que no está (no hay nada que hacer)
 */
export async function planFichaWrite(db, file, { superadmin }) {
	const p = fichaOfPath(file.path);
	if (!p) throw new Error(`${file.path} no es una ficha de amigues ni de la wiki.`);
	const existing = await readFicha(db, p.category, p.slug);
	if (file.delete)
		return existing && !existing.deleted ? { ...p, path: file.path, existing, remove: true } : null;
	if (file.content === undefined) {
		throw new Error(`No se puede guardar ${file.path} en la base: falta su texto.`);
	}
	if (!existing) {
		throw new Error(
			p.category === 'amigues'
				? `${file.path}: ese perfil no está en la base. Los perfiles nuevos se crean en Comunidad → Perfiles → «Nuevo perfil» (y las fichas del repo se importan en «Importar y clasificar»).`
				: `${file.path}: no hay ninguna etiqueta con esa dirección. Creala primero en Etiquetas.`
		);
	}
	const current = existing.object;
	if (p.category === 'amigues') {
		const mapped = mdToProfile(p.slug, file.content, { kind: profileKindOf(current.data) });
		/** @type {Record<string, unknown>} */
		const data = { ...mapped.data };
		// El campo viejo `avatar` (sin uso) no está en el .md: queda como estaba.
		if (current.data.avatar !== undefined) data.avatar = current.data.avatar;
		// «Solo con cuenta» no se puede escribir en una ficha: queda, salvo que la ficha la oculte.
		const visibility =
			current.visibility === 'members' && mapped.visibility === 'public'
				? 'members'
				: mapped.visibility;
		return {
			...p,
			path: file.path,
			existing,
			remove: false,
			title: mapped.title,
			data,
			visibility
		};
	}
	const page = markdownToWiki(file.content);
	const key = String(current.data.key);
	if (page.wiki && page.wiki !== key) {
		throw new Error(
			`${file.path} es la página de «${key}», pero el texto dice «wiki: ${page.wiki}». Para cambiar el nombre de la etiqueta, renombrala en Etiquetas.`
		);
	}
	return {
		...p,
		path: file.path,
		existing,
		remove: false,
		title: current.title,
		data: withWikiPage(current.data, page, wikiBodyHtmlFor(current.data, page.body, superadmin))
	};
}

/**
 * Guarda lo planeado (con su revisión en la misma tanda). Un perfil: el objeto, sin tocar sus
 * relaciones. Una página de la wiki: los datos de la etiqueta (borrar le saca el texto).
 *
 * @param {D1Database} db
 * @param {FichaWrite} w
 * @param {string} actor
 */
export async function applyFichaWrite(db, w, actor) {
	const e = /** @type {FichaFile} */ (w.existing);
	const also = (/** @type {import('$lib/server/objects/save.js').SavedRef} */ self) => [
		revisionStatement(db, self, 'panel')
	];
	if (w.category === 'amigues') {
		if (w.remove) {
			return saveObject(
				db,
				{ id: e.object.id, type: PROFILE_TYPE, version: e.object.version, deleted: true },
				{ actor, also }
			);
		}
		return saveObject(
			db,
			{
				id: e.object.id,
				type: PROFILE_TYPE,
				version: e.object.version,
				title: /** @type {string} */ (w.title),
				data: /** @type {Record<string, unknown>} */ (w.data),
				visibility: w.visibility,
				// Volver a crear un perfil borrado es deshacer el borrado.
				...(e.object.deleted_at !== null ? { deleted: false } : {})
			},
			{ actor, also }
		);
	}
	const data = w.remove
		? withWikiPage(
				e.object.data,
				{ title: '', summary: '', authors: [], tags: [], body: '' },
				undefined
			)
		: /** @type {Record<string, unknown>} */ (w.data);
	try {
		return await saveObject(
			db,
			{ id: e.object.id, type: TAG_TYPE, version: e.object.version, title: e.object.title, data },
			{ actor, also }
		);
	} finally {
		// El sitio lee las páginas de la wiki con el árbol de etiquetas (recordado unos segundos).
		clearTagSourceCache();
	}
}

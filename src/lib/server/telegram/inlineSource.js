/**
 * De dónde saca el modo inline lo que muestra (inline.js, docs/telegram.md «Modo inline»): el
 * índice público de la búsqueda (`publicSearchIndex`, el mismo de /api/search-index.json, ya
 * filtrado para une visitante sin cuenta) y, solo para las direcciones que están en ese índice, la
 * imagen, la fecha y el tipo de perfil.
 *
 * Barato: el índice se arma una vez por cambio de la base (y se comparte con el endpoint); los
 * extras, una vez por índice armado (dos consultas chicas: las imágenes de los perfiles y de las
 * series); y entre consultas se reusa lo último por {@link INLINE_SOURCE_TTL_MS}, así una ráfaga de
 * letras no hace ni las consultas de «¿cambió algo?».
 */
import { getDB } from '$lib/server/db';
import { publicSearchIndex } from '$lib/server/search/publicIndex.js';
import { postTime } from '$lib/server/contenido/posts.js';
import { imageKeysByObject, seriesImageKeys } from '$lib/server/media/library.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { prepareIndex } from '$lib/utils/search';
import { tagPagePath } from '$lib/utils/series.js';

/** @typedef {import('./inline.js').InlineSource} InlineSource */
/** @typedef {import('./inline.js').InlineExtra} InlineExtra */
/** @typedef {import('$lib/server/search/publicIndex.js').BuiltIndex} BuiltIndex */

/** Cuánto se reusa la fuente sin volver a mirar la base. */
export const INLINE_SOURCE_TTL_MS = 60 * 1000;

/**
 * El árbol de etiquetas, para recorrer la Kinkipedia por ramas (sections.js): de cada etiqueta
 * (sin los alias), sus madres, su nombre visible y sus hijas en el orden del árbol (`children`,
 * el mismo que recorre /wiki con GlosarioTree; `root` va con las de arriba de todo). Nada más:
 * qué se muestra lo decide el índice.
 *
 * @param {TagManager | undefined} tags
 * @returns {Map<string, import('./inline.js').TreeTag> | undefined}
 */
export function tagTree(tags) {
	if (!tags) return undefined;
	/** @type {Map<string, import('./inline.js').TreeTag>} */
	const tree = new Map();
	for (const t of tags.tagsData()) {
		if (!t?.id || t.aliasOf) continue;
		tree.set(t.id, {
			parents: t.id !== 'root' && Array.isArray(t.parents) ? t.parents.map(String) : [],
			name: String(t.visible_name ?? t.id),
			children: Array.isArray(t.children) ? t.children.map(String) : []
		});
	}
	return tree;
}

/**
 * Lo de más de cada dirección del índice. Pura: recibe lo leído (las claves de las imágenes de
 * perfiles por id y de series por etiqueta) y descarta todo lo que no está en el índice. Con el
 * árbol de etiquetas (`built.tags`), suma `tree`.
 *
 * @param {Pick<BuiltIndex, 'raw' | 'posts' | 'wikiPosts' | 'profiles'> & { tags?: TagManager }} built
 * @param {{ avatars?: ReadonlyMap<number, string>, series?: ReadonlyMap<string, string> }} [images]
 * @returns {InlineSource}
 */
export function makeInlineSource(built, { avatars = new Map(), series = new Map() } = {}) {
	const docs = built.raw.docs;
	const inIndex = new Set(docs.map((d) => d.h));
	/** @type {Map<string, InlineExtra>} */
	const extras = new Map();
	/** @param {string} href @param {InlineExtra} extra */
	const add = (href, extra) => {
		if (inIndex.has(href) && !extras.has(href)) extras.set(href, extra);
	};
	/** @param {unknown} key */
	const mediaOf = (key) => (typeof key === 'string' && key ? `/media/${key}` : undefined);
	/** @param {unknown} v */
	const imageOf = (v) => (typeof v === 'string' && v ? v : undefined);

	for (const post of built.posts) {
		const { meta, path } = post;
		const time = postTime(post);
		add(path, {
			image: imageOf(meta.featured),
			...(Number.isFinite(time) ? { time } : {}),
			...(meta.category === 'calendario' ? { meta } : {})
		});
	}
	for (const post of built.wikiPosts) add(post.path, { image: imageOf(post.meta.featured) });
	for (const p of built.profiles ?? []) {
		add(`/amigues/${p.legacySlug || p.object.slug}`, {
			image: mediaOf(avatars.get(Number(p.object.id))),
			kind: profileKindOf(p.object.data ?? {}),
			// Un lugar no listado al que lleva un evento: se encuentra buscando, pero no va en la
			// lista de Amigues (como /amigues).
			...(p.object.data?.unlisted ? { unlisted: true } : {})
		});
	}
	for (const [tag, key] of series) add(tagPagePath(tag), { image: mediaOf(key) });
	const tree = tagTree(built.tags);
	return { docs, prepared: prepareIndex(built.raw), extras, ...(tree ? { tree } : {}) };
}

/** @type {WeakMap<BuiltIndex, Promise<InlineSource>>} */
const sources = new WeakMap();

/** @type {{ at: number, source: Promise<InlineSource> } | null} */
let last = null;

/**
 * La fuente del modo inline.
 *
 * @param {App.Platform | undefined} platform
 * @param {number} [now]
 * @returns {Promise<InlineSource>}
 */
export function inlineSource(platform, now = Date.now()) {
	if (last && now - last.at >= 0 && now - last.at < INLINE_SOURCE_TTL_MS) return last.source;
	const source = publicSearchIndex(platform).then((built) => {
		let made = sources.get(built);
		if (!made) {
			made = readImages(platform).then((images) => makeInlineSource(built, images));
			sources.set(built, made);
		}
		return made;
	});
	const fresh = { at: now, source };
	last = fresh;
	source.catch(() => {
		if (last === fresh) last = null;
	});
	return source;
}

/** Para las pruebas: olvidar la última fuente. */
export function clearInlineSource() {
	last = null;
}

/**
 * Las imágenes de los perfiles y de las series (solo imágenes que ve cualquiera). Si falla, sin
 * miniaturas.
 *
 * @param {App.Platform | undefined} platform
 */
async function readImages(platform) {
	const db = getDB(platform);
	if (!db) return {};
	const [avatars, series] = await Promise.all([
		imageKeysByObject(db, 'perfil', 'avatar').catch(() => new Map()),
		seriesImageKeys(db).catch(() => new Map())
	]);
	return { avatars, series };
}

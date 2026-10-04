/**
 * Series de eventos del lado del servidor: arma lo que muestran las páginas a partir de los posts
 * del deploy y del árbol de etiquetas. La lógica está en $lib/utils/series.js (pura, con tests);
 * acá solo se juntan los datos (el interruptor `series` quedó prendido para siempre).
 *
 * Las funciones reciben `posts` y `tags` para poder probarlas con datos inventados; por defecto
 * usan los posts listados del sitio por la capa compartida de contenido (`sitePosts(platform)`:
 * de la base; pasá `platform`) y el árbol de etiquetas en uso (la base: $lib/utils/siteTags.js).
 */
import { mediaURL, thumbURL } from '$lib/utils';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { getDB } from '$lib/server/db';
import { seriesImageKeys } from '$lib/server/media/library.js';
import {
	editionNav,
	eventImageRef,
	seriesEditions,
	seriesImage,
	seriesOfTags,
	seriesParentOf,
	seriesTagIds,
	splitEditions,
	tagIdFromSlug,
	tagPagePath
} from '$lib/utils/series.js';

/** @typedef {import('$lib/utils/series.js').Edition} Edition */
/** @typedef {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} Posts */
/**
 * @typedef {{ posts?: Posts, tags?: TagManager, now?: number,
 *   platform?: App.Platform, images?: Map<string, string> }} SeriesOptions `platform`: de dónde
 *   leer los posts (y las imágenes de la biblioteca) si no vienen; `images`: nombre de la etiqueta
 *   → clave de su imagen en la biblioteca (docs/imagenes.md)
 */

/** El árbol de etiquetas en uso (la base; el archivo, solo como respaldo). */
export function siteTags() {
	return currentSiteTags();
}

/**
 * @param {SeriesOptions} opts
 * @returns {Promise<{ posts: Posts, tags: TagManager, now: number, images: Map<string, string> }>}
 */
async function resolve(opts) {
	return {
		posts: opts.posts ?? (await sitePosts(opts.platform)),
		tags: opts.tags ?? siteTags(),
		now: opts.now ?? Date.now(),
		images: opts.images ?? (await libraryImages(opts.platform))
	};
}

/**
 * Las imágenes de la biblioteca de las series; ninguna sin base o si falla (quedan las del repo).
 * @param {App.Platform | undefined} platform
 * @returns {Promise<Map<string, string>>}
 */
async function libraryImages(platform) {
	const db = getDB(platform);
	if (!db) return new Map();
	try {
		return await seriesImageKeys(db);
	} catch {
		return new Map();
	}
}

/**
 * URL de la imagen de una serie (archivo de src/lib/assets o imagen de un evento,
 * `calendario:<evento>/<archivo>`: ver seriesImage), o `undefined`.
 *
 * @param {string | undefined} file
 */
export async function seriesImageURL(file) {
	if (!file) return undefined;
	const ref = eventImageRef(file);
	if (ref) return mediaURL('calendario', ref.slug, ref.file);
	try {
		return await thumbURL('calendario', '', file);
	} catch {
		return undefined;
	}
}

/**
 * Lo básico de una serie para mostrar. La imagen: la de la biblioteca si tiene (edge `imagen`);
 * si no, la del repo (campo `image`).
 *
 * @param {TagManager} tags
 * @param {string} id
 * @param {Map<string, string>} [images]
 */
async function seriesHeader(tags, id, images) {
	const tag = tags.get(id);
	const key = images?.get(id);
	return {
		id,
		name: tag?.visible_name ?? id,
		icon: tag?.icon ?? '',
		description: typeof tag?.description === 'string' ? tag.description : '',
		href: tagPagePath(id),
		image: key ? `/media/${key}` : await seriesImageURL(seriesImage(tag))
	};
}

/**
 * Las series de un evento con su lugar en cada una, para la página del evento: "Edición N de
 * <serie>", anterior y siguiente, y si ya pasó (para "Avisame si se repite").
 *
 * @param {{ slug: string, tags?: readonly string[], start?: string }} event
 * @param {SeriesOptions} [opts]
 */
export async function eventSeries(event, opts = {}) {
	const { posts, tags, now, images } = await resolve(opts);
	const ids = seriesOfTags(event.tags, seriesTagIds(tags));
	const out = [];
	for (const id of ids) {
		const editions = seriesEditions(posts, id);
		const nav = editionNav(editions, event.slug);
		if (!nav) continue;
		const { upcoming } = splitEditions(editions, now);
		const started = new Date(event.start ?? editions[nav.index].start).getTime() <= now;
		out.push({
			...(await seriesHeader(tags, id, images)),
			number: nav.number,
			total: nav.total,
			prev: nav.prev,
			next: nav.next,
			past: started,
			nextUpcoming: upcoming.find((e) => e.slug !== event.slug) ?? null
		});
	}
	return out;
}

/**
 * La página de una serie: imagen, próximas ediciones (la más cercana primero) y pasadas (la más
 * reciente primero). `null` si la etiqueta no es una serie.
 *
 * @param {string} tagId
 * @param {SeriesOptions} [opts]
 */
export async function seriesPage(tagId, opts = {}) {
	const { posts, tags, now, images } = await resolve(opts);
	const id = tagIdFromSlug(tags, tagId) ?? tagId;
	if (!seriesTagIds(tags).includes(id)) return null;
	const editions = seriesEditions(posts, id);
	const { upcoming, past } = splitEditions(editions, now);
	return { ...(await seriesHeader(tags, id, images)), total: editions.length, upcoming, past };
}

/**
 * Todas las series con sus ediciones (para el panel).
 *
 * @param {SeriesOptions} [opts]
 */
export async function allSeries(opts = {}) {
	const { posts, tags, now, images } = await resolve(opts);
	const out = [];
	for (const id of seriesTagIds(tags)) {
		const editions = seriesEditions(posts, id);
		const { upcoming, past } = splitEditions(editions, now);
		out.push({ ...(await seriesHeader(tags, id, images)), editions, upcoming, past });
	}
	return out;
}

/**
 * Las series para listarlas (la Kinkipedia): nombre, imagen, descripción, cuántas ediciones, la
 * próxima y la serie madre (`parent`, si es una serie hija). Solo las que tienen al menos una
 * edición, en el orden del árbol.
 *
 * @param {SeriesOptions} [opts]
 */
export async function seriesSummaries(opts = {}) {
	const tags = opts.tags ?? siteTags();
	const ids = seriesTagIds(tags);
	return (await allSeries({ ...opts, tags }))
		.filter((s) => s.editions.length)
		.map(({ editions, upcoming, past, ...head }) => ({
			...head,
			// La serie madre, si es una serie hija (la Kinkipedia las agrupa: groupSeries).
			parent: seriesParentOf(tags, head.id, ids),
			total: editions.length,
			next: upcoming[0]
				? { title: upcoming[0].title, start: upcoming[0].start, path: upcoming[0].path }
				: null,
			last: past[0] ? { start: past[0].start } : null
		}));
}

/**
 * Los eventos con una etiqueta o alguna de sus hijas (como la página de la etiqueta).
 *
 * @param {string} tagId
 * @param {SeriesOptions} [opts]
 */
export async function eventsForTag(tagId, opts = {}) {
	const { posts, tags } = await resolve({ ...opts, images: new Map() });
	const id = tagIdFromSlug(tags, tagId) ?? tagId;
	const wanted = new Set([id, ...(tags.get(id)?.getAllChildren?.() ?? [])]);
	return posts.filter(
		(p) => p.meta?.category === 'calendario' && (p.meta.tags ?? []).some((t) => wanted.has(t))
	);
}

/**
 * ¿Existe esta etiqueta en el árbol? (declarada, hija de otra o alias)
 *
 * @param {string} tagId
 * @param {TagManager} [tags]
 */
export function tagExists(tagId, tags = siteTags()) {
	const t = tags.get(tagId);
	return Boolean(t && !t.orphan);
}

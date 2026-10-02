/**
 * Series de eventos del lado del servidor: arma lo que muestran las páginas a partir de los posts
 * del deploy y del árbol de etiquetas. La lógica está en $lib/utils/series.js (pura, con tests);
 * acá solo se juntan los datos. Todo detrás del interruptor `series` (src/lib/server/flags.js):
 * quien llama controla el interruptor.
 *
 * Las funciones reciben `posts` y `tags` para poder probarlas con datos inventados; por defecto
 * usan los posts listados del deploy y el árbol de etiquetas en uso (archivo o base, interruptor
 * `etiquetas_db`: $lib/utils/siteTags.js).
 */
import { fetchMarkdownPosts, mediaURL, thumbURL } from '$lib/utils';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import {
	editionNav,
	eventImageRef,
	seriesEditions,
	seriesImage,
	seriesOfTags,
	seriesTagIds,
	splitEditions,
	tagIdFromSlug,
	tagPagePath
} from '$lib/utils/series.js';

/** @typedef {import('$lib/utils/series.js').Edition} Edition */
/** @typedef {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} Posts */
/** @typedef {{ posts?: Posts, tags?: TagManager, now?: number }} SeriesOptions */

/** El árbol de etiquetas en uso (el archivo, o la base con el interruptor `etiquetas_db`). */
export function siteTags() {
	return currentSiteTags();
}

/**
 * @param {SeriesOptions} opts
 * @returns {Promise<{ posts: Posts, tags: TagManager, now: number }>}
 */
async function resolve(opts) {
	return {
		posts: opts.posts ?? (await fetchMarkdownPosts()),
		tags: opts.tags ?? siteTags(),
		now: opts.now ?? Date.now()
	};
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
 * Lo básico de una serie para mostrar.
 *
 * @param {TagManager} tags
 * @param {string} id
 */
async function seriesHeader(tags, id) {
	const tag = tags.get(id);
	return {
		id,
		name: tag?.visible_name ?? id,
		icon: tag?.icon ?? '',
		description: typeof tag?.description === 'string' ? tag.description : '',
		href: tagPagePath(id),
		image: await seriesImageURL(seriesImage(tag))
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
	const { posts, tags, now } = await resolve(opts);
	const ids = seriesOfTags(event.tags, seriesTagIds(tags));
	const out = [];
	for (const id of ids) {
		const editions = seriesEditions(posts, id);
		const nav = editionNav(editions, event.slug);
		if (!nav) continue;
		const { upcoming } = splitEditions(editions, now);
		const started = new Date(event.start ?? editions[nav.index].start).getTime() <= now;
		out.push({
			...(await seriesHeader(tags, id)),
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
	const { posts, tags, now } = await resolve(opts);
	const id = tagIdFromSlug(tags, tagId) ?? tagId;
	if (!seriesTagIds(tags).includes(id)) return null;
	const editions = seriesEditions(posts, id);
	const { upcoming, past } = splitEditions(editions, now);
	return { ...(await seriesHeader(tags, id)), total: editions.length, upcoming, past };
}

/**
 * Todas las series con sus ediciones (para el panel).
 *
 * @param {SeriesOptions} [opts]
 */
export async function allSeries(opts = {}) {
	const { posts, tags, now } = await resolve(opts);
	const out = [];
	for (const id of seriesTagIds(tags)) {
		const editions = seriesEditions(posts, id);
		const { upcoming, past } = splitEditions(editions, now);
		out.push({ ...(await seriesHeader(tags, id)), editions, upcoming, past });
	}
	return out;
}

/**
 * Las series para listarlas (la Kinkipedia): nombre, imagen, descripción, cuántas ediciones y la
 * próxima. Solo las que tienen al menos una edición, en el orden del árbol.
 *
 * @param {SeriesOptions} [opts]
 */
export async function seriesSummaries(opts = {}) {
	return (await allSeries(opts))
		.filter((s) => s.editions.length)
		.map(({ editions, upcoming, past, ...head }) => ({
			...head,
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
	const { posts, tags } = await resolve(opts);
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

/**
 * Series de eventos: una serie es una ETIQUETA hija de «evento recurrente» (como Picantearla o
 * Cine para Sucixs, en src/lib/utils/hardcodedTags.js), y sus ediciones son los eventos con esa
 * etiqueta. No hay otro objeto: la imagen de la serie es el campo `image` de la etiqueta (un
 * archivo de src/lib/assets) y la descripción, la de la etiqueta o su entrada de la Kinkipedia.
 *
 * Funciones puras (sin Svelte ni SvelteKit): andan en el navegador, en el servidor y en vitest.
 * Todo lo de series usa esto.
 */

import { TIMEZONE } from './dates.js';
import { currentSiteTagList } from './siteTags.js';
import { tagSlug } from './tagSlug.js';

export { resolveTagSlug, tagIdFromSlug, tagSlug } from './tagSlug.js';

/** La etiqueta madre de las series. */
export const SERIES_PARENT = 'evento recurrente';

/**
 * @typedef {object} Edition
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start ISO, como en el frontmatter
 * @prop {string} status abierto | anunciado | agotadas | cancelado
 * @prop {string} path /calendario/<slug>
 * @prop {number} number número de edición (del título, del frontmatter `edition` o contado)
 * @prop {string} [featured] URL de la imagen del evento, si tiene
 */

/**
 * Las etiquetas que son series: hijas (o nietas) de «evento recurrente», sin alias.
 *
 * @param {TagManager} tagManager
 * @returns {string[]}
 */
export function seriesTagIds(tagManager) {
	const parent = tagManager.get(SERIES_PARENT);
	const ids = parent?.getAllChildren?.() ?? [];
	return [...new Set(ids.map((id) => tagManager.get(id)?.id ?? id))];
}

/**
 * ¿Esta etiqueta (o un alias de ella) es una serie?
 *
 * @param {TagManager} tagManager
 * @param {string} id
 */
export function isSeriesTag(tagManager, id) {
	const canonical = tagManager.get(id)?.id ?? id;
	return seriesTagIds(tagManager).includes(canonical);
}

/**
 * Las series de un evento, en el orden de `seriesIds`.
 *
 * @param {readonly string[] | undefined} tags etiquetas del evento (ya canónicas)
 * @param {readonly string[]} seriesIds
 */
export function seriesOfTags(tags, seriesIds) {
	const set = new Set(tags ?? []);
	return seriesIds.filter((id) => set.has(id));
}

/** @param {string} s */
const norm = (s) => s.trim().toLowerCase();

/**
 * Índice de las etiquetas de serie sobre la lista cruda de etiquetas en uso (archivo o base,
 * ./siteTags.js), sin armar un TagManager: nombre (o alias) en minúsculas → id de la etiqueta.
 * Hijas y nietas de `root`; los alias (`aka`, y las entradas con `aliasOf`) apuntan al id.
 * Lo usan los gráficos de Estadísticas para contar quién vuelve a la misma serie.
 *
 * @param {ReadonlyArray<{ id: string, children?: string[], aka?: string[], aliasOf?: string }>} [rawTags]
 * @param {string} [root]
 * @returns {Map<string, string>}
 */
export function seriesTagIndex(rawTags = currentSiteTagList(), root = SERIES_PARENT) {
	const byId = new Map(rawTags.map((t) => [t.id, t]));
	const children = (/** @type {string} */ id) => byId.get(id)?.children ?? [];
	const ids = new Set();
	for (const child of children(root)) {
		ids.add(child);
		for (const grandchild of children(child)) ids.add(grandchild);
	}
	/** @type {Map<string, string>} */
	const index = new Map();
	for (const id of ids) {
		index.set(norm(id), id);
		for (const alias of byId.get(id)?.aka ?? []) index.set(norm(alias), id);
	}
	for (const t of rawTags) {
		if (t.aliasOf && ids.has(t.aliasOf)) index.set(norm(t.id), t.aliasOf);
	}
	return index;
}

/**
 * Las series de un evento a partir de sus etiquetas tal como vienen en el frontmatter (sin
 * canonizar: compara sin mayúsculas y resuelve alias), sin repetir, en orden alfabético.
 *
 * @param {unknown} tags las etiquetas del frontmatter
 * @param {Map<string, string>} [index] de `seriesTagIndex`
 * @returns {string[]}
 */
export function eventSeriesTags(tags, index = seriesTagIndex()) {
	if (!Array.isArray(tags)) return [];
	const found = new Set();
	for (const t of tags) {
		if (typeof t !== 'string') continue;
		const id = index.get(norm(t));
		if (id) found.add(id);
	}
	return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * El número de edición escrito en el título: «Picantearla (9° Edición)», «(10ª edición)»,
 * «#12», «Edición 3». `null` si no tiene.
 *
 * @param {unknown} title
 * @returns {number | null}
 */
export function editionNumberFromTitle(title) {
	const t = String(title ?? '');
	const m =
		t.match(/(\d{1,4})\s*(?:°|º|ª|a|ra|da|ta|va|na)?\s*edici[oó]n/i) ??
		t.match(/edici[oó]n\s*(?:n[°º.]?\s*)?#?(\d{1,4})\b/i) ??
		t.match(/#(\d{1,4})\b/);
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Número explícito de una edición: el campo `edition` del frontmatter (si es un entero
 * positivo) o el del título.
 *
 * @param {{ edition?: unknown, title?: unknown }} meta
 */
function explicitNumber(meta) {
	const e = Number(meta.edition);
	if (meta.edition !== undefined && meta.edition !== null && Number.isInteger(e) && e > 0) return e;
	return editionNumberFromTitle(meta.title);
}

/**
 * Las ediciones de una serie, de la más vieja a la más nueva. Solo eventos con fecha válida.
 * Numeración: el número explícito (frontmatter `edition` o título) si lo tiene; si no, el de la
 * edición anterior + 1 (o la posición, si ninguna anterior tiene número). Así «Picantearla (9°
 * Edición)» sigue siendo la 9 aunque las primeras ocho no estén en el sitio.
 *
 * @param {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} posts posts procesados
 *   (fetchMarkdownPosts o /api/posts)
 * @param {string} seriesId
 * @returns {Edition[]}
 */
export function seriesEditions(posts, seriesId) {
	const list = posts
		.filter(
			(p) =>
				p.meta?.category === 'calendario' &&
				(p.meta.tags ?? []).includes(seriesId) &&
				Number.isFinite(new Date(p.meta.start).getTime())
		)
		.slice()
		.sort((a, b) => {
			const d = new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime();
			return d || String(a.meta.postID).localeCompare(String(b.meta.postID));
		});
	/** @type {Edition[]} */
	const out = [];
	let previous = 0;
	list.forEach((p, i) => {
		const number = explicitNumber(p.meta) ?? (previous > 0 ? previous + 1 : i + 1);
		previous = number;
		out.push({
			slug: String(p.meta.postID),
			title: String(p.meta.title ?? p.meta.postID),
			start: String(p.meta.start),
			status: String(p.meta.status ?? ''),
			path: p.path ?? `/calendario/${p.meta.postID}`,
			number,
			...(p.meta.featured ? { featured: String(p.meta.featured) } : {})
		});
	});
	return out;
}

/**
 * Dónde está un evento en su serie: número, total y la edición anterior y la siguiente.
 * `null` si el evento no es una edición de la lista.
 *
 * @param {readonly Edition[]} editions de seriesEditions
 * @param {string} slug
 */
export function editionNav(editions, slug) {
	const index = editions.findIndex((e) => e.slug === slug);
	if (index === -1) return null;
	return {
		index,
		number: editions[index].number,
		total: editions.length,
		prev: editions[index - 1] ?? null,
		next: editions[index + 1] ?? null
	};
}

/**
 * Próximas (empiezan después de `now`, la más cercana primero, sin las canceladas) y pasadas
 * (la más reciente primero). Mismo criterio que el resto del sitio (isCurrent en allPosts.js).
 *
 * @param {readonly Edition[]} editions
 * @param {number} [now]
 */
export function splitEditions(editions, now = Date.now()) {
	/** @type {Edition[]} */
	const upcoming = [];
	/** @type {Edition[]} */
	const past = [];
	for (const e of editions) {
		if (new Date(e.start).getTime() > now) {
			if (e.status !== 'cancelado') upcoming.push(e);
		} else past.push(e);
	}
	past.reverse();
	return { upcoming, past };
}

/**
 * La imagen de una serie: el campo `image` de su etiqueta. Es el nombre de un archivo de
 * src/lib/assets («picantearla-miniatura.webp») o la imagen de un evento, sin copiarla:
 * `calendario:<evento>/<archivo>` («calendario:colectiver-2026-08/1.webp», el archivo de
 * src/lib/posts/calendario/media/colectiver-2026-08/).
 *
 * @param {Pick<RawTag, 'image'> | undefined} tag
 * @returns {string | undefined}
 */
export function seriesImage(tag) {
	const v = typeof tag?.image === 'string' ? tag.image.trim() : '';
	return v || undefined;
}

/** Prefijo de la imagen de una serie que es la imagen de un evento. */
export const EVENT_IMAGE_PREFIX = 'calendario:';

const EVENT_IMAGE =
	/^calendario:([A-Za-z0-9][A-Za-z0-9_-]{0,150})\/([A-Za-z0-9][\w.-]{0,120}\.(?:jpe?g|jfif|png|webp))$/i;

/**
 * Si `image` es la imagen de un evento (`calendario:<evento>/<archivo>`), el evento y el
 * archivo; si no, `null`. Sin `..`, sin más carpetas ni links de afuera.
 *
 * @param {unknown} image
 * @returns {{ slug: string, file: string } | null}
 */
export function eventImageRef(image) {
	const m = typeof image === 'string' ? image.match(EVENT_IMAGE) : null;
	return m ? { slug: m[1], file: m[2] } : null;
}

/**
 * Dirección de la página de una etiqueta (la Kinkipedia muestra la etiqueta si no hay entrada).
 * Con la forma slug (`tagSlug`), como los demás links a una etiqueta.
 *
 * @param {string} id
 */
export function tagPagePath(id) {
	return '/wiki/' + encodeURIComponent(tagSlug(id));
}

/**
 * Fecha corta de una edición en hora de Argentina: «12 sept 2026».
 *
 * @param {string} start
 */
export function editionDateLabel(start) {
	const d = new Date(start);
	if (Number.isNaN(d.getTime())) return '';
	return d
		.toLocaleDateString('es-AR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: TIMEZONE
		})
		.replace(/ de /g, ' ')
		.replace('.', '');
}

/**
 * Dirección del calendario .ics de una etiqueta o serie (src/routes/ics/etiqueta/), con la misma
 * forma slug que la página (`tagPagePath`). La ruta la resuelve con `resolveTagSlug`, así que los
 * links viejos con espacios (%20) siguen andando.
 *
 * @param {string} id
 */
export function tagFeedPath(id) {
	return `/ics/etiqueta/${encodeURIComponent(tagSlug(id))}.ics`;
}

/**
 * Dirección de /api/series para una etiqueta (lo que pide la página de la etiqueta), con la
 * misma forma slug.
 *
 * @param {string} id
 */
export function seriesApiPath(id) {
	return `/api/series/${encodeURIComponent(tagSlug(id))}`;
}

/**
 * Links para suscribirse a un calendario: el https, el webcal:// (abre la app de calendario) y
 * el de Google Calendar. (Acá y no en icsFeed.js para que el navegador no cargue el paquete ics.)
 *
 * @param {string} url absoluto, https
 */
export function subscribeLinks(url) {
	const webcal = url.replace(/^https?:\/\//, 'webcal://');
	return {
		https: url,
		webcal,
		google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`
	};
}

/**
 * La serie madre de una serie (una serie hija, como «Picantearla: Deluxe» o «Cuirdas Sudacas
 * 2026», está dentro de otra serie y no directo en «evento recurrente»), o `null`. Si tiene
 * varias madres que son series, la primera.
 *
 * @param {TagManager} tagManager
 * @param {string} id
 * @param {readonly string[]} [seriesIds] de `seriesTagIds` (para no recalcularlo)
 * @returns {string | null}
 */
export function seriesParentOf(tagManager, id, seriesIds = seriesTagIds(tagManager)) {
	const parents = /** @type {string[]} */ (tagManager.get(id)?.parents ?? []);
	return parents.find((p) => p !== id && seriesIds.includes(p)) ?? null;
}

/**
 * Agrupa una lista de series (la de la Kinkipedia) por serie madre: cada madre lleva sus hijas en
 * `children`, en el orden en que venían. Una hija cuya madre no está en la lista (porque la madre
 * no tiene ediciones propias) queda suelta, como cualquier otra. Las hijas de una hija se juntan
 * con la madre de arriba (dos niveles alcanzan para mostrar).
 *
 * @template {{ id: string, parent?: string | null }} S
 * @param {readonly S[]} list
 * @returns {(S & { children: S[] })[]}
 */
export function groupSeries(list) {
	const byId = new Map(list.map((s) => [s.id, s]));
	/** @param {S} s */
	const topOf = (s) => {
		let current = s;
		const seen = new Set([s.id]);
		while (current.parent && byId.has(current.parent) && !seen.has(current.parent)) {
			seen.add(current.parent);
			current = /** @type {S} */ (byId.get(current.parent));
		}
		return current;
	};
	/** @type {Map<string, S & { children: S[] }>} */
	const groups = new Map();
	for (const s of list) {
		const top = topOf(s);
		if (!groups.has(top.id)) groups.set(top.id, { ...top, children: [] });
		if (top.id !== s.id) /** @type {any} */ (groups.get(top.id)).children.push(s);
	}
	return [...groups.values()];
}

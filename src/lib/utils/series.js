/**
 * Series de eventos: una serie es una ETIQUETA hija de «evento recurrente» (como Picantearla o
 * Cine para Sucixs, en src/lib/utils/hardcodedTags.js), y sus ediciones son los eventos con esa
 * etiqueta. No hay otro objeto: la imagen de la serie es el campo `image` de la etiqueta (un
 * archivo de src/lib/assets) y la descripción, la de la etiqueta o su entrada de la Kinkipedia.
 *
 * Funciones puras (sin Svelte ni SvelteKit): andan en el navegador, en el servidor y en vitest.
 * Todo lo que va detrás del interruptor `series` (src/lib/server/flags.js) usa esto.
 */

import { TIMEZONE } from './dates.js';

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
 * La imagen de una serie: el campo `image` de su etiqueta (nombre de archivo de src/lib/assets).
 *
 * @param {Pick<RawTag, 'image'> | undefined} tag
 * @returns {string | undefined}
 */
export function seriesImage(tag) {
	const v = typeof tag?.image === 'string' ? tag.image.trim() : '';
	return v || undefined;
}

/**
 * Dirección de la página de una etiqueta (la Kinkipedia muestra la etiqueta si no hay entrada).
 *
 * @param {string} id
 */
export function tagPagePath(id) {
	return '/wiki/' + encodeURIComponent(id.replaceAll(' ', '-'));
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
 * Dirección del calendario .ics de una etiqueta o serie (src/routes/ics/etiqueta/).
 *
 * @param {string} id
 */
export function tagFeedPath(id) {
	return `/ics/etiqueta/${encodeURIComponent(id)}.ics`;
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

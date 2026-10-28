/**
 * La fila «Talleres y eventos» de la portada: los próximos eventos, una tarjeta por taller, serie o
 * título (la edición más próxima), así una clase que se repite cada semana no ocupa tres lugares.
 *
 * Qué cuenta como «lo mismo», con lo que el sitio ya usa para juntar ediciones:
 * - las partes de un taller (docs/talleres-partes.md): el taller entero es una tarjeta;
 * - las series (etiquetas hijas de «evento recurrente», $lib/utils/series.js): las ediciones
 *   tienen títulos distintos («Picantearla (60ª Edición)», «(61ª Edición)») y son una tarjeta;
 * - si no, el mismo título exacto (sin mayúsculas ni espacios de más): las clases que se cargan
 *   sueltas, sin serie. Dos eventos que solo comparten palabras («Evento de prueba: entradas» y
 *   «Evento de prueba: entradas a la gorra») siguen separados.
 *
 * Pura (sin Svelte): la usa la portada y la prueban los tests.
 */
import { parseSiteDate } from './dates.js';
import { seriesOfTags, seriesTagIds } from './series.js';

/** @typedef {{ path: string, meta: Record<string, any> }} EventPost */

/** @param {unknown} title */
const normTitle = (title) =>
	String(title ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();

/**
 * La clave de «la misma tarjeta» de un evento.
 *
 * @param {EventPost} post
 * @param {{ seriesIds?: readonly string[], canonical?: (tag: string) => string,
 *   workshops?: Record<string, string> }} [opts]
 *   `seriesIds`: las etiquetas que son series; `canonical`: el id canónico de una etiqueta (los
 *   alias); `workshops`: dirección de una parte → su taller ({@link workshopGroups})
 * @returns {string}
 */
export function eventCardKey(post, { seriesIds = [], canonical = (t) => t, workshops = {} } = {}) {
	const slug = String(post.meta?.postID ?? '');
	const workshop = slug ? workshops[slug] : undefined;
	if (workshop) return `taller:${workshop}`;
	const tags = Array.isArray(post.meta?.tags)
		? post.meta.tags.map((t) => canonical(String(t)))
		: [];
	// Todas sus series (ordenadas): una edición de «Picantearla: Deluxe» no se junta con las de
	// «Picantearla» a secas.
	const series = [...new Set(seriesOfTags(tags, seriesIds))].sort();
	if (series.length) return `serie:${series.join('|')}`;
	return `titulo:${normTitle(post.meta?.title) || post.path}`;
}

/**
 * Los próximos eventos de la portada: los que empiezan después de `now`, por fecha, una tarjeta
 * por taller, serie o título (la edición más próxima que no esté cancelada; si están todas
 * canceladas, la primera), y como mucho `limit`.
 *
 * @template {EventPost} P
 * @param {readonly P[]} posts todos los posts (se quedan los del calendario)
 * @param {{ tagManager?: TagManager | null, workshops?: Record<string, string>, now?: number,
 *   limit?: number }} [opts]
 * @returns {P[]}
 */
export function upcomingEventCards(
	posts,
	{ tagManager = null, workshops = {}, now = Date.now(), limit = 9 } = {}
) {
	const seriesIds = tagManager ? seriesTagIds(tagManager) : [];
	/** @param {string} t */
	const canonical = (t) => tagManager?.get(t)?.id ?? t;
	const upcoming = posts
		.filter((p) => p.meta?.category == 'calendario' && parseSiteDate(p.meta.start).getTime() > now)
		.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1));
	/** @type {Map<string, P>} */
	const chosen = new Map();
	for (const post of upcoming) {
		const key = eventCardKey(post, { seriesIds, canonical, workshops });
		const current = chosen.get(key);
		if (!current) chosen.set(key, post);
		// Una edición cancelada no tapa a la que sigue.
		else if (current.meta.status === 'cancelado' && post.meta.status !== 'cancelado') {
			chosen.set(key, post);
		}
	}
	return [...chosen.values()]
		.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1))
		.slice(0, limit);
}

/**
 * Qué eventos de la lista son partes del mismo taller: dirección → un número por taller. Solo los
 * eventos que ya están en la lista y sin la dirección del taller (puede estar oculto): la página
 * solo necesita saber cuáles van juntos.
 *
 * @param {readonly { meta: Record<string, any> }[]} posts
 * @param {Map<string, { workshop: string }>} partLabels de `partLabelsOrNone`
 *   ($lib/server/eventos/pasados.js)
 * @returns {Record<string, string>}
 */
export function workshopGroups(posts, partLabels) {
	/** @type {Map<string, string>} */
	const ids = new Map();
	/** @type {Record<string, string>} */
	const out = {};
	for (const p of posts) {
		const slug = String(p.meta?.postID ?? '');
		const label = slug ? partLabels.get(slug) : undefined;
		if (!label) continue;
		if (!ids.has(label.workshop)) ids.set(label.workshop, String(ids.size + 1));
		out[slug] = /** @type {string} */ (ids.get(label.workshop));
	}
	return out;
}

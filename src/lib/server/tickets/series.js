/**
 * "¿Primera vez en la serie?" para el modo puerta.
 *
 * Qué es la serie de un evento: sus etiquetas de serie, las hijas (o nietas) de «evento
 * recurrente» (las mismas de las páginas de series, $lib/utils/series.js). Ya no se adivina por
 * el slug: un evento sin etiqueta de serie no tiene serie y en la puerta no se muestra nada.
 *
 * Ediciones anteriores: las que van antes que este evento en el orden de ediciones de cada una
 * de sus series (seriesEditions: por fecha de comienzo). Si el evento está en más de una serie,
 * se juntan las anteriores de todas.
 *
 * Primera vez: la persona de la entrada NO tiene una entrada aprobada o con ingreso marcado en
 * una edición anterior:
 * - otra entrada con el mismo nombre (sin mayúsculas, tildes ni espacios de más), o
 * - si la entrada es de quien compró (mismo nombre), otra compra con el mismo email.
 * Si ninguna edición anterior tiene entradas acá (primera edición, o ediciones de antes de la
 * venta), no se sabe (`known: false`) y no se muestra nada.
 *
 * La lógica es pura (doorSeries, isFirstTime) y la consulta recibe los posts y el árbol de
 * etiquetas para poder probarla con datos inventados.
 */
import { foldText } from './orders.js';
import { editionNav, seriesEditions, seriesOfTags, seriesTagIds } from '$lib/utils/series.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} Posts */

/**
 * @typedef {{ ids: string[], label: string }} DoorSeries
 * `ids`: etiquetas de serie del evento (vacío si no tiene); `label`: para mostrar ("Picantearla").
 */

/**
 * Las series de un evento (por etiqueta) y sus ediciones anteriores.
 *
 * @param {Posts} posts posts procesados (fetchMarkdownPosts)
 * @param {TagManager} tags árbol de etiquetas
 * @param {string} slug
 * @returns {{ series: DoorSeries, earlier: string[] }}
 */
export function doorSeries(posts, tags, slug) {
	const post = posts.find((p) => p.meta?.category === 'calendario' && p.meta.postID === slug);
	/** @type {string[]} */
	const ids = [];
	/** @type {string[]} */
	const names = [];
	/** @type {Set<string>} */
	const earlier = new Set();
	for (const id of seriesOfTags(post?.meta?.tags, seriesTagIds(tags))) {
		const editions = seriesEditions(posts, id);
		const nav = editionNav(editions, slug);
		if (!nav) continue;
		ids.push(id);
		names.push(tags.get(id)?.visible_name ?? id);
		for (const e of editions.slice(0, nav.index)) earlier.add(e.slug);
	}
	return { series: { ids, label: names.join(' / ') }, earlier: [...earlier] };
}

/**
 * @typedef {{
 *   known: boolean,
 *   series: DoorSeries,
 *   events: string[],
 *   names: Set<string>,
 *   emails: Set<string>
 * }} PriorAttendance
 * `events`: ediciones anteriores con alguna entrada que cuenta.
 */

/** Tope de parámetros por consulta (D1 acepta 100). */
const CHUNK = 90;

/**
 * Quiénes fueron a ediciones anteriores de la serie del evento `slug`.
 *
 * @param {D1Database} db
 * @param {{ slug: string, posts: Posts, tags: TagManager }} input
 * @returns {Promise<PriorAttendance>}
 */
export async function priorAttendance(db, { slug, posts, tags }) {
	const { series, earlier } = doorSeries(posts, tags, slug);
	/** @type {PriorAttendance} */
	const out = { known: false, series, events: [], names: new Set(), emails: new Set() };
	/** @type {Set<string>} */
	const events = new Set();

	for (let i = 0; i < earlier.length; i += CHUNK) {
		const chunk = earlier.slice(i, i + CHUNK);
		const marks = chunk.map((_, j) => `?${j + 1}`).join(', ');
		const rows = await db
			.prepare(
				`SELECT t.event_slug, t.holder_name, o.buyer_email FROM tickets t
				JOIN orders o ON o.id = t.order_id
				WHERE t.event_slug IN (${marks})
					AND (o.status = 'approved' OR t.checked_in_at IS NOT NULL)`
			)
			.bind(...chunk)
			.all();
		for (const r of rows.results) {
			events.add(String(r.event_slug));
			const name = foldText(r.holder_name);
			if (name) out.names.add(name);
			const email = String(r.buyer_email ?? '')
				.trim()
				.toLowerCase();
			if (email) out.emails.add(email);
		}
	}
	out.events = [...events];
	out.known = out.events.length > 0;
	return out;
}

/**
 * ¿Es la primera vez de esta persona en la serie? `null` si no se sabe (ver arriba).
 *
 * @param {{ holder: string, buyerName: string, buyerEmail: string }} person
 * @param {PriorAttendance} prior
 * @returns {boolean | null}
 */
export function isFirstTime({ holder, buyerName, buyerEmail }, prior) {
	if (!prior.known) return null;
	const name = foldText(holder);
	if (name && prior.names.has(name)) return false;
	const email = String(buyerEmail ?? '')
		.trim()
		.toLowerCase();
	if (email && name && name === foldText(buyerName) && prior.emails.has(email)) return false;
	return true;
}

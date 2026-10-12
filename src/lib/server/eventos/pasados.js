/**
 * Los eventos pasados de /calendario, de a un mes (docs/seo.md, «Peso de las páginas»): la página
 * trae los próximos enteros y, de los pasados, solo los del mes que abre; los de otro mes los pide
 * a /api/calendario/pasados cuando alguien va a ese mes. Antes viajaban los ~500 en cada visita.
 *
 * De un pasado va solo lo que usan la grilla del mes y el botón «Mostrar eventos pasados»
 * (nunca el lugar: así no hay que repetir las reglas de privacidad); la lista los muestra enteros
 * recién cuando alguien pide verlos (/api/posts).
 */
import { argDate } from '$lib/utils/dates.js';
import { isCurrent } from '$lib/utils/allPosts';
import { allWorkshops } from '$lib/server/eventos/partes.js';
import { partLabelsBySlug } from '$lib/utils/partes.js';

/** Lo que llega de un evento pasado. */
export const PAST_EVENT_FIELDS = Object.freeze([
	'title',
	'start',
	'end',
	'tags',
	'featured',
	'status',
	'layout',
	'category',
	'postID',
	'redirect',
	'mark',
	'parte'
]);

/**
 * @param {AnyPostData} meta
 * @returns {AnyPostData}
 */
export function slimPastMeta(meta) {
	/** @type {Record<string, any>} */
	const m = meta;
	return /** @type {AnyPostData} */ (
		Object.fromEntries(PAST_EVENT_FIELDS.filter((k) => k in m).map((k) => [k, m[k]]))
	);
}

/**
 * true si el evento ya empezó y empezó en `month` (yyyy-MM, hora de Argentina).
 * @param {ProcessedPost} post
 * @param {string} month
 * @param {number} now
 */
export function isPastIn(post, month, now) {
	if (isCurrent(post, now)) return false;
	const start = new Date(post.meta.start);
	return !isNaN(start.getTime()) && argDate(start).slice(0, 7) === month;
}

/**
 * Los eventos de `month` que ya empezaron, con solo {@link PAST_EVENT_FIELDS}, en el orden de
 * `posts`.
 * @param {ProcessedPost[]} posts los del calendario
 * @param {string} month yyyy-MM
 * @param {number} [now]
 * @returns {ProcessedPost[]}
 */
export function pastEventsOf(posts, month, now = Date.now()) {
	return posts
		.filter((p) => isPastIn(p, month, now))
		.map((p) => /** @type {ProcessedPost} */ ({ ...p, meta: slimPastMeta(p.meta) }));
}

/**
 * «Parte N de M» de los talleres en varias partes (docs/talleres-partes.md), por slug. Si no se
 * pueden leer, sin etiquetas (la página anda igual).
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export function partLabelsOrNone(db) {
	return allWorkshops(db)
		.then(partLabelsBySlug)
		.catch((e) => {
			console.error('[partes] no se pudieron leer los talleres:', e);
			return new Map();
		});
}

/**
 * Los eventos pasados de /calendario, de a un mes (docs/seo.md, «Peso de las páginas»): la página
 * trae los próximos enteros y, de los pasados, solo los del mes que abre; los de otro mes los pide
 * a /api/calendario/pasados cuando alguien va a ese mes. Antes viajaban los ~500 en cada visita.
 *
 * De un pasado va solo lo que usan la grilla del mes y el botón «Mostrar eventos pasados»
 * (nunca el lugar: así no hay que repetir las reglas de privacidad); la lista los muestra enteros
 * recién cuando alguien pide verlos, también de a un mes (/api/calendario/pasados?enteros=1, con
 * el lugar como en /api/posts). Antes «Mostrar eventos pasados» bajaba /api/posts entero.
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
 * Los eventos de `month` que ya empezaron, enteros (para la lista con «Mostrar eventos pasados»),
 * en el orden de `posts`. El lugar vinculado lo pone quien llama (`withVenuePlaces`).
 * @param {ProcessedPost[]} posts los del calendario
 * @param {string} month yyyy-MM
 * @param {number} [now]
 * @returns {ProcessedPost[]}
 */
export function fullPastEventsOf(posts, month, now = Date.now()) {
	return posts.filter((p) => isPastIn(p, month, now));
}

/**
 * El mes (yyyy-MM, hora de Argentina) del evento más viejo, o `null` si no hay ninguno con fecha:
 * hasta ahí ofrece la lista «Mostrar el mes anterior».
 * @param {ProcessedPost[]} posts los del calendario
 * @returns {string | null}
 */
export function firstEventMonth(posts) {
	let first = null;
	for (const p of posts) {
		const start = new Date(p.meta.start);
		if (isNaN(start.getTime())) continue;
		const month = argDate(start).slice(0, 7);
		if (first === null || month < first) first = month;
	}
	return first;
}

/**
 * Las etiquetas «Parte N de M»: recordadas con la marca del contenido mientras no cambie (guardar
 * las partes guarda el taller y mueve la marca; src/lib/server/contenido/posts.js,
 * `fromContentState`), o leídas de la base.
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
async function labelsKnownOrRead(db) {
	const read = () => allWorkshops(db).then(partLabelsBySlug);
	if (!db) return read();
	const { fromContentState } = await import('$lib/server/contenido/posts.js');
	return (await fromContentState(db, 'partLabels', read)) ?? read();
}

/**
 * «Parte N de M» de los talleres en varias partes (docs/talleres-partes.md), por slug. Si no se
 * pueden leer, sin etiquetas (la página anda igual).
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export function partLabelsOrNone(db) {
	return labelsKnownOrRead(db).catch((e) => {
		console.error('[partes] no se pudieron leer los talleres:', e);
		return new Map();
	});
}

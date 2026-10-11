/**
 * El modo inline del bot (docs/telegram.md, «Modo inline»): en cualquier chat, `@<bot> <texto>`
 * muestra lo que coincide de **todo lo público del sitio** (eventos, material, la Kinkipedia,
 * amigues y series), y elegir un resultado manda una tarjeta compacta con «Ver en el sitio» (y
 * «Entradas» si el evento vende acá).
 *
 * Sin reglas propias de visibilidad: lo único que puede salir es lo que está en el índice público
 * de la búsqueda (`publicSearchIndex`, el mismo de /api/search-index.json, que ya deja afuera lo
 * oculto, lo «solo con cuenta», lo sin aprobar, lo no listado y lo borrado). Lo de más que suma
 * (imagen, fecha, tipo de perfil, lugar y venta de un evento) se busca solo para las direcciones
 * que ya están en el índice, y el lugar sale de las mismas funciones que la página del evento.
 *
 * Funciones puras (salvo el tope por persona, en memoria): reciben la fuente ya armada
 * (inlineSource.js) y devuelven el `answerInlineQuery`.
 */
import { fold, groupHits, search } from '$lib/utils/search';
import { KIND_LABELS } from '$lib/utils/perfiles.js';
import { isMediaPath, isPublicMediaUrl } from '$lib/utils/media.js';
import { PRODUCTION_HOST } from '$lib/utils/seo.js';
import { escapeHtml, formatWhen } from './format.js';
import { truncate } from './keyboards.js';
import { isHttps, tgTime } from './screens.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('$lib/utils/search').PreparedIndex} PreparedIndex */
/** @typedef {import('./deliver.js').BotPlan} BotPlan */
/** @typedef {import('./screens.js').Button} Button */

/**
 * Lo que se sabe de una dirección del índice además de lo que trae el índice: la imagen (la
 * dirección que usa el sitio), la fecha para ordenar el material, el tipo de un perfil y, de un
 * evento, su metadata (para el lugar y la venta, con las funciones de la página).
 *
 * @typedef {{ image?: string, time?: number, kind?: string, meta?: Record<string, any> }} InlineExtra
 */

/**
 * La fuente del modo inline: el índice público y sus extras, por dirección.
 *
 * @typedef {{ docs: readonly SearchDoc[], prepared: PreparedIndex,
 *   extras: ReadonlyMap<string, InlineExtra> }} InlineSource
 */

/**
 * Lo público de la tarjeta de un evento para el modo inline: el lugar como lo muestra la página,
 * la zona (barrio y ciudad si la página los muestra) y la venta.
 *
 * @typedef {{ place?: string, area?: string,
 *   ticket?: import('$lib/utils/ticketCta.js').TicketCta | null }} InlineEventInfo
 */

/**
 * @typedef {{
 *   source: () => Promise<InlineSource | null>,
 *   events?: (metas: Record<string, any>[]) => Promise<Map<string, InlineEventInfo>>
 * }} InlineDeps `events`: el lugar y la venta de los eventos de la página (events.js).
 */

/**
 * Los textos del modo inline, en un solo lugar (cuando esté el registro «Textos del bot», van ahí).
 */
export const INLINE_TEXTS = Object.freeze({
	/** El botón de la tarjeta que abre la página. */
	viewOnSite: 'Ver en el sitio',
	/** El botón de la tarjeta de un evento que vende entradas acá. */
	tickets: '🎟 Entradas',
	/** El botón arriba de los resultados cuando no hay ninguno (abre el bot en privado). */
	noResults: 'No encontré nada. Probá en el bot',
	/** Arriba de los resultados cuando el sitio no tiene nada que mostrar todavía. */
	nothingYet: 'Todavía no hay nada para mostrar. Abrí el bot',
	/** La descripción de una serie (sin resumen). */
	series: 'Serie de eventos',
	/** La descripción de una entrada de la Kinkipedia sin resumen. */
	wiki: 'Kinkipedia',
	/** La descripción de un material sin resumen. */
	material: 'Material'
});

/** Resultados por página (Telegram acepta hasta 50). */
export const INLINE_PAGE = 20;

/** Hasta cuántos resultados se recorren con «más» (`next_offset`). */
export const INLINE_MAX = 200;

/** Cuánto guarda Telegram la respuesta (segundos): es la misma para todes. */
export const INLINE_CACHE_SECONDS = 120;

/** Con la consulta vacía: cuántos materiales van después de los próximos eventos. */
export const EMPTY_MATERIAL = 5;

/** Largo máximo de lo buscado (Telegram manda hasta 256 caracteres). */
const QUERY_MAX = 100;

/** El deep link que abre el buscador del bot en privado (nav.js). */
const SEARCH_START = 'buscar';

/**
 * Los prefijos que acotan el tipo («evento: cuerdas»). Sin tildes ni mayúsculas.
 *
 * @type {Readonly<Record<string, readonly SearchDoc['c'][]>>}
 */
export const INLINE_PREFIXES = Object.freeze({
	evento: ['calendario'],
	eventos: ['calendario'],
	material: ['material'],
	wiki: ['wiki', 'serie'],
	kinkipedia: ['wiki', 'serie'],
	serie: ['serie'],
	series: ['serie'],
	amigues: ['amigues']
});

/**
 * «evento: cuerdas» → `{ types: ['calendario'], text: 'cuerdas' }`. Sin prefijo, `types: null`.
 *
 * @param {unknown} query
 * @returns {{ types: readonly SearchDoc['c'][] | null, text: string }}
 */
export function parseInlineQuery(query) {
	const q = (typeof query === 'string' ? query : '').trim().slice(0, QUERY_MAX);
	const match = /^([\p{L}]+)\s*:\s*([\s\S]*)$/u.exec(q);
	const types = match ? INLINE_PREFIXES[fold(match[1])] : undefined;
	if (match && types) return { types, text: match[2].trim() };
	return { types: null, text: q };
}

/** @param {SearchDoc} doc */
const startOf = (doc) => (doc.d ? Date.parse(doc.d) : NaN);

/**
 * @param {readonly SearchDoc[]} docs
 * @param {number} now
 */
function upcomingEvents(docs, now) {
	return docs
		.filter((d) => d.c === 'calendario' && startOf(d) > now)
		.sort((a, b) => startOf(a) - startOf(b));
}

/**
 * @param {readonly SearchDoc[]} docs
 * @param {InlineSource['extras']} extras
 */
function recentMaterial(docs, extras) {
	const time = (/** @type {SearchDoc} */ d) => extras.get(d.h)?.time ?? -Infinity;
	return docs.filter((d) => d.c === 'material').sort((a, b) => time(b) - time(a) || 0);
}

/**
 * Qué se muestra, en orden. Con texto: el mismo buscador y el mismo orden que la búsqueda del
 * sitio (`search` + `groupHits`: próximos, series, material, amigues, Kinkipedia, pasados). Sin
 * texto: los próximos eventos y después algunos materiales recientes; con un prefijo, todo lo de
 * ese tipo (los eventos, solo los próximos).
 *
 * @param {InlineSource} source
 * @param {{ types: readonly SearchDoc['c'][] | null, text: string }} query
 * @param {number} now
 * @returns {SearchDoc[]}
 */
export function selectInline(source, { types, text }, now) {
	const allowed = (/** @type {SearchDoc} */ d) => !types || types.includes(d.c);
	if (text) {
		return groupHits(search(source.prepared, text), now)
			.flatMap((g) => g.hits.map((h) => h.doc))
			.filter(allowed)
			.slice(0, INLINE_MAX);
	}
	const { docs, extras } = source;
	if (!types) {
		return [...upcomingEvents(docs, now), ...recentMaterial(docs, extras).slice(0, EMPTY_MATERIAL)];
	}
	if (types.includes('calendario')) return upcomingEvents(docs, now).slice(0, INLINE_MAX);
	if (types.includes('material')) return recentMaterial(docs, extras).slice(0, INLINE_MAX);
	return docs
		.filter(allowed)
		.sort((a, b) => a.t.localeCompare(b.t, 'es'))
		.slice(0, INLINE_MAX);
}

/** Lado de la miniatura, en píxeles. */
export const THUMB_SIZE = 160;

/** Cómo se achica (Cloudflare Images, como `resizedImageUrl` de seo.js, pero chiquita). */
const THUMB_OPTIONS = `width=${THUMB_SIZE},height=${THUMB_SIZE},fit=cover,format=jpeg,quality=75`;

/** La foto de la tarjeta compacta en el chat (siteScreens.js): más grande, sin recortar. */
export const CARD_IMAGE_OPTIONS = 'width=480,format=jpeg,quality=80';

/**
 * La miniatura de una imagen del sitio para la lista de resultados, o `null`. **Nunca la imagen
 * entera**: solo una imagen de la biblioteca servida desde {@link PRODUCTION_HOST}, achicada por
 * las transformaciones de Cloudflare (sin `onerror=redirect`: si no se puede achicar, Telegram no
 * muestra miniatura en lugar de bajar la original). En un preview o en local no hay miniaturas.
 *
 * @param {unknown} src la imagen como la usa el sitio (`/media/img/…`)
 * @param {string} origin
 * @param {string} [options] cómo se achica (por defecto, la miniatura de {@link THUMB_SIZE} px)
 */
export function inlineThumbUrl(src, origin, options = THUMB_OPTIONS) {
	if (typeof src !== 'string' || !src) return null;
	/** @type {URL} */
	let url;
	try {
		url = new URL(src, isPublicMediaUrl(src) ? undefined : origin);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.hostname !== PRODUCTION_HOST) return null;
	if (!isMediaPath(url.pathname) || url.search || url.hash) return null;
	return `${url.origin}/cdn-cgi/image/${options}${url.pathname}`;
}

/** La dirección del evento («/calendario/<evento>»). @param {SearchDoc} doc */
export const eventSlugOf = (doc) =>
	doc.c === 'calendario' && doc.h.startsWith('/calendario/')
		? decodeURIComponent(doc.h.slice('/calendario/'.length))
		: null;

/**
 * La descripción corta de un resultado (texto plano, sin HTML).
 *
 * @param {SearchDoc} doc
 * @param {InlineExtra | undefined} extra
 * @param {InlineEventInfo | undefined} event
 * @param {number} now
 * @param {number} [max] largo máximo
 */
export function inlineDescription(doc, extra, event, now, max = 120) {
	if (doc.c === 'calendario') {
		const when = doc.d ? formatWhen(doc.d, now) : '';
		return truncate([when, event?.area ?? ''].filter(Boolean).join(' · '), max);
	}
	const summary = doc.s || doc.b || '';
	if (doc.c === 'amigues') {
		const kind = KIND_LABELS[/** @type {keyof typeof KIND_LABELS} */ (extra?.kind ?? '')];
		return truncate([kind ?? KIND_LABELS.persona, summary].filter(Boolean).join(' · '), max);
	}
	if (summary) return truncate(summary, max);
	return doc.c === 'serie'
		? INLINE_TEXTS.series
		: doc.c === 'wiki'
			? INLINE_TEXTS.wiki
			: INLINE_TEXTS.material;
}

/**
 * El título con el ícono de la etiqueta (Kinkipedia y series), si tiene.
 *
 * @param {SearchDoc} doc
 */
export const titleOf = (doc) => truncate(`${doc.i ? `${doc.i} ` : ''}${doc.t}`, 200);

/**
 * La tarjeta que se manda al elegir un resultado: título, una o dos líneas y los botones. Para un
 * evento, como la tarjeta del bot (screens.js): la fecha con `tg-time`, el lugar como lo muestra la
 * página y el estado de la venta si no se puede comprar.
 *
 * @param {SearchDoc} doc
 * @param {InlineExtra | undefined} extra
 * @param {InlineEventInfo | undefined} event
 * @param {{ origin: string, now: number }} ctx
 * @returns {{ text: string, keyboard: Button[][] }}
 */
export function inlineCard(doc, extra, event, ctx) {
	const url = `${ctx.origin}${doc.h}`;
	const lines = [`<b>${escapeHtml(titleOf(doc))}</b>`];
	if (doc.c === 'calendario') {
		const when = doc.d ? tgTime(doc.d, ctx.now) : '';
		if (when) lines.push(`📅 ${when}`);
		if (event?.place) lines.push(`📍 ${escapeHtml(truncate(event.place, 200))}`);
		if (event?.ticket?.kind === 'note') lines.push(`🎟 ${escapeHtml(event.ticket.text)}`);
	} else {
		lines.push(escapeHtml(inlineDescription(doc, extra, event, ctx.now)));
	}
	/** @type {Button[][]} */
	const keyboard = [];
	if (isHttps(ctx.origin)) {
		/** @type {Button[]} */
		const row = [{ text: INLINE_TEXTS.viewOnSite, url }];
		if (event?.ticket?.kind === 'buy') {
			row.push({ text: INLINE_TEXTS.tickets, url: `${ctx.origin}${event.ticket.href}` });
		}
		keyboard.push(row);
	} else {
		// Sin https Telegram no acepta botones con link: el link va en el texto.
		lines.push(`<a href="${escapeHtml(url)}">${escapeHtml(INLINE_TEXTS.viewOnSite)}</a>`);
	}
	return { text: lines.join('\n'), keyboard };
}

/**
 * Un resultado (`InlineQueryResultArticle`).
 *
 * @param {string} id
 * @param {SearchDoc} doc
 * @param {InlineExtra | undefined} extra
 * @param {InlineEventInfo | undefined} event
 * @param {{ origin: string, now: number }} ctx
 */
export function inlineArticle(id, doc, extra, event, ctx) {
	const card = inlineCard(doc, extra, event, ctx);
	const thumb = inlineThumbUrl(extra?.image, ctx.origin);
	return {
		type: 'article',
		id,
		title: titleOf(doc),
		description: inlineDescription(doc, extra, event, ctx.now),
		input_message_content: {
			message_text: card.text,
			parse_mode: 'HTML',
			link_preview_options: { is_disabled: true }
		},
		...(card.keyboard.length ? { reply_markup: { inline_keyboard: card.keyboard } } : {}),
		...(thumb
			? { thumbnail_url: thumb, thumbnail_width: THUMB_SIZE, thumbnail_height: THUMB_SIZE }
			: {})
	};
}

/**
 * El desplazamiento que mandó Telegram (lo que dimos en `next_offset`). Cualquier otra cosa, 0.
 *
 * @param {unknown} offset
 */
export function parseOffset(offset) {
	const n = typeof offset === 'string' && /^\d{1,4}$/.test(offset) ? Number(offset) : 0;
	return n <= INLINE_MAX ? n : INLINE_MAX;
}

// ---------------------------------------------------------------------------------------------
// Tope por persona (en memoria, sin la base)
// ---------------------------------------------------------------------------------------------

/** Consultas por persona y por minuto, en cada instancia del worker. */
export const INLINE_RATE = Object.freeze({ limit: 30, windowMs: 60 * 1000 });

/** @type {Map<number, { start: number, count: number }>} */
const hits = new Map();
const HITS_MAX = 5000;

/**
 * ¿Puede consultar? Telegram ya manda una consulta por pausa al escribir y guarda las respuestas
 * ({@link INLINE_CACHE_SECONDS}); esto corta a quien insista. En memoria: no escribe en la base
 * (un tope en D1 sería una escritura por letra).
 *
 * @param {number} userId
 * @param {number} now
 */
export function inlineAllowed(userId, now) {
	const entry = hits.get(userId);
	if (!entry || now - entry.start >= INLINE_RATE.windowMs) {
		if (hits.size >= HITS_MAX) hits.clear();
		hits.set(userId, { start: now, count: 1 });
		return true;
	}
	entry.count++;
	return entry.count <= INLINE_RATE.limit;
}

/** Para las pruebas. */
export function resetInlineRate() {
	hits.clear();
}

// ---------------------------------------------------------------------------------------------
// La respuesta
// ---------------------------------------------------------------------------------------------

/**
 * La respuesta a un `inline_query`: un `answerInlineQuery` (o `null` si no hay que contestar: sin
 * fuente, consulta rara o alguien que pasó el tope).
 *
 * @param {any} inlineQuery
 * @param {InlineDeps & { origin: string, now?: () => number }} deps
 * @returns {Promise<BotPlan | null>}
 */
export async function planInlineQuery(inlineQuery, deps) {
	const id = inlineQuery?.id;
	const userId = inlineQuery?.from?.id;
	if (typeof id !== 'string' || !id || typeof userId !== 'number') return null;
	const now = deps.now ? deps.now() : Date.now();
	if (!inlineAllowed(userId, now)) return null;
	const source = await deps.source();
	if (!source) return null;

	const query = parseInlineQuery(inlineQuery.query);
	const all = selectInline(source, query, now);
	const offset = parseOffset(inlineQuery.offset);
	const page = all.slice(offset, offset + INLINE_PAGE);
	const next = offset + INLINE_PAGE < all.length ? String(offset + INLINE_PAGE) : '';

	/** @type {Map<string, InlineEventInfo>} */
	let events = new Map();
	const metas = page
		.filter((d) => eventSlugOf(d))
		.map((d) => source.extras.get(d.h)?.meta)
		.filter((m) => m && typeof m === 'object');
	if (metas.length && deps.events) {
		try {
			events = await deps.events(/** @type {Record<string, any>[]} */ (metas));
		} catch (error) {
			// Sin lugar ni venta: mejor que sin respuesta.
			console.error(
				'[telegram] inline: no se pudo leer lugar y venta:',
				/** @type {Error} */ (error)?.name
			);
		}
	}
	const ctx = { origin: deps.origin, now };
	const results = page.map((doc, i) => {
		const slug = eventSlugOf(doc);
		return inlineArticle(
			String(offset + i),
			doc,
			source.extras.get(doc.h),
			slug ? events.get(slug) : undefined,
			ctx
		);
	});
	/** @type {Record<string, unknown>} */
	const answer = {
		method: 'answerInlineQuery',
		inline_query_id: id,
		results,
		cache_time: INLINE_CACHE_SECONDS,
		is_personal: false,
		next_offset: next
	};
	if (offset === 0 && results.length === 0) {
		answer.button = {
			text: query.text || query.types ? INLINE_TEXTS.noResults : INLINE_TEXTS.nothingYet,
			start_parameter: SEARCH_START
		};
	}
	return { steps: [/** @type {import('./deliver.js').BotMethod} */ (answer)] };
}

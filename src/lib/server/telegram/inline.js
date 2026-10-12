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
import { botText } from './texts.js';
import { startLink, startParam } from './nav.js';
import { richDocMessage } from './rich.js';
import { suggestSearches } from './searchSuggest.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('$lib/utils/search').PreparedIndex} PreparedIndex */
/** @typedef {import('./deliver.js').BotPlan} BotPlan */
/** @typedef {import('./screens.js').Button} Button */

/**
 * Lo que se sabe de una dirección del índice además de lo que trae el índice: la imagen (la
 * dirección que usa el sitio), la fecha para ordenar el material, el tipo de un perfil y, de un
 * evento, su metadata (para el lugar y la venta, con las funciones de la página).
 *
 * `unlisted`: un perfil no listado (un lugar al que lleva un evento): sale buscando, nunca en la
 * lista de la sección Amigues (sections.js).
 *
 * @typedef {{ image?: string, time?: number, kind?: string, meta?: Record<string, any>,
 *   unlisted?: boolean }} InlineExtra
 */

/**
 * Una etiqueta del árbol del sitio, para recorrer la Kinkipedia por ramas (sections.js): sus
 * madres (con `root` si es de arriba de todo), su nombre visible y sus hijas en el orden del
 * árbol (el de /wiki).
 *
 * @typedef {{ parents: readonly string[], name: string, children: readonly string[] }} TreeTag
 */

/**
 * La fuente del modo inline: el índice público y sus extras, por dirección. `tree`: el árbol de
 * etiquetas (por id), si se armó con él; sin árbol, la Kinkipedia del bot es una lista por nombre.
 *
 * @typedef {{ docs: readonly SearchDoc[], prepared: PreparedIndex,
 *   extras: ReadonlyMap<string, InlineExtra>, tree?: ReadonlyMap<string, TreeTag> }} InlineSource
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
 *   events?: (metas: Record<string, any>[]) => Promise<Map<string, InlineEventInfo>>,
 *   tags?: () => Promise<TagManager | null>,
 *   rich?: boolean,
 *   botUsername?: string | null
 * }} InlineDeps `events`: el lugar y la venta de los eventos de la página (events.js). `tags`:
 *   el árbol de etiquetas del sitio, para lo que se ofrece cuando no hay resultados
 *   (noResults.js: madres, hijas y relacionadas, y «Seguir»). `rich`: con
 *   `telegram_enriquecido` prendido (y el token, para poder volver a la tarjeta de siempre), los
 *   resultados van como mensajes enriquecidos (rich.js). `botUsername`: con el interruptor
 *   prendido, los eventos suman «📅 Abrir en el calendario» (la Mini App en ese evento).
 */

/**
 * El link que abre la Mini App del calendario (la Main Mini App del bot) en un evento:
 * `t.me/<bot>?startapp=ev-<id>`, con el mismo id que los deep links del bot (nav.js). La página
 * lo recibe como `tgWebAppStartParam`. `null` sin el usuario del bot.
 *
 * @param {string | null | undefined} botUsername
 * @param {string} slug
 */
export function miniAppEventLink(botUsername, slug) {
	const link = startLink(botUsername, startParam({ screen: 'event', slug }));
	return link ? link.replace('?start=', '?startapp=') : null;
}

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
 * Los próximos eventos del índice, del más cercano (también para Buscar sin resultados,
 * noResults.js).
 *
 * @param {readonly SearchDoc[]} docs
 * @param {number} now
 */
export function upcomingEvents(docs, now) {
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

/**
 * Cuando lo buscado no trae nada: lo que trae la primera búsqueda parecida (con el mismo prefijo,
 * si había), o `null`.
 *
 * @param {InlineSource} source
 * @param {{ types: readonly SearchDoc['c'][] | null, text: string }} query
 * @param {number} now
 * @returns {{ query: string, docs: SearchDoc[] } | null}
 */
export function similarInline(source, query, now) {
	for (const s of suggestSearches(source, query.text).suggestions) {
		const docs = selectInline(source, { types: query.types, text: s.query }, now);
		if (docs.length) return { query: s.query, docs };
	}
	return null;
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
	if (doc.c === 'serie') return botText('sitio.tipo_serie');
	if (doc.c === 'wiki') return botText('sitio.tipo_wiki');
	return botText('sitio.tipo_material');
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
		const row = [{ text: botText('sitio.boton_ver'), url }];
		if (event?.ticket?.kind === 'buy') {
			row.push({ text: botText('sitio.boton_entradas'), url: `${ctx.origin}${event.ticket.href}` });
		}
		keyboard.push(row);
	} else {
		// Sin https Telegram no acepta botones con link: el link va en el texto.
		lines.push(`<a href="${escapeHtml(url)}">${escapeHtml(botText('sitio.boton_ver'))}</a>`);
	}
	return { text: lines.join('\n'), keyboard };
}

/**
 * Un resultado (`InlineQueryResultArticle`). Con `rich`, el mensaje que se manda es enriquecido
 * (`InputRichMessageContent`, Bot API 10.1: el contenido se lee adentro del chat, sin imágenes por
 * URL); sin `rich`, o si no hay nada más que el título, la tarjeta de siempre. Con `botUsername`,
 * un evento suma «📅 Abrir en el calendario».
 *
 * @param {string} id
 * @param {SearchDoc} doc
 * @param {InlineExtra | undefined} extra
 * @param {InlineEventInfo | undefined} event
 * @param {{ origin: string, now: number, rich?: boolean, botUsername?: string | null }} ctx
 */
export function inlineArticle(id, doc, extra, event, ctx) {
	const card = inlineCard(doc, extra, event, ctx);
	const slug = eventSlugOf(doc);
	const calendar = slug && isHttps(ctx.origin) ? miniAppEventLink(ctx.botUsername, slug) : null;
	if (calendar)
		card.keyboard.push([{ text: botText('compartir.boton_calendario'), url: calendar }]);
	const rich = ctx.rich ? richDocMessage(doc, { title: titleOf(doc), now: ctx.now, event }) : null;
	const thumb = inlineThumbUrl(extra?.image, ctx.origin);
	// La vista previa del link (la imagen para compartir de la página) arriba del texto, así el
	// mensaje mandado también lleva foto (gorrite, 11/10), pero chica, al costado, como cuando une
	// usuarie achica la vista previa al mandar un link (gorrite, 12/10). Telegram lo toma como
	// preferencia. Sin https no arma la vista previa: se apaga.
	const preview = isHttps(ctx.origin)
		? { url: `${ctx.origin}${doc.h}`, prefer_small_media: true, show_above_text: true }
		: { is_disabled: true };
	return {
		type: 'article',
		id,
		title: titleOf(doc),
		description: inlineDescription(doc, extra, event, ctx.now),
		input_message_content: rich
			? { rich_message: rich }
			: { message_text: card.text, parse_mode: 'HTML', link_preview_options: preview },
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
	const found = selectInline(source, query, now);
	// Sin resultados: lo de la búsqueda parecida que más se acerca (searchSuggest.js), si hay.
	const similar = found.length === 0 && query.text ? similarInline(source, query, now) : null;
	const all = similar ? similar.docs : found;
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
	/** @param {boolean} rich */
	const answerWith = (rich) => {
		const ctx = {
			origin: deps.origin,
			now,
			...(rich ? { rich: true } : {}),
			...(deps.botUsername ? { botUsername: deps.botUsername } : {})
		};
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
		if (similar && offset === 0) {
			answer.button = {
				text: botText('sitio.inline_sugerencia', {
					busqueda: truncate(query.text, 16),
					sugerencia: truncate(similar.query, 16)
				}),
				start_parameter: SEARCH_START
			};
		} else if (offset === 0 && results.length === 0) {
			answer.button = {
				text: botText(
					query.text || query.types ? 'sitio.inline_sin_resultados' : 'sitio.inline_vacio'
				),
				start_parameter: SEARCH_START
			};
		}
		return /** @type {import('./deliver.js').BotMethod} */ (answer);
	};
	// Enriquecidos: si Telegram rechaza la respuesta, la misma con las tarjetas de siempre.
	if (deps.rich) return { steps: [answerWith(true)], fallback: [answerWith(false)] };
	return { steps: [answerWith(false)] };
}

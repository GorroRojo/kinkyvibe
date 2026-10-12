/**
 * Buscar sin resultados (docs/telegram.md, «Buscar»): en lugar de solo «No encontré nada», una
 * respuesta que sirva, en este orden:
 *
 * 1. **Parecidos**: lo buscado con otra letra (más tolerante que el buscador del sitio, que ya
 *    perdona un error), el nombre de una etiqueta parecida y, si lo buscado es una etiqueta, sus
 *    madres, hijas y relacionadas. Cada sugerencia es un botón que busca eso, y solo se ofrece si
 *    trae algo.
 * 2. **La sección más cercana** (Material, Kinkipedia, Amigues, Series o el calendario) con sus
 *    botones de siempre; si la etiqueta está en esa sección, ya filtrada por ella.
 * 3. **Lo que viene**: unos pocos próximos eventos, con la línea de la lista de resultados.
 * 4. **«⭐ Seguir»** cuando lo buscado es una etiqueta (solo por chat privado y con «Lo que sigo»
 *    prendido): el mismo `follow` que el botón del sitio y que «Seguir» en una tarjeta (seguir.js).
 *
 * Todo sale del índice público de la búsqueda (inlineSource.js) y del árbol de etiquetas del
 * sitio, con las funciones de siempre (las sugerencias, en searchSuggest.js sobre `search`;
 * `resolveTag` de Lo que sigo; `sectionDocs`).
 * Funciones puras, sin base. No guarda ni loguea quién buscó ni qué.
 */
import { resolveTag } from '$lib/server/sigo/targets.js';
import { truncate } from './keyboards.js';
import { encodeNav, shortHash } from './nav.js';
import { upcomingEvents } from './inline.js';
import { suggestSearches, tagRelatives, usedTags } from './searchSuggest.js';
import { isHttps, miniAppUrl } from './screens.js';
import { sectionDocs } from './sections.js';
import { docLine, homeButton } from './siteScreens.js';
import { botText } from './texts.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('./inline.js').InlineSource} InlineSource */
/** @typedef {import('./inline.js').InlineExtra} InlineExtra */
/** @typedef {import('./nav.js').SectionId} SectionId */
/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/** @typedef {import('./screens.js').Button} Button */

/**
 * @typedef {import('./searchSuggest.js').Suggestion} Suggestion
 * @typedef {{ key: string, title: string, hash: string }} SearchTag la etiqueta que es lo buscado
 * @typedef {{ id: SectionId | 'calendario', tag?: string }} NearSection `tag`: el hash de la
 *   etiqueta para abrir la sección filtrada (solo si está en esa sección).
 * @typedef {{ suggestions: Suggestion[], tag: SearchTag | null, section: NearSection | null,
 *   upcoming: SearchDoc[] }} NoResultsHelp
 */

/** Cuántos próximos eventos. */
export const UPCOMING_MAX = 3;

/**
 * La sección de una cosa del índice.
 *
 * @param {SearchDoc} doc
 * @returns {SectionId | 'calendario'}
 */
const sectionOf = (doc) =>
	doc.c === 'material'
		? 'm'
		: doc.c === 'wiki'
			? 'w'
			: doc.c === 'amigues'
				? 'a'
				: doc.c === 'serie'
					? 's'
					: 'calendario';

/** Para desempatar. */
const SECTION_ORDER = ['m', 'w', 'a', 's', 'calendario'];

/**
 * La sección donde está la mayoría de estas cosas (empate: Material, Kinkipedia, Amigues, Series,
 * calendario). Si una de las etiquetas está en esa sección, la sección filtrada por la primera.
 *
 * @param {InlineSource} source
 * @param {readonly SearchDoc[]} docs
 * @param {readonly string[]} tags ids, en orden de preferencia
 * @returns {NearSection | null}
 */
function nearestSection(source, docs, tags) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const d of docs) counts.set(sectionOf(d), (counts.get(sectionOf(d)) ?? 0) + 1);
	const best = [...counts].sort(
		(a, b) => b[1] - a[1] || SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0])
	)[0]?.[0];
	if (!best) return null;
	if (best === 'calendario') return { id: 'calendario' };
	const id = /** @type {SectionId} */ (best);
	const inSection = sectionDocs(source, id);
	const tag = tags.find((t) => inSection.some((d) => d.g?.includes(t)));
	return tag ? { id, tag: shortHash(tag) } : { id };
}

/**
 * Qué ofrecer cuando lo buscado no trajo nada. Pura.
 *
 * @param {InlineSource} source el índice público
 * @param {string} query lo buscado, ya recortado (`clipQuery`)
 * @param {number} now
 * @param {TagManager | null} [manager] el árbol de etiquetas del sitio (sin él: sin madres, hijas
 *   ni «Seguir»)
 * @returns {NoResultsHelp}
 */
export function noResultsHelp(source, query, now, manager = null) {
	const resolved = manager && query ? resolveTag(manager, query) : null;
	const relatives = resolved && manager ? tagRelatives(manager, resolved.target.key) : [];
	const { suggestions, firstHits } = suggestSearches(source, query, relatives);

	// La sección: lo que tiene la etiqueta buscada (o sus parientes); si no, lo de la primera
	// sugerencia.
	const family = resolved ? [resolved.target.key, ...relatives] : [];
	const tagged = family.length
		? source.docs.filter((d) => d.g?.some((g) => family.includes(g)))
		: [];
	const used = usedTags(source);
	const suggestedTags = suggestions.map((s) => s.query).filter((q) => used.has(q));
	const section = nearestSection(source, tagged.length ? tagged : firstHits, [
		...family,
		...suggestedTags
	]);

	return {
		suggestions,
		tag: resolved
			? {
					key: resolved.target.key,
					title: resolved.title,
					hash: shortHash(resolved.target.key)
				}
			: null,
		section,
		upcoming: upcomingEvents(source.docs, now).slice(0, UPCOMING_MAX)
	};
}

/** El botón de cada sección (los del inicio). @type {Record<SectionId, string>} */
const SECTION_BUTTON = {
	m: 'secciones.boton_material',
	w: 'secciones.boton_kinkipedia',
	a: 'secciones.boton_amigues',
	s: 'secciones.boton_series'
};

/**
 * El botón de la sección más cercana: el de la sección en el inicio (filtrada por la etiqueta si
 * hay); el calendario, la Mini App en privado (como en el inicio) o la lista de próximos.
 *
 * @param {NearSection} section
 * @param {ScreenCtx} ctx
 * @returns {Button}
 */
function sectionButton(section, ctx) {
	if (section.id === 'calendario') {
		const text = botText('inicio.boton_calendario');
		return ctx.chat === 'private' && isHttps(ctx.origin)
			? { text, web_app: { url: miniAppUrl(ctx.origin) } }
			: { text, callback_data: encodeNav({ screen: 'list', view: 'p', page: 0 }) };
	}
	return {
		text: botText(SECTION_BUTTON[section.id]),
		callback_data: encodeNav({
			screen: 'section',
			section: section.id,
			page: 0,
			...(section.tag ? { tag: section.tag } : {})
		})
	};
}

/**
 * ¿Se ofrece «⭐ Seguir» para la etiqueta buscada? Solo por chat privado y con «Lo que sigo»
 * prendido (como en las tarjetas; en un grupo no se ofrece).
 *
 * @param {NoResultsHelp} help
 * @param {ScreenCtx} ctx
 */
export const offersFollow = (help, ctx) => Boolean(help.tag && ctx.sigo && ctx.chat === 'private');

/**
 * La pantalla de una búsqueda sin resultados: lo dice, ofrece parecidos, la sección más cercana,
 * lo que viene y «⭐ Seguir» si lo buscado es una etiqueta. Corta, para un teléfono.
 *
 * @param {string} query ya recortada (`clipQuery`)
 * @param {NoResultsHelp} help
 * @param {ScreenCtx} ctx
 * @param {{ extras?: ReadonlyMap<string, InlineExtra>, following?: boolean }} [opts]
 *   `following`: ya sigue la etiqueta (después de tocar «Seguir»)
 * @returns {Screen}
 */
export function noResultsScreen(query, help, ctx, { extras = new Map(), following = false } = {}) {
	const follow = offersFollow(help, ctx);
	const nombre = help.tag ? truncate(help.tag.title, 30) : '';
	const parts = [botText('sitio.sin_resultados', { busqueda: truncate(query, 60) })];
	if (help.suggestions.length) parts.push(botText('sitio.sugerencias'));
	if (follow) parts.push(botText('sitio.seguir_etiqueta', { nombre }));
	if (help.upcoming.length) {
		parts.push(
			`${botText('sitio.proximos')}\n${help.upcoming.map((d) => docLine(d, extras.get(d.h), ctx)).join('\n')}`
		);
	}

	/** @type {Button[][]} */
	const rows = help.suggestions.map((s) => [
		{
			text: botText('sitio.boton_sugerencia', {
				busqueda: truncate(s.query, 30),
				cantidad: s.count
			}),
			callback_data: encodeNav({ screen: 'site_results', query: s.query, page: 0 })
		}
	]);
	if (follow && help.tag) {
		rows.push([
			following
				? { text: botText('seguir.boton_ya', { nombre }), disabled: {} }
				: {
						text: botText('sitio.boton_seguir', { nombre }),
						callback_data: encodeNav({ screen: 'search_follow', tag: help.tag.hash, query })
					}
		]);
	}
	if (help.section) rows.push([sectionButton(help.section, ctx)]);
	rows.push([
		{ text: botText('eventos.boton_buscar_otra'), callback_data: encodeNav({ screen: 'search' }) },
		homeButton()
	]);
	return { text: parts.join('\n\n'), keyboard: rows };
}

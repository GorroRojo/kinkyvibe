/**
 * Las pantallas de la búsqueda en todo el sitio (docs/telegram.md, «Buscar»): la lista de
 * resultados marcada por tipo (📅 eventos, 📚 material, 📖 Kinkipedia y series, 👥 amigues) y la
 * tarjeta compacta de lo que no es un evento (los eventos siguen con su tarjeta, screens.js).
 * Funciones puras: reciben lo que ya salió del índice público de la búsqueda (inlineSource.js) y
 * devuelven una {@link Screen}. Están pensadas para reusarse en las listas por sección.
 */
import { escapeHtml } from './format.js';
import { truncate } from './keyboards.js';
import { encodeNav, shortHash } from './nav.js';
import {
	CARD_IMAGE_OPTIONS,
	INLINE_TEXTS,
	inlineDescription,
	inlineThumbUrl,
	titleOf
} from './inline.js';
import { CAPTION_MAX, isHttps, pagerRow, paginate, tgTime } from './screens.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('./inline.js').InlineExtra} InlineExtra */
/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/** @typedef {import('./screens.js').Button} Button */

/** El ícono de cada tipo, en la lista y en la tarjeta. @type {Readonly<Record<SearchDoc['c'], string>>} */
export const TYPE_EMOJI = Object.freeze({
	calendario: '📅',
	material: '📚',
	wiki: '📖',
	serie: '📖',
	amigues: '👥'
});

/** Los textos de la búsqueda en todo el sitio (cuando esté el registro «Textos del bot», van ahí). */
export const SITE_TEXTS = Object.freeze({
	back: '‹ Volver',
	again: '🔎 Buscar otra cosa',
	home: '🏠 Inicio',
	viewOnSite: INLINE_TEXTS.viewOnSite,
	/** @param {string} query */
	none: (query) =>
		`No encontré nada para «${escapeHtml(truncate(query, 60))}» en el sitio. Probá con otra palabra.`,
	/** @param {string} query @param {number} count */
	found: (query, count) =>
		`<b>Encontré ${count === 1 ? 'esto' : count} para «${escapeHtml(truncate(query, 60))}»</b>`
});

/** El hash de la dirección de una cosa, para su botón (nav.js). @param {SearchDoc} doc */
export const docHash = (doc) => shortHash(doc.h);

/** @returns {Button} */
const homeButton = () => ({ text: SITE_TEXTS.home, callback_data: encodeNav({ screen: 'home' }) });

/**
 * Un renglón de la lista: el ícono del tipo y el título con link al sitio; abajo, la fecha (los
 * eventos) o una línea (lo demás).
 *
 * @param {SearchDoc} doc
 * @param {InlineExtra | undefined} extra
 * @param {ScreenCtx} ctx
 */
export function docLine(doc, extra, ctx) {
	const now = ctx.now ?? Date.now();
	const link = `${TYPE_EMOJI[doc.c] ?? '•'} <a href="${escapeHtml(`${ctx.origin}${doc.h}`)}">${escapeHtml(titleOf(doc))}</a>`;
	const second =
		doc.c === 'calendario'
			? doc.d
				? tgTime(doc.d, now)
				: ''
			: escapeHtml(inlineDescription(doc, extra, undefined, now, 80));
	return second ? `${link}\n${second}` : link;
}

/**
 * La lista de resultados de buscar en todo el sitio, de a 5 (`PAGE_SIZE` de screens.js): un botón por cosa
 * (abre su tarjeta), «‹ 2/3 ›», «🔎 Buscar otra cosa» y «🏠 Inicio». El orden es el del buscador
 * del sitio.
 *
 * @param {string} query ya recortada (`clipQuery`)
 * @param {SearchDoc[]} docs
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @param {ReadonlyMap<string, InlineExtra>} [extras]
 * @returns {Screen}
 */
export function siteResultsScreen(query, docs, page, ctx, extras = new Map()) {
	const again = { text: SITE_TEXTS.again, callback_data: encodeNav({ screen: 'search' }) };
	if (docs.length === 0)
		return { text: SITE_TEXTS.none(query), keyboard: [[again], [homeButton()]] };
	const p = paginate(docs.length, page);
	const shown = docs.slice(p.from, p.to);
	const head = `${SITE_TEXTS.found(query, docs.length)}${p.pages > 1 ? ` · ${p.page + 1}/${p.pages}` : ''}`;
	const text = `${head}\n\n${shown.map((d) => docLine(d, extras.get(d.h), ctx)).join('\n\n')}`;
	/** @type {Button[][]} */
	const rows = shown.map((d) => [
		{
			text: `${TYPE_EMOJI[d.c] ?? '•'} ${truncate(d.t, 32)}`,
			callback_data: encodeNav({ screen: 'site_doc', hash: docHash(d), page: p.page, query })
		}
	]);
	const pager = pagerRow(p.page, p.pages, (n) =>
		encodeNav({ screen: 'site_results', query, page: n })
	);
	if (pager) rows.push(pager);
	rows.push([again], [homeButton()]);
	return { text, keyboard: rows };
}

/**
 * El botón «‹ Volver» a una página de resultados.
 *
 * @param {string} query
 * @param {number} page
 * @returns {Button}
 */
export const backToResults = (query, page) => ({
	text: SITE_TEXTS.back,
	callback_data: encodeNav({ screen: 'site_results', query, page })
});

/**
 * La tarjeta compacta de algo que no es un evento próximo (material, Kinkipedia, series, amigues,
 * un evento que ya pasó): título, una o dos líneas, la foto (achicada, solo si se puede) y los
 * botones «Ver en el sitio», «‹ Volver» y «🏠 Inicio».
 *
 * @param {SearchDoc} doc
 * @param {InlineExtra | undefined} extra
 * @param {ScreenCtx} ctx
 * @param {{ back?: Button | null }} [opts]
 * @returns {Screen}
 */
export function docScreen(doc, extra, ctx, { back = null } = {}) {
	const now = ctx.now ?? Date.now();
	const url = `${ctx.origin}${doc.h}`;
	const https = isHttps(ctx.origin);
	const icon = TYPE_EMOJI[doc.c];
	const lines = [`<b>${icon ? `${icon} ` : ''}${escapeHtml(titleOf(doc))}</b>`];
	if (doc.c === 'calendario') {
		const when = doc.d ? tgTime(doc.d, now) : '';
		if (when) lines.push(`📅 ${when}`);
	} else {
		const description = inlineDescription(doc, extra, undefined, now, 300);
		if (description) lines.push(escapeHtml(description));
	}
	if (!https)
		lines.push('', `<a href="${escapeHtml(url)}">${escapeHtml(SITE_TEXTS.viewOnSite)}</a>`);
	const text = lines.join('\n');
	/** @type {Button[][]} */
	const rows = [];
	if (https) rows.push([{ text: SITE_TEXTS.viewOnSite, url }]);
	rows.push(back ? [back, homeButton()] : [homeButton()]);
	const photo = inlineThumbUrl(extra?.image, ctx.origin, CARD_IMAGE_OPTIONS);
	return {
		text,
		keyboard: rows,
		...(photo && text.length <= CAPTION_MAX ? { photo } : {})
	};
}

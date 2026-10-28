/**
 * Mensajes enriquecidos del bot (Bot API 10.1–10.3, «Rich messages»; docs/telegram.md, «Mensajes
 * enriquecidos y compartir»): una entrada de la Kinkipedia, un material o un evento **se lee
 * adentro del chat** (título, resumen, el texto y un pie), con «Ver en el sitio» en los botones.
 * Detrás del interruptor `telegram_enriquecido`.
 *
 * Sin reglas propias de visibilidad: todo sale del índice público de la búsqueda (`SearchDoc`: el
 * título, el resumen y el cuerpo en texto plano y recortado que ya sirve /api/search-index.json) y,
 * de un evento, de lo mismo que su tarjeta (el lugar como lo muestra su página y la venta). Nada
 * que no esté ya en el índice o en la tarjeta de siempre.
 *
 * Se arma con el HTML de los mensajes enriquecidos (`InputRichMessage.html`): `<h3>`, `<p>`, `<i>`,
 * `<tg-time>`, `<figure><img>` y `<footer>`. Todo lo que viene del sitio va escapado. Funciones
 * puras.
 */
import { escapeHtml } from './format.js';
import { truncate } from './keyboards.js';
import { tgTime } from './screens.js';
import { botText } from './texts.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('./inline.js').InlineEventInfo} InlineEventInfo */
/**
 * Lo que va en `rich_message` (`InputRichMessage`, con `html`).
 *
 * @typedef {{ html: string }} RichMessage
 */

/** Largo buscado de cada párrafo (el cuerpo del índice viene en un solo renglón). */
export const PARAGRAPH_TARGET = 450;

/** Los tipos que se leen adentro del chat (amigues sigue con la tarjeta compacta). */
const RICH_TYPES = new Set(['wiki', 'serie', 'material', 'calendario']);

/**
 * Corta un texto en párrafos de más o menos {@link PARAGRAPH_TARGET} caracteres, siempre al final
 * de una oración (o, si una oración sola es muy larga, entera).
 *
 * @param {string} text
 * @param {number} [target]
 * @returns {string[]}
 */
export function paragraphs(text, target = PARAGRAPH_TARGET) {
	const clean = (text ?? '').replace(/\s+/g, ' ').trim();
	if (!clean) return [];
	const sentences = clean.split(/(?<=[.!?…])\s+(?=[¿¡«"(\p{Lu}\p{N}])/u);
	/** @type {string[]} */
	const out = [];
	let current = '';
	for (const s of sentences) {
		if (current && current.length + 1 + s.length > target) {
			out.push(current);
			current = s;
		} else current = current ? `${current} ${s}` : s;
	}
	if (current) out.push(current);
	return out;
}

/** El cuerpo sin el resumen repetido al principio (el índice a veces trae los dos). */
function bodyWithoutSummary(/** @type {string} */ body, /** @type {string} */ summary) {
	if (!summary) return body;
	const s = summary.replace(/…$/, '').trim();
	if (s && body.startsWith(s)) return body.slice(s.length).replace(/^[\s.:;,-]+/, '');
	return body;
}

/** Qué es, para el pie. @param {SearchDoc} doc */
function typeLabel(doc) {
	if (doc.c === 'calendario') return botText('compartir.tipo_evento');
	if (doc.c === 'serie') return botText('sitio.tipo_serie');
	if (doc.c === 'wiki') return botText('sitio.tipo_wiki');
	return botText('sitio.tipo_material');
}

/**
 * El mensaje enriquecido de algo del índice público, o `null` si no va (amigues, o algo sin nada
 * más que el título: ahí alcanza la tarjeta de siempre).
 *
 * @param {SearchDoc} doc
 * @param {{ title: string, now: number, event?: InlineEventInfo, photo?: string | null }} opts
 *   `title`: como lo muestra la tarjeta (con su ícono); `event`: el lugar y la venta de un evento
 *   (events.js); `photo`: una imagen ya achicada del sitio (solo en el chat del bot: en el modo
 *   inline Telegram no acepta imágenes por URL).
 * @returns {RichMessage | null}
 */
export function richDocMessage(doc, { title, now, event, photo = null }) {
	if (!RICH_TYPES.has(doc.c)) return null;
	const summary = (doc.s ?? '').trim();
	const body = bodyWithoutSummary((doc.b ?? '').trim(), summary);
	if (doc.c !== 'calendario' && !summary && !body) return null;

	/** @type {string[]} */
	const blocks = [];
	if (photo) blocks.push(`<figure><img src="${escapeHtml(photo)}"/></figure>`);
	blocks.push(`<h3>${escapeHtml(truncate(title, 200))}</h3>`);
	if (doc.c === 'calendario') {
		const when = doc.d ? tgTime(doc.d, now) : '';
		if (when) blocks.push(`<p>📅 ${when}</p>`);
		if (event?.place) blocks.push(`<p>📍 ${escapeHtml(truncate(event.place, 200))}</p>`);
		if (event?.ticket?.kind === 'note') blocks.push(`<p>🎟 ${escapeHtml(event.ticket.text)}</p>`);
	}
	if (summary) blocks.push(`<p><i>${escapeHtml(summary)}</i></p>`);
	for (const p of paragraphs(body)) blocks.push(`<p>${escapeHtml(p)}</p>`);
	// El índice recorta el cuerpo con «…»: lo demás se lee en el sitio.
	if (body.endsWith('…')) blocks.push(`<p><i>${botText('compartir.sigue')}</i></p>`);
	blocks.push(`<footer>${escapeHtml(botText('compartir.pie', { tipo: typeLabel(doc) }))}</footer>`);
	return { html: blocks.join('') };
}

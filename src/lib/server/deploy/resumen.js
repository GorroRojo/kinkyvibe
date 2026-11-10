/**
 * La descripción corta de un PR para el aviso «Cada deploy» (./aviso.js; gorrite: «also little
 * description would be nice»). Funciones puras, sin imports: texto plano, sin markdown, de una o
 * dos líneas.
 *
 * De dónde sale, en este orden:
 *
 * 1. Una línea `Aviso: …` del cuerpo del PR (convención opcional, en castellano, para gorrite;
 *    docs/telegram.md, «Cada deploy»).
 * 2. Una línea `Resumen: …` o `Qué cambia: …`, o el primer párrafo debajo de un título
 *    `## Resumen` / `## Qué cambia`.
 * 3. El primer párrafo del cuerpo (sin títulos, sin la línea `Plan:`, sin bloques de código ni
 *    tablas); si es una lista, su primer ítem.
 * 4. Lo mismo con el cuerpo del mensaje del commit (el del squash), sin los trailers.
 *
 * Si queda largo, la primera oración; si igual pasa de {@link SUMMARY_MAX}, se corta en una
 * palabra con «…».
 */

/** Hasta cuántos caracteres la descripción. */
export const SUMMARY_MAX = 200;

/** Líneas que nunca son descripción: la del plan, trailers de commit, la firma de Claude Code. */
const SKIP_LINE =
	/^\s*(?:[-*+]\s+)?(?:Plan:|Co-Authored-By:|Claude-Session:|Signed-off-by:|🤖|https:\/\/claude\.ai\/code\/)/i;
const AVISO = /^\s*(?:[-*+>]\s*)?\**Aviso\**\s*:\**\s*(\S.*)$/i;
const RESUMEN = /^\s*(?:[-*+>]\s*)?\**(?:Resumen|Qu[eé] cambia)\**\s*:\**\s*(\S.*)$/i;
const RESUMEN_HEADING = /^\s*#{1,6}\s*(?:Resumen|Qu[eé] cambia)\s*:?\s*$/i;
const HEADING = /^\s*#{1,6}\s/;
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,3}[.)])\s+/;
const FENCE = /^\s*(?:```|~~~)/;

/**
 * Markdown → texto plano de una línea: sin imágenes, links (queda el texto), `código`, negritas,
 * itálicas con `*`, comentarios HTML ni etiquetas.
 *
 * @param {string} md
 */
export function plainText(md) {
	return String(md)
		.replace(/<!--[^]*?-->/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
		.replace(/<\/?[a-z][^>]*>/gi, ' ')
		.replace(/`+([^`]*)`+/g, '$1')
		.replace(/(\*\*|__)(?=\S)([^]*?\S)\1/g, '$2')
		.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '$1$2')
		.replace(/~~(?=\S)([^]*?\S)~~/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Lo deja en {@link SUMMARY_MAX} caracteres: entero si entra; si no, la primera oración si entra;
 * si no, cortado en una palabra con «…».
 *
 * @param {string} text texto plano
 */
export function shorten(text) {
	if (text.length <= SUMMARY_MAX) return text;
	const sentence = /^.+?[.!?](?=\s|$)/.exec(text)?.[0];
	if (sentence && sentence.length >= 20 && sentence.length <= SUMMARY_MAX) return sentence;
	const cut = text.slice(0, SUMMARY_MAX - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > SUMMARY_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/**
 * Los párrafos de un texto markdown, como listas de líneas: sin bloques de código, comentarios
 * HTML, tablas, separadores ni las líneas de {@link SKIP_LINE}.
 *
 * @param {string} md
 * @returns {string[][]}
 */
function paragraphs(md) {
	// Hasta que no cambie: sacar un comentario puede armar otro (`<!<!-- -->-- -->`). Un `<!--`
	// sin cierre se corta hasta el final, como lo haría el navegador.
	let text = String(md);
	for (let prev = ''; prev !== text;) {
		prev = text;
		text = text.replace(/<!--[^]*?-->/g, '');
	}
	const lines = text
		.replace(/<!--[^]*$/, '')
		.replace(/\r\n?/g, '\n')
		.split('\n');
	/** @type {string[][]} */
	const out = [];
	/** @type {string[]} */
	let current = [];
	let fenced = false;
	const flush = () => {
		if (current.length) out.push(current);
		current = [];
	};
	for (const line of lines) {
		if (FENCE.test(line)) {
			fenced = !fenced;
			flush();
			continue;
		}
		if (fenced) continue;
		if (!line.trim() || /^\s*(?:[-*_]\s*){3,}$/.test(line) || /^\s*\|/.test(line)) {
			flush();
			continue;
		}
		if (SKIP_LINE.test(line)) continue;
		if (HEADING.test(line)) {
			flush();
			out.push([line]);
			continue;
		}
		current.push(line);
	}
	flush();
	return out;
}

/**
 * El texto de un párrafo: si es una lista, solo su primer ítem.
 *
 * @param {string[]} lines
 */
function paragraphText(lines) {
	if (LIST_ITEM.test(lines[0])) {
		const item = [lines[0].replace(LIST_ITEM, '')];
		for (const l of lines.slice(1)) {
			if (LIST_ITEM.test(l)) break;
			item.push(l);
		}
		return plainText(item.join(' '));
	}
	return plainText(lines.join(' '));
}

/**
 * La descripción de un texto markdown (pasos 1 a 3 de arriba), o '' si no hay.
 *
 * @param {string} md
 */
function summaryOf(md) {
	const text = String(md ?? '');
	if (!text.trim()) return '';
	for (const line of text.split(/\r?\n/)) {
		const m = AVISO.exec(line);
		if (m && plainText(m[1])) return shorten(plainText(m[1]));
	}
	for (const line of text.split(/\r?\n/)) {
		const m = RESUMEN.exec(line);
		if (m && plainText(m[1])) return shorten(plainText(m[1]));
	}
	const blocks = paragraphs(text);
	const under = blocks.findIndex((b) => b.length === 1 && RESUMEN_HEADING.test(b[0]));
	if (under >= 0) {
		const next = blocks[under + 1];
		if (next && !HEADING.test(next[0])) {
			const t = paragraphText(next);
			if (t) return shorten(t);
		}
	}
	for (const b of blocks) {
		if (HEADING.test(b[0])) continue;
		const t = paragraphText(b);
		if (t) return shorten(t);
	}
	return '';
}

/**
 * La descripción corta de un PR (o de un commit sin PR): del cuerpo del PR y, si no da nada, del
 * cuerpo del mensaje del commit (sin su primera línea, que es el título).
 *
 * @param {{ body?: string | null, commitMessage?: string | null }} input
 * @returns {string} texto plano (sin escapar), o '' si no hay
 */
export function prSummary({ body, commitMessage }) {
	const fromBody = summaryOf(body ?? '');
	if (fromBody) return fromBody;
	const commitBody = String(commitMessage ?? '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.slice(1)
		.join('\n');
	return summaryOf(commitBody);
}

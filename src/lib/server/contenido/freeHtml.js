/**
 * El cuerpo de un post con **HTML libre** (decisión 0004: superadmins pueden usar HTML libre) →
 * HTML, armado como lo arma mdsvex al compilar un .md, para que se vea igual que hoy:
 *
 * - markdown + GFM, con el HTML tal cual (también `<iframe>`, `<video>`…), leído como lo leía
 *   el parser de mdsvex (remark) donde CommonMark lo lee distinto: ver {@link likeMdsvex};
 * - el HTML escrito a mano no lo tocan los plugins de abajo (en mdsvex era un nodo `raw`), ver
 *   {@link holdRawHtml};
 * - las mismas transformaciones tipográficas que el sitio configura en mdsvex (`smartypants`:
 *   comillas tipográficas, `...` → …, `--` → – y `---` → —), ver {@link smartypants};
 * - los mismos plugins de rehype que svelte.config.js: `rehype-slug`, `customRehype` (anclas de los
 *   títulos, menciones `@alguien`, links `[[término]]`) y `rehype-toc` (el índice);
 * - los bloques `<script>` de mdsvex no salen en el HTML (tampoco hoy: son código del componente);
 *   sus imports de imágenes y archivos se resuelven antes con la misma URL que les da el build;
 * - los `<style>` propios se devuelven aparte (`css`): la página los aplica solo dentro del texto,
 *   como hace Svelte (ver {@link scopeCss}).
 *
 * Cuando se sacó mdsvex (decisión 0032) se comparó este HTML con el del componente que mdsvex
 * compilaba de cada .md (los 571 eventos y materiales y las 12 páginas de la wiki): todos dan lo
 * mismo salvo el embed de Instagram de un evento, que pierde el `<script>` de Instagram (queda su
 * tarjeta con el link). `freeHtml.test.js` tiene un caso inventado por cada diferencia que hubo.
 *
 * El HTML NO se limpia: solo se usa para textos que importó o guardó une superadmin
 * (`body_html: 'libre'`). Lo demás pasa por la lista corta (src/lib/server/amigues/sanitize.js).
 */
import { micromark } from 'micromark';
import { gfm } from 'micromark-extension-gfm';
// Las partes de GFM para HTML, sin `tagfilter` (que escaparía <iframe>, <style>…: esto es HTML
// libre, como en mdsvex). Son las mismas que arma `gfmHtml()`.
import { gfmAutolinkLiteralHtml } from 'micromark-extension-gfm-autolink-literal';
import { gfmFootnoteHtml } from 'micromark-extension-gfm-footnote';
import { gfmStrikethroughHtml } from 'micromark-extension-gfm-strikethrough';
import { gfmTableHtml } from 'micromark-extension-gfm-table';
import { gfmTaskListItemHtml } from 'micromark-extension-gfm-task-list-item';
import { rehype } from 'rehype';
import rehypeSlug from 'rehype-slug';
import toc from '@jsdevtools/rehype-toc';
import customRehype from '$lib/utils/customRehype.js';
import { resolveMediaImports } from '$lib/server/amigues/render.js';
import { tooDeepToRender } from '$lib/utils/htmlNesting.js';

/** Elementos cuyo texto no se toca (como smartypants). */
const SKIP_TAGS = new Set([
	'code',
	'pre',
	'kbd',
	'samp',
	'script',
	'style',
	'textarea',
	'math',
	'svg'
]);
/**
 * Etiquetas que en markdown (CommonMark) ya abren un bloque de HTML: a esas no hay que ayudarlas
 * (ver {@link likeMdsvex}).
 */
const HTML_BLOCK_TAGS = new Set(
	(
		'address article aside base basefont blockquote body caption center col colgroup dd details ' +
		'dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 ' +
		'head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option ' +
		'p param search section summary table tbody td tfoot th thead title tr track ul script style ' +
		'pre textarea'
	).split(' ')
);

/** Un ítem de lista: viñeta (`-`, `*`, `+`) o número, y después un espacio o nada. */
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
/** El comienzo de una línea dentro de citas (`> `, `> > `…) y lo que sigue. */
const QUOTED = /^((?:[ ]{0,3}>[ ]?)*)(.*)$/;

/**
 * Ajusta el markdown para que micromark (CommonMark) lo lea como lo lee el parser de mdsvex
 * (remark, más permisivo), en lo que cambia lo que se ve:
 * - una línea que empieza con una etiqueta HTML (`<small>…`, `<video …>…`, `</div>`) abre un
 *   bloque de HTML que sigue hasta la próxima línea en blanco (sin `<p>` alrededor), también en el
 *   medio de un párrafo o de una cita (`> <small>…`): se termina el párrafo con una línea en blanco
 *   y se pasa la etiqueta a su propia línea, que en CommonMark también abre un bloque. En un ítem
 *   de lista, no (remark la sigue como parte del ítem, igual que CommonMark);
 * - un ítem de lista vacío (`-` solo) seguido de una línea de texto: ese texto es el ítem;
 * - el énfasis con `*` que remark leía y CommonMark no (ver {@link legacyEmphasis}).
 * Fuera de los bloques de código. Los comentarios HTML se sacan (Svelte no los publica).
 *
 * @param {string} text
 */
export function likeMdsvex(text) {
	// Los comentarios HTML no se publican (Svelte los saca); uno que ocupa su propia línea en el
	// medio de una lista no la corta (en CommonMark, sí).
	// Hasta que no quede ninguno (sacar uno puede juntar las partes de otro: `<!<!---->--`).
	let clean = text.replace(/\r\n?/g, '\n').replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n/gm, '');
	for (let prev = ''; prev !== clean;) {
		prev = clean;
		clean = clean.replace(/<!--[\s\S]*?-->/g, '');
	}
	const lines = clean.split('\n');
	/** @type {string[]} */
	const out = [];
	let fence = '';
	// Dentro de un bloque de HTML (hasta la próxima línea en blanco): el markdown no se toca.
	let inHtml = false;
	// La primera línea del bloque actual (sin el `>` de las citas); '' después de una en blanco.
	let first = '';
	// Si en el bloque actual ya empezó una lista.
	let inList = false;
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		const f = /^\s*(```|~~~)/.exec(line);
		if (f || fence) {
			if (f) fence = fence ? (line.trim().startsWith(fence) ? '' : fence) : f[1];
			out.push(line);
			continue;
		}
		let [, quote, rest] = /** @type {RegExpExecArray} */ (QUOTED.exec(line));
		if (!rest.trim()) {
			inHtml = false;
			first = '';
			inList = false;
			out.push(line);
			continue;
		}
		const start = !first;
		if (start) first = rest;
		if (inHtml) {
			out.push(line);
			continue;
		}
		if (LIST_ITEM.test(rest)) inList = true;
		// `-` solo y en la línea siguiente el texto del ítem.
		const empty = /^([ \t]*(?:[-*+]|\d{1,9}[.)]))[ \t]*$/.exec(rest);
		const next = i + 1 < lines.length ? QUOTED.exec(lines[i + 1]) : null;
		if (empty && (start || inList) && next && next[1] === quote && next[2].trim()) {
			if (!LIST_ITEM.test(next[2]) && !/^\s*</.test(next[2])) {
				rest = `${empty[1]} ${next[2].trim()}`;
				line = quote + rest;
				i++;
			}
		}
		const tag = /^<\/?([a-zA-Z][\w-]*)(?:\s[^<>]*)?\/?>/.exec(rest);
		if (tag && (start || (!inList && !/^\s/.test(rest)))) {
			if (!start) {
				out.push(quote.trimEnd());
				first = rest;
				inList = false;
			}
			inHtml = true;
			const after = rest.slice(tag[0].length);
			if (!HTML_BLOCK_TAGS.has(tag[1].toLowerCase()) && after.trim()) {
				out.push(quote + tag[0], quote + after);
			} else out.push(line);
			continue;
		}
		const lead =
			/^(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+|[ \t]*#{1,6}[ \t]+|[ \t]*)/.exec(rest)?.[0] ?? '';
		out.push(quote + lead + legacyEmphasis(rest.slice(lead.length)));
	}
	return out.join('\n');
}

/** @param {string | undefined} c */
const isSpace = (c) => !c || /\s/.test(c);
/** @param {string | undefined} c */
const isPunct = (c) => !!c && /[\p{P}\p{S}]/u.test(c);

/**
 * Si la tira de `*` entre `from` y `to` puede abrir (`left`) o cerrar (`right`) un énfasis en
 * CommonMark («left/right-flanking delimiter run»).
 * @param {string} s
 * @param {number} from
 * @param {number} to
 */
function flanking(s, from, to) {
	const before = s[from - 1];
	const after = s[to];
	return {
		left: !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before)),
		right: !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after))
	};
}

/**
 * Dónde cierra el énfasis (`*…*`, `size` 1) o la negrita (`**…**`, `size` 2) que abre en `at`,
 * como lo buscaba remark (el parser de mdsvex): el primer `*` (o `**`) que no sigue con otro `*`,
 * con texto adentro; el de apertura puede tener un espacio después y el de cierre uno antes.
 * @param {string} s
 * @param {number} at
 * @param {1 | 2} size
 * @returns {number} la posición del cierre, o -1
 */
function remarkCloser(s, at, size) {
	let queue = '';
	let prev = '';
	for (let i = at + size; i < s.length; i++) {
		const c = s[i];
		if (c === '*' && (size === 1 || s[i + 1] === '*')) {
			if (s[i + size] !== '*') {
				if (!queue.trim() || (size === 1 && prev === '*')) return -1;
				return i;
			}
			// `**` adentro de un énfasis se saltea entero; `***` adentro de una negrita, de a uno
			// (como remark).
			queue += s.slice(i, i + 2);
			prev = '*';
			if (size === 1) i++;
			continue;
		}
		if (c === '\\') {
			queue += s.slice(i, i + 2);
			prev = s[i + 1] ?? '';
			i++;
			continue;
		}
		queue += c;
		prev = c;
	}
	return -1;
}

/**
 * El énfasis con `*` de una línea, como lo leía remark (el parser de mdsvex), donde CommonMark lo
 * lee distinto: `Dom* soy? … Subs* hay` (el de apertura pegado a una palabra y con un espacio
 * después), `** @alguien **` (espacios adentro) y `***así***` (negrita por fuera). Esos pasan a
 * `<em>`/`<strong>`; el resto queda como está. No mira adentro del código (`` `…` ``) ni de las
 * etiquetas HTML, y respeta los `\*` escapados.
 *
 * @param {string} s
 * @returns {string}
 */
export function legacyEmphasis(s) {
	if (!s.includes('*')) return s;
	let out = '';
	let i = 0;
	while (i < s.length) {
		const c = s[i];
		if (c === '\\') {
			out += s.slice(i, i + 2);
			i += 2;
			continue;
		}
		if (c === '`') {
			const ticks = /^`+/.exec(s.slice(i))?.[0] ?? '`';
			const close = s.slice(i + ticks.length).search(new RegExp(`(?<!\`)${ticks}(?!\`)`));
			const end = close < 0 ? i + ticks.length : i + ticks.length + close + ticks.length;
			out += s.slice(i, end);
			i = end;
			continue;
		}
		if (c === '<') {
			const t = /^<\/?[a-zA-Z][^<>]*>/.exec(s.slice(i));
			if (t) {
				out += t[0];
				i += t[0].length;
				continue;
			}
		}
		if (c !== '*') {
			out += c;
			i++;
			continue;
		}
		const run = /^\*+/.exec(s.slice(i))?.[0].length ?? 1;
		/** @type {1 | 2} */
		const size = run >= 2 ? 2 : 1;
		const close = remarkCloser(s, i, size);
		if (close < 0) {
			// remark prueba de nuevo desde el carácter siguiente.
			out += '*';
			i++;
			continue;
		}
		const closeRun = /^\*+/.exec(s.slice(close))?.[0].length ?? size;
		const inner = legacyEmphasis(s.slice(i + size, close));
		const sameInCommonMark =
			run < 3 && flanking(s, i, i + run).left && flanking(s, close, close + closeRun).right;
		const tagName = size === 2 ? 'strong' : 'em';
		const mark = '*'.repeat(size);
		out += sameInCommonMark ? mark + inner + mark : `<${tagName}>${inner}</${tagName}>`;
		i = close + size;
	}
	return out;
}

/**
 * Los links de markdown a otros sitios llevan `rel="nofollow"`, como en mdsvex
 * (`remark-external-links`). Se reconocen en lo que arma micromark: `<a href="https://…">` (el
 * HTML escrito a mano ya no está: ver {@link holdRawHtml}).
 *
 * @param {string} html
 */
function nofollow(html) {
	return html.replace(
		/<a href="(https?:[^"]*)"( title="[^"]*")?>/g,
		'<a href="$1"$2 rel="nofollow">'
	);
}

/** @param {string} s */
const escapeAttr = (s) =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * Las variables del frontmatter que un texto usa como mdsvex (`{title}`): su valor.
 *
 * @param {string} text
 * @param {Record<string, unknown>} vars
 */
function resolveVars(text, vars) {
	/** @param {string} name */
	const known = (name) =>
		Object.hasOwn(vars, name) && ['string', 'number', 'boolean'].includes(typeof vars[name]);
	return text
		.replace(/=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (all, name) =>
			known(name) ? `="${escapeAttr(String(vars[name]))}"` : all
		)
		.replace(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (all, name) =>
			known(name) ? escapeAttr(String(vars[name])) : all
		);
}

/** @typedef {{ value: string, type: 'space' | 'word' | 'sign' }} Token */

/** Signos que terminan una oración (retext: `terminalMarker`). */
const TERMINAL = /^[!.?…‽]+$/;
/** Signos de cierre que van con la oración anterior aunque vengan después de su final. */
const AFFIX = /^([)\]}"'\xBB’”›]|[!.?…‽])\1*$/;
/** Signos que, entre dos palabras, son parte de la palabra (`no-monógamx`, `6.400`, `it's`). */
const INNER_WORD = /^([&'\-.:=?@\xAD\xB7‐‑’‧]|_+)$/;
/** Abreviaturas: el punto después no termina la oración. */
const ABBREVIATION =
	/^([0-9]{1,3}|[a-z]|al|ca|cap|cca|cent|cf|cit|con|cp|cwt|ead|etc|ff|fl|ibid|id|nem|op|pro|seq|sic|stat|tem|viz)$/i;

/**
 * Las oraciones de un texto, como las arma retext (parse-latin) para smartypants: palabras,
 * espacios y signos (los signos iguales seguidos van juntos: `...`, `--`, `""`; un signo entre dos
 * palabras es parte de la palabra), en párrafos (los corta un salto de línea) y oraciones (las
 * corta un `.`, `?`, `!` o `…`, con sus excepciones: una «oración» sin palabras, o que empieza con
 * minúscula, número, `,` o `;`, sigue a la anterior; los signos de cierre después del final, también).
 * Los espacios del principio y del final de cada oración quedan afuera.
 *
 * @param {string} text
 * @returns {{ tokens: Token[], sentences: Token[][] }}
 */
function sentencesOf(text) {
	/** @type {Token[]} */
	const flat = (text.match(/\s+|[\p{L}\p{M}\p{N}]+|([^\s\p{L}\p{M}\p{N}])\1*/gu) ?? []).map(
		(value) => ({
			value,
			type: /^\s/.test(value) ? 'space' : /^[\p{L}\p{M}\p{N}]/u.test(value) ? 'word' : 'sign'
		})
	);
	/** @type {Token[]} */
	const tokens = [];
	for (const t of flat) {
		const n = tokens.length;
		if (t.type === 'word' && n >= 2 && tokens[n - 2].type === 'word') {
			const mid = tokens[n - 1];
			if (mid.type === 'sign' && INNER_WORD.test(mid.value)) {
				tokens[n - 2] = { type: 'word', value: tokens[n - 2].value + mid.value + t.value };
				tokens.pop();
				continue;
			}
		}
		tokens.push(t);
	}
	/** @type {Token[][]} */
	const sentences = [];
	/** @type {Token[]} */
	let cur = [];
	/** @type {Token[][]} */
	let para = [];
	const endParagraph = () => {
		if (cur.length) para.push(cur);
		cur = [];
		sentences.push(...mergeSentences(para));
		para = [];
	};
	for (const t of tokens) {
		if (t.type === 'space' && /[\n\r]/.test(t.value)) {
			endParagraph();
			continue;
		}
		cur.push(t);
		if (t.type === 'sign' && TERMINAL.test(t.value)) {
			para.push(cur);
			cur = [];
		}
	}
	endParagraph();
	return { tokens, sentences };
}

/**
 * Las excepciones de parse-latin al cortar oraciones (ver {@link sentencesOf}).
 * @param {Token[][]} list
 * @returns {Token[][]}
 */
function mergeSentences(list) {
	let s = list.filter((x) => x.length);
	// Sin palabras: con la anterior (o con la siguiente, si es la primera).
	for (let i = 0; i < s.length; i++) {
		if (s[i].some((t) => t.type === 'word')) continue;
		if (i > 0) s[i - 1].push(...s[i]);
		else if (s[i + 1]) s[i + 1].unshift(...s[i]);
		else continue;
		s.splice(i--, 1);
	}
	// Los signos de cierre del principio, a la anterior.
	for (let i = 1; i < s.length; i++) {
		while (s[i].length && s[i][0].type === 'sign' && AFFIX.test(s[i][0].value)) {
			s[i - 1].push(/** @type {Token} */ (s[i].shift()));
		}
	}
	s = s.filter((x) => x.length);
	/** @param {(x: Token[], prev: Token[]) => boolean} test */
	const intoPrevious = (test) => {
		for (let i = 1; i < s.length; i++) {
			if (test(s[i], s[i - 1])) {
				s[i - 1].push(...s[i]);
				s.splice(i--, 1);
			}
		}
	};
	// Empieza con minúscula, con número, o con `,`/`;`; o la anterior termina en una abreviatura.
	intoPrevious((x) => {
		const first = x.find((t) => t.type !== 'space');
		return first?.type === 'word' && /^\p{Ll}/u.test(first.value);
	});
	intoPrevious((x) => x[0].type === 'word' && /^\d/.test(x[0].value));
	intoPrevious((_, prev) => {
		const [word, stop] = prev.slice(-2);
		return stop?.value === '.' && word?.type === 'word' && ABBREVIATION.test(word.value);
	});
	intoPrevious((x) => {
		const first = x.find((t) => t.type !== 'space');
		return first?.type === 'sign' && (first.value === ',' || first.value === ';');
	});
	// Los puntos que no son el final de la oración van con la palabra de al lado (`etc.`).
	for (const x of s) {
		let found = false;
		for (let i = x.length - 1; i >= 0; i--) {
			const t = x[i];
			if (t.type !== 'sign') {
				if (t.type === 'word') found = true;
				continue;
			}
			if (!TERMINAL.test(t.value)) continue;
			if (!found) {
				found = true;
				continue;
			}
			if (t.value !== '.') continue;
			const [prev, next, after] = [x[i - 1], x[i + 1], x[i + 2]];
			if (prev?.type === 'word') {
				if (next?.type === 'space' && after?.value === '.') continue;
				prev.value += '.';
			} else if (next?.type === 'word') next.value = '.' + next.value;
			else continue;
			t.value = '';
			x.splice(i, 1);
		}
	}
	// Los espacios de las puntas, afuera.
	return s.map((x) => {
		let a = 0;
		let b = x.length;
		while (a < b && x[a].type === 'space') a++;
		while (b > a && x[b - 1].type === 'space') b--;
		return x.slice(a, b);
	});
}

/**
 * Las transformaciones tipográficas de mdsvex (`smartypants: { quotes, ellipses, dashes:
 * 'oldschool' }`, con retext-smartypants) sobre el texto de un nodo, decidiendo cada comilla por
 * lo que tiene al lado dentro de su oración (ver {@link sentencesOf}):
 * - `"` o `'` seguida de un signo y después algo que no es palabra (`", ` `"? `): cierra;
 * - dos comillas distintas seguidas antes de una palabra (`"'Hola`): abren las dos;
 * - antes de una década (`'80s`): cierra;
 * - después de espacio o signo y antes de una palabra: abre;
 * - después de una palabra: cierra;
 * - al final de la oración o antes de un espacio (o `'s`): cierra; si no, abre.
 * Un apóstrofo dentro de una palabra (`it's`) cierra. `---` → —, `--` → – y tres o más puntos
 * (también `. . .`) → …; `----` o `""` quedan como están.
 *
 * @param {string} text
 * @param {string} [_before] (ya no se usa: retext decide cada texto por separado)
 */
export function smartypants(text, _before = '') {
	const { tokens, sentences } = sentencesOf(text);
	const open = /** @type {Record<string, string>} */ ({ '"': '“', "'": '‘' });
	const close = /** @type {Record<string, string>} */ ({ '"': '”', "'": '’' });
	for (const t of tokens) {
		if (t.type === 'word' && t.value.includes("'")) t.value = t.value.replaceAll("'", '’');
		else if (t.value === '---') t.value = '—';
		else if (t.value === '--') t.value = '–';
		else if (/^\.{3,}$/.test(t.value)) t.value = '…';
	}
	for (const sentence of sentences) {
		for (let i = 0; i < sentence.length; i++) {
			const t = sentence[i];
			if (t.value === '.') {
				// `. . .`: los puntos con espacios en el medio, hacia atrás.
				let j = i;
				let count = 1;
				while (
					j - 2 >= 0 &&
					sentence[j - 1].type === 'space' &&
					/^\.+$/.test(sentence[j - 2].value)
				) {
					j -= 2;
					count++;
				}
				if (count >= 3) {
					for (const gone of sentence.splice(j, i - j)) gone.value = '';
					i = j;
					t.value = '…';
				}
			} else if (t.value === '"' || t.value === "'") {
				const prev = sentence[i - 1];
				const next = sentence[i + 1];
				const after = sentence[i + 2];
				if (next && after && next.type === 'sign' && after.type !== 'word') {
					t.value = close[t.value];
				} else if (after && (next.value === '"' || next.value === "'") && after.type === 'word') {
					t.value = open[t.value];
					next.value = open[next.value];
				} else if (next && /^\d\ds$/.test(next.value)) t.value = close[t.value];
				else if (prev && next && prev.type !== 'word' && next.type === 'word') {
					t.value = open[t.value];
				} else if (prev && prev.type === 'word') t.value = close[t.value];
				else if (!next || next.type === 'space' || (t.value === "'" && next.value === 's')) {
					t.value = close[t.value];
				} else t.value = open[t.value];
			}
		}
	}
	return tokens.map((t) => t.value).join('');
}

/**
 * Plugin de unified: {@link smartypants} en los textos (no en código ni estilos).
 * @returns {(tree: any) => void}
 */
function rehypeSmartypants() {
	return (tree) => {
		// Cada texto por separado, como mdsvex (una comilla pegada a una etiqueta, `"<b>x</b>"`,
		// queda como la deja mdsvex hoy).
		/** @param {any} node */
		const walk = (node) => {
			for (const child of node.children ?? []) {
				if (child.type === 'text') child.value = smartypants(child.value);
				else if (child.type === 'element' && !SKIP_TAGS.has(child.tagName)) walk(child);
			}
		};
		walk(tree);
	};
}

const WIKI = /\[\[([^\]:]+)( : [^\]]+)?\]\]/g;
const OPEN = '\uE000';
const CLOSE = '\uE001';
/**
 * Una arroba escapada (`\@alguien`: no es una mención). micromark saca la barra (CommonMark escapa
 * la puntuación) y `customRehype` vería una mención; el parser de mdsvex la dejaba y
 * `customRehype` la respetaba. Se esconde antes del markdown ({@link hideEscapedAt}) y vuelve como
 * `@` (o `\@` dentro de código, donde la barra se ve) en {@link rehypeRestoreBrackets}.
 */
const ESC_AT = '\uE002';

/**
 * Esconde las `\@` fuera de los bloques de código (ver {@link ESC_AT}).
 * @param {string} text
 */
function hideEscapedAt(text) {
	let fence = '';
	return text
		.split('\n')
		.map((line) => {
			const f = /^\s*(```|~~~)/.exec(line);
			if (f) {
				fence = fence ? (line.trim().startsWith(fence) ? '' : fence) : f[1];
				return line;
			}
			return fence ? line : line.replaceAll('\\@', ESC_AT);
		})
		.join('\n');
}

/**
 * Los links `[[término]]` / `[[término : texto]]` de la wiki, como los arma `customRehype` en los
 * .md (mismo `href` y texto). Después esconde los corchetes que quedan, para que `customRehype` no
 * los vuelva a mirar (los devuelve {@link rehypeRestoreBrackets}).
 * @returns {(tree: any) => void}
 */
function rehypeWikiLinks() {
	return (tree) => {
		/** @param {any} node */
		const walk = (node) => {
			if (!node.children) return;
			/** @type {any[]} */
			const out = [];
			for (const child of node.children) {
				if (child.type === 'element') {
					if (!SKIP_TAGS.has(child.tagName)) walk(child);
					out.push(child);
					continue;
				}
				if (child.type !== 'text') {
					out.push(child);
					continue;
				}
				let last = 0;
				const value = String(child.value);
				for (const m of value.matchAll(WIKI)) {
					const at = /** @type {number} */ (m.index);
					if (at > last) out.push({ type: 'text', value: value.slice(last, at) });
					out.push({
						type: 'element',
						tagName: 'a',
						properties: {
							className: ['wikilink'],
							href: '/wiki/' + m[1].trim().replaceAll(' ', '-').toLowerCase()
						},
						children: [{ type: 'text', value: m[2] ? m[2].slice(3) : m[1] }]
					});
					last = at + m[0].length;
				}
				if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
			}
			node.children = out.map((c) =>
				c.type === 'text'
					? { ...c, value: c.value.replaceAll('[', OPEN).replaceAll(']', CLOSE) }
					: c
			);
		};
		walk(tree);
	};
}

/**
 * Devuelve los corchetes que escondió {@link rehypeWikiLinks} y las arrobas escapadas
 * ({@link ESC_AT}). @returns {(tree: any) => void}
 */
function rehypeRestoreBrackets() {
	return (tree) => {
		/** @param {any} node @param {boolean} inCode */
		const walk = (node, inCode) => {
			for (const c of node.children ?? []) {
				if (c.type === 'text')
					c.value = c.value
						.replaceAll(OPEN, '[')
						.replaceAll(CLOSE, ']')
						.replaceAll(ESC_AT, inCode ? '\\@' : '@');
				else walk(c, inCode || c.tagName === 'code' || c.tagName === 'pre');
			}
		};
		walk(tree, false);
	};
}

/** Saca los comentarios HTML (Svelte no los publica). @returns {(tree: any) => void} */
function rehypeDropComments() {
	return (tree) => {
		/** @param {any} node */
		const walk = (node) => {
			if (!node.children) return;
			node.children = node.children.filter((/** @type {any} */ c) => c.type !== 'comment');
			node.children.forEach(walk);
		};
		walk(tree);
	};
}

/**
 * Corta los bloques `<script …>…</script>` y `<style …>…</style>` del texto (buscándolos como
 * texto, como src/lib/utils/markdownPreview.js) y devuelve el CSS de los `<style>`.
 *
 * @param {string} text
 * @returns {{ text: string, css: string[] }}
 */
export function takeBlocks(text) {
	/** @type {string[]} */
	const css = [];
	let out = text;
	for (;;) {
		const lower = out.toLowerCase();
		const found = ['script', 'style']
			.map((tag) => ({ tag, at: lower.search(new RegExp(`<${tag}[\\s>]`)) }))
			.filter((x) => x.at >= 0)
			.sort((a, b) => a.at - b.at)[0];
		if (!found) break;
		const open = lower.indexOf('>', found.at);
		const close = open < 0 ? -1 : lower.indexOf(`</${found.tag}`, open);
		const end = close < 0 ? -1 : lower.indexOf('>', close);
		if (open < 0 || close < 0 || end < 0) {
			out = out.slice(0, found.at);
			break;
		}
		if (found.tag === 'style') css.push(out.slice(open + 1, close));
		out = out.slice(0, found.at) + out.slice(end + 1);
	}
	return { text: out, css };
}

/**
 * El CSS propio de un post, aplicado solo dentro de su texto (`@scope`), como los estilos de un
 * componente de Svelte. `:global(x)` queda como `x`.
 *
 * @param {string[]} blocks
 * @param {string} scope selector del contenedor del texto
 */
export function scopeCss(blocks, scope) {
	const css = blocks
		.map((b) => b.replace(/:global\(([^()]*)\)/g, '$1').trim())
		.filter(Boolean)
		.join('\n');
	if (!css) return '';
	// Que el CSS no pueda cerrar la etiqueta <style> de la página.
	return `@scope (${scope}) {\n${css.replace(/<\/style/gi, '<\\/style')}\n}`;
}

/** Las marcas que guardan el lugar del HTML escrito a mano mientras se arma el resto. */
const RAW_OPEN = '\uE010';
const RAW_CLOSE = '\uE011';
const RAW_MARK = /\uE010(\d+)\uE011/g;

/** Las etiquetas que en HTML no tienen cierre (`<img>`, `<br>`…). */
const VOID_TAGS = new Set(
	'area base br col embed hr img input link meta param source track wbr'.split(' ')
);

/**
 * `<video … />` y otras etiquetas cerradas a la manera de Svelte: en HTML, `/>` no cierra nada
 * (el `<video>` se tragaría lo que sigue); en Svelte (mdsvex), sí. Pasan a `<video …></video>`.
 * @param {string} html
 */
function closeSelfClosing(html) {
	return html.replace(
		/<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/>/g,
		(all, name, attrs) => (VOID_TAGS.has(name.toLowerCase()) ? all : `<${name}${attrs}></${name}>`)
	);
}

/**
 * Extensión de micromark: el HTML escrito a mano (bloques y etiquetas sueltas) no sale en el HTML
 * que arma micromark sino una marca ({@link RAW_OPEN}n{@link RAW_CLOSE}); el HTML queda en
 * `held[n]`. Así los plugins de rehype no lo tocan, como en mdsvex (que lo pasaba como nodo
 * `raw`): sin comillas tipográficas, menciones, anclas, índice ni `rel="nofollow"` adentro de un
 * bloque de HTML; el texto entre dos etiquetas sueltas (`<small>"así"</small>` en un párrafo) sí
 * es markdown, como antes. Ver {@link rehypeRawHoles}.
 *
 * @param {string[]} held
 * @returns {import('micromark-util-types').HtmlExtension}
 */
function holdRawHtml(held) {
	/** @this {import('micromark-util-types').CompileContext} */
	function enter() {
		this.buffer();
		this.setData('ignoreEncode', true);
	}
	/** @this {import('micromark-util-types').CompileContext} */
	function exit() {
		this.setData('ignoreEncode');
		const html = closeSelfClosing(this.resume().replaceAll(ESC_AT, '\\@'));
		held.push(html);
		this.raw(`${RAW_OPEN}${held.length - 1}${RAW_CLOSE}`);
	}
	return {
		enter: {
			htmlFlow() {
				this.lineEndingIfNeeded();
				enter.call(this);
			},
			htmlText: enter
		},
		exit: { htmlFlow: exit, htmlText: exit }
	};
}

/**
 * Extensión de micromark: en el código en línea (`` `…` ``) las entidades (`&nbsp;`) valen como
 * en mdsvex (se ven como el carácter, no como `&nbsp;`). `<` y `>` se siguen escapando.
 * @type {import('micromark-util-types').HtmlExtension}
 */
const codeTextEntities = {
	exit: {
		codeTextData(token) {
			this.raw(
				this.encode(this.sliceSerialize(token)).replace(
					/&amp;(#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{1,31});/gi,
					'&$1;'
				)
			);
		}
	}
};

/**
 * Pone el HTML escrito a mano ({@link holdRawHtml}) en su lugar, como nodos `raw` (que se escriben
 * tal cual, igual que en mdsvex). Va primero: los demás plugins ven el texto partido en esos
 * lugares, como en mdsvex. Una marca que quedó en un atributo (`![<b>x</b>](…)`, el `alt` de una
 * imagen) vuelve como texto: el atributo lo escapa.
 * @returns {(tree: any, file: any) => void}
 */
function rehypeRawHoles() {
	return (tree, file) => {
		/** @type {string[]} */
		const held = file.data.held ?? [];
		/** @param {string} value */
		const plain = (value) => value.replace(RAW_MARK, (_, n) => held[Number(n)] ?? '');
		/** @param {any} node */
		const walk = (node) => {
			if (!node.children) return;
			/** @type {any[]} */
			const out = [];
			for (const child of node.children) {
				if (child.type === 'element') {
					for (const [key, value] of Object.entries(child.properties ?? {})) {
						if (typeof value === 'string' && value.includes(RAW_OPEN)) {
							child.properties[key] = plain(value);
						} else if (Array.isArray(value)) {
							child.properties[key] = value.map((v) => (typeof v === 'string' ? plain(v) : v));
						}
					}
					walk(child);
				}
				if (child.type !== 'text' || !child.value.includes(RAW_OPEN)) {
					out.push(child);
					continue;
				}
				let last = 0;
				for (const m of child.value.matchAll(RAW_MARK)) {
					const at = /** @type {number} */ (m.index);
					if (at > last) out.push({ type: 'text', value: child.value.slice(last, at) });
					out.push({ type: 'raw', value: held[Number(m[1])] ?? '' });
					last = at + m[0].length;
				}
				if (last < child.value.length) out.push({ type: 'text', value: child.value.slice(last) });
			}
			node.children = out;
		};
		walk(tree);
	};
}

/**
 * El bloque de código con lenguaje (```` ```sh ````) lleva la clase también en el `<pre>`, como en
 * mdsvex (`<pre class="language-sh"><code class="language-sh">`).
 * @returns {(tree: any) => void}
 */
function rehypePreLanguage() {
	return (tree) => {
		/** @param {any} node */
		const walk = (node) => {
			for (const child of node.children ?? []) {
				if (child.type !== 'element') continue;
				if (child.tagName === 'pre') {
					const code = child.children?.find(
						(/** @type {any} */ c) => c.type === 'element' && c.tagName === 'code'
					);
					const lang = (code?.properties?.className ?? []).filter((/** @type {string} */ c) =>
						String(c).startsWith('language-')
					);
					if (lang.length && !child.properties.className) child.properties.className = lang;
				}
				walk(child);
			}
		};
		walk(tree);
	};
}

/**
 * Cuántos títulos lista el índice (un link por título).
 *
 * @param {any} node
 * @returns {number}
 */
function countTocLinks(node) {
	if (!node || typeof node !== 'object') return 0;
	const own = node.type === 'element' && node.tagName === 'a' ? 1 : 0;
	return (
		own +
		(node.children ?? []).reduce(
			(/** @type {number} */ n, /** @type {any} */ c) => n + countTocLinks(c),
			0
		)
	);
}

// Los plugins están tipados para distintas versiones de unified (los de mdsvex, para otra): es el
// mismo árbol hast.
/** @type {any[]} */
const PLUGINS = [
	rehypeRawHoles,
	rehypeDropComments,
	rehypePreLanguage,
	rehypeSmartypants,
	rehypeSlug,
	rehypeWikiLinks,
	customRehype,
	rehypeRestoreBrackets,
	// El índice solo con 2 títulos o más: con uno (o ninguno) no ayuda a ubicarse y ocupa lugar.
	// Y con nombre: en un evento conviven varios <nav> (menú, migas, índice).
	[
		toc,
		{
			/** @param {any} nav */
			customizeTOC: (nav) => {
				if (countTocLinks(nav) < 2) return false;
				nav.properties.ariaLabel = 'Índice';
				return nav;
			}
		}
	]
];
const processor = PLUGINS.reduce(
	(p, plugin) => (Array.isArray(plugin) ? p.use(...plugin) : p.use(plugin)),
	/** @type {any} */ (rehype().data('settings', { fragment: true, allowDangerousHtml: true }))
).freeze();

/** Lee y vuelve a escribir el HTML: cierra lo que quedó abierto. */
const balance = rehype().data('settings', { fragment: true }).freeze();

/**
 * @param {string | null | undefined} body
 * @param {{ resolveMedia?: (file: string, path: string) => string | undefined, vars?: Record<string, unknown> }} [opts]
 *   `vars`: el frontmatter (mdsvex deja usar sus campos en el texto, `{title}`)
 * @returns {Promise<{ html: string, css: string[] }>}
 */
export async function renderFreeBody(body, { resolveMedia = () => undefined, vars = {} } = {}) {
	const resolved = resolveVars(resolveMediaImports(String(body ?? ''), resolveMedia), vars);
	const { text, css } = takeBlocks(resolved);
	/** @type {string[]} */
	const held = [];
	const markup = micromark(hideEscapedAt(likeMdsvex(text)), {
		allowDangerousHtml: true,
		extensions: [gfm()],
		htmlExtensions: [
			gfmAutolinkLiteralHtml,
			gfmFootnoteHtml(),
			gfmStrikethroughHtml,
			gfmTableHtml,
			gfmTaskListItemHtml,
			codeTextEntities,
			holdRawHtml(held)
		]
	});
	// Miles de elementos uno adentro de otro rompen rehype (se queda sin pila): vacío, no un error.
	// Cuenta también el HTML apartado (`held`), en su lugar: vuelve adentro del texto al final.
	const whole = markup.replace(RAW_MARK, (_, n) => held[Number(n)] ?? '');
	if (tooDeepToRender(whole, 'libre')) return { html: '', css: [] };
	const file = await processor.process({ value: nofollow(markup), data: { held } });
	// El HTML escrito a mano salió tal cual: una pasada más lo deja bien armado (una etiqueta sin
	// cerrar se cierra adentro del texto y no se come el resto de la página).
	return { html: String(await balance.process(String(file))), css };
}

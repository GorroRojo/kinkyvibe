/**
 * El cuerpo de un post con **HTML libre** (decisión 0004: superadmins pueden usar HTML libre) →
 * HTML, armado como lo arma mdsvex al compilar un .md, para que se vea igual que hoy:
 *
 * - markdown + GFM, con el HTML tal cual (también `<iframe>`, `<video>`…);
 * - las mismas transformaciones tipográficas que el sitio configura en mdsvex (`smartypants`:
 *   comillas tipográficas, `...` → …, `--` → – y `---` → —), ver {@link smartypants};
 * - los mismos plugins de rehype que svelte.config.js: `rehype-slug`, `customRehype` (anclas de los
 *   títulos, menciones `@alguien`, links `[[término]]`) y `rehype-toc` (el índice);
 * - los bloques `<script>` de mdsvex no salen en el HTML (tampoco hoy: son código del componente);
 *   sus imports de imágenes y archivos se resuelven antes con la misma URL que les da el build;
 * - los `<style>` propios se devuelven aparte (`css`): la página los aplica solo dentro del texto,
 *   como hace Svelte (ver {@link scopeCss}).
 *
 * La prueba `freeHtml.test.js` compara este HTML con el que da el componente compilado del mismo
 * .md, para todos los eventos y el material reales del repo.
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

/**
 * Ajusta el markdown para que micromark (CommonMark) lo lea como lo lee el parser de mdsvex
 * (remark, más permisivo), en lo que cambia lo que se ve:
 * - un párrafo que empieza con una etiqueta HTML (`<small>…`, `<video …>…`) es un bloque de HTML
 *   (sin `<p>` alrededor): se pasa la etiqueta de apertura a su propia línea, que en CommonMark
 *   también abre un bloque;
 * - una lista sigue siendo la misma lista aunque cambie la viñeta (`-`, `*`, `+`) o tenga un
 *   comentario HTML en el medio.
 * Fuera de los bloques de código.
 *
 * @param {string} text
 */
export function likeMdsvex(text) {
	// Los comentarios HTML no se publican (Svelte los saca); uno que ocupa su propia línea en el
	// medio de una lista no la corta (en CommonMark, sí).
	// Hasta que no quede ninguno (sacar uno puede juntar las partes de otro: `<!<!---->--`).
	let clean = text.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n/gm, '');
	for (let prev = ''; prev !== clean;) {
		prev = clean;
		clean = clean.replace(/<!--[\s\S]*?-->/g, '');
	}
	const lines = clean.split('\n');
	let fence = '';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const f = /^\s*(```|~~~)/.exec(line);
		if (f) {
			fence = fence ? (line.trim().startsWith(fence) ? '' : fence) : f[1];
			continue;
		}
		if (fence) continue;
		lines[i] = line.replace(/^(\s*)[*+](\s+)/, '$1-$2');
		const start = i === 0 || !lines[i - 1].trim();
		const m = /^<([a-zA-Z][\w-]*)(\s[^<>]*)?>(?=\S)/.exec(lines[i]);
		if (start && m && !HTML_BLOCK_TAGS.has(m[1].toLowerCase())) {
			lines[i] = `${m[0]}\n${lines[i].slice(m[0].length)}`;
		}
	}
	return lines.join('\n');
}

/**
 * Los links de markdown a otros sitios llevan `rel="nofollow"`, como en mdsvex
 * (`remark-external-links`). Se reconocen en lo que arma micromark: `<a href="https://…">`.
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

/**
 * Las transformaciones tipográficas de mdsvex (`smartypants: { quotes, ellipses, dashes:
 * 'oldschool' }`) sobre un texto, con el carácter que venía antes (para decidir si una comilla
 * abre o cierra).
 *
 * @param {string} text
 * @param {string} before el último carácter del texto anterior del mismo bloque ('' al empezar)
 */
export function smartypants(text, before = '') {
	let s = text
		.replace(/---/g, '—')
		.replace(/--/g, '–')
		.replace(/\.\.\./g, '…')
		.replace(/\. \. \./g, '…');
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c !== '"' && c !== "'") {
			out += c;
			continue;
		}
		const prev = i > 0 ? s[i - 1] : before;
		const next = s[i + 1] ?? '';
		const opening = (prev === '' || /[\s([{—–-]/.test(prev)) && next !== '' && !/\s/.test(next);
		if (c === '"') out += opening ? '“' : '”';
		else out += opening ? '‘' : '’';
	}
	return out;
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

/** Devuelve los corchetes que escondió {@link rehypeWikiLinks}. @returns {(tree: any) => void} */
function rehypeRestoreBrackets() {
	return (tree) => {
		/** @param {any} node */
		const walk = (node) => {
			for (const c of node.children ?? []) {
				if (c.type === 'text') c.value = c.value.replaceAll(OPEN, '[').replaceAll(CLOSE, ']');
				else walk(c);
			}
		};
		walk(tree);
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

// Los plugins están tipados para distintas versiones de unified (los de mdsvex, para otra): es el
// mismo árbol hast.
/** @type {any[]} */
const PLUGINS = [
	rehypeDropComments,
	rehypeSmartypants,
	rehypeSlug,
	rehypeWikiLinks,
	customRehype,
	rehypeRestoreBrackets,
	toc
];
const processor = PLUGINS.reduce(
	(p, plugin) => p.use(plugin),
	/** @type {any} */ (rehype().data('settings', { fragment: true }))
).freeze();

/**
 * @param {string | null | undefined} body
 * @param {{ resolveMedia?: (file: string, path: string) => string | undefined, vars?: Record<string, unknown> }} [opts]
 *   `vars`: el frontmatter (mdsvex deja usar sus campos en el texto, `{title}`)
 * @returns {Promise<{ html: string, css: string[] }>}
 */
export async function renderFreeBody(body, { resolveMedia = () => undefined, vars = {} } = {}) {
	const resolved = resolveVars(resolveMediaImports(String(body ?? ''), resolveMedia), vars);
	const { text, css } = takeBlocks(resolved);
	const markup = micromark(likeMdsvex(text), {
		allowDangerousHtml: true,
		extensions: [gfm()],
		htmlExtensions: [
			gfmAutolinkLiteralHtml,
			gfmFootnoteHtml(),
			gfmStrikethroughHtml,
			gfmTableHtml,
			gfmTaskListItemHtml
		]
	});
	return { html: String(await processor.process(nofollow(markup))), css };
}

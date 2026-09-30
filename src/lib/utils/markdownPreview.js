/**
 * Live preview of a post's markdown in the panel's editors. Close to what the site shows (same
 * markdown + GFM, wiki links `[[término]]` / `[[término : texto]]` like customRehype, the page's
 * `.content` styles), without running mdsvex in the browser.
 *
 * - `<script>` / `<style>` blocks (mdsvex imports) are dropped; Svelte expressions `{x}` stay as
 *   written.
 * - Inline HTML (<small>, <div>, <img>…) is rendered: posts use it a lot. The result must go
 *   through `sanitizePreview` in the browser before `{@html}` (drops scripts, iframes, event
 *   handlers and javascript: URLs), since the text is whatever the person typed.
 */
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

/** @param {string} s */
const escapeHtml = (s) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
	);

/**
 * `[[bondage]]` → a link to /wiki/bondage; `[[objetificación : objetificante]]` → text
 * "objetificante" linking to /wiki/objetificación. Not inside code spans/blocks.
 * @param {string} md
 */
export function wikiLinksToMarkdown(md) {
	return md
		.split(/(```[\s\S]*?```|`[^`\n]*`)/)
		.map((part, i) =>
			i % 2
				? part
				: part.replace(/\[\[([^\]\n]+)\]\]/g, (_, inner) => {
						const [term, text] = String(inner)
							.split(':')
							.map((s) => s.trim());
						const label = text || term;
						return `<a href="/wiki/${encodeURIComponent(term)}" class="wikilink">${escapeHtml(label)}</a>`;
					})
		)
		.join('');
}

/**
 * Drops `<script>` / `<style>` blocks (mdsvex imports) for the preview, without regular
 * expressions: finds the opening tag (any case), then its closing tag and the `>` that ends it
 * (so `</script >` or `</script\n foo>` count), and cuts that stretch; an unclosed block is cut
 * to the end. Starts over after each cut, so pieces can't reassemble into a new tag
 * (`<scr<script></script>ipt>`). Only a first pass: the rendered HTML still goes through
 * `sanitizePreview` before `{@html}`.
 * @param {string} text
 */
export function stripScriptAndStyle(text) {
	let out = text;
	for (;;) {
		const lower = out.toLowerCase();
		const starts = ['<script', '<style']
			.map((tag) => ({ tag, at: lower.indexOf(tag) }))
			.filter((s) => s.at >= 0)
			.sort((a, b) => a.at - b.at);
		if (!starts.length) return out;
		const { tag, at } = starts[0];
		const close = lower.indexOf('</' + tag.slice(1), at);
		const gt = close < 0 ? -1 : lower.indexOf('>', close);
		out = gt < 0 ? out.slice(0, at) : out.slice(0, at) + out.slice(gt + 1);
	}
}

/**
 * Markdown body → HTML for the preview (not sanitized yet, see sanitizePreview).
 * @param {string} body
 */
export function renderPreviewHtml(body) {
	const md = wikiLinksToMarkdown(
		stripScriptAndStyle(String(body ?? '').replace(/\r\n?/g, '\n'))
	);
	return micromark(md, {
		allowDangerousHtml: true,
		extensions: [gfm()],
		htmlExtensions: [gfmHtml()]
	});
}

const DROP = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select';

/**
 * Cleans rendered preview HTML in place with the browser's parser: removes active elements,
 * `on*` attributes and non-http(s)/relative URLs. Browser only.
 * @param {string} html
 * @returns {string}
 */
export function sanitizePreview(html) {
	if (typeof DOMParser === 'undefined') return '';
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
	const root = doc.body.firstElementChild;
	if (!root) return '';
	root.querySelectorAll(DROP).forEach((el) => el.remove());
	root.querySelectorAll('*').forEach((el) => {
		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			const value = attr.value.trim().toLowerCase();
			if (name.startsWith('on') || name === 'style' || name === 'srcdoc')
				el.removeAttribute(attr.name);
			else if (
				['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name) &&
				/^(javascript|data|vbscript):/.test(value.replace(/\s+/g, ''))
			)
				el.removeAttribute(attr.name);
		}
		if (el.tagName === 'A') {
			el.setAttribute('target', '_blank');
			el.setAttribute('rel', 'noreferrer');
		}
	});
	return root.innerHTML;
}

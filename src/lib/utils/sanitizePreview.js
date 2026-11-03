/**
 * Limpieza de la vista previa del editor (el HTML de `renderPreviewHtml`, ./markdownPreview.js)
 * antes de `{@html}`, en el navegador. El texto es lo que la persona tipeó.
 *
 * Dos pasos:
 * 1. **DOMPurify** con una lista de lo permitido («deja pasar solo lo bueno conocido»): su lista de
 *    HTML (sin SVG ni MathML), menos lo que la vista previa nunca mostró (`DROP`, que sale entero,
 *    con su contenido). Lo que no está en su lista se va (una etiqueta desconocida deja su texto).
 * 2. El filtro de antes (#584) sobre lo que queda, por las dudas y para lo que el sitio quiere:
 *    saca `DROP`, `on…`, `style`, `srcdoc` y los `javascript:`/`data:`/`vbscript:` (también con
 *    espacios o controles en el esquema), prefija `id`/`name` y los links abren aparte.
 *
 * Solo en el navegador: DOMPurify necesita un DOM de verdad (en el servidor, sin DOM, devuelve
 * ''). El HTML de las páginas públicas lo limpia el servidor (src/lib/server/amigues/sanitize.js,
 * `rehype-sanitize`); el HTML libre de superadmins no se limpia (decisión 0004).
 */
import DOMPurify from 'dompurify';

// svg y math salen enteros, como en la lista corta del servidor (amigues/sanitize.js).
const DROP = [
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'link',
	'meta',
	'base',
	'form',
	'input',
	'button',
	'textarea',
	'select',
	'svg',
	'math',
	'noscript',
	'template'
];

/** @type {import('dompurify').Config} */
const CONFIG = {
	USE_PROFILES: { html: true },
	FORBID_TAGS: DROP,
	// Como antes: lo de `DROP` sale con su contenido (un `<button>` no deja su texto).
	ADD_FORBID_CONTENTS: DROP,
	FORBID_ATTR: ['style', 'srcdoc', 'action', 'formaction'],
	RETURN_DOM: true
};

/** Attributes whose values get a prefix, as hast-util-sanitize's `clobber` / `clobberPrefix`. */
const CLOBBER = ['id', 'name', 'aria-describedby', 'aria-labelledby'];
const CLOBBER_PREFIX = 'user-content-';

/**
 * The value as the browser reads its scheme: without whitespace or control characters.
 * @param {string} value
 */
const schemeOf = (value) =>
	[...value.replace(/\s+/g, '')].filter((c) => c.charCodeAt(0) >= 0x20).join('');

/**
 * Cleans rendered preview HTML: DOMPurify (allowlist), then the site's own pass (see the top of
 * this file). Browser only: without a DOM it returns ''.
 * @param {string} html
 * @returns {string}
 */
export function sanitizePreview(html) {
	if (typeof window === 'undefined' || !DOMPurify.isSupported) return '';
	// Con `RETURN_DOM`, DOMPurify devuelve el `<body>` de un documento aparte.
	const root = /** @type {HTMLElement | null} */ (
		/** @type {unknown} */ (DOMPurify.sanitize(String(html ?? ''), CONFIG))
	);
	if (!root) return '';
	root.querySelectorAll(DROP.join(',')).forEach((el) => el.remove());
	root.querySelectorAll('*').forEach((el) => {
		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			const value = attr.value.trim().toLowerCase();
			if (name.startsWith('on') || name === 'style' || name === 'srcdoc')
				el.removeAttribute(attr.name);
			// Como el esquema del servidor (`clobber`): un `id`/`name` del texto no puede pisar nombres
			// de la página (`document.createElement`, `window.algo`).
			else if (CLOBBER.includes(name) && !attr.value.startsWith(CLOBBER_PREFIX))
				el.setAttribute(attr.name, CLOBBER_PREFIX + attr.value);
			else if (
				['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name) &&
				/^(javascript|data|vbscript):/.test(schemeOf(value))
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

/**
 * Qué tan hondo se meten los elementos de un HTML, uno adentro de otro.
 *
 * Las herramientas que arman el texto de una página (rehype: hast-util-from-parse5,
 * hast-util-to-html…) recorren el árbol con recursión: un texto con miles de elementos uno adentro
 * de otro (`<div>` × 5000, o `>` × 2000 en markdown) se queda sin pila y tira `RangeError`. En
 * Node pasa un poco antes de los 2000 niveles; un texto de verdad no pasa de unas decenas.
 *
 * - Al guardar (src/lib/server/objects/fields.js), un texto más hondo que {@link MAX_HTML_NESTING}
 *   no se guarda y el panel dice por qué.
 * - Al mostrarlo (src/lib/server/amigues/render.js y src/lib/server/contenido/freeHtml.js), uno
 *   que ya estaba guardado sale vacío (y deja una línea en los registros) en vez de romper la
 *   página.
 *
 * La cuenta es aproximada y barata (una pasada con una expresión regular, sin armar el árbol): una
 * pila de nombres de etiqueta. Un cierre saca hasta su apertura (uno sin apertura no cuenta), las
 * etiquetas vacías (`<br>`, `<img>`…) y las que se cierran solas (`<x/>`) no suman, y un `<p>`,
 * `<li>`, `<td>`… cierra al anterior igual (como hace el navegador). Lo que el navegador agrega
 * solo (un `<tbody>`) no se cuenta: por eso el límite queda lejos de donde se rompe.
 *
 * Sin dependencias ni `$lib` (lo usa src/lib/server/objects/fields.js, que corre en el cron).
 */

/** Más niveles que esto, uno adentro de otro, no se guardan ni se arman. */
export const MAX_HTML_NESTING = 500;

const VOID = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

/** Las que cierra otra igual que se abre (`<li>a<li>b`). */
const SELF_SIBLING = new Set(['p', 'li', 'dt', 'dd', 'option', 'tr', 'td', 'th', 'rt', 'rp']);

const TAG = /<(\/?)([a-zA-Z][^\s/>]*)[^>]*?(\/?)>|<!--[\s\S]*?-->/g;

/**
 * Los niveles de elementos uno adentro de otro (aproximado, ver arriba). Deja de contar apenas
 * pasa `limit` (devuelve `limit + 1`): así la pasada es siempre corta.
 * @param {string | null | undefined} html
 * @param {number} [limit]
 * @returns {number}
 */
export function htmlNestingDepth(html, limit = MAX_HTML_NESTING) {
	const text = String(html ?? '');
	if (!text.includes('<')) return 0;
	/** @type {string[]} */
	const stack = [];
	let max = 0;
	for (const m of text.matchAll(TAG)) {
		if (!m[2]) continue;
		const name = m[2].toLowerCase();
		if (m[1]) {
			const at = stack.lastIndexOf(name);
			if (at >= 0) stack.length = at;
		} else if (!m[3] && !VOID.has(name)) {
			if (SELF_SIBLING.has(name) && stack[stack.length - 1] === name) stack.pop();
			stack.push(name);
			if (stack.length > max) max = stack.length;
			if (max > limit) return max;
		}
	}
	return max;
}

/**
 * Los niveles de un texto como se guarda (markdown con HTML): los del HTML más las citas de
 * markdown (`>`) de una misma línea, que también se vuelven elementos uno adentro de otro.
 * @param {string | null | undefined} body
 * @returns {number}
 */
export function bodyNestingDepth(body) {
	const text = String(body ?? '');
	let quotes = 0;
	for (const m of text.matchAll(/^[ \t]*((?:>[ \t]*)+)/gm)) {
		const n = m[1].split('>').length - 1;
		if (n > quotes) quotes = n;
	}
	return quotes > MAX_HTML_NESTING ? quotes : htmlNestingDepth(text) + quotes;
}

/**
 * Al armar una página: `true` si el HTML es demasiado hondo para armarlo (más de
 * {@link MAX_HTML_NESTING} niveles). Deja una línea en los registros del Worker; quien llama
 * muestra el texto vacío en vez de romper la página.
 * @param {string} html lo que se va a leer con rehype
 * @param {string} where qué camino lo arma (para el registro)
 * @returns {boolean}
 */
export function tooDeepToRender(html, where) {
	const depth = htmlNestingDepth(html);
	if (depth <= MAX_HTML_NESTING) return false;
	console.error(
		JSON.stringify({
			area: 'contenido',
			message: `texto con más de ${MAX_HTML_NESTING} niveles de HTML: se muestra vacío`,
			where
		})
	);
	return true;
}

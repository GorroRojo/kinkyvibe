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
 * etiquetas vacías (`<br>`, `<img>`…) y las que se cierran solas (`<x/>`) no suman, lo de adentro
 * de `<script>`, `<style>`, `<textarea>`… es texto, y lo que el navegador cierra solo se cierra
 * igual: un `<li>` cierra el `<li>` abierto de su lista (con lo que tenga adentro, `<li><p>a<li>`),
 * lo mismo `<dt>`/`<dd>`, `<td>`/`<th>`, `<tr>` y `<option>`, y un bloque (`<div>`, `<ul>`,
 * `<p>`…) cierra el `<p>` abierto. Lo que el navegador agrega solo (un `<tbody>`) no se cuenta:
 * por eso el límite queda lejos de donde se rompe.
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

/** Lo de adentro es texto, no etiquetas: se saltea hasta el cierre. */
const RAW_TEXT = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'xmp',
	'iframe',
	'noembed',
	'noframes',
	'noscript',
	'plaintext'
]);

/** Donde el navegador deja de buscar qué cerrar (el «scope» por defecto de HTML). */
const SCOPE = ['html', 'table', 'td', 'th', 'caption', 'template', 'applet', 'marquee', 'object'];

/** Los bloques que cierran un `<p>` abierto (como hace el navegador). */
const CLOSES_P = new Set(
	(
		'address article aside blockquote center details dialog dir div dl fieldset figcaption ' +
		'figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li dd dt listing main menu nav ol p ' +
		'pre search section summary table ul'
	).split(' ')
);

/**
 * Lo que cierra solo cada etiqueta que se abre: `close`, las que cierra (la primera que encuentra
 * bajando por la pila); `stop`, dónde deja de buscar.
 * @type {Record<string, { close: Set<string>, stop: Set<string> }>}
 */
const IMPLIED = {};
/** @param {string[]} names @param {string[]} close @param {string[]} stop */
const implied = (names, close, stop) => {
	for (const n of names) IMPLIED[n] = { close: new Set(close), stop: new Set(stop) };
};
implied(['li'], ['li'], ['ul', 'ol', 'menu', ...SCOPE]);
implied(['dt', 'dd'], ['dt', 'dd'], ['dl', ...SCOPE]);
implied(['td', 'th'], ['td', 'th'], ['tr', ...SCOPE]);
implied(['tr'], ['tr'], ['thead', 'tbody', 'tfoot', 'table', 'template', 'html']);
implied(['thead', 'tbody', 'tfoot'], ['thead', 'tbody', 'tfoot'], ['table', 'template', 'html']);
implied(['option'], ['option'], ['select', 'datalist', 'optgroup']);
implied(['optgroup'], ['optgroup', 'option'], ['select', 'datalist']);
const P_ONLY = new Set(['p']);
const P_STOP = new Set([...SCOPE, 'button']);

/**
 * Cierra (saca de la pila) la primera de `close` que encuentra bajando, salvo que antes aparezca
 * una de `stop`.
 * @param {string[]} stack
 * @param {Set<string>} close
 * @param {Set<string>} stop
 */
function closeImplied(stack, close, stop) {
	for (let i = stack.length - 1; i >= 0; i--) {
		if (close.has(stack[i])) {
			stack.length = i;
			return;
		}
		if (stop.has(stack[i])) return;
	}
}

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
	const lower = text.toLowerCase();
	/** @type {string[]} */
	const stack = [];
	let max = 0;
	const re = new RegExp(TAG.source, 'g');
	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (!m[2]) continue;
		const name = m[2].toLowerCase();
		if (m[1]) {
			const at = stack.lastIndexOf(name);
			if (at >= 0) stack.length = at;
			continue;
		}
		if (m[3] || VOID.has(name)) continue;
		if (RAW_TEXT.has(name)) {
			// Lo de adentro no son etiquetas: sigue después del cierre (sin cierre, no hay más).
			const end = name === 'plaintext' ? -1 : lower.indexOf(`</${name}`, re.lastIndex);
			if (end < 0) break;
			re.lastIndex = end;
			continue;
		}
		if (CLOSES_P.has(name)) closeImplied(stack, P_ONLY, P_STOP);
		const rule = IMPLIED[name];
		if (rule) closeImplied(stack, rule.close, rule.stop);
		stack.push(name);
		if (stack.length > max) max = stack.length;
		if (max > limit) return max;
	}
	return max;
}

/**
 * El texto sin el código de markdown (bloques con ``` o ~~~ y `código` en la línea): ahí un `<div>`
 * o un `>` son texto, no elementos.
 * @param {string} md
 */
function withoutMarkdownCode(md) {
	/** @type {string[]} */
	const out = [];
	/** @type {string | null} */
	let fence = null;
	for (const line of md.split('\n')) {
		const f = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
		if (fence) {
			if (
				f &&
				f[1][0] === fence[0] &&
				f[1].length >= fence.length &&
				!/\S/.test(line.slice(f[0].length))
			)
				fence = null;
			continue;
		}
		if (f && !(f[1][0] === '`' && line.slice(f[0].length).includes('`'))) {
			fence = f[1];
			continue;
		}
		out.push(line.replace(/``[^\n]*?``|`[^`\n]*`/g, ''));
	}
	return out.join('\n');
}

/**
 * Los niveles de un texto como se guarda (markdown con HTML): los del HTML más las citas de
 * markdown (`>`) de una misma línea, que también se vuelven elementos uno adentro de otro. El
 * código de markdown no cuenta (es texto).
 * @param {string | null | undefined} body
 * @returns {number}
 */
export function bodyNestingDepth(body) {
	const text = withoutMarkdownCode(String(body ?? ''));
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

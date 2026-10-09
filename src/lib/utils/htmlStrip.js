/**
 * Sacar comentarios y etiquetas de un HTML para comparar o buscar en su texto. No es un
 * sanitizador (para mostrar HTML de afuera está freeHtml): cada reemplazo se repite hasta que no
 * cambia nada, así no queda un `<!--` o un `<script` armado con los pedazos de lo que se sacó.
 */

/**
 * Repite `replace` hasta que el texto deja de cambiar.
 * @param {string} text
 * @param {RegExp} re con la bandera `g`
 */
function untilStable(text, re) {
	let prev;
	let out = String(text ?? '');
	do {
		prev = out;
		out = out.replace(re, '');
	} while (out !== prev);
	return out;
}

/** El texto sin comentarios HTML (`<!-- … -->`). @param {string} text */
export const stripHtmlComments = (text) => untilStable(text, /<!--[\s\S]*?-->/g);

/** El texto sin comentarios ni etiquetas HTML (sin poner espacios en su lugar). @param {string} text */
export const stripHtmlTags = (text) => untilStable(stripHtmlComments(text), /<[^<>]*>/g);

/** Etiquetas que se ven aunque no tengan texto (una imagen, un video, un mapa embebido…). */
const VISIBLE_EMPTY =
	/<(img|picture|video|audio|iframe|embed|object|svg|canvas|hr|input|button|select|textarea|kv-[\w-]+)\b/i;

/**
 * ¿El HTML muestra algo? Falso si es vacío, o solo espacios, comentarios, `<style>`/`<script>`
 * o etiquetas sin texto (`<p></p>`, `<br>`, `&nbsp;`). Una imagen, un video o un embebido
 * cuentan como algo. Para no dejar un título («De qué se trata») sin nada abajo.
 * @param {unknown} html
 */
export function hasVisibleHtml(html) {
	let text = stripHtmlComments(String(html ?? ''));
	text = untilStable(text, /<(style|script|template)\b[\s\S]*?<\/\1\s*>/gi);
	if (VISIBLE_EMPTY.test(text)) return true;
	text = stripHtmlTags(text).replace(/&(nbsp|#160|#xa0|ensp|emsp|thinsp|zwsp|#8203);/gi, ' ');
	return /[^\s\u200b\u2060\ufeff]/.test(text);
}

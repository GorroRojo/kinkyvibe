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

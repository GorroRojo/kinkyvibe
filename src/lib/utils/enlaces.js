/**
 * Los enlaces del cuerpo de un objeto (docs/enlaces.md, decisión 0047): qué nombra el texto con
 * `[[…]]`, `![[…]]`, `@nombre`, `#etiqueta` y `#[[etiqueta con espacios]]`, en el orden del texto.
 * Solo lee el texto (no sabe qué objetos existen): resolver cada nombre a un objeto lo hace
 * src/lib/server/objects/enlaces.js al guardar.
 *
 * Lo que no cuenta (docs/enlaces.md, «Qué se puede escribir»):
 * - lo que está dentro de código (bloques con ``` o ~~~, `código en línea`, `<code>`, `<pre>`),
 *   de `<script>`/`<style>` y de comentarios HTML;
 * - las direcciones (`https://…`, el destino de un `[texto](…)`, los atributos de una etiqueta
 *   HTML): `instagram.com/@alguien` o `href="#seccion"` no son menciones ni etiquetas;
 * - lo escapado: `\@`, `\#`, `\[[`;
 * - un `#` seguido de espacio (un título) o pegado a una palabra (`C#`, `a#b`); una etiqueta
 *   tiene al menos una letra (`#1` no es etiqueta).
 *
 * Es un lector de texto, no el procesador de Markdown: cuando llegue el procesador único
 * (`enlaces-markdown` del plan), las dos cosas tienen que coincidir.
 */

/** @typedef {'enlace' | 'incrustado' | 'mencion' | 'etiqueta'} ReferenceForm */
/** @typedef {{ form: ReferenceForm, target: string }} BodyReference */

/** Cuántos caracteres puede tener lo que se nombra (más largo: no es un enlace). */
const TARGET_MAX = 200;

/** Tapa con espacios (conserva el largo, así nada se junta con lo de al lado). */
const blank = (/** @type {string} */ s) => s.replace(/[^\n]/g, ' ');

/**
 * El texto sin lo que no cuenta (código, comentarios, direcciones, etiquetas HTML).
 *
 * @param {string} text
 */
function visibleText(text) {
	let out = text
		.replace(/\r\n?/g, '\n')
		.replace(/<!--[\s\S]*?(?:-->|$)/g, blank)
		.replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, blank);
	// Bloques de código con ``` o ~~~ (hasta el mismo cierre, o hasta el final).
	const lines = out.split('\n');
	let fence = '';
	for (let i = 0; i < lines.length; i++) {
		const open = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
		if (fence) {
			const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
			if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = '';
			lines[i] = '';
		} else if (open) {
			fence = open[1];
			lines[i] = '';
		}
	}
	out = lines.join('\n');
	return (
		out
			// Código en línea: la misma cantidad de comillas invertidas abre y cierra, en el mismo
			// párrafo (una comilla suelta no tapa lo que viene después de una línea en blanco).
			.replace(/(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g, blank)
			// Etiquetas HTML (con sus atributos), destinos de links de Markdown y direcciones sueltas.
			.replace(/<\/?[A-Za-z][^<>\n]*>/g, blank)
			.replace(
				/\]\([^()\s]*(?:\([^()\s]*\)[^()\s]*)*(?:\s+"[^"\n]*")?\)/g,
				(m) => ']' + blank(m.slice(1))
			)
			.replace(/\b(?:https?:\/\/|mailto:|www\.)[^\s<>]+/gi, blank)
	);
}

/**
 * Lo que nombra un `[[…]]` por dentro: sin el texto visible (`|texto` o ` : texto`, la forma vieja)
 * ni la sección (`#En la práctica`, `#^a1b2`). Vacío si es un enlace a una sección propia.
 *
 * @param {string} inner
 */
function linkTarget(inner) {
	let target = inner;
	const old = target.indexOf(' : ');
	if (old >= 0) target = target.slice(0, old);
	const pipe = target.indexOf('|');
	// `\|` dentro de una tabla: la barra es del separador.
	if (pipe >= 0) target = target.slice(0, pipe).replace(/\\$/, '');
	const hash = target.indexOf('#');
	if (hash >= 0) target = target.slice(0, hash);
	return target.replace(/\s+/g, ' ').trim();
}

/**
 * Dónde empieza una etiqueta: al principio, después de un espacio o de `(`, `¡`, `¿`.
 * Las cuatro formas, en este orden (la primera que calza en cada lugar del texto gana).
 */
const REFERENCE = new RegExp(
	[
		// 1: #[[etiqueta con espacios]]
		String.raw`(?<=^|[\s(¡¿])#\[\[([^\[\]\n]+)\]\]`,
		// 2: escape, 3: «!» (incrustado), 4: lo de adentro de [[…]]
		String.raw`(\\?)(!?)\[\[([^\[\]\n]+)\]\]`,
		// 5: escape, 6: @nombre (como customRehype.js: no pegado a una letra, así un mail no cuenta)
		String.raw`(?<![\w\d])(\\?)@([\p{L}\p{N}_.-]*[\p{L}\p{N}_])`,
		// 7: #etiqueta: letras, números, _, - y /, con al menos una letra o _
		String.raw`(?<=^|[\s(¡¿])#([\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)`
	].join('|'),
	'gu'
);

/**
 * Lo que nombra el cuerpo, en orden (puede repetir: quien lo usa decide).
 *
 * @param {unknown} text
 * @returns {BodyReference[]}
 */
export function bodyReferences(text) {
	if (typeof text !== 'string' || !/[[@#]/.test(text)) return [];
	/** @type {BodyReference[]} */
	const out = [];
	/** @param {ReferenceForm} form @param {string} target */
	const push = (form, target) => {
		if (target && target.length <= TARGET_MAX) out.push({ form, target });
	};
	for (const m of visibleText(text).matchAll(REFERENCE)) {
		if (m[1] !== undefined) push('etiqueta', m[1].replace(/\s+/g, ' ').trim());
		else if (m[4] !== undefined) {
			if (!m[2]) push(m[3] ? 'incrustado' : 'enlace', linkTarget(m[4]));
		} else if (m[6] !== undefined) {
			if (!m[5]) push('mencion', m[6]);
		} else if (m[7] !== undefined) push('etiqueta', m[7].replace(/[-/]+$/, ''));
	}
	return out;
}

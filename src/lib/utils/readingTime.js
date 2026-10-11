/**
 * Tiempo de lectura estimado de un texto guardado en la base (markdown con HTML, como lo guarda
 * el panel). Idea original de JorgeT10 (PR #46), rehecha sobre el contenido de la base.
 *
 * El texto pasa por `stripMarkdown` (el mismo que usa el buscador, $lib/utils/search): saca
 * etiquetas HTML, comentarios, `<style>`/`<script>`, imágenes, URLs sueltas y decodifica las
 * entidades. Antes se sacan los bloques de código (con cercas o `<pre>`): se miran, no se leen de
 * corrido.
 */
import { stripMarkdown } from './search.js';

/** Palabras por minuto de una lectura tranquila en castellano. */
export const WORDS_PER_MINUTE = 200;

/**
 * El texto sin bloques de código: cercas (``` o ~~~, hasta su cierre o el final) y `<pre>…</pre>`.
 * @param {string} text
 */
function withoutCodeBlocks(text) {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(^[ \t]*\1[ \t]*$|(?![\s\S]))/gm, ' ')
		.replace(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, ' ');
}

/**
 * Cuántas palabras tiene el texto que se lee (sin HTML, código ni imágenes). Una «palabra» es un
 * pedazo entre espacios con al menos una letra o un número: «—» o «…» solos no cuentan.
 * @param {unknown} body markdown o HTML
 * @returns {number}
 */
export function countWords(body) {
	if (typeof body !== 'string' || !body.trim()) return 0;
	const text = stripMarkdown(withoutCodeBlocks(body));
	let n = 0;
	for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) n++;
	return n;
}

/**
 * Minutos de lectura, redondeados para arriba (mínimo 1 si hay algo para leer; 0 si no hay texto).
 * @param {unknown} body markdown o HTML
 * @param {number} [wpm]
 * @returns {number}
 */
export function readingMinutes(body, wpm = WORDS_PER_MINUTE) {
	const words = countWords(body);
	if (!words) return 0;
	const rate = Number.isFinite(wpm) && wpm > 0 ? wpm : WORDS_PER_MINUTE;
	return Math.max(1, Math.ceil(words / rate));
}

/**
 * Debajo de esto el texto entra casi entero en la pantalla y «1 min de lectura» es ruido (un
 * material que es solo un link): la página no lo muestra.
 */
export const MIN_WORDS_TO_SHOW = 100;

/**
 * Los minutos que muestra la página de un material: los de {@link readingMinutes} si
 * el texto tiene al menos {@link MIN_WORDS_TO_SHOW} palabras; si no, 0 (no se muestra).
 * @param {unknown} body markdown o HTML
 * @returns {number}
 */
export function pageReadingMinutes(body) {
	const words = countWords(body);
	return words >= MIN_WORDS_TO_SHOW ? Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) : 0;
}

/** El `title` del indicador: cómo se calcula. */
export const READING_TIME_HINT = `Estimado a unas ${WORDS_PER_MINUTE} palabras por minuto`;

/**
 * «X min de lectura», o '' si no hay nada para leer.
 * @param {unknown} minutes
 */
export function readingTimeLabel(minutes) {
	const n = Number(minutes);
	return Number.isFinite(n) && n >= 1 ? `${Math.round(n)} min de lectura` : '';
}

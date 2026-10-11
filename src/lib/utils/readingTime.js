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
 * material que es solo un link, una entrada corta de la wiki): la página no lo muestra.
 */
export const MIN_WORDS_TO_SHOW = 100;

/**
 * Las palabras que cuentan para la página: las de {@link countWords} si son al menos
 * {@link MIN_WORDS_TO_SHOW}; si no, 0 (no se muestra). Viajan a la página para que el navegador
 * recalcule los minutos con la velocidad de cada persona ({@link minutesAtSpeed}).
 * @param {unknown} body markdown o HTML
 * @returns {number}
 */
export function pageReadingWords(body) {
	const words = countWords(body);
	return words >= MIN_WORDS_TO_SHOW ? words : 0;
}

/**
 * Los minutos que muestra la página de un material o de la wiki, a la velocidad de siempre
 * ({@link WORDS_PER_MINUTE}): 0 si el texto es corto (no se muestra).
 * @param {unknown} body markdown o HTML
 * @returns {number}
 */
export function pageReadingMinutes(body) {
	return minutesAtSpeed(pageReadingWords(body), WORDS_PER_MINUTE);
}

/** La velocidad más lenta y la más rápida que se puede elegir («Otro»). */
export const READING_SPEED_MIN = 80;
export const READING_SPEED_MAX = 600;

/** Las velocidades para elegir rápido (palabras por minuto). «Predeterminado» es la de siempre. */
export const READING_SPEEDS = /** @type {const} */ ([
	{ id: 'despacio', label: 'Más despacio', wpm: 150 },
	{ id: 'normal', label: 'Predeterminado', wpm: WORDS_PER_MINUTE },
	{ id: 'rapido', label: 'Más rápido', wpm: 280 }
]);

/**
 * Una velocidad elegida (número o texto con un número), redondeada y llevada al rango
 * {@link READING_SPEED_MIN}–{@link READING_SPEED_MAX}; `null` si no es un número (nada elegido).
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseReadingSpeed(value) {
	if (typeof value === 'string') value = value.trim();
	if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	return Math.min(READING_SPEED_MAX, Math.max(READING_SPEED_MIN, Math.round(n)));
}

/**
 * Minutos para tantas palabras a esa velocidad, para arriba (mínimo 1); 0 sin palabras. Sin una
 * velocidad válida, la de siempre.
 * @param {unknown} words las de {@link pageReadingWords}
 * @param {unknown} [wpm]
 * @returns {number}
 */
export function minutesAtSpeed(words, wpm = WORDS_PER_MINUTE) {
	const n = Number(words);
	if (!Number.isFinite(n) || n <= 0) return 0;
	const rate = parseReadingSpeed(wpm) ?? WORDS_PER_MINUTE;
	return Math.max(1, Math.ceil(n / rate));
}

/**
 * La explicación del indicador (al pasar el mouse, con el foco o al tocarlo): cómo se calcula.
 * Las imágenes y el código no cuentan porque {@link countWords} los saca.
 */
export const READING_TIME_HINT = `Calculado a unas ${WORDS_PER_MINUTE} palabras por minuto, sin contar imágenes ni código`;

/**
 * La explicación con la velocidad de la persona: la de siempre ({@link READING_TIME_HINT}) si no
 * eligió ninguna (o eligió «Predeterminado»).
 * @param {unknown} [wpm]
 */
export function readingTimeHint(wpm) {
	const rate = parseReadingSpeed(wpm);
	return rate === null || rate === WORDS_PER_MINUTE
		? READING_TIME_HINT
		: `Calculado a tu velocidad (${rate} palabras por minuto), sin contar imágenes ni código`;
}

/**
 * «X min de lectura», o '' si no hay nada para leer.
 * @param {unknown} minutes
 */
export function readingTimeLabel(minutes) {
	const n = Number(minutes);
	return Number.isFinite(n) && n >= 1 ? `${Math.round(n)} min de lectura` : '';
}

/**
 * La transcripción y los subtítulos del video de un texto (material; docs/imagenes.md, «Video:
 * transcripción y subtítulos»).
 *
 * - `transcript`: texto plano. Se muestra debajo del video, en un desplegable «Ver transcripción»
 *   (`<details>`), escapado: nunca es HTML.
 * - `subtitles`: un archivo WebVTT de la biblioteca (`/media/file/<hash>.vtt`). Va como `<track>`
 *   del video (subtítulos en español, prendidos por defecto).
 *
 * Si el texto tiene varios videos, es del primero. Si no tiene ningún `<video>` (por ejemplo, solo
 * un enlace al .mp4), la transcripción va al final del texto.
 *
 * Funciones puras, sin dependencias: corren en el servidor, en el navegador y en vitest.
 */

/** La dirección de un .vtt de la biblioteca. */
export const SUBTITLES_PATH = /^\/media\/file\/[0-9a-f]{64}\.vtt$/;

/** Por qué no se puede guardar lo que se escribió en «Subtítulos». */
export const SUBTITLES_PROBLEM =
	'Subtítulos: tiene que ser un archivo .vtt de la biblioteca (/media/file/….vtt). Subilo en Contenido → Biblioteca y copiá su dirección.';

/** @param {unknown} v */
export const isSubtitlesPath = (v) => SUBTITLES_PATH.test(String(v ?? '').trim());

/** Un video en el texto: una etiqueta `<video>` o un enlace a un MP4 o WebM de la biblioteca. */
const VIDEO_IN_TEXT = /<video[\s>]|\/media\/file\/[0-9a-f]{64}\.(?:mp4|webm)(?![0-9A-Za-z_])/i;

/**
 * ¿El texto muestra o enlaza un video? (Para mostrar la sección «Video» del editor.)
 * @param {unknown} body
 */
export const hasVideo = (body) => VIDEO_IN_TEXT.test(String(body ?? ''));

/** @param {string} s */
const escapeHtml = (s) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/**
 * La transcripción como HTML: un párrafo por bloque (separados por una línea vacía), los saltos
 * de línea sueltos como `<br>`. Todo escapado.
 * @param {string} text
 */
export function transcriptHtml(text) {
	return String(text ?? '')
		.replace(/\r\n?/g, '\n')
		.trim()
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
		.join('');
}

/**
 * Dónde está la primera etiqueta `<video …>` del HTML que no está dentro de un comentario.
 * @param {string} html
 */
function firstVideo(html) {
	/** @type {[number, number][]} */
	const comments = [...html.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((m) => [
		m.index ?? 0,
		(m.index ?? 0) + m[0].length
	]);
	for (const m of html.matchAll(/<video\b[^>]*>/gi)) {
		const at = m.index ?? 0;
		if (!comments.some(([a, b]) => at >= a && at < b)) return { index: at, tag: m[0] };
	}
	return null;
}

/**
 * El HTML del texto con los subtítulos (`<track>`) en el primer video y la transcripción
 * («Ver transcripción») debajo. Sin transcripción ni subtítulos válidos, el mismo HTML.
 *
 * @param {string} html el texto ya armado (y limpio)
 * @param {{ transcript?: unknown, subtitles?: unknown }} data
 * @returns {string}
 */
export function addVideoExtras(html, { transcript, subtitles } = {}) {
	const text = typeof transcript === 'string' ? transcriptHtml(transcript) : '';
	const vtt = isSubtitlesPath(subtitles) ? String(subtitles).trim() : '';
	if (!text && !vtt) return html;
	let out = String(html ?? '');
	const video = firstVideo(out);
	const details = text
		? `<details class="kv-transcripcion"><summary>Ver transcripción</summary><div class="kv-transcripcion-texto">${text}</div></details>`
		: '';
	if (!video) return details ? `${out}${details}` : out;
	const openEnd = video.index + video.tag.length;
	const track = vtt
		? `<track kind="subtitles" src="${vtt}" srclang="es" label="Español" default>`
		: '';
	out = out.slice(0, openEnd) + track + out.slice(openEnd);
	if (!details) return out;
	const close = out.toLowerCase().indexOf('</video>', openEnd);
	if (close === -1) return out + details;
	const after = close + '</video>'.length;
	return out.slice(0, after) + details + out.slice(after);
}

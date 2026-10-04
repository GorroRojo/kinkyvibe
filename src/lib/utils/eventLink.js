/**
 * El link de acción de un evento (`link` / `link_text` del frontmatter): el de la inscripción
 * cuando el evento no vende entradas. Una sola regla para el editor (crear y editar, en el
 * navegador y al guardar), la importación de la planilla, el tipo `evento` de la base y la página
 * pública.
 *
 * Vale: una dirección web (`https://`, `http://`), un mail (`mailto:` con una dirección), un
 * teléfono (`tel:`) o una página del sitio («/calendario/…», «#entradas»). Cualquier otro esquema
 * (`javascript:`, `data:`, `vbscript:`, `file:`…) se rechaza y la página no lo muestra.
 */
import { parseDocument } from 'yaml';
import { splitMarkdown } from './eventDraft.js';

/** Esquemas aceptados en un link absoluto. */
export const EVENT_LINK_PROTOCOLS = Object.freeze(['https:', 'http:', 'mailto:', 'tel:']);

/** Largo máximo (el mismo del campo `link` del tipo `evento`). */
export const EVENT_LINK_MAX = 2000;

/**
 * ¿Qué tiene de malo el link de acción? `null` si está bien (ver el comentario del módulo).
 * El texto no incluye el nombre del campo: quien lo usa lo antepone.
 *
 * @param {string} link ya sin espacios alrededor
 * @returns {string | null}
 */
export function eventLinkProblem(link) {
	if (link.length > EVENT_LINK_MAX) return 'es demasiado largo';
	if (/^\/(?!\/)/.test(link) || link.startsWith('#')) return null;
	/** @type {URL} */
	let url;
	try {
		url = new URL(link);
	} catch {
		return 'no es un link válido (tiene que empezar con https://)';
	}
	if (!EVENT_LINK_PROTOCOLS.includes(url.protocol)) {
		return 'tiene que ser un link web (https://), un mail (mailto:) o una página del sitio';
	}
	if (url.protocol === 'mailto:' && !isMailtoAddress(url)) {
		return 'es un mail sin dirección (por ejemplo mailto:hola@kinkyvibe.ar)';
	}
	return null;
}

/**
 * Un `mailto:` con al menos una dirección con forma de mail (antes del `?asunto…`).
 * @param {URL} url
 */
function isMailtoAddress(url) {
	let to;
	try {
		to = decodeURIComponent(url.pathname);
	} catch {
		return false;
	}
	return to.split(',').some((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.trim()));
}

/**
 * El link listo para un `href`, o `''` si no hay o no vale (así un .md con `javascript:` nunca
 * llega a la página).
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function safeEventLink(raw) {
	const link = typeof raw === 'string' ? raw.trim() : '';
	if (!link) return '';
	return eventLinkProblem(link) === null ? link : '';
}

/**
 * ¿Es un link a un mail? (La página no lo abre en otra pestaña.)
 * @param {unknown} raw
 */
export function isMailtoLink(raw) {
	return typeof raw === 'string' && /^mailto:/i.test(raw.trim());
}

/**
 * ¿Abre otra web? Solo los `http(s)://` (un mail, un teléfono o una página del sitio, no).
 * @param {unknown} raw
 */
export function isWebLink(raw) {
	return typeof raw === 'string' && /^https?:\/\//i.test(raw.trim());
}

/**
 * Problemas del link de un archivo de evento, para el guardado (vacío = todo bien). Un archivo
 * cuyas propiedades no se pueden leer lo valida el resto del guardado.
 *
 * @param {string} content el archivo completo
 * @returns {string[]}
 */
export function linkFileErrors(content) {
	/** @type {Record<string, any>} */
	let meta;
	try {
		const doc = parseDocument(splitMarkdown(content).frontmatter);
		if (doc.errors.length) return [];
		meta = doc.toJS() ?? {};
	} catch {
		return [];
	}
	if (meta.link === undefined || meta.link === null || meta.link === '') return [];
	const problem = eventLinkProblem(String(meta.link).trim());
	return problem ? [`Link de inscripción: ${problem}.`] : [];
}

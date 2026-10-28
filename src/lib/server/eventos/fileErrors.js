/**
 * Validación del archivo completo de un evento (el .md con su frontmatter) para el guardado del
 * editor: el «Dónde» y el link de inscripción. Vive en el servidor porque necesita `yaml`; las
 * reglas en sí siguen en $lib/utils/eventPlace.js y $lib/utils/eventLink.js, que usan también la
 * página pública y el editor en el navegador sin bajar `yaml`.
 */
import { parseDocument } from 'yaml';
import { splitMarkdown } from '$lib/utils/eventDraft.js';
import { checkMapLink } from '$lib/utils/eventPlace.js';
import { eventLinkProblem } from '$lib/utils/eventLink.js';

/**
 * Problemas del «Dónde» de un archivo de evento, para el guardado (vacío = todo bien). Un archivo
 * cuyas propiedades no se pueden leer lo valida el resto del guardado.
 * @param {string} content el archivo completo
 * @returns {string[]}
 */
export function placeFileErrors(content) {
	/** @type {Record<string, any>} */
	let meta;
	try {
		const doc = parseDocument(splitMarkdown(content).frontmatter);
		if (doc.errors.length) return [];
		meta = doc.toJS() ?? {};
	} catch {
		return [];
	}
	if (meta.location_map === undefined || meta.location_map === null) return [];
	const map = checkMapLink(String(meta.location_map));
	return map.ok ? [] : [map.message];
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

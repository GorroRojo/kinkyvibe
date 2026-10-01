/**
 * Crear series desde el panel (interruptor `series`): «Crear serie» en Eventos → Series y la
 * pregunta «¿Es parte de una serie?» al duplicar un evento. Una serie es una etiqueta hija de
 * «evento recurrente»; los cambios se guardan con el mismo camino que /admin/etiquetas
 * (planTagEdit / commitTagEdit). Funciones puras, con pruebas en seriesAdmin.test.js.
 */
import { SERIES_PARENT } from './series.js';
import { seriesNameFromTitle } from './seriesDetect.js';
import { isAssetFileName, validateTagName } from './tagConfig.js';

/** @param {unknown} s */
const clean = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Las operaciones del editor de etiquetas para crear una serie.
 *
 * @param {{ name: unknown, image?: unknown, description?: unknown }} input
 * @param {{ exists?: (name: string) => boolean }} [opts]
 * @returns {{ ok: true, name: string, ops: import('./tagConfig.js').TagOp[] } | { ok: false, error: string }}
 */
export function seriesCreateOps(input, { exists = () => false } = {}) {
	const name = clean(input.name);
	const invalid = validateTagName(name);
	if (invalid) return { ok: false, error: invalid };
	if (exists(name)) return { ok: false, error: `Ya existe una etiqueta «${name}».` };
	const image = clean(input.image);
	if (image && !isAssetFileName(image))
		return { ok: false, error: 'La imagen tiene que ser un archivo de src/lib/assets.' };
	const description = String(input.description ?? '').trim();
	if (description.length > 2000)
		return { ok: false, error: 'La descripción es demasiado larga (máximo 2000 caracteres).' };
	/** @type {import('./tagConfig.js').TagOp[]} */
	const ops = [
		{ type: 'create', id: name, parent: SERIES_PARENT, ...(description ? { description } : {}) }
	];
	if (image) ops.push({ type: 'update', id: name, set: { image } });
	return { ok: true, name, ops };
}

/**
 * Qué preguntar al duplicar: `null` si el evento original ya está en una serie; si no, el nombre
 * sugerido (el título sin número de edición, fechas, etc.) y las series que existen.
 *
 * @param {{ title?: unknown, tags?: readonly string[] }} source
 * @param {readonly string[]} seriesIds
 */
export function seriesPromptFor(source, seriesIds) {
	const tags = new Set(source.tags ?? []);
	if (seriesIds.some((id) => tags.has(id))) return null;
	return { suggested: seriesNameFromTitle(source.title), existing: [...seriesIds] };
}

/**
 * @typedef {{ type: 'none' } |
 *   { type: 'create', name: string, markSource: boolean } |
 *   { type: 'add', name: string, markSource: boolean }} SeriesChoice
 */

/**
 * La respuesta a «¿Es parte de una serie?» (campos del formulario de duplicar).
 *
 * @param {{ choice?: unknown, name?: unknown, existing?: unknown, markSource?: unknown }} form
 * @param {{ seriesIds: readonly string[], exists?: (name: string) => boolean }} opts
 * @returns {{ ok: true, choice: SeriesChoice } | { ok: false, error: string }}
 */
export function readSeriesChoice(form, { seriesIds, exists = () => false }) {
	const markSource =
		form.markSource === 'on' || form.markSource === '1' || form.markSource === true;
	const kind = String(form.choice ?? '');
	if (kind === '' || kind === 'no') return { ok: true, choice: { type: 'none' } };
	if (kind === 'crear') {
		const name = clean(form.name);
		const invalid = validateTagName(name);
		if (invalid) return { ok: false, error: `Serie nueva: ${invalid}` };
		if (seriesIds.includes(name))
			return { ok: false, error: `«${name}» ya es una serie: elegí «Agregar a una existente».` };
		if (exists(name))
			return {
				ok: false,
				error: `Ya hay una etiqueta «${name}» que no es serie: elegí otro nombre o pasala a serie desde Etiquetas.`
			};
		return { ok: true, choice: { type: 'create', name, markSource } };
	}
	if (kind === 'agregar') {
		const name = clean(form.existing);
		if (!seriesIds.includes(name)) return { ok: false, error: 'Elegí una de las series.' };
		return { ok: true, choice: { type: 'add', name, markSource } };
	}
	return { ok: false, error: 'Respuesta inválida a «¿Es parte de una serie?».' };
}

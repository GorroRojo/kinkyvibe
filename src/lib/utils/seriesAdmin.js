/**
 * Crear series desde el panel: «Crear serie» en Eventos → Series y la
 * pregunta «¿Es parte de una serie?» al duplicar un evento. Una serie es una etiqueta hija de
 * «evento recurrente»; los cambios se guardan con el mismo camino que /admin/etiquetas
 * (planTagEdit / commitTagEdit). Funciones puras, con pruebas en seriesAdmin.test.js.
 */
import { SERIES_PARENT } from './series.js';
import { seriesNameFromTitle } from './seriesDetect.js';
import { isTagImage, validateTagName } from './tagConfig.js';

const IMAGE_ERROR =
	'La imagen tiene que ser un archivo de src/lib/assets o la de un evento (calendario:<evento>/1.webp).';

/** @param {unknown} s */
const clean = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Las operaciones del editor de etiquetas para crear una serie: hija de «evento recurrente» o, con
 * `parent`, de otra serie (una serie hija: una por año, como «Cuirdas Sudacas 2026», o una edición
 * especial, como «Picantearla: Deluxe»). Sus eventos llevan las dos etiquetas: la de la serie hija
 * y la de la madre (así la página de la madre sigue mostrando todas las ediciones).
 *
 * @param {{ name: unknown, image?: unknown, description?: unknown, icon?: unknown, parent?: unknown }} input
 * @param {{ exists?: (name: string) => boolean, seriesIds?: readonly string[] }} [opts]
 *   `seriesIds`: las series que existen (las únicas madres que se aceptan además de «evento
 *   recurrente»)
 * @returns {{ ok: true, name: string, parent: string, ops: import('./tagConfig.js').TagOp[] } | { ok: false, error: string }}
 */
export function seriesCreateOps(input, { exists = () => false, seriesIds = [] } = {}) {
	const name = clean(input.name);
	const invalid = validateTagName(name);
	if (invalid) return { ok: false, error: invalid };
	if (exists(name)) return { ok: false, error: `Ya existe una etiqueta «${name}».` };
	const parent = clean(input.parent) || SERIES_PARENT;
	if (parent !== SERIES_PARENT && !seriesIds.includes(parent))
		return { ok: false, error: 'Elegí una de las series como madre (o ninguna).' };
	const image = clean(input.image);
	if (image && !isTagImage(image)) return { ok: false, error: IMAGE_ERROR };
	const icon = clean(input.icon);
	if (icon.length > SERIES_ICON_MAX)
		return { ok: false, error: 'El ícono tiene que ser un emoji (o dos).' };
	const description = String(input.description ?? '').trim();
	if (description.length > 2000)
		return { ok: false, error: 'La descripción es demasiado larga (máximo 2000 caracteres).' };
	/** @type {import('./tagConfig.js').TagOp[]} */
	const ops = [
		{
			type: 'create',
			id: name,
			parent,
			...(icon ? { icon } : {}),
			...(description ? { description } : {})
		}
	];
	if (image) ops.push({ type: 'update', id: name, set: { image } });
	return { ok: true, name, parent, ops };
}

/** Largo máximo del ícono (un emoji, como en Etiquetas). */
export const SERIES_ICON_MAX = 16;
/** Largo máximo del nombre visible. */
export const SERIES_TITLE_MAX = 100;

/**
 * Las operaciones del editor de etiquetas para editar una serie (Eventos → Series → Editar): el
 * nombre de la etiqueta (`key`, el que usan los eventos: renombrar, como en Etiquetas), el nombre
 * visible, el ícono, la imagen y la descripción. Solo lo que cambió.
 *
 * Renombrar va primero (`rename`, con `keepAlias` como lo eligió quien edita: ver
 * RenameChoice.svelte) y lo demás se aplica a la etiqueta con el nombre nuevo.
 *
 * @param {{ key?: unknown, visible_name?: unknown, icon?: unknown, image?: unknown, description?: unknown }} input
 * @param {{ id: string, visible_name?: string, icon?: string, image?: string, description?: string }} current
 * @param {{ keepAlias?: boolean, exists?: (name: string) => boolean }} [opts] `exists`: si un
 *   nombre ya es otra etiqueta (o alias)
 * @returns {{ ok: true, name: string, renamed: string | null, ops: import('./tagConfig.js').TagOp[] } | { ok: false, error: string }}
 */
export function seriesEditOps(input, current, { keepAlias = false, exists = () => false } = {}) {
	const from = current.id;
	const key = input.key === undefined ? from : clean(input.key) || from;
	if (key !== from) {
		const invalid = validateTagName(key);
		if (invalid) return { ok: false, error: invalid };
		if (exists(key))
			return {
				ok: false,
				error: `Ya existe una etiqueta (o un alias) «${key}». Para juntar dos etiquetas usá «Fusionar», en Etiquetas.`
			};
	}
	const id = key;
	const next = {
		visible_name: clean(input.visible_name),
		icon: clean(input.icon),
		image: clean(input.image),
		description: String(input.description ?? '').trim()
	};
	if (next.visible_name === id) next.visible_name = '';
	if (next.visible_name.length > SERIES_TITLE_MAX)
		return { ok: false, error: `El nombre es demasiado largo (máximo ${SERIES_TITLE_MAX}).` };
	if (/[[\]]/.test(next.visible_name))
		return { ok: false, error: 'El nombre no puede tener corchetes.' };
	if (next.icon.length > SERIES_ICON_MAX)
		return { ok: false, error: 'El ícono tiene que ser un emoji (o dos).' };
	if (next.image && !isTagImage(next.image)) return { ok: false, error: IMAGE_ERROR };
	if (next.description.length > 2000)
		return { ok: false, error: 'La descripción es demasiado larga (máximo 2000 caracteres).' };
	const beforeVisible =
		current.visible_name && current.visible_name !== from ? current.visible_name : '';
	const before = {
		visible_name: beforeVisible === id ? '' : beforeVisible,
		icon: clean(current.icon),
		image: clean(current.image),
		description: String(current.description ?? '').trim()
	};
	/** @type {Record<string, string>} */
	const set = {};
	for (const k of /** @type {(keyof typeof next)[]} */ (Object.keys(next))) {
		if (next[k] !== before[k]) set[k] = next[k];
	}
	/** @type {import('./tagConfig.js').TagOp[]} */
	const ops = [];
	if (key !== from) ops.push({ type: 'rename', from, to: key, keepAlias });
	if (Object.keys(set).length) ops.push({ type: 'update', id, set });
	if (!ops.length) return { ok: false, error: 'No cambiaste nada.' };
	return { ok: true, name: id, renamed: key !== from ? from : null, ops };
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

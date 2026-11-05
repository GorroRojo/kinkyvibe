/**
 * Cambios de una etiqueta y de su entrada de la Kinkipedia, del conector de Claude
 * (docs/conector-claude.md, «Cambios»), por los mismos guardados del panel:
 *
 * - **etiqueta**: Etiquetas → «Guardar» de una etiqueta (un cambio `update` de
 *   src/lib/utils/tagConfig.js: nombre para mostrar, ícono, color, descripción e imagen). Renombrar,
 *   mover, fusionar y los alias, desde el panel: cambian muchas publicaciones a la vez y deshacerlos
 *   no es volver una versión atrás.
 * - **kinkipedia**: Etiquetas → «Entrada de la Kinkipedia» → «Guardar» (título, resumen, autores,
 *   etiquetas y texto). Sacar la entrada entera (el «Sacar la entrada» del panel) solo lo hace
 *   `deshacer`, cuando vuelve a una versión sin entrada.
 */
import { ToolInputError } from './tools.js';
import { failMessage, oneLine, runPanelAction, textList, valueText } from './objetos.js';
import { normalizeBody, short } from './editarPost.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** Las claves de `cambios` de una etiqueta. */
export const TAG_FIELDS = Object.freeze([
	'nombre_visible',
	'icono',
	'color',
	'descripcion',
	'imagen'
]);

/** Las claves de `cambios` de una entrada de la Kinkipedia. */
export const WIKI_FIELDS = Object.freeze(['titulo', 'resumen', 'autores', 'etiquetas', 'texto']);

/** Campo de `cambios` → clave del cambio `update` del panel y cómo se muestra. */
const TAG_KEYS = /** @type {const} */ ([
	['nombre_visible', 'visible_name', 'nombre para mostrar'],
	['icono', 'icon', 'ícono'],
	['color', 'color', 'color'],
	['descripcion', 'description', 'descripción'],
	['imagen', 'image', 'imagen']
]);

/**
 * Lo que tiene ahora una etiqueta en los campos que se cambian desde acá.
 * @param {{ title: string, data: Record<string, unknown> }} tag
 * @returns {Record<string, string>}
 */
export function tagValues(tag) {
	const key = String(tag.data.key ?? '');
	/** @param {unknown} v */
	const s = (v) => (typeof v === 'string' ? v : '');
	return {
		visible_name: tag.title && tag.title !== key ? tag.title : '',
		icon: s(tag.data.icon),
		color: s(tag.data.color),
		description: s(tag.data.description),
		image: s(tag.data.image)
	};
}

/**
 * Las entradas de una etiqueta, normalizadas (como claves del cambio `update`).
 * @param {unknown} raw
 */
export function normalizeTagInputs(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError(`\`cambios\` es un objeto con alguno de: ${TAG_FIELDS.join(', ')}.`);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !TAG_FIELDS.includes(k));
	if (unknown.length)
		throw new ToolInputError(
			`No se puede cambiar ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')} de una etiqueta desde acá ` +
				`(renombrar, mover, fusionar y los alias van desde el panel). Lo que sí: ${TAG_FIELDS.join(', ')}.`
		);
	/** @type {Record<string, string>} */
	const out = {};
	for (const [k, key] of TAG_KEYS) {
		if (input[k] === undefined) continue;
		out[key] =
			k === 'descripcion'
				? String(normalizeBody(input[k]) ?? '').slice(0, 2000)
				: oneLine(input[k], k === 'imagen' ? 160 : 60);
	}
	if (!Object.keys(out).length) throw new ToolInputError('No hay nada para cambiar.');
	return out;
}

/**
 * El cambio `update` y el antes y después.
 * @param {StoredObject} tag
 * @param {Record<string, string>} set lo que cambia
 */
export function planTagChange(tag, set) {
	const before = tagValues(tag);
	/** @type {Record<string, string>} */
	const changed = {};
	const changes = [];
	for (const [, key, label] of TAG_KEYS) {
		if (set[key] === undefined || set[key] === before[key]) continue;
		changed[key] = set[key];
		changes.push({
			campo: label,
			antes: key === 'description' ? short(before[key]) : valueText(before[key]),
			despues: key === 'description' ? short(set[key]) : valueText(set[key])
		});
	}
	return { op: { type: 'update', id: String(tag.data.key), set: changed }, changes };
}

/**
 * El «Guardar» de una etiqueta en Etiquetas.
 * @param {ToolContext} ctx
 * @param {Record<string, unknown>} op
 * @returns {Promise<{ ok: true, warnings: string[] } | { ok: false, message: string }>}
 */
export async function savePanelTag(ctx, op) {
	const { actions } = await import('../../../routes/(authed)/admin/etiquetas/+page.server.js');
	const form = new FormData();
	form.set('op', JSON.stringify(op));
	const r = /** @type {any} */ (
		await runPanelAction(ctx, actions.guardar, {
			path: '/admin/etiquetas?/guardar',
			params: {},
			form
		})
	);
	return r?.saved ? { ok: true, warnings: [] } : { ok: false, message: failMessage(r) };
}

/**
 * Lo que tiene ahora la entrada de la Kinkipedia de una etiqueta.
 * @param {{ data: Record<string, unknown> }} tag
 */
export function wikiValues(tag) {
	const d = tag.data;
	/** @param {unknown} v */
	const list = (v) => (Array.isArray(v) ? v.map((x) => String(x)) : []);
	return {
		title: typeof d.wiki_title === 'string' ? d.wiki_title : '',
		summary: typeof d.wiki_summary === 'string' ? d.wiki_summary : '',
		authors: list(d.wiki_authors),
		tags: list(d.wiki_tags),
		body: typeof d.body === 'string' ? d.body : ''
	};
}

/** @typedef {ReturnType<typeof wikiValues>} WikiValues */

/**
 * Las entradas de la Kinkipedia, normalizadas.
 * @param {unknown} raw
 * @returns {Partial<WikiValues>}
 */
export function normalizeWikiInputs(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError(`\`cambios\` es un objeto con alguno de: ${WIKI_FIELDS.join(', ')}.`);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !WIKI_FIELDS.includes(k));
	if (unknown.length)
		throw new ToolInputError(
			`No se puede cambiar ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')} de la Kinkipedia. Lo que sí: ${WIKI_FIELDS.join(', ')}.`
		);
	/** @type {Partial<WikiValues>} */
	const out = {};
	if (input.titulo !== undefined) out.title = oneLine(input.titulo, 200);
	if (input.resumen !== undefined) out.summary = oneLine(input.resumen, 1000);
	if (input.autores !== undefined) out.authors = textList(input.autores, 'autores', 20);
	if (input.etiquetas !== undefined) out.tags = textList(input.etiquetas, 'etiquetas', 60);
	if (input.texto !== undefined) {
		const b = normalizeBody(input.texto);
		if (b === null) throw new ToolInputError('El texto es demasiado largo.');
		out.body = b;
	}
	if (!Object.keys(out).length) throw new ToolInputError('No hay nada para cambiar.');
	return out;
}

/**
 * Los valores nuevos y el antes y después.
 * @param {WikiValues} before
 * @param {Partial<WikiValues>} inputs
 */
export function planWikiChange(before, inputs) {
	const after = { ...before, ...inputs };
	const labels = /** @type {const} */ ([
		['title', 'título'],
		['summary', 'resumen'],
		['authors', 'autores'],
		['tags', 'etiquetas'],
		['body', 'texto']
	]);
	const changes = [];
	for (const [k, label] of labels) {
		if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
		changes.push({
			campo: label,
			antes: k === 'body' ? short(String(before[k])) : valueText(before[k]),
			despues: k === 'body' ? short(String(after[k])) : valueText(after[k])
		});
	}
	return { after, changes };
}

/**
 * El «Guardar» (o, con `remove`, «Sacar la entrada») de la Kinkipedia del panel.
 * @param {ToolContext} ctx
 * @param {{ slug: string, values: WikiValues, version: number, remove?: boolean }} change
 * @returns {Promise<{ ok: true, warnings: string[] } | { ok: false, message: string, conflict: boolean }>}
 */
export async function savePanelWiki(ctx, { slug, values, version, remove = false }) {
	const { actions } =
		await import('../../../routes/(authed)/admin/etiquetas/wiki/[term]/+page.server.js');
	const form = new FormData();
	form.set('title', values.title);
	form.set('summary', values.summary);
	form.set('authors', values.authors.join('\n'));
	form.set('tags', values.tags.join('\n'));
	form.set('body', values.body);
	form.set('version', String(version));
	const name = remove ? 'sacar' : 'guardar';
	const r = /** @type {any} */ (
		await runPanelAction(ctx, actions[name], {
			path: `/admin/etiquetas/wiki/${encodeURIComponent(slug)}?/${name}`,
			params: { term: slug },
			form
		})
	);
	if (r?.wiki?.ok) return { ok: true, warnings: [] };
	return {
		ok: false,
		message: failMessage(r, 'wiki'),
		conflict: Boolean(r?.data?.wiki?.conflict)
	};
}

/** Las claves de `cambios` de una etiqueta nueva. */
export const NEW_TAG_FIELDS = Object.freeze([
	'nombre',
	'madre',
	'nombre_visible',
	'icono',
	'descripcion'
]);

/**
 * El cambio `create` del editor de etiquetas para una etiqueta nueva, normalizado.
 * @param {unknown} raw
 */
export function normalizeNewTagInputs(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError(`\`cambios\` es un objeto con: ${NEW_TAG_FIELDS.join(', ')}.`);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !NEW_TAG_FIELDS.includes(k));
	if (unknown.length)
		throw new ToolInputError(
			`En una etiqueta nueva no va ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')}. Lo que sí: ${NEW_TAG_FIELDS.join(', ')} (el color y la imagen, después, con \`editar_objeto\`).`
		);
	const id = oneLine(input.nombre, 61);
	if (!id) throw new ToolInputError('Falta `nombre` (el nombre exacto de la etiqueta).');
	/** @type {{ type: 'create', id: string, parent?: string, visible_name?: string, icon?: string, description?: string }} */
	const op = { type: 'create', id };
	const parent = oneLine(input.madre, 100);
	if (parent) op.parent = parent;
	const visible = oneLine(input.nombre_visible, 60);
	if (visible) op.visible_name = visible;
	const icon = oneLine(input.icono, 16);
	if (icon) op.icon = icon;
	const description = String(normalizeBody(input.descripcion) ?? '').slice(0, 2000);
	if (description) op.description = description;
	return op;
}

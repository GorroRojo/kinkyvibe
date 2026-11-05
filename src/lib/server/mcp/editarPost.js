/**
 * Lo común a los cambios del conector de Claude sobre los eventos y el material
 * (docs/conector-claude.md, «Cambios»): los dos se editan en el panel como un texto (propiedades y
 * descripción) más la imagen de la biblioteca (edge `portada`), y se guardan por el «Guardar» de
 * su editor. Acá: leer lo que hay, normalizar los campos que comparten (título, descripción,
 * resumen, etiquetas, personas, visibilidad, imagen, link, propiedades) y armar el texto nuevo
 * como lo armaría el editor (`applyFrontmatterChanges`).
 *
 * Lo propio de cada uno: ./editarEvento.js (fecha, lugar, estado, entradas) y ./editarMaterial.js.
 */
import { findDbPost } from '$lib/server/contenido/repo.js';
import { imageOf } from '$lib/server/media/library.js';
import { REMOVE, splitMarkdown } from '$lib/utils/eventDraft.js';
import { personasFromMd, personasToMd } from '$lib/utils/personasList.js';
import { parseDocument } from 'yaml';
import {
	imageTitle,
	oneLine,
	personasInput,
	personasText,
	propertiesInput,
	resolveImage,
	textList,
	valueText
} from './objetos.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {{ campo: string, antes: string, despues: string }} FieldChange */

/** Un error de las entradas, para devolverle a Claude. */
export class PostChangeError extends Error {}

/** Las claves de `cambios` que comparten el evento y el material. */
export const COMMON_FIELDS = Object.freeze([
	'titulo',
	'descripcion',
	'resumen',
	'etiquetas',
	'personas',
	'visibilidad',
	'imagen',
	'link',
	'texto_del_link',
	'propiedades'
]);

/** Los valores de `visibilidad` (el «No listado» del editor). */
export const VISIBILITY_VALUES = Object.freeze(['listado', 'no_listado']);

const VISIBILITY_TEXT = /** @type {Record<string, string>} */ ({
	listado: 'listado (aparece en las listas)',
	no_listado: 'no listado (no aparece en las listas; se ve con el link)'
});

/** Las propiedades que no van en `propiedades` (tienen su campo, o no se cambian desde acá). */
export const COMMON_BLOCKED = Object.freeze([
	'title',
	'summary',
	'tags',
	'authors',
	'personas',
	'force_unlisted',
	'layout',
	'category',
	'updated_date',
	'featured',
	'link',
	'link_text'
]);

export const MAX_TITLE = 200;
export const MAX_BODY = 20000;
const MAX_SUMMARY = 1000;

/**
 * @typedef {{
 *   category: 'calendario' | 'material',
 *   slug: string,
 *   raw: string,
 *   sha: string,
 *   meta: Record<string, any>,
 *   frontmatter: string,
 *   body: string,
 *   title: string,
 *   object: import('$lib/server/objects/read.js').StoredObject,
 *   imageId: number | null
 * }} PostState
 */

/**
 * Lo que hay ahora de un evento o un material (el texto, su sha, el objeto y la imagen), o `null`.
 *
 * @param {ToolContext} ctx
 * @param {'calendario' | 'material'} category
 * @param {string} slug
 * @returns {Promise<PostState | null>}
 */
export async function postState(ctx, category, slug) {
	const file = await findDbPost(ctx.db, category, slug);
	if (!file || file.deleted) return null;
	const { frontmatter, body } = splitMarkdown(file.raw);
	const doc = parseDocument(frontmatter);
	if (doc.errors.length) {
		throw new PostChangeError(
			'Las propiedades tienen un error de formato: arreglalo desde el panel.'
		);
	}
	const image = await imageOf(ctx.db, file.object.id, 'portada', {
		role: 'admin',
		id: ctx.user.login
	}).catch(() => null);
	return {
		category,
		slug,
		raw: file.raw,
		sha: file.sha,
		meta: doc.toJS() ?? {},
		frontmatter,
		body,
		title: file.object.title,
		object: file.object,
		imageId: image ? Number(image.id) : null
	};
}

/** La descripción normalizada (saltos de línea LF, sin espacios de más al final). @param {unknown} v */
export function normalizeBody(v) {
	if (typeof v !== 'string') return null;
	const text = v
		.replace(/\r\n?/g, '\n')
		// eslint-disable-next-line no-control-regex -- sin caracteres de control (salvo el salto y el tab)
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
		.replace(/[ \t]+$/gm, '')
		.trim();
	return text.length <= MAX_BODY ? text : null;
}

/** El texto de la descripción como queda en el archivo. @param {string} text */
export const bodyOf = (text) => `\n${text}\n`;

/** @param {string} s */
export const short = (s) => {
	const one = s.replace(/\s+/g, ' ').trim();
	return one.length > 160 ? `${one.slice(0, 160)}… (${s.length} caracteres)` : one || '(vacía)';
};

/** `authors:` del archivo como lista de textos. @param {unknown} v */
const authorsOf = (v) =>
	(Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
		.map((x) => String(x ?? ''))
		.filter(Boolean);

/** La lista de personas que tiene ahora el archivo. @param {PostState} s */
export const currentPersonas = (s) =>
	personasFromMd(authorsOf(s.meta.authors), s.meta.personas, s.category);

/** Las etiquetas que tiene ahora el archivo. @param {PostState} s */
export const currentTags = (s) =>
	(Array.isArray(s.meta.tags) ? s.meta.tags : []).map((t) => String(t ?? '')).filter(Boolean);

/**
 * Los campos comunes de `cambios`, normalizados (con los nombres resueltos en el servidor). Lo que
 * no es común queda para quien llama.
 *
 * @param {ToolContext} ctx
 * @param {Record<string, unknown>} input
 * @param {readonly string[]} blocked las propiedades que no van en `propiedades`
 * @returns {Promise<Record<string, unknown>>}
 */
export async function normalizeCommonInputs(ctx, input, blocked) {
	/** @type {Record<string, unknown>} */
	const out = {};
	if (input.titulo !== undefined) {
		const t = oneLine(input.titulo, MAX_TITLE + 1);
		if (!t) throw new PostChangeError('El título no puede quedar vacío.');
		if (t.length > MAX_TITLE)
			throw new PostChangeError(`El título puede tener hasta ${MAX_TITLE} caracteres.`);
		out.titulo = t;
	}
	if (input.descripcion !== undefined) {
		const b = normalizeBody(input.descripcion);
		if (b === null)
			throw new PostChangeError(`La descripción puede tener hasta ${MAX_BODY} caracteres.`);
		if (!b) throw new PostChangeError('La descripción no puede quedar vacía.');
		out.descripcion = b;
	}
	if (input.resumen !== undefined) {
		const t = oneLine(input.resumen, MAX_SUMMARY + 1);
		if (t.length > MAX_SUMMARY)
			throw new PostChangeError(`El resumen puede tener hasta ${MAX_SUMMARY} caracteres.`);
		out.resumen = t;
	}
	if (input.etiquetas !== undefined) out.etiquetas = textList(input.etiquetas, 'etiquetas');
	if (input.personas !== undefined) out.personas = await personasInput(ctx, input.personas);
	if (input.visibilidad !== undefined) {
		if (typeof input.visibilidad !== 'string' || !VISIBILITY_VALUES.includes(input.visibilidad))
			throw new PostChangeError(`\`visibilidad\` es una de: ${VISIBILITY_VALUES.join(', ')}.`);
		out.visibilidad = input.visibilidad;
	}
	if (input.imagen !== undefined) {
		const img = await resolveImage(ctx, input.imagen);
		out.imagen = img.id;
	}
	if (input.link !== undefined) out.link = oneLine(input.link, 2000);
	if (input.texto_del_link !== undefined) out.texto_del_link = oneLine(input.texto_del_link, 80);
	if (input.propiedades !== undefined)
		out.propiedades = propertiesInput(input.propiedades, blocked);
	return out;
}

/**
 * Los cambios comunes sobre el texto: las propiedades que cambian (`fm`, como las toma
 * `applyFrontmatterChanges`), la descripción, la imagen y el antes y después en palabras.
 *
 * @param {ToolContext} ctx
 * @param {PostState} state
 * @param {Record<string, any>} inputs ya normalizadas
 * @returns {Promise<{ fm: Record<string, any>, body: string, image: number | null | undefined, changes: FieldChange[] }>}
 *   `image`: la imagen nueva (`null` = sacarla), o `undefined` si no cambia
 */
export async function planCommonChanges(ctx, state, inputs) {
	/** @type {FieldChange[]} */
	const changes = [];
	/** @type {Record<string, any>} */
	const fm = {};
	if (inputs.titulo !== undefined && inputs.titulo !== state.title) {
		fm.title = inputs.titulo;
		changes.push({ campo: 'título', antes: state.title, despues: inputs.titulo });
	}
	if (inputs.resumen !== undefined) {
		const before = typeof state.meta.summary === 'string' ? state.meta.summary.trim() : '';
		if (inputs.resumen !== before) {
			fm.summary = inputs.resumen || REMOVE;
			changes.push({
				campo: 'resumen',
				antes: valueText(before),
				despues: valueText(inputs.resumen)
			});
		}
	}
	if (inputs.etiquetas !== undefined) {
		const before = currentTags(state);
		if (JSON.stringify(before) !== JSON.stringify(inputs.etiquetas)) {
			fm.tags = inputs.etiquetas.length ? inputs.etiquetas : REMOVE;
			changes.push({
				campo: 'etiquetas',
				antes: valueText(before),
				despues: valueText(inputs.etiquetas)
			});
		}
	}
	if (inputs.personas !== undefined) {
		const before = currentPersonas(state);
		const next = personasToMd(inputs.personas, state.category);
		const was = personasToMd(before, state.category);
		if (JSON.stringify(was) !== JSON.stringify(next)) {
			fm.authors = next.authors.length ? next.authors : REMOVE;
			fm.personas = next.personas.length ? next.personas : REMOVE;
			changes.push({
				campo: 'personas',
				antes: personasText(before),
				despues: personasText(inputs.personas)
			});
		}
	}
	if (inputs.visibilidad !== undefined) {
		const wasUnlisted = state.meta.force_unlisted === true;
		const unlisted = inputs.visibilidad === 'no_listado';
		if (unlisted !== wasUnlisted) {
			fm.force_unlisted = unlisted ? true : null;
			changes.push({
				campo: 'visibilidad',
				antes: VISIBILITY_TEXT[wasUnlisted ? 'no_listado' : 'listado'],
				despues: VISIBILITY_TEXT[inputs.visibilidad]
			});
		}
	}
	for (const [key, field, label] of /** @type {const} */ ([
		['link', 'link', 'link'],
		['link_text', 'texto_del_link', 'texto del link']
	])) {
		if (inputs[field] === undefined) continue;
		const before = state.meta[key] == null ? '' : String(state.meta[key]);
		if (inputs[field] !== before) {
			fm[key] = inputs[field] || REMOVE;
			changes.push({ campo: label, antes: valueText(before), despues: valueText(inputs[field]) });
		}
	}
	if (inputs.propiedades !== undefined) {
		for (const [key, value] of Object.entries(
			/** @type {Record<string, unknown>} */ (inputs.propiedades)
		)) {
			const before = state.meta[key];
			if (value === null) {
				if (before === undefined) continue;
				fm[key] = REMOVE;
			} else {
				if (JSON.stringify(before) === JSON.stringify(value)) continue;
				fm[key] = value;
			}
			changes.push({
				campo: `propiedad «${key}»`,
				antes: valueText(before),
				despues: valueText(value)
			});
		}
	}
	let body = state.body;
	if (inputs.descripcion !== undefined) {
		const before = state.body.trim();
		if (inputs.descripcion !== before) {
			body = bodyOf(inputs.descripcion);
			changes.push({
				campo: 'descripción',
				antes: short(before),
				despues: short(inputs.descripcion)
			});
		}
	}
	/** @type {number | null | undefined} */
	let image;
	if (inputs.imagen !== undefined && inputs.imagen !== state.imageId) {
		image = inputs.imagen;
		// Con una imagen de la biblioteca (o sin ninguna), la vieja del repo no hace falta (como
		// «Cargar evento»).
		if (state.meta.featured !== undefined && state.meta.featured !== null) fm.featured = null;
		changes.push({
			campo: 'imagen',
			antes: await imageTitle(ctx, state.imageId),
			despues: await imageTitle(ctx, image)
		});
	}
	return { fm, body, image, changes };
}

/** El valor del campo `imageId` del formulario del panel. @param {number | null | undefined} image */
export const imageField = (image) =>
	image === undefined ? '' : image === null ? 'none' : String(image);

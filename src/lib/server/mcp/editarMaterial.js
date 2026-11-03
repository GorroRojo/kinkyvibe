/**
 * Cambios de un material del conector de Claude (docs/conector-claude.md, «Cambios»): lo que el
 * panel edita en Contenido → Material, por el mismo «Guardar» (`editorActions('material')`, con
 * sus validaciones, el control de que nadie guardó en el medio, el historial y Actividad).
 *
 * Los campos son los comunes con el evento (./editarPost.js): título, descripción, resumen,
 * etiquetas, personas con su rol, visibilidad, imagen de la biblioteca, link y otras propiedades
 * del texto (`propiedades`: la fecha de publicación original, «Ir directo al link»…).
 */
import {
	applyFrontmatterChanges,
	formatPostDate,
	joinMarkdown,
	todayInArgentina
} from '$lib/utils/eventDraft.js';
import { contentProblems, readContentForm } from '$lib/utils/contentPosts.js';
import { activeRoles, personasFileErrors } from '$lib/server/personas/index.js';
import {
	COMMON_BLOCKED,
	COMMON_FIELDS,
	PostChangeError,
	imageField,
	normalizeCommonInputs,
	planCommonChanges,
	postState
} from './editarPost.js';
import { failMessage, isFail, runPanelAction } from './objetos.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./editarPost.js').PostState} PostState */

/** Las claves de `cambios` de un material. */
export const MATERIAL_FIELDS = COMMON_FIELDS;

/** Lo que hay ahora de un material, o `null`. @param {ToolContext} ctx @param {string} slug */
export const materialState = (ctx, slug) => postState(ctx, 'material', slug);

/** La versión de lo que hay. @param {PostState} s */
export const materialBase = (s) => `${s.object.version}:${s.sha}`;

/**
 * Las entradas normalizadas. Tira {@link PostChangeError}.
 * @param {ToolContext} ctx
 * @param {unknown} raw
 */
export async function normalizeMaterialInputs(ctx, raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new PostChangeError(
			`\`cambios\` es un objeto con alguno de: ${MATERIAL_FIELDS.join(', ')}.`
		);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !MATERIAL_FIELDS.includes(k));
	if (unknown.length)
		throw new PostChangeError(
			`No se puede cambiar ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')} en un material. ` +
				`Lo que sí: ${MATERIAL_FIELDS.join(', ')}.`
		);
	const out = await normalizeCommonInputs(ctx, input, COMMON_BLOCKED);
	if (!Object.keys(out).length) throw new PostChangeError('No hay nada para cambiar.');
	return out;
}

/**
 * El texto nuevo y el antes y después, validado con las reglas del formulario del panel.
 * @param {ToolContext} ctx
 * @param {PostState} state
 * @param {Record<string, any>} inputs
 * @param {{ today?: string }} [opts]
 */
export async function planMaterialChange(ctx, state, inputs, { today = todayInArgentina() } = {}) {
	const common = await planCommonChanges(ctx, state, inputs);
	if (!common.changes.length)
		throw new PostChangeError('Eso ya está así: no hay nada para cambiar.');
	let content;
	try {
		content = joinMarkdown(
			applyFrontmatterChanges(state.frontmatter, {
				updated_date: formatPostDate(today),
				...common.fm
			}),
			common.body
		);
	} catch (e) {
		throw new PostChangeError(`No se pudo armar el cambio: ${/** @type {Error} */ (e).message}`);
	}
	await checkMaterialContent(ctx, state, content);
	return { content, image: common.image, changes: common.changes, warnings: [] };
}

/**
 * Las reglas del formulario del panel sobre el texto nuevo (`contentProblems` y las personas).
 * @param {ToolContext} ctx
 * @param {PostState | null} state `null` si es nuevo
 * @param {string} content
 */
export async function checkMaterialContent(ctx, state, content) {
	let problems;
	try {
		problems = contentProblems('material', readContentForm('material', content));
	} catch (e) {
		throw new PostChangeError(/** @type {Error} */ (e).message);
	}
	if (problems.length) throw new PostChangeError(problems.join(' '));
	const roles = await activeRoles(ctx.platform).catch(() => null);
	if (roles) {
		const was = state ? personasFileErrors(state.raw, roles) : [];
		const now = personasFileErrors(content, roles).filter((e) => !was.includes(e));
		if (now.length) throw new PostChangeError(now.join(' '));
	}
}

/**
 * El «Guardar» del editor de material del panel (editar o crear).
 *
 * @param {ToolContext} ctx
 * @param {{ slug: string, content: string, sha: string, image?: number | null, isNew?: boolean }} change
 * @returns {Promise<{ ok: true, warnings: string[] } | { ok: false, message: string, conflict: boolean }>}
 */
export async function savePanelMaterial(ctx, { slug, content, sha, image, isNew = false }) {
	const { actions } =
		await import('../../../routes/(authed)/admin/contenido/material/[slug]/+page.server.js');
	const form = new FormData();
	form.set('mode', isNew ? 'nuevo' : 'editar');
	form.set('slug', slug);
	form.set('content', content);
	form.set('sha', sha);
	form.set('eol', 'lf');
	form.set('imageId', imageField(image));
	const r = /** @type {any} */ (
		await runPanelAction(ctx, /** @type {any} */ (actions).guardar, {
			path: `/admin/contenido/material/${encodeURIComponent(isNew ? 'nuevo' : slug)}?/guardar`,
			params: isNew ? {} : { slug },
			form
		})
	);
	if (r && (r.saved || r.redirected)) return { ok: true, warnings: [] };
	return { ok: false, message: failMessage(r), conflict: isFail(r) && r.status === 409 };
}

/**
 * Cambios de un perfil o un lugar del conector de Claude (docs/conector-claude.md, «Cambios»): lo
 * que el panel edita en Comunidad → Perfiles (y Eventos → Lugares, que son perfiles de tipo
 * lugar), por el mismo «Guardar» (`saveProfileAction`: sus validaciones, el control de versión, el
 * historial y Actividad). Crear uno (oculto, como borrador): «Nuevo perfil» (`createProfileAction`).
 *
 * Los campos tienen nombres en castellano ({@link PROFILE_FIELDS}) y se pasan a los del formulario
 * del panel (`readProfileForm`).
 */
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { VENUE_PRIVACY } from '$lib/server/objects/types/perfil.js';
import { emptyFormValues, formToData, profileFormValues } from '$lib/server/amigues/editor.js';
import { imageOf } from '$lib/server/media/library.js';
import { ToolInputError } from './tools.js';
import {
	adminViewer,
	failMessage,
	imageTitle,
	oneLine,
	resolveImage,
	runPanelAction,
	textList,
	valueText
} from './objetos.js';
import { normalizeBody } from './editarPost.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {ReturnType<typeof profileFormValues>} ProfileFormValues */

/** Los campos de texto: nombre en `cambios` → campo del formulario, y cómo se muestra. */
const TEXT_FIELDS = /** @type {const} */ ([
	['bio', 'bio', 'bio'],
	['descripcion', 'body', 'descripción'],
	['pronombres', 'pronouns', 'pronombres'],
	['link_de_pronombres', 'pronouns_url', 'link de los pronombres'],
	['texto_del_link', 'link_text', 'texto del link'],
	['email', 'email', 'mail'],
	['telefono', 'tel', 'teléfono'],
	['cumpleanos', 'bday', 'cumpleaños'],
	['identidad_de_genero', 'gender_identity', 'género'],
	['que_hace', 'job_title', 'qué hace'],
	['direccion', 'address', 'dirección'],
	['barrio', 'area', 'barrio'],
	['ciudad', 'city', 'ciudad'],
	['accesibilidad', 'accessibility', 'accesibilidad'],
	['como_llegar', 'how_to_get_there', 'cómo llegar']
]);

/** Las listas: nombre en `cambios` → campo del formulario. */
const LIST_FIELDS = /** @type {const} */ ([
	['links', 'links', 'links'],
	['etiquetas', 'tags', 'etiquetas'],
	['autores', 'authors', 'autores']
]);

/** Las claves de `cambios` de un perfil o un lugar. */
export const PROFILE_FIELDS = Object.freeze([
	'titulo',
	'tipo_de_perfil',
	'visibilidad',
	'quien_lo_ve',
	...TEXT_FIELDS.map(([k]) => k),
	...LIST_FIELDS.map(([k]) => k),
	'no_indexar',
	'mostrar_miembres',
	'latitud',
	'longitud',
	'privacidad',
	'imagen'
]);

const KINDS = Object.freeze(['persona', 'proyecto', 'lugar']);
const WHO = /** @type {Record<string, string>} */ ({
	publico: 'public',
	miembres: 'members',
	oculto: 'hidden'
});
const WHO_TEXT = /** @type {Record<string, string>} */ ({
	public: 'todes',
	members: 'les miembres',
	hidden: 'nadie (oculto)'
});

/**
 * @typedef {{ object: StoredObject, slug: string, values: ProfileFormValues, imageId: number | null }} ProfileState
 */

/**
 * Lo que hay ahora de un perfil (el objeto, los valores del formulario y la imagen).
 * @param {ToolContext} ctx
 * @param {StoredObject} object
 * @param {string} slug
 * @returns {Promise<ProfileState>}
 */
export async function profileState(ctx, object, slug) {
	const image = await imageOf(ctx.db, object.id, 'avatar', adminViewer(ctx)).catch(() => null);
	return {
		object,
		slug,
		values: profileFormValues(object),
		imageId: image ? Number(image.id) : null
	};
}

/** La versión de lo que hay. @param {ProfileState} s */
export const profileBase = (s) => String(s.object.version);

/**
 * Las entradas normalizadas. Tira {@link ToolInputError}.
 * @param {ToolContext} ctx
 * @param {unknown} raw
 * @param {{ lugar?: boolean }} [opts] `lugar`: es un lugar (no cambia de tipo)
 */
export async function normalizeProfileInputs(ctx, raw, { lugar = false } = {}) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError(
			`\`cambios\` es un objeto con alguno de: ${PROFILE_FIELDS.join(', ')}.`
		);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !PROFILE_FIELDS.includes(k));
	if (unknown.length)
		throw new ToolInputError(
			`No se puede cambiar ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')} en un perfil. ` +
				`Lo que sí: ${PROFILE_FIELDS.join(', ')}.`
		);
	/** @type {Record<string, unknown>} */
	const out = {};
	if (input.titulo !== undefined) {
		const t = oneLine(input.titulo, 201);
		if (!t || t.length > 200) throw new ToolInputError('El nombre va de 1 a 200 caracteres.');
		out.titulo = t;
	}
	if (input.tipo_de_perfil !== undefined) {
		if (lugar)
			throw new ToolInputError('Un lugar sigue siendo un lugar: el tipo se cambia desde el panel.');
		if (typeof input.tipo_de_perfil !== 'string' || !KINDS.includes(input.tipo_de_perfil))
			throw new ToolInputError(`\`tipo_de_perfil\` es uno de: ${KINDS.join(', ')}.`);
		out.tipo_de_perfil = input.tipo_de_perfil;
	}
	if (input.visibilidad !== undefined) {
		if (input.visibilidad !== 'listado' && input.visibilidad !== 'no_listado')
			throw new ToolInputError('`visibilidad` es `listado` o `no_listado`.');
		out.visibilidad = input.visibilidad;
	}
	if (input.quien_lo_ve !== undefined) {
		if (typeof input.quien_lo_ve !== 'string' || !Object.hasOwn(WHO, input.quien_lo_ve))
			throw new ToolInputError(`\`quien_lo_ve\` es uno de: ${Object.keys(WHO).join(', ')}.`);
		out.quien_lo_ve = input.quien_lo_ve;
	}
	for (const [k] of TEXT_FIELDS) {
		if (input[k] === undefined) continue;
		const v =
			k === 'descripcion' || k === 'bio' ? normalizeBody(input[k]) : oneLine(input[k], 2000);
		if (v === null) throw new ToolInputError(`\`${k}\` es demasiado largo.`);
		out[k] = v;
	}
	for (const [k] of LIST_FIELDS) {
		if (input[k] !== undefined) out[k] = textList(input[k], k);
	}
	for (const k of ['no_indexar', 'mostrar_miembres']) {
		if (input[k] === undefined) continue;
		if (typeof input[k] !== 'boolean') throw new ToolInputError(`\`${k}\` es true o false.`);
		out[k] = input[k];
	}
	for (const k of ['latitud', 'longitud']) {
		if (input[k] === undefined) continue;
		if (input[k] !== null && (typeof input[k] !== 'number' || !Number.isFinite(input[k])))
			throw new ToolInputError(`\`${k}\` es un número (o null para sacarla).`);
		out[k] = input[k] === null ? '' : String(input[k]);
	}
	if (input.privacidad !== undefined) {
		if (
			input.privacidad !== '' &&
			!(/** @type {readonly unknown[]} */ (VENUE_PRIVACY).includes(input.privacidad))
		)
			throw new ToolInputError(`\`privacidad\` es una de: ${VENUE_PRIVACY.join(', ')}.`);
		out.privacidad = input.privacidad;
	}
	if (input.imagen !== undefined) out.imagen = (await resolveImage(ctx, input.imagen)).id;
	if (!Object.keys(out).length) throw new ToolInputError('No hay nada para cambiar.');
	return out;
}

/**
 * Los valores del formulario con las entradas aplicadas.
 * @param {ProfileFormValues} base
 * @param {Record<string, any>} inputs
 * @returns {ProfileFormValues}
 */
export function applyProfileInputs(base, inputs) {
	const v = structuredClone(base);
	if (inputs.titulo !== undefined) v.title = inputs.titulo;
	if (inputs.tipo_de_perfil !== undefined) v.kind = inputs.tipo_de_perfil;
	if (inputs.visibilidad !== undefined) v.unlisted = inputs.visibilidad === 'no_listado';
	if (inputs.quien_lo_ve !== undefined) v.visibility = WHO[inputs.quien_lo_ve];
	for (const [k, f] of TEXT_FIELDS) if (inputs[k] !== undefined) v.text[f] = inputs[k];
	for (const [k, f] of LIST_FIELDS) if (inputs[k] !== undefined) v.lists[f] = inputs[k].join('\n');
	if (inputs.no_indexar !== undefined) v.noindex = inputs.no_indexar;
	if (inputs.mostrar_miembres !== undefined) v.show_members = inputs.mostrar_miembres;
	if (inputs.latitud !== undefined) v.lat = inputs.latitud;
	if (inputs.longitud !== undefined) v.lng = inputs.longitud;
	if (inputs.privacidad !== undefined) v.venue_privacy = inputs.privacidad;
	return v;
}

/**
 * El antes y después entre dos versiones del formulario (y la imagen).
 * @param {ToolContext} ctx
 * @param {ProfileFormValues} a
 * @param {ProfileFormValues} b
 * @param {{ before: number | null, after: number | null | undefined }} image
 */
export async function profileChanges(ctx, a, b, image) {
	/** @type {Array<{ campo: string, antes: string, despues: string }>} */
	const out = [];
	/** @param {string} campo @param {unknown} x @param {unknown} y */
	const add = (campo, x, y) => {
		if (JSON.stringify(x) !== JSON.stringify(y))
			out.push({ campo, antes: valueText(x), despues: valueText(y) });
	};
	add('nombre', a.title, b.title);
	add('tipo de perfil', a.kind, b.kind);
	add(
		'quién lo ve',
		WHO_TEXT[a.visibility] ?? a.visibility,
		WHO_TEXT[b.visibility] ?? b.visibility
	);
	add('visibilidad', a.unlisted ? 'no listado' : 'listado', b.unlisted ? 'no listado' : 'listado');
	for (const [, f, label] of TEXT_FIELDS) add(label, a.text[f] ?? '', b.text[f] ?? '');
	for (const [, f, label] of LIST_FIELDS)
		add(
			label,
			(a.lists[f] ?? '').split('\n').filter(Boolean),
			(b.lists[f] ?? '').split('\n').filter(Boolean)
		);
	add('no aparecer en buscadores', a.noindex ? 'sí' : 'no', b.noindex ? 'sí' : 'no');
	add('mostrar miembres', a.show_members ? 'sí' : 'no', b.show_members ? 'sí' : 'no');
	add('latitud', a.lat, b.lat);
	add('longitud', a.lng, b.lng);
	add('privacidad del lugar', a.venue_privacy, b.venue_privacy);
	if (image.after !== undefined && image.after !== image.before) {
		out.push({
			campo: 'imagen',
			antes: await imageTitle(ctx, image.before),
			despues: await imageTitle(ctx, image.after)
		});
	}
	return out;
}

/**
 * Valida los valores con las reglas del tipo (lo mismo que hace el guardado). Tira.
 * @param {ProfileFormValues} values
 * @param {Record<string, unknown>} [current]
 */
export function checkProfileValues(values, current = {}) {
	if (!values.title.trim()) throw new ToolInputError('El perfil tiene que tener nombre.');
	const def = /** @type {any} */ (coreTypes.get('perfil'));
	const r = validateData(def, formToData(values, current));
	if (!r.ok)
		throw new ToolInputError(`Revisá los datos: ${r.errors.map((e) => e.message).join('; ')}`);
}

/** El formulario del panel con esos valores. @param {ProfileFormValues} v @param {number | null | undefined} image */
function profileForm(v, image) {
	const form = new FormData();
	form.set('title', v.title);
	form.set('kind', v.kind);
	form.set('visibility', v.visibility);
	form.set('version', String(v.version));
	for (const [k, val] of Object.entries(v.text)) form.set(k, val ?? '');
	for (const [k, val] of Object.entries(v.lists)) form.set(k, val ?? '');
	if (v.unlisted) form.set('unlisted', 'on');
	if (v.noindex) form.set('noindex', 'on');
	if (v.show_members) form.set('show_members', 'on');
	form.set('lat', v.lat ?? '');
	form.set('lng', v.lng ?? '');
	form.set('venue_privacy', v.venue_privacy ?? '');
	form.set('imageId', image === undefined ? '' : image === null ? 'none' : String(image));
	return form;
}

/**
 * El «Guardar» del editor de perfiles del panel.
 * @param {ToolContext} ctx
 * @param {{ slug: string, values: ProfileFormValues, image?: number | null }} change
 * @returns {Promise<{ ok: true, warnings: string[] } | { ok: false, message: string, conflict: boolean }>}
 */
export async function savePanelProfile(ctx, { slug, values, image }) {
	const { actions } =
		await import('../../../routes/(authed)/admin/comunidad/perfiles/[slug]/+page.server.js');
	const r = /** @type {any} */ (
		await runPanelAction(ctx, actions.guardarPerfil, {
			path: `/admin/comunidad/perfiles/${encodeURIComponent(slug)}?/guardarPerfil`,
			params: { slug },
			form: profileForm(values, image)
		})
	);
	if (r?.perfil?.ok) return { ok: true, warnings: [] };
	return {
		ok: false,
		message: failMessage(r, 'perfil'),
		conflict: Boolean(r?.data?.perfil?.conflict) || r?.status === 409
	};
}

/**
 * «Nuevo perfil» del panel (Comunidad → Perfiles → Nuevo): lo crea y devuelve su dirección.
 * @param {ToolContext} ctx
 * @param {ProfileFormValues} values
 * @returns {Promise<{ ok: true, slug: string } | { ok: false, message: string }>}
 */
export async function createPanelProfile(ctx, values) {
	const { actions } =
		await import('../../../routes/(authed)/admin/comunidad/perfiles/nuevo/+page.server.js');
	const r = /** @type {any} */ (
		await runPanelAction(ctx, actions.crearPerfil, {
			path: '/admin/comunidad/perfiles/nuevo?/crearPerfil',
			params: {},
			form: profileForm(values, undefined)
		})
	);
	if (r?.redirected) {
		const m = /\/admin\/comunidad\/perfiles\/([^/?#]+)/.exec(r.redirected);
		return { ok: true, slug: m ? decodeURIComponent(m[1]) : '' };
	}
	return { ok: false, message: failMessage(r, 'perfil') };
}

export { emptyFormValues };

/**
 * Lo común a los cambios del conector de Claude sobre objetos (docs/conector-claude.md, «Cambios»):
 * qué tipos se pueden editar, cómo se encuentra un objeto por su nombre o su dirección, cómo se
 * llama a una acción del panel con un pedido armado como el del formulario, y cómo se leen las
 * entradas que se repiten entre tipos (la imagen, las etiquetas, las personas, las propiedades).
 *
 * Nada de esto guarda: guarda la acción del panel que corresponde (./editarEvento.js,
 * ./editarMaterial.js, ./editarPerfil.js, ./editarEtiqueta.js, ./borradores.js, ./deshacer.js).
 */
import { findDbPostObject } from '$lib/server/contenido/repo.js';
import { getObject, searchObjects } from '$lib/server/objects/read.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { findImage, searchImages, slugOfKey } from '$lib/server/media/library.js';
import { foldText } from '$lib/utils/text.js';
import { ToolInputError, resolveEvent } from './tools.js';

/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('./tools.js').ToolContext} ToolContext */

/**
 * Los tipos que se editan con `editar_objeto` y se deshacen con `deshacer`. `lugar` es un perfil
 * de tipo lugar (Eventos → Lugares); `kinkipedia`, la entrada de la wiki de una etiqueta.
 */
export const EDIT_TYPES = Object.freeze([
	'evento',
	'material',
	'perfil',
	'lugar',
	'etiqueta',
	'kinkipedia'
]);

/** Cómo se nombra cada tipo en los mensajes. */
export const TYPE_TEXT = /** @type {Record<string, string>} */ ({
	evento: 'el evento',
	material: 'el material',
	perfil: 'el perfil',
	lugar: 'el lugar',
	etiqueta: 'la etiqueta',
	kinkipedia: 'la entrada de la Kinkipedia de'
});

/** El `targetType` de Actividad de cada tipo. */
export const LOG_TYPE = /** @type {Record<string, string>} */ ({
	evento: 'event',
	material: 'post',
	perfil: 'profile',
	lugar: 'profile',
	etiqueta: 'tag',
	kinkipedia: 'tag'
});

/** El tipo de objeto de la base de cada tipo del conector. */
export const OBJECT_TYPE_OF = /** @type {Record<string, string>} */ ({
	evento: 'evento',
	material: 'material',
	perfil: 'perfil',
	lugar: 'perfil',
	etiqueta: 'etiqueta',
	kinkipedia: 'etiqueta'
});

/** El viewer de les admins (ven lo oculto). @param {ToolContext} ctx */
export const adminViewer = (ctx) =>
	/** @type {import('$lib/server/objects/visibility.js').Viewer} */ ({
		role: 'admin',
		id: ctx.user.login
	});

/** Texto en una línea, sin caracteres de control. @param {unknown} v @param {number} max */
export function oneLine(v, max) {
	return typeof v === 'string'
		? v
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, max)
		: '';
}

/** El `tipo` de un pedido, o un error claro. @param {unknown} raw */
export function editType(raw) {
	const t = typeof raw === 'string' ? raw.trim() : '';
	if (!EDIT_TYPES.includes(t))
		throw new ToolInputError(`\`tipo\` es uno de: ${EDIT_TYPES.join(', ')}.`);
	return t;
}

/**
 * Un objeto que se puede editar, por su dirección o su nombre. Tira {@link ToolInputError} con las
 * opciones si hay varios (o ninguno).
 *
 * @param {ToolContext} ctx
 * @param {string} tipo uno de {@link EDIT_TYPES}
 * @param {string} query
 * @returns {Promise<{ object: StoredObject, slug: string }>} `slug`: la dirección con la que lo
 *   abre el panel (la vieja de un .md importado, si tiene)
 */
export async function findTarget(ctx, tipo, query) {
	const q = oneLine(query, 200);
	if (!q) throw new ToolInputError('Falta `objeto` (la dirección o el nombre).');
	const viewer = adminViewer(ctx);
	if (tipo === 'evento' || tipo === 'material') {
		let slug = q;
		if (tipo === 'evento') {
			const r = await resolveEvent(q);
			if (!r.event)
				throw notFound(
					tipo,
					q,
					(r.options ?? []).map((o) => [o.titulo, o.slug])
				);
			slug = r.event.slug;
		} else {
			const direct = await findDbPostObject(ctx.db, 'material', q);
			if (!direct || direct.deleted) {
				const found = await pick(ctx, 'material', q);
				slug = found.slug;
			}
		}
		const post = await findDbPostObject(
			ctx.db,
			tipo === 'evento' ? 'calendario' : 'material',
			slug
		);
		if (!post || post.deleted) throw new ToolInputError(`${cap(TYPE_TEXT[tipo])} «${q}» no está.`);
		return { object: post.object, slug: post.urlSlug };
	}
	const type = OBJECT_TYPE_OF[tipo];
	const direct = await getObject(ctx.db, { type, slug: q }, viewer);
	const keep = (/** @type {StoredObject} */ o) =>
		tipo === 'lugar' ? profileKindOf(o.data) === 'lugar' : true;
	if (direct && keep(direct)) return { object: direct, slug: direct.slug };
	const o = await pick(ctx, type, q, keep);
	return { object: o, slug: o.slug };
}

/** Cómo se dice «ninguno» de cada tipo. */
const NONE_TEXT = /** @type {Record<string, string>} */ ({
	evento: 'ningún evento',
	material: 'ningún material',
	perfil: 'ningún perfil',
	lugar: 'ningún lugar',
	etiqueta: 'ninguna etiqueta',
	kinkipedia: 'ninguna etiqueta'
});

/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {string} tipo
 * @param {string} q
 * @param {Array<[string, string]>} options título y dirección
 */
function notFound(tipo, q, options) {
	return new ToolInputError(
		options.length
			? `Hay varios que coinciden con «${q}»: ${options
					.slice(0, 10)
					.map(([t, s]) => `${t} (${s})`)
					.join(', ')}. Volvé a pedir con la dirección (slug).`
			: `No encontré ${NONE_TEXT[tipo] ?? 'nada'} «${q}».`
	);
}

/**
 * Busca entre los objetos de un tipo: uno solo, o el error con las opciones.
 * @param {ToolContext} ctx
 * @param {string} type tipo de la base
 * @param {string} q
 * @param {(o: StoredObject) => boolean} [keep]
 */
async function pick(ctx, type, q, keep = () => true) {
	const found = (await searchObjects(ctx.db, q, adminViewer(ctx), { type, limit: 20 })).filter(
		(o) => o.type === type && keep(o)
	);
	const f = foldText(q);
	const exact = found.filter(
		(o) =>
			foldText(o.title) === f || (typeof o.data?.key === 'string' && foldText(o.data.key) === f)
	);
	if (exact.length === 1) return exact[0];
	if (found.length === 1) return found[0];
	throw notFound(
		type,
		q,
		(exact.length ? exact : found).map((o) => [o.title, o.slug])
	);
}

/**
 * Llama a una acción del panel con un pedido armado como el del formulario, a nombre de le admin
 * de la conexión (sin cookies: `locals` ya trae a le admin verificade, como hooks.server.js).
 *
 * @param {ToolContext} ctx
 * @param {(event: any) => any} action
 * @param {{ path: string, params: Record<string, string>, form: FormData }} req
 */
export async function runPanelAction(ctx, action, { path, params, form }) {
	const url = new URL(`${ctx.origin}${path}`);
	const event = {
		params,
		locals: {
			user: { id: ctx.user.id, login: ctx.user.login, name: null },
			user_token: 'conector-claude'
		},
		request: new Request(url, { method: 'POST', body: form }),
		url,
		platform: ctx.platform,
		fetch: ctx.fetch,
		setHeaders: () => {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	try {
		return await action(event);
	} catch (e) {
		// Un alta del panel termina con una redirección a lo nuevo: eso es que salió bien.
		if (e && typeof e === 'object' && 'status' in e && 'location' in e) {
			return { redirected: String(/** @type {any} */ (e).location) };
		}
		throw e;
	}
}

/** El mensaje de error de lo que contestó una acción del panel (un `fail`). @param {any} r @param {string} [key] */
export function failMessage(r, key) {
	const data = r?.data;
	const inner = key ? data?.[key] : null;
	return (
		(typeof inner?.message === 'string' && inner.message) ||
		(typeof data?.error === 'string' && data.error) ||
		'No se pudo guardar.'
	);
}

/** ¿La acción contestó con un `fail`? @param {any} r */
export const isFail = (r) =>
	Boolean(r && typeof r === 'object' && typeof r.status === 'number' && 'data' in r);

/**
 * La imagen de la biblioteca que se pide (`imagen`): '' la saca; si no, se busca por su dirección o
 * su nombre (una sola). `{ id: null }` = sacarla.
 *
 * @param {ToolContext} ctx
 * @param {unknown} raw
 * @returns {Promise<{ id: number | null, title: string }>}
 */
export async function resolveImage(ctx, raw) {
	const q = oneLine(raw, 200);
	if (!q) return { id: null, title: 'sin imagen' };
	const viewer = adminViewer(ctx);
	const bySlug = await getObject(ctx.db, { type: 'imagen', slug: q }, viewer);
	if (bySlug) return { id: bySlug.id, title: bySlug.title };
	const found = await searchImages(ctx.db, { q, viewer, limit: 10 });
	const f = foldText(q);
	const exact = found.filter((i) => foldText(String(i.title ?? '')) === f);
	const one = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
	if (one) return { id: Number(one.id), title: String(one.title ?? one.id) };
	throw new ToolInputError(
		found.length
			? `Hay varias imágenes que coinciden con «${q}»: ${found
					.slice(0, 8)
					.map((i) => `${i.title} (${slugOfKey(i.key) ?? i.id})`)
					.join(', ')}. Volvé a pedir con la dirección (slug) de la imagen.`
			: `No encontré ninguna imagen «${q}» en la biblioteca. Las imágenes se suben desde el panel (Contenido → Biblioteca).`
	);
}

/** El nombre de una imagen de la biblioteca (para el antes y después). @param {ToolContext} ctx @param {number | null | undefined} id */
export async function imageTitle(ctx, id) {
	if (!id) return 'sin imagen';
	const img = await findImage(ctx.db, id, adminViewer(ctx)).catch(() => null);
	return img ? String(img.title ?? `imagen ${id}`) : `imagen ${id}`;
}

/**
 * Una lista de textos (etiquetas, autores, links): cada uno en una línea, sin repetir, sin vacíos.
 * @param {unknown} raw
 * @param {string} what para el mensaje
 * @param {number} [max]
 */
export function textList(raw, what, max = 60) {
	if (!Array.isArray(raw)) throw new ToolInputError(`\`${what}\` es una lista de textos.`);
	/** @type {string[]} */
	const out = [];
	for (const item of raw) {
		const t = oneLine(item, 300);
		if (t && !out.includes(t)) out.push(t);
	}
	if (out.length > max) throw new ToolInputError(`\`${what}\` puede tener hasta ${max}.`);
	return out;
}

/**
 * `personas`: `[{ nombre, rol }]`, donde `nombre` es la dirección de un perfil (va como perfil) o un
 * nombre libre. Ordenada como vino.
 *
 * @param {ToolContext} ctx
 * @param {unknown} raw
 * @returns {Promise<Array<{ profile?: string, name?: string, role: string }>>}
 */
export async function personasInput(ctx, raw) {
	if (!Array.isArray(raw) || raw.length > 60) {
		throw new ToolInputError(
			'`personas` es una lista de `{ nombre, rol }` (la dirección de un perfil o un nombre, y el rol).'
		);
	}
	const out = [];
	for (const item of raw) {
		const nombre = oneLine(/** @type {any} */ (item)?.nombre, 300);
		const rol = oneLine(/** @type {any} */ (item)?.rol, 60);
		if (!nombre || !rol)
			throw new ToolInputError('Cada persona lleva `nombre` (o la dirección del perfil) y `rol`.');
		const profile = await getObject(
			ctx.db,
			{ type: 'perfil', slug: nombre },
			adminViewer(ctx)
		).catch(() => null);
		out.push(profile ? { profile: profile.slug, role: rol } : { name: nombre, role: rol });
	}
	return out;
}

/** Cómo se muestra una lista de personas. @param {Array<{ profile?: string, name?: string, role: string }>} items */
export const personasText = (items) =>
	items.length
		? items.map((p) => `${p.profile ? `@${p.profile}` : p.name} (${p.role})`).join(', ')
		: 'nadie';

/**
 * Cómo se muestra un valor cualquiera en el antes y después.
 * @param {unknown} v
 * @returns {string}
 */
export function valueText(v) {
	if (v === undefined || v === null || v === '') return '(vacío)';
	if (Array.isArray(v)) return v.length ? v.map((x) => valueText(x)).join(', ') : '(vacío)';
	if (typeof v === 'object') return JSON.stringify(v);
	const one = String(v).replace(/\s+/g, ' ').trim();
	return one.length > 160 ? `${one.slice(0, 160)}… (${String(v).length} caracteres)` : one;
}

/**
 * `propiedades`: otras propiedades del texto del evento o del material (`{ clave: valor }`, `null`
 * la saca), las que el editor del panel guarda en el texto. Las que tienen un campo propio en
 * `cambios` (o que no se cambian desde acá) se rechazan.
 *
 * @param {unknown} raw
 * @param {readonly string[]} blocked
 * @returns {Record<string, unknown>}
 */
export function propertiesInput(raw, blocked) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError('`propiedades` es un objeto `{ clave: valor }` (`null` la saca).');
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const [k, v] of Object.entries(raw)) {
		if (!/^[a-z][a-z0-9_]{0,40}$/.test(k))
			throw new ToolInputError(`«${k.slice(0, 40)}» no es una propiedad válida.`);
		if (blocked.includes(k))
			throw new ToolInputError(
				`«${k}» no va en \`propiedades\`: usá su campo de \`cambios\` (o cambialo desde el panel).`
			);
		const ok =
			v === null ||
			typeof v === 'string' ||
			typeof v === 'number' ||
			typeof v === 'boolean' ||
			(Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number'));
		if (!ok)
			throw new ToolInputError(
				`El valor de «${k}» va como texto, número, sí/no, una lista de textos o \`null\`.`
			);
		out[k] = typeof v === 'string' ? v.slice(0, 2000) : v;
	}
	if (!Object.keys(out).length) throw new ToolInputError('`propiedades` está vacío.');
	return out;
}

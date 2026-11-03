/**
 * El historial y el deshacer del conector de Claude (docs/conector-claude.md, «Deshacer»).
 *
 * - **`historial`** (lectura): las últimas versiones de un objeto (`object_revisions`), con cuándo,
 *   quién («Claude, confirmado por …» si fue el conector) y qué campos cambiaron (los nombres, no
 *   los valores). Ningún objeto del historial tiene datos de compradores.
 * - **`deshacer`** (con `vista_previa` y `aplicar`): vuelve un objeto a una versión anterior, por
 *   el mismo guardado del panel que una edición (./editarEvento.js, ./editarMaterial.js,
 *   ./editarPerfil.js, ./editarEtiqueta.js): con su validación, el control de que nadie guardó en
 *   el medio, el historial y lo que sigue a un guardado. Lo que se guarda es una versión nueva (de
 *   Claude, con «confirmado por»), así que un deshacer también se deshace.
 *
 * Sin `a_version`, vuelve a la versión de antes del último guardado. Un guardado del panel puede
 * dejar dos versiones seguidas (el texto del evento y después su lugar): la segunda, con los mismos
 * datos, de la misma persona y con menos de {@link SAME_SAVE_MS} de diferencia, cuenta como parte
 * del mismo guardado.
 *
 * Las relaciones (etiquetas, personas con perfil, imagen, lugar) vuelven solo si esa versión las
 * tiene guardadas (desde la migración 0073); si no, quedan como están y la vista previa lo avisa.
 */
import {
	listRevisions,
	getRevision,
	revisionAuthorLabel
} from '$lib/server/contenido/revisions.js';
import { contentEdgesOf, withContentEdges } from '$lib/server/contenido/relaciones.js';
import { postToMarkdown } from '$lib/server/contenido/markdown.js';
import { coreTypes } from '$lib/server/objects/types/index.js';
import { splitMarkdown } from '$lib/utils/eventDraft.js';
import { tagSlug } from '$lib/utils/tagSlug.js';
import { argFormat } from '$lib/utils/dates.js';
import { parseDocument } from 'yaml';
import { ToolInputError } from './tools.js';
import {
	EDIT_TYPES,
	LOG_TYPE,
	OBJECT_TYPE_OF,
	TYPE_TEXT,
	editType,
	findTarget,
	imageTitle,
	oneLine,
	valueText
} from './objetos.js';
import { PostChangeError, short } from './editarPost.js';
import { checkEventContent, eventBase, eventState, savePanelEvent } from './editarEvento.js';
import {
	checkMaterialContent,
	materialBase,
	materialState,
	savePanelMaterial
} from './editarMaterial.js';
import {
	checkProfileValues,
	profileChanges,
	profileState,
	savePanelProfile
} from './editarPerfil.js';
import {
	planTagChange,
	planWikiChange,
	savePanelTag,
	savePanelWiki,
	tagValues,
	wikiValues
} from './editarEtiqueta.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./tools.js').ToolOutput} ToolOutput */
/** @typedef {import('$lib/server/contenido/revisions.js').Revision} Revision */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** Dos versiones seguidas con menos de esto entre sí (y de la misma persona) son un guardado. */
export const SAME_SAVE_MS = 5000;

/** De dónde vino cada versión, en palabras. */
const SOURCE_TEXT = /** @type {Record<string, string>} */ ({
	import: 'importación',
	panel: 'panel',
	agenda: 'agenda',
	deshacer: 'deshacer un borrado',
	lugar: 'lugar del evento',
	partes: 'partes del taller',
	migracion: 'migración',
	demo: 'demo',
	claude: 'conector de Claude'
});

/** Las relaciones que se muestran y se devuelven, con su nombre. */
const EDGE_TEXT = /** @type {Record<string, string>} */ ({
	etiqueta: 'etiquetas',
	persona: 'personas',
	portada: 'imagen',
	avatar: 'imagen',
	lugar: 'lugar',
	relacionada_con: 'relacionadas',
	hijo_de: 'etiqueta madre',
	alias_de: 'alias'
});

/**
 * ¿`newer` es la segunda mitad del guardado de `older`? El «Guardar» del editor de eventos deja
 * dos versiones si cambia el lugar: el texto y, enseguida, el lugar (los mismos datos, otras
 * relaciones). Dos guardados de verdad (aunque sean seguidos, como deshacer algo recién hecho)
 * cambian los datos, así que no cuentan como uno.
 * @param {Revision} newer
 * @param {Revision} older
 */
const sameSave = (newer, older) =>
	newer.savedBy === older.savedBy &&
	Math.abs(newer.savedAt - older.savedAt) <= SAME_SAVE_MS &&
	(newer.source === older.source || (newer.source === 'lugar' && older.source === 'panel')) &&
	newer.title === older.title &&
	newer.visibility === older.visibility &&
	JSON.stringify(newer.data) === JSON.stringify(older.data);

/**
 * La versión a la que vuelve `deshacer` sin `a_version`: la de antes del último guardado.
 * @param {Revision[]} revs de la más nueva a la más vieja
 * @param {number} current la versión actual del objeto
 */
export function undoTarget(revs, current) {
	if (!revs.length) return null;
	// Lo de ahora no quedó en el historial (se guardó sin historial): vuelve a lo último guardado.
	if (revs[0].version !== current) return revs[0];
	let i = 1;
	while (revs[i] && sameSave(revs[i - 1], revs[i])) i++;
	return revs[i] ?? null;
}

/** Los nombres de los campos de un tipo. @param {string} type */
const fieldLabels = (type) =>
	/** @type {Record<string, { label?: string }>} */ (
		/** @type {any} */ (coreTypes.get(type))?.fields ?? {}
	);

/**
 * Qué cambió entre dos versiones (solo los nombres de los campos).
 * @param {string} type tipo de la base
 * @param {Revision} newer
 * @param {Revision | undefined} older
 */
export function revisionDiff(type, newer, older) {
	if (!older) return ['(primera versión en el historial)'];
	const labels = fieldLabels(type);
	/** @type {string[]} */
	const out = [];
	if (newer.title !== older.title) out.push('título');
	if (newer.visibility !== older.visibility) out.push('visibilidad');
	if (newer.deleted !== older.deleted) out.push(newer.deleted ? 'borrado' : 'recuperado');
	const keys = new Set([...Object.keys(newer.data), ...Object.keys(older.data)]);
	for (const k of keys) {
		if (k === 'updated_date' || k === 'body_html' || k === 'wiki_body_html') continue;
		if (JSON.stringify(newer.data[k]) === JSON.stringify(older.data[k])) continue;
		const label = (labels[k]?.label ?? k).toLowerCase();
		if (!out.includes(label)) out.push(label);
	}
	if (newer.edges && older.edges) {
		const kinds = new Set([...newer.edges, ...older.edges].map((e) => e.kind));
		for (const kind of kinds) {
			const pick = (/** @type {Revision} */ r) =>
				JSON.stringify(
					/** @type {NonNullable<Revision['edges']>} */ (r.edges)
						.filter((e) => e.kind === kind)
						.map((e) => [e.to, e.data])
				);
			if (pick(newer) !== pick(older) && EDGE_TEXT[kind] && !out.includes(EDGE_TEXT[kind]))
				out.push(EDGE_TEXT[kind]);
		}
	}
	return out.length ? out : ['(sin cambios en los datos)'];
}

/** La herramienta de lectura `historial`. */
export const HISTORY_TOOL = {
	definition: {
		name: 'historial',
		title: 'Historial de un objeto',
		description:
			'Las últimas versiones de un evento, material, perfil, lugar, etiqueta o entrada de la ' +
			'Kinkipedia: número de versión, cuándo, quién (y si fue Claude, quién lo confirmó) y qué ' +
			'campos cambiaron. Sirve para elegir a qué versión volver con la operación `deshacer` ' +
			'(`a_version`). Marca a cuál vuelve `deshacer` si no se dice.',
		inputSchema: {
			type: 'object',
			properties: {
				tipo: { type: 'string', enum: [...EDIT_TYPES] },
				objeto: { type: 'string', description: 'La dirección (slug) o el nombre.' },
				limite: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
			},
			required: ['tipo', 'objeto'],
			additionalProperties: false
		}
	},
	/**
	 * @param {ToolContext} ctx
	 * @param {Record<string, unknown>} args
	 * @returns {Promise<ToolOutput>}
	 */
	async run(ctx, args) {
		const tipo = editType(args.tipo);
		const { object, slug } = await findTarget(ctx, tipo, oneLine(args.objeto, 200));
		const limite =
			typeof args.limite === 'number' ? Math.min(50, Math.max(1, Math.floor(args.limite))) : 10;
		const revs = await listRevisions(ctx.db, object.id, { limit: Math.min(50, limite + 1) });
		const target = undoTarget(revs, object.version);
		return {
			result: {
				tipo,
				slug,
				titulo: object.title,
				version_actual: object.version,
				versiones: revs.slice(0, limite).map((r, i) => ({
					version: r.version,
					cuando: new Date(r.savedAt).toISOString(),
					quien: revisionAuthorLabel(r, { withAdmin: true }),
					origen: SOURCE_TEXT[r.source] ?? r.source,
					cambios: revisionDiff(object.type, r, revs[i + 1]),
					...(r.version === object.version ? { es_la_actual: true } : {}),
					...(target && r.version === target.version ? { deshacer_vuelve_aca: true } : {}),
					...(r.edges ? {} : { sin_relaciones_guardadas: true })
				})),
				nota: revs.length
					? 'Para volver a una versión: `vista_previa` con `operacion: deshacer`, el tipo, el objeto y `a_version` (sin `a_version`, vuelve a la marcada con `deshacer_vuelve_aca`).'
					: 'No hay versiones en el historial.'
			},
			log: {
				summary: `Claude: miró el historial ${`de ${TYPE_TEXT[tipo]}`.replace(/^de el /, 'del ')} «${object.title}»`,
				targetType: LOG_TYPE[tipo],
				targetId: slug
			}
		};
	}
};

/** Los nombres de las propiedades del texto, para el antes y después de un deshacer. */
const META_TEXT = /** @type {Record<string, string>} */ ({
	title: 'título',
	summary: 'resumen',
	status: 'estado',
	start: 'inicio',
	end: 'fin',
	tags: 'etiquetas',
	authors: 'personas (organizan o autores)',
	personas: 'personas',
	force_unlisted: 'visibilidad (no listado)',
	force_unpublished: 'oculto',
	tickets: 'entradas',
	link: 'link',
	link_text: 'texto del link'
});

/**
 * Propiedades técnicas que el guardado del panel escribe solo: vuelven igual al deshacer, pero no
 * se listan en el antes y después. Cada una dice qué valor tiene (sin la clave, su valor por
 * defecto): si es el mismo de los dos lados, no hay cambio para mostrar. `updated_date` (la fecha
 * de «Actualizado», que cada guardado pone en hoy) no se muestra nunca, como en una edición.
 * @type {Record<string, (v: unknown) => unknown>}
 */
const TECHNICAL = {
	updated_date: () => null,
	// El editor escribe `puerta: true` (lo mismo que no tenerla) en un evento con venta.
	puerta: (v) => v ?? true
};

/** ¿Esa propiedad es igual de los dos lados, o es técnica sin cambio que mostrar? @param {string} k @param {unknown} x @param {unknown} y */
const sameProperty = (k, x, y) =>
	Object.hasOwn(TECHNICAL, k)
		? JSON.stringify(TECHNICAL[k](x)) === JSON.stringify(TECHNICAL[k](y))
		: JSON.stringify(x) === JSON.stringify(y);

/** El antes y después entre dos textos de un post. @param {string} a @param {string} b */
export function textChanges(a, b) {
	const pa = splitMarkdown(a);
	const pb = splitMarkdown(b);
	const ma = parseDocument(pa.frontmatter).toJS() ?? {};
	const mb = parseDocument(pb.frontmatter).toJS() ?? {};
	const out = [];
	for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
		if (sameProperty(k, ma[k], mb[k])) continue;
		out.push({
			campo: META_TEXT[k] ?? `propiedad «${k}»`,
			antes: short(valueText(ma[k])),
			despues: short(valueText(mb[k]))
		});
	}
	if (pa.body.trim() !== pb.body.trim())
		out.push({
			campo: 'descripción',
			antes: short(pa.body.trim()),
			despues: short(pb.body.trim())
		});
	return out;
}

/**
 * El cambio `deshacer`: lo mismo que arma `planChange` de ./edicion.js para una edición.
 *
 * @param {ToolContext} ctx
 * @param {Record<string, unknown>} args
 * @returns {Promise<import('./edicion.js').Plan>}
 */
export async function planUndo(ctx, args) {
	const tipo = editType(args.tipo);
	const { object, slug } = await findTarget(ctx, tipo, oneLine(args.objeto, 200));
	const wanted = args.a_version;
	/** @type {Revision | null} */
	let rev;
	if (wanted !== undefined && wanted !== null) {
		if (typeof wanted !== 'number' || !Number.isSafeInteger(wanted) || wanted < 1)
			throw new ToolInputError('`a_version` es el número de versión que muestra `historial`.');
		if (wanted === object.version)
			throw new ToolInputError(`La versión ${wanted} es la actual: no hay nada que deshacer.`);
		rev = await getRevision(ctx.db, object.id, wanted);
		if (!rev) throw new ToolInputError(`No hay una versión ${wanted} en el historial.`);
	} else {
		rev = undoTarget(await listRevisions(ctx.db, object.id, { limit: 20 }), object.version);
		if (!rev)
			throw new ToolInputError(
				`No hay una versión anterior de ${TYPE_TEXT[tipo]} «${object.title}» en el historial (es la primera). Para sacarlo, borralo desde el panel.`
			);
	}
	if (rev.deleted)
		throw new ToolInputError(
			`En la versión ${rev.version} estaba borrado: borrar se hace desde el panel (y se recupera desde Actividad).`
		);
	const when = argFormat({ dateStyle: 'short', timeStyle: 'short' }).format(rev.savedAt);
	const head = `Volver ${TYPE_TEXT[tipo]} «${object.title}» a la versión ${rev.version} (del ${when}, ${revisionAuthorLabel(rev)}):`;
	/** @type {string[]} */
	const warnings = rev.edges
		? []
		: [
				'Esa versión es de antes de que el historial guardara las relaciones: las etiquetas, las personas con perfil, la imagen y el lugar quedan como están ahora.'
			];
	const common = {
		operation: 'deshacer',
		tipo,
		head,
		inputs: { a_version: rev.version },
		target: `${tipo}:${slug}`,
		targetTitle: object.title,
		targetLog: { targetType: LOG_TYPE[tipo], targetId: slug }
	};
	/** @param {string} kind */
	const edgeTo = (kind) => {
		if (!rev?.edges) return undefined;
		const e = rev.edges.find((x) => x.kind === kind);
		return e ? e.to : null;
	};
	try {
		if (tipo === 'evento' || tipo === 'material') {
			const category = tipo === 'evento' ? 'calendario' : 'material';
			const state =
				tipo === 'evento' ? await eventState(ctx, slug) : await materialState(ctx, slug);
			if (!state) throw new ToolInputError(`${TYPE_TEXT[tipo]} «${slug}» ya no está.`);
			const rows = rev.edges
				? {
						personas: rev.edges
							.filter((e) => e.kind === 'persona')
							.map((e) => ({ slug: e.slug, data: e.data })),
						tags: rev.edges
							.filter((e) => e.kind === 'etiqueta' && e.key)
							.map((e) => ({ key: /** @type {string} */ (e.key), data: e.data }))
					}
				: (await contentEdgesOf(ctx.db, [object.id])).get(object.id);
			const content = postToMarkdown(category, {
				title: rev.title,
				data: withContentEdges(OBJECT_TYPE_OF[tipo], rev.data, rows),
				visibility: /** @type {any} */ (rev.visibility)
			});
			const changes = content === state.raw ? [] : textChanges(state.raw, content);
			const image = edgeTo('portada');
			if (image !== undefined && image !== state.imageId) {
				changes.push({
					campo: 'imagen',
					antes: await imageTitle(ctx, state.imageId),
					despues: await imageTitle(ctx, image)
				});
			}
			/** @type {import('$lib/utils/venueChoice.js').VenueChoice | null} */
			let venue = null;
			if (tipo === 'evento' && rev.edges) {
				const ev = /** @type {import('./editarEvento.js').EventState} */ (state);
				const e = rev.edges.find((x) => x.kind === 'lugar');
				const next = {
					venueId: e ? e.to : null,
					privacy: /** @type {any} */ (e?.data?.privacy ?? null)
				};
				if (
					next.venueId !== ev.venue.venueId ||
					(next.privacy ?? null) !== (ev.venue.privacy ?? null)
				) {
					venue = next;
					const name = (/** @type {number | null} */ id) =>
						id === null
							? 'sin lugar elegido'
							: (ev.venues.find((v) => v.id === id)?.title ?? `lugar ${id}`);
					changes.push({
						campo: 'lugar',
						antes: name(ev.venue.venueId),
						despues: name(next.venueId)
					});
				}
			}
			if (!changes.length)
				throw new ToolInputError(
					`Ya está como en la versión ${rev.version}: no hay nada que deshacer.`
				);
			if (tipo === 'evento')
				await checkEventContent(ctx, slug, /** @type {any} */ (state), content, {
					tagsChanged: false
				});
			else await checkMaterialContent(ctx, state, content);
			const base = tipo === 'evento' ? eventBase(state) : materialBase(state);
			return {
				...common,
				base,
				changes,
				warnings,
				links: linksFor(tipo, slug),
				apply: async (c) => {
					const r =
						tipo === 'evento'
							? await savePanelEvent(c, { slug, content, sha: state.sha, venue, image })
							: await savePanelMaterial(c, { slug, content, sha: state.sha, image });
					if (r.ok) return r;
					const now = tipo === 'evento' ? await eventState(c, slug) : await materialState(c, slug);
					const stale = !now || (tipo === 'evento' ? eventBase(now) : materialBase(now)) !== base;
					return { ok: false, stale, message: r.message };
				}
			};
		}
		if (tipo === 'perfil' || tipo === 'lugar') {
			const state = await profileState(ctx, object, slug);
			const { profileFormValues } = await import('$lib/server/amigues/editor.js');
			const values = {
				...profileFormValues({
					...object,
					title: rev.title,
					data: rev.data,
					visibility: /** @type {any} */ (rev.visibility)
				}),
				version: object.version
			};
			const image = edgeTo('avatar');
			const changes = await profileChanges(ctx, state.values, values, {
				before: state.imageId,
				after: image
			});
			if (!changes.length)
				throw new ToolInputError(
					`Ya está como en la versión ${rev.version}: no hay nada que deshacer.`
				);
			checkProfileValues(values, object.data);
			return {
				...common,
				base: String(object.version),
				changes,
				warnings,
				links: linksFor(tipo, slug),
				apply: async (c) => {
					const r = await savePanelProfile(c, {
						slug,
						values,
						image: image === state.imageId ? undefined : image
					});
					return r.ok ? r : { ok: false, stale: r.conflict, message: r.message };
				}
			};
		}
		if (tipo === 'etiqueta') {
			const { op, changes } = planTagChange(
				object,
				tagValues({ title: rev.title, data: rev.data })
			);
			if (rev.data.key !== object.data.key)
				warnings.push(
					`En esa versión se llamaba «${String(rev.data.key)}»: el nombre no cambia desde acá (renombrar va desde el panel).`
				);
			if (!changes.length)
				throw new ToolInputError(
					`Ya está como en la versión ${rev.version}: no hay nada que deshacer.`
				);
			return {
				...common,
				base: String(object.version),
				changes,
				warnings,
				links: linksFor(tipo, slug),
				apply: async (c) => {
					const r = await savePanelTag(c, op);
					return r.ok ? r : { ok: false, stale: false, message: r.message };
				}
			};
		}
		// kinkipedia
		const before = wikiValues(object);
		const after = wikiValues({ data: rev.data });
		const { changes } = planWikiChange(before, after);
		if (!changes.length)
			throw new ToolInputError(
				`Ya está como en la versión ${rev.version}: no hay nada que deshacer.`
			);
		const remove = !after.title && !after.summary && !after.body;
		if (remove)
			warnings.push(
				'En esa versión la etiqueta no tenía entrada en la Kinkipedia: se saca (la etiqueta queda).'
			);
		const wikiSlug = tagSlug(String(object.data.key ?? ''));
		return {
			...common,
			base: String(object.version),
			changes,
			warnings,
			links: linksFor(tipo, wikiSlug),
			apply: async (c) => {
				const r = await savePanelWiki(c, {
					slug: wikiSlug,
					values: after,
					version: object.version,
					remove
				});
				return r.ok ? r : { ok: false, stale: r.conflict, message: r.message };
			}
		};
	} catch (error) {
		if (error instanceof PostChangeError) throw new ToolInputError(error.message);
		throw error;
	}
}

/**
 * Las direcciones de un objeto en el panel y en el sitio.
 * @param {string} tipo
 * @param {string} slug
 * @returns {Record<string, string>}
 */
export function linksFor(tipo, slug) {
	const s = encodeURIComponent(slug);
	switch (tipo) {
		case 'evento':
			return { panel: `/admin/eventos/${s}/editar`, publico: `/calendario/${slug}` };
		case 'material':
			return { panel: `/admin/contenido/material/${s}`, publico: `/material/${slug}` };
		case 'perfil':
		case 'lugar':
			return { panel: `/admin/comunidad/perfiles/${s}`, publico: `/amigues/${slug}` };
		case 'etiqueta':
			return { panel: '/admin/etiquetas' };
		default:
			return { panel: `/admin/etiquetas/wiki/${s}`, publico: `/wiki/${slug}` };
	}
}

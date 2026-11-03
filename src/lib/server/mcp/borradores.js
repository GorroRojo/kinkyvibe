/**
 * Borradores nuevos del conector de Claude (docs/conector-claude.md, «Borradores»), por las mismas
 * altas del panel, siempre sin publicar:
 *
 * - **evento**: «Borrador» de la Agenda (`crearBorrador`): no listado, `status: anunciado` y la
 *   marca `borrador: true` (lo de «A confirmar»). Con `copia_de`, duplica un evento (como la
 *   agenda). La dirección la elige el panel al guardar. Lo demás (descripción, entradas, lugar…)
 *   se completa después con `editar_objeto`.
 * - **material**: «Nuevo material» de Contenido → Material (`guardar` con `mode: nuevo`), no
 *   listado (`force_unlisted: true`).
 * - **perfil** y **lugar**: «Nuevo perfil» de Comunidad → Perfiles (`crearPerfil`), oculto
 *   (`quien_lo_ve: oculto`) hasta que alguien lo publique.
 *
 * Un borrador nuevo no tiene una versión anterior: no se deshace (se borra desde el panel, y eso se
 * puede recuperar).
 */
import materialTemplate from '$lib/admin/plantillas/material.md?raw';
import { takenContentSlugs } from '$lib/server/admin/contentList.js';
import {
	REMOVE,
	applyFrontmatterChanges,
	formatPostDate,
	joinMarkdown,
	splitMarkdown,
	todayInArgentina
} from '$lib/utils/eventDraft.js';
import {
	freeContentSlug,
	suggestContentSlug,
	validateContentSlug
} from '$lib/utils/contentPosts.js';
import { personasToMd } from '$lib/utils/personasList.js';
import { ToolInputError, resolveEvent } from './tools.js';
import { failMessage, oneLine, personasText, runPanelAction, valueText } from './objetos.js';
import { PostChangeError, bodyOf, normalizeCommonInputs } from './editarPost.js';
import { normalizeDateTime } from './editarEvento.js';
import { checkMaterialContent, savePanelMaterial } from './editarMaterial.js';
import {
	applyProfileInputs,
	checkProfileValues,
	createPanelProfile,
	emptyFormValues,
	normalizeProfileInputs,
	profileChanges
} from './editarPerfil.js';
import { linksFor } from './historial.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */

/** Los tipos de los que se crea un borrador. */
export const DRAFT_TYPES = Object.freeze(['evento', 'material', 'perfil', 'lugar']);

/** Los campos de `cambios` de un borrador de evento. */
const EVENT_DRAFT_FIELDS = Object.freeze(['titulo', 'inicio', 'fin', 'copia_de']);

/** Los campos de `cambios` de un borrador de material. */
const MATERIAL_DRAFT_FIELDS = Object.freeze([
	'titulo',
	'slug',
	'resumen',
	'descripcion',
	'etiquetas',
	'personas',
	'link',
	'texto_del_link',
	'propiedades'
]);

/** @param {unknown} raw @param {readonly string[]} fields */
function inputObject(raw, fields) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError(`\`cambios\` es un objeto con: ${fields.join(', ')}.`);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !fields.includes(k));
	if (unknown.length)
		throw new ToolInputError(
			`En un borrador no va ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')}. Lo que sí: ${fields.join(', ')} (lo demás, después, con \`editar_objeto\`).`
		);
	return input;
}

/**
 * El cambio `crear_borrador`: lo mismo que arma `planChange` de ./edicion.js para una edición.
 *
 * @param {ToolContext} ctx
 * @param {Record<string, unknown>} args
 * @returns {Promise<import('./edicion.js').Plan>}
 */
export async function planDraft(ctx, args) {
	const tipo = typeof args.tipo === 'string' ? args.tipo : '';
	if (!DRAFT_TYPES.includes(tipo))
		throw new ToolInputError(`\`tipo\` de un borrador es uno de: ${DRAFT_TYPES.join(', ')}.`);
	const common = {
		operation: 'crear_borrador',
		tipo,
		base: 'nuevo',
		warnings: /** @type {string[]} */ ([])
	};
	try {
		if (tipo === 'evento') {
			const input = inputObject(args.cambios, EVENT_DRAFT_FIELDS);
			const title = oneLine(input.titulo, 201);
			const source = input.copia_de ? oneLine(input.copia_de, 200) : '';
			/** @type {{ slug: string, titulo: string } | null} */
			let from = null;
			if (source) {
				const r = await resolveEvent(source);
				if (!r.event)
					throw new ToolInputError(
						r.options?.length
							? `Hay varios eventos que coinciden con «${source}»: ${r.options.map((o) => `${o.titulo} (${o.slug})`).join(', ')}.`
							: `No encontré ningún evento «${source}» para copiar.`
					);
				from = { slug: r.event.slug, titulo: r.event.title };
			}
			if (!title && !from) throw new ToolInputError('Falta `titulo`.');
			if (title.length > 200)
				throw new ToolInputError('El título puede tener hasta 200 caracteres.');
			const start = normalizeDateTime(input.inicio);
			if (!start)
				throw new ToolInputError('`inicio` va como «AAAA-MM-DDTHH:MM» (hora de Argentina).');
			const end = input.fin ? normalizeDateTime(input.fin) : null;
			if (input.fin && !end) throw new ToolInputError('`fin` va como «AAAA-MM-DDTHH:MM».');
			if (end && end.slice(0, 10) !== start.slice(0, 10))
				throw new ToolInputError(
					'Un borrador termina el mismo día que empieza (como en la agenda). Para otra fecha de fin, cambiala después con `editar_objeto`.'
				);
			const inputs = { titulo: title, inicio: start, fin: end ?? '', copia_de: from?.slug ?? '' };
			const changes = [
				{ campo: 'título', antes: '', despues: title || `(el de «${from?.titulo}»)` },
				{ campo: 'inicio', antes: '', despues: start.replace('T', ' ') },
				...(end ? [{ campo: 'fin', antes: '', despues: end.replace('T', ' ') }] : []),
				...(from
					? [{ campo: 'copia de', antes: '', despues: `${from.titulo} (${from.slug})` }]
					: []),
				{ campo: 'estado', antes: '', despues: 'borrador no listado («A confirmar» en la agenda)' }
			];
			const target = `evento:nuevo:${start}:${title || from?.slug}`;
			return {
				...common,
				head: `Crear un borrador de evento:`,
				inputs,
				target,
				targetTitle: title || from?.titulo || '',
				targetLog: { targetType: 'event', targetId: title || from?.slug || '' },
				changes,
				links: { panel: '/admin/eventos/agenda' },
				apply: async (c) => {
					const { actions } =
						await import('../../../routes/(authed)/admin/eventos/agenda/+page.server.js');
					const form = new FormData();
					form.set('title', title);
					form.set('source', from?.slug ?? '');
					form.set('date', start.slice(0, 10));
					form.set('startTime', start.slice(11));
					form.set('endTime', end ? end.slice(11) : '');
					const r = /** @type {any} */ (
						await runPanelAction(c, /** @type {any} */ (actions).crearBorrador, {
							path: '/admin/eventos/agenda?/crearBorrador',
							params: {},
							form
						})
					);
					if (r?.draft?.slug) {
						return {
							ok: true,
							warnings: Array.isArray(r.draft.notes) ? r.draft.notes : [],
							created: { slug: r.draft.slug, links: linksFor('evento', r.draft.slug) }
						};
					}
					return { ok: false, stale: false, message: failMessage(r, 'draft') };
				}
			};
		}
		if (tipo === 'material') {
			const input = inputObject(args.cambios, MATERIAL_DRAFT_FIELDS);
			const { slug: rawSlug, ...rest } = input;
			const inputs = await normalizeCommonInputs(ctx, rest, [
				'title',
				'summary',
				'tags',
				'authors',
				'personas',
				'force_unlisted',
				'layout',
				'category',
				'link',
				'link_text',
				'featured'
			]);
			if (!inputs.titulo) throw new ToolInputError('Falta `titulo`.');
			const taken = await takenContentSlugs('material');
			const wanted = rawSlug
				? oneLine(rawSlug, 100)
				: freeContentSlug(suggestContentSlug(String(inputs.titulo), 'material'), 'material', taken);
			const problem = validateContentSlug(wanted, 'material', taken);
			if (problem) throw new ToolInputError(`Dirección «${wanted}»: ${problem}`);
			const today = todayInArgentina();
			const personas = /** @type {any[] | undefined} */ (inputs.personas);
			const md = personas ? personasToMd(personas, 'material') : { authors: [], personas: [] };
			const tags = /** @type {string[] | undefined} */ (inputs.etiquetas) ?? [];
			/** @type {Record<string, any>} */
			const fm = {
				title: inputs.titulo,
				summary: inputs.resumen || REMOVE,
				tags: tags.length ? tags : REMOVE,
				authors: md.authors.length ? md.authors : REMOVE,
				personas: md.personas.length ? md.personas : REMOVE,
				published_date: formatPostDate(today),
				updated_date: formatPostDate(today),
				force_unlisted: true,
				link: inputs.link || undefined,
				link_text: inputs.texto_del_link || undefined,
				.../** @type {Record<string, unknown>} */ (inputs.propiedades ?? {})
			};
			for (const [k, v] of Object.entries(fm)) if (v === null) fm[k] = REMOVE;
			const { frontmatter } = splitMarkdown(materialTemplate);
			const content = joinMarkdown(
				applyFrontmatterChanges(frontmatter, fm),
				inputs.descripcion ? bodyOf(String(inputs.descripcion)) : ''
			);
			await checkMaterialContent(ctx, null, content);
			const changes = [
				{ campo: 'título', antes: '', despues: String(inputs.titulo) },
				{ campo: 'dirección', antes: '', despues: wanted },
				...(inputs.resumen
					? [{ campo: 'resumen', antes: '', despues: valueText(inputs.resumen) }]
					: []),
				{ campo: 'etiquetas', antes: '', despues: valueText(tags) },
				{ campo: 'personas', antes: '', despues: personasText(personas ?? []) },
				...(inputs.descripcion
					? [{ campo: 'descripción', antes: '', despues: valueText(inputs.descripcion) }]
					: []),
				{ campo: 'visibilidad', antes: '', despues: 'no listado (borrador)' }
			];
			return {
				...common,
				head: 'Crear un borrador de material:',
				inputs: { ...inputs, slug: wanted },
				target: `material:nuevo:${wanted}`,
				targetTitle: String(inputs.titulo),
				targetLog: { targetType: 'post', targetId: `material/${wanted}` },
				changes,
				links: linksFor('material', wanted),
				apply: async (c) => {
					const r = await savePanelMaterial(c, { slug: wanted, content, sha: '', isNew: true });
					return r.ok
						? {
								ok: true,
								warnings: [],
								created: { slug: wanted, links: linksFor('material', wanted) }
							}
						: { ok: false, stale: r.conflict, message: r.message };
				}
			};
		}
		// perfil o lugar
		const lugar = tipo === 'lugar';
		const inputs = await normalizeProfileInputs(ctx, args.cambios, { lugar });
		if (!inputs.titulo) throw new ToolInputError('Falta `titulo` (el nombre).');
		if (inputs.imagen !== undefined)
			throw new ToolInputError('La imagen se elige después, con `editar_objeto`.');
		const base = emptyFormValues(lugar ? 'lugar' : String(inputs.tipo_de_perfil ?? 'persona'));
		const values = { ...applyProfileInputs(base, inputs), visibility: 'hidden' };
		if (inputs.quien_lo_ve && inputs.quien_lo_ve !== 'oculto')
			common.warnings.push(
				'Un borrador nace oculto: para mostrarlo, cambiá `quien_lo_ve` después.'
			);
		checkProfileValues(values);
		const changes = (
			await profileChanges(ctx, base, values, { before: null, after: undefined })
		).map((ch) => ({ ...ch, antes: '' }));
		return {
			...common,
			head: `Crear un borrador de ${lugar ? 'lugar' : 'perfil'} (oculto):`,
			inputs: { ...inputs, quien_lo_ve: 'oculto' },
			target: `${tipo}:nuevo:${values.title}`,
			targetTitle: values.title,
			targetLog: { targetType: 'profile', targetId: values.title },
			changes,
			links: { panel: lugar ? '/admin/eventos/lugares' : '/admin/comunidad/perfiles' },
			apply: async (c) => {
				const r = await createPanelProfile(c, values);
				return r.ok
					? { ok: true, warnings: [], created: { slug: r.slug, links: linksFor(tipo, r.slug) } }
					: { ok: false, stale: false, message: r.message };
			}
		};
	} catch (error) {
		if (error instanceof PostChangeError) throw new ToolInputError(error.message);
		throw error;
	}
}

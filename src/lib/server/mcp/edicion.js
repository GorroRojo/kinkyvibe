/**
 * Las herramientas de cambios del conector de Claude (docs/conector-claude.md, «Cambios»):
 * `vista_previa` y `aplicar`. Solo con los interruptores `conector_claude` y
 * `conector_claude_edicion` prendidos y una conexión con el permiso `edicion` (o una llave para
 * rutinas, ./oauth.js y ./llaves.js); si no, ni aparecen en `tools/list`.
 *
 * - `vista_previa` recibe la operación ({@link OPERATIONS}: editar un objeto, crear un código o un
 *   borrador, deshacer), el objetivo (por nombre o slug) y los cambios; los valida con las reglas
 *   del panel y devuelve el antes y después en palabras, la huella y la versión de lo que había.
 *   No guarda nada.
 * - `aplicar` recibe lo mismo más la huella y la versión. Si lo que hay cambió desde la vista previa,
 *   o las entradas no dan la misma huella, no guarda nada. Si no, guarda por el mismo código que el
 *   panel (./editarEvento.js, ./editarMaterial.js, ./editarPerfil.js, ./editarEtiqueta.js,
 *   ./crearCodigo.js, ./borradores.js, ./historial.js), con «confirmado por» en el historial y en
 *   Actividad. Sin tope por día: si hay muchos cambios en una hora, sale un aviso por Telegram a
 *   les admins (./avisoCambios.js, lo dispara ./rpc.js después de anotarlo en Actividad). Guarda
 *   con las reglas de HTML de le admin que autorizó, como el panel (decisión 0004).
 * - Nada de plata ni mails: ni ventas, ni reembolsos, ni envíos, ni cancelar un evento
 *   (./editarEvento.js, `eventMailGuard`).
 */
import { isAdmin } from '$lib/server/auth';
import { runAsPanelAuthor } from '$lib/server/contenido/author.js';
import { eventHref } from '$lib/admin/nav.js';
import { dbTagsForAdmin } from '$lib/server/etiquetas/panel.js';
import { planDbTagEdit } from '$lib/server/etiquetas/editor.js';
import { readOps } from '$lib/utils/tagConfig.js';
import { tagSlug } from '$lib/utils/tagSlug.js';
import {
	changeHash,
	claudeLabel,
	cleanConfirmedBy,
	cleanRequest,
	editingOn,
	hashMatches
} from './cambios.js';
import {
	EVENT_FIELDS,
	EventChangeError,
	STATUS_VALUES,
	VISIBILITY_VALUES,
	eventBase,
	eventState,
	normalizeEventInputs,
	planEventChange,
	savePanelEvent
} from './editarEvento.js';
import { PostChangeError } from './editarPost.js';
import {
	MATERIAL_FIELDS,
	materialBase,
	materialState,
	normalizeMaterialInputs,
	planMaterialChange,
	savePanelMaterial
} from './editarMaterial.js';
import {
	PROFILE_FIELDS,
	applyProfileInputs,
	checkProfileValues,
	normalizeProfileInputs,
	profileBase,
	profileChanges,
	profileState,
	savePanelProfile
} from './editarPerfil.js';
import {
	TAG_FIELDS,
	WIKI_FIELDS,
	normalizeTagInputs,
	normalizeWikiInputs,
	planTagChange,
	planWikiChange,
	savePanelTag,
	savePanelWiki,
	wikiValues
} from './editarEtiqueta.js';
import {
	CODE_FIELDS,
	CodeChangeError,
	codeExists,
	describeCode,
	normalizeCodeInputs,
	savePanelCode,
	ticketedSlugs
} from './crearCodigo.js';
import { DRAFT_TYPES, planDraft } from './borradores.js';
import { linksFor, planUndo } from './historial.js';
import { EDIT_TYPES, LOG_TYPE, TYPE_TEXT, editType, findTarget } from './objetos.js';
import { ToolInputError, resolveEvent } from './tools.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./tools.js').ToolOutput} ToolOutput */

/** Las operaciones que existen. */
export const OPERATIONS = Object.freeze([
	'editar_objeto',
	'editar_evento',
	'crear_codigo',
	'crear_borrador',
	'deshacer'
]);

const OPERATION_TEXT = /** @type {Record<string, string>} */ ({
	editar_objeto:
		'editar un evento, material, perfil, lugar, etiqueta o entrada de la Kinkipedia (`tipo` y `objeto`)',
	editar_evento: 'lo mismo que `editar_objeto` con `tipo: evento` (el evento va en `evento`)',
	crear_codigo: 'crear un código de descuento',
	crear_borrador:
		'crear un borrador sin publicar de un evento, material, perfil o lugar, o una etiqueta nueva',
	deshacer:
		'volver un objeto a una versión anterior (la de antes del último guardado, o `a_version`, el número que muestra `historial`)'
});

/** El esquema de entrada común (sin la huella). */
const BASE_PROPERTIES = {
	operacion: {
		type: 'string',
		enum: [...OPERATIONS],
		description: OPERATIONS.map((o) => `\`${o}\`: ${OPERATION_TEXT[o]}.`).join(' ')
	},
	tipo: {
		type: 'string',
		enum: [...EDIT_TYPES],
		description:
			'En `editar_objeto` y `deshacer`: qué es el objeto. En `crear_borrador`: evento, material, perfil, lugar o etiqueta.'
	},
	objeto: {
		type: 'string',
		description:
			'En `editar_objeto` y `deshacer`: el objeto, por su dirección (slug) o su nombre (una etiqueta, también por su nombre exacto).'
	},
	evento: {
		type: 'string',
		description:
			'En `editar_evento`, el evento (slug o nombre). En `crear_codigo`, el evento del código (sin `evento`, vale para todos).'
	},
	a_version: {
		type: 'integer',
		minimum: 1,
		description: 'En `deshacer`: la versión a la que volver (opcional; la muestra `historial`).'
	},
	cambios: {
		type: 'object',
		description:
			'Lo que cambia (o lo del borrador). Evento: ' +
			EVENT_FIELDS.join(', ') +
			' (`estado`: ' +
			STATUS_VALUES.join(', ') +
			'; `visibilidad`: ' +
			VISIBILITY_VALUES.join(', ') +
			'; `personas`: `[{ nombre, rol }]`, el nombre es la dirección de un perfil o un nombre libre; ' +
			'`etiquetas`: la lista entera; `imagen`: la dirección o el nombre de una imagen de la biblioteca, ' +
			'vacío la saca; `entradas`: `[{ tipo, precio? | a_la_gorra?: { minimo, sugerido } | tandas?: ' +
			'[{ nombre, precio, cantidad?, hasta? }], cupo? }]`, un tipo que no existe se suma; `precios`: ' +
			'`[{ tipo, precio }]`; `propiedades`: `{ clave: valor }` de otras propiedades del texto, `null` ' +
			'la saca; fechas «AAAA-MM-DDTHH:MM», hora de Argentina). Material: ' +
			MATERIAL_FIELDS.join(', ') +
			'. Perfil o lugar: ' +
			PROFILE_FIELDS.join(', ') +
			' (`quien_lo_ve`: publico, miembres, oculto). Etiqueta: ' +
			TAG_FIELDS.join(', ') +
			'. Kinkipedia: ' +
			WIKI_FIELDS.join(', ') +
			'. Código: ' +
			CODE_FIELDS.join(', ') +
			'. Borrador de evento: titulo, inicio, fin, copia_de; de material: titulo, slug, resumen, ' +
			'descripcion, etiquetas, personas, link, texto_del_link, propiedades; de perfil o lugar: los ' +
			'campos de un perfil (nace oculto); de etiqueta: nombre, madre, nombre_visible, icono, descripcion (se publica al toque). `deshacer` no lleva `cambios`.',
		additionalProperties: true
	}
};

/**
 * @typedef {{ ok: true, warnings: string[], created?: { slug: string, links: Record<string, string> } }
 *   | { ok: false, stale: boolean, message: string }} ApplyResult
 *
 * @typedef {{
 *   operation: string,
 *   tipo?: string,
 *   head: string,
 *   target: string,
 *   targetTitle: string,
 *   targetLog: { targetType: string, targetId: string },
 *   inputs: Record<string, unknown>,
 *   base: string,
 *   changes: Array<{ campo: string, antes: string, despues: string }>,
 *   warnings: string[],
 *   links: Record<string, string>,
 *   apply: (ctx: ToolContext) => Promise<ApplyResult>
 * }} Plan
 */

/**
 * Lo que haría `editar_objeto` (o `editar_evento`), ya validado.
 * @param {ToolContext} ctx
 * @param {string} operation
 * @param {string} tipo
 * @param {string} query
 * @param {unknown} cambios
 * @returns {Promise<Plan>}
 */
async function planEdit(ctx, operation, tipo, query, cambios) {
	const { object, slug } = await findTarget(ctx, tipo, query);
	const common = {
		operation,
		tipo,
		// `editar_evento` dice lo mismo que en #607 (lo lee el bot del equipo).
		head:
			operation === 'editar_evento'
				? `Cambiar en «${object.title}»:`
				: `Cambiar en ${TYPE_TEXT[tipo]} «${object.title}»:`,
		target: operation === 'editar_evento' ? slug : `${tipo}:${slug}`,
		targetTitle: object.title,
		targetLog: { targetType: LOG_TYPE[tipo], targetId: slug },
		links: linksFor(tipo, slug)
	};
	if (tipo === 'evento') {
		const state = await eventState(ctx, slug);
		if (!state) throw new ToolInputError('Ese evento no está en la base (o está borrado).');
		const inputs = await normalizeEventInputs(ctx, cambios, state);
		const plan = await planEventChange(ctx, slug, state, inputs);
		const base = eventBase(state);
		return {
			...common,
			links: { panel: eventHref(slug), publico: `/calendario/${slug}` },
			inputs,
			base,
			changes: plan.changes,
			warnings: plan.warnings,
			apply: async (c) => {
				const r = await savePanelEvent(c, {
					slug,
					content: plan.content,
					sha: state.sha,
					venue: plan.venue,
					image: plan.image
				});
				if (r.ok) return r;
				// ¿Alguien guardó en el medio? (el panel lo dice con un mensaje general)
				const now = await eventState(c, slug).catch(() => null);
				const stale = !now || eventBase(now) !== base;
				return { ok: false, stale, message: r.message };
			}
		};
	}
	if (tipo === 'material') {
		const state = await materialState(ctx, slug);
		if (!state) throw new ToolInputError('Ese material no está en la base (o está borrado).');
		const inputs = await normalizeMaterialInputs(ctx, cambios);
		const plan = await planMaterialChange(ctx, state, inputs);
		const base = materialBase(state);
		return {
			...common,
			inputs,
			base,
			changes: plan.changes,
			warnings: plan.warnings,
			apply: async (c) => {
				const r = await savePanelMaterial(c, {
					slug,
					content: plan.content,
					sha: state.sha,
					image: plan.image
				});
				if (r.ok) return r;
				const now = await materialState(c, slug).catch(() => null);
				const stale = r.conflict || !now || materialBase(now) !== base;
				return { ok: false, stale, message: r.message };
			}
		};
	}
	if (tipo === 'perfil' || tipo === 'lugar') {
		const state = await profileState(ctx, object, slug);
		const inputs = await normalizeProfileInputs(ctx, cambios, { lugar: tipo === 'lugar' });
		const values = applyProfileInputs(state.values, inputs);
		const image = /** @type {number | null | undefined} */ (inputs.imagen);
		const changes = await profileChanges(ctx, state.values, values, {
			before: state.imageId,
			after: image
		});
		if (!changes.length) throw new ToolInputError('Eso ya está así: no hay nada para cambiar.');
		checkProfileValues(values, object.data);
		return {
			...common,
			inputs,
			base: profileBase(state),
			changes,
			warnings: [],
			apply: async (c) => {
				const r = await savePanelProfile(c, { slug, values, image });
				return r.ok ? r : { ok: false, stale: r.conflict, message: r.message };
			}
		};
	}
	if (tipo === 'etiqueta') {
		const inputs = normalizeTagInputs(cambios);
		const { op, changes } = planTagChange(object, inputs);
		if (!changes.length) throw new ToolInputError('Eso ya está así: no hay nada para cambiar.');
		// Las reglas del editor de etiquetas (la imagen, el color…), antes de mostrar nada.
		const fromDb = await dbTagsForAdmin(ctx.platform, ctx.user.login);
		if (!fromDb) throw new ToolInputError('No se pueden leer las etiquetas de la base.');
		try {
			planDbTagEdit(fromDb.records, readOps([op]));
		} catch (e) {
			throw new ToolInputError(/** @type {Error} */ (e).message);
		}
		return {
			...common,
			inputs,
			base: String(object.version),
			changes,
			warnings: [],
			apply: async (c) => {
				const r = await savePanelTag(c, op);
				return r.ok ? r : { ok: false, stale: false, message: r.message };
			}
		};
	}
	// kinkipedia
	const inputs = normalizeWikiInputs(cambios);
	const before = wikiValues(object);
	const { after, changes } = planWikiChange(before, inputs);
	if (!changes.length) throw new ToolInputError('Eso ya está así: no hay nada para cambiar.');
	if (!after.title && !after.summary && !after.body)
		throw new ToolInputError('La entrada tiene que tener al menos título, resumen o texto.');
	const wikiSlug = tagSlug(String(object.data.key ?? ''));
	return {
		...common,
		head: `Cambiar en la entrada de la Kinkipedia de «${object.title}»:`,
		links: linksFor('kinkipedia', wikiSlug),
		inputs: { ...inputs },
		base: String(object.version),
		changes,
		warnings: [],
		apply: async (c) => {
			const r = await savePanelWiki(c, { slug: wikiSlug, values: after, version: object.version });
			return r.ok ? r : { ok: false, stale: r.conflict, message: r.message };
		}
	};
}

/**
 * Lo que haría el cambio, ya validado: objetivo, entradas normalizadas, versión, antes y después y
 * cómo guardarlo. Tira {@link ToolInputError} si algo no se puede.
 *
 * @param {ToolContext} ctx
 * @param {Record<string, unknown>} args
 * @returns {Promise<Plan>}
 */
export async function planChange(ctx, args) {
	const operation = typeof args.operacion === 'string' ? args.operacion : '';
	if (!OPERATIONS.includes(operation))
		throw new ToolInputError(`\`operacion\` es una de: ${OPERATIONS.join(', ')}.`);
	const eventQuery = typeof args.evento === 'string' ? args.evento.trim().slice(0, 200) : '';
	try {
		if (operation === 'editar_evento') {
			if (!eventQuery) throw new ToolInputError('Falta `evento` (slug o nombre).');
			return await planEdit(ctx, operation, 'evento', eventQuery, args.cambios);
		}
		if (operation === 'editar_objeto') {
			const tipo = editType(args.tipo);
			const query =
				typeof args.objeto === 'string' ? args.objeto : tipo === 'evento' ? eventQuery : '';
			return await planEdit(ctx, operation, tipo, query, args.cambios);
		}
		if (operation === 'crear_borrador') {
			if (!DRAFT_TYPES.includes(String(args.tipo)))
				throw new ToolInputError(`\`tipo\` de un borrador es uno de: ${DRAFT_TYPES.join(', ')}.`);
			return await planDraft(ctx, args);
		}
		if (operation === 'deshacer') return await planUndo(ctx, args);
		// crear_codigo
		/** Resuelve el evento por slug o nombre (como `ventas`). */
		const findEvent = async () => {
			const r = await resolveEvent(eventQuery);
			if (r.event) return r.event;
			throw new ToolInputError(
				r.options?.length
					? `Hay varios eventos que coinciden con «${eventQuery}»: ${r.options
							.map((o) => `${o.titulo} (${o.slug})`)
							.join(', ')}. Volvé a pedir con el slug.`
					: `No encontré ningún evento «${eventQuery}».`
			);
		};
		const ticketed = await ticketedSlugs();
		const ev = eventQuery ? await findEvent() : null;
		if (ev && !ticketed.includes(ev.slug))
			throw new ToolInputError(
				`«${ev.title}» no vende entradas por el sitio: no puede tener códigos.`
			);
		const inputs = normalizeCodeInputs(args.cambios, ev?.slug ?? null, ticketed);
		if (await codeExists(ctx.db, inputs.codigo))
			throw new ToolInputError(`Ya existe un código ${inputs.codigo}. Elegí otro.`);
		return {
			operation,
			head: `Crear el código de descuento ${inputs.codigo}:`,
			target: inputs.codigo,
			targetTitle: inputs.codigo,
			targetLog: { targetType: 'discount', targetId: inputs.codigo },
			inputs,
			base: 'nuevo',
			changes: describeCode(inputs, ev?.title ?? null),
			warnings: [],
			links: { panel: ev ? eventHref(ev.slug, 'codigos') : '/admin/ventas/codigos' },
			apply: async (c) => {
				const r = await savePanelCode(c, inputs);
				return r.ok
					? { ok: true, warnings: [] }
					: { ok: false, stale: r.exists, message: r.message };
			}
		};
	} catch (error) {
		if (
			error instanceof EventChangeError ||
			error instanceof PostChangeError ||
			error instanceof CodeChangeError
		)
			throw new ToolInputError(error.message);
		throw error;
	}
}

/** El antes y después en un texto corto (lo que el bot muestra para pedir el ✅). @param {Plan} p */
export function summaryText(p) {
	const lines = p.changes.map((c) =>
		c.antes ? `• ${c.campo}: ${c.antes} → ${c.despues}` : `• ${c.campo}: ${c.despues}`
	);
	return [p.head, ...lines, ...p.warnings.map((w) => `⚠️ ${w}`)].join('\n');
}

/** Cómo se nombra el tipo del objeto. @param {Plan} p */
const typeText = (p) => TYPE_TEXT[p.tipo ?? 'evento'];

/** Para Actividad: de qué es el cambio. @param {Plan} p */
function whatOf(p) {
	switch (p.operation) {
		case 'crear_codigo':
			return `el código de descuento ${p.target}`;
		case 'crear_borrador':
			return p.tipo === 'etiqueta'
				? `la etiqueta nueva «${p.targetTitle}»`
				: `un borrador de ${p.tipo} «${p.targetTitle}»`;
		case 'deshacer':
			return `volver atrás ${typeText(p)} «${p.targetTitle}»`;
		default:
			return `un cambio en ${typeText(p)} «${p.targetTitle}»`;
	}
}

/** Para Actividad: qué se hizo. @param {Plan} p */
function doneOf(p) {
	switch (p.operation) {
		case 'crear_codigo':
			return `creó el código de descuento ${p.target}`;
		case 'crear_borrador':
			return p.tipo === 'etiqueta'
				? `creó la etiqueta «${p.targetTitle}»`
				: `creó un borrador de ${p.tipo} «${p.targetTitle}»`;
		case 'deshacer':
			return `volvió ${typeText(p)} «${p.targetTitle}» a la versión ${p.inputs.a_version} (${fieldsOf(p)})`;
		default:
			return `editó ${typeText(p)} «${p.targetTitle}» (${fieldsOf(p)})`;
	}
}

/** Para Actividad: qué campos cambian (sin los valores, que pueden ser largos). @param {Plan} p */
const fieldsOf = (p) => p.changes.map((c) => c.campo).join(', ');

/** Sin el interruptor de cambios: un error claro. @param {ToolContext} ctx */
async function requireEditing(ctx) {
	if (ctx.canEdit !== true) {
		throw new ToolInputError(
			'Esta conexión solo tiene permiso de lectura. Para cambiar, volvé a conectar el conector en Claude y permití también los cambios.'
		);
	}
	if (!(await editingOn(ctx.db))) {
		throw new ToolInputError(
			'Los cambios del conector están apagados (Ajustes → Interruptores → «Conector de Claude: cambios»). Claude solo puede leer.'
		);
	}
}

/** @type {Record<string, { definition: Record<string, unknown>, annotations: Record<string, boolean>, run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolOutput> }>} */
export const EDIT_TOOLS = {
	vista_previa: {
		definition: {
			name: 'vista_previa',
			title: 'Vista previa de un cambio',
			description:
				'Primer paso de todo cambio: muestra exactamente qué va a cambiar, sin guardar nada. ' +
				'Valida con las reglas del panel y devuelve `resumen` (el antes y después en un texto ' +
				'corto, para mostrarle a la persona y pedirle el OK), `cambios`, `hash` y `version`. ' +
				'Para guardar, llamá a `aplicar` con las mismas entradas más `hash` y `version`, solo ' +
				'después de que la persona confirme. Operaciones: ' +
				OPERATIONS.map((o) => `\`${o}\` (${OPERATION_TEXT[o]})`).join(', ') +
				'.',
			inputSchema: {
				type: 'object',
				properties: BASE_PROPERTIES,
				required: ['operacion'],
				additionalProperties: false
			}
		},
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		},
		async run(ctx, args) {
			await requireEditing(ctx);
			const p = await planChange(ctx, args);
			const hash = await changeHash(ctx.db, p);
			return {
				result: {
					operacion: p.operation,
					objetivo: p.target,
					titulo: p.targetTitle,
					resumen: summaryText(p),
					cambios: p.changes,
					avisos: p.warnings,
					hash,
					version: p.base,
					enlaces: p.links
				},
				log: {
					summary: `Claude: vista previa de ${whatOf(p)} (${fieldsOf(p)})`,
					...p.targetLog,
					detail: { operacion: p.operation, campos: p.changes.map((c) => c.campo) }
				}
			};
		}
	},

	aplicar: {
		definition: {
			name: 'aplicar',
			title: 'Aplicar un cambio confirmado',
			description:
				'Segundo paso: guarda un cambio ya visto con `vista_previa`, por el mismo guardado que ' +
				'el panel (con historial). Llevá las mismas entradas que en la vista previa, más `hash` ' +
				'y `version` tal como vinieron. Si algo cambió desde la vista previa o las entradas no ' +
				'son las mismas, no guarda nada: hacé una vista previa nueva y volvé a pedir el OK. ' +
				'`confirmado_por`: el nombre de quien del equipo confirmó (si no lo confirmó la misma ' +
				'persona que está en este chat). `pedido`: el texto de lo que se pidió.',
			inputSchema: {
				type: 'object',
				properties: {
					...BASE_PROPERTIES,
					hash: { type: 'string', description: 'El `hash` de la vista previa.' },
					version: { type: 'string', description: 'La `version` de la vista previa.' },
					confirmado_por: {
						type: 'string',
						maxLength: 40,
						description: 'Quién del equipo confirmó el cambio (un nombre). Opcional.'
					},
					pedido: {
						type: 'string',
						maxLength: 500,
						description: 'El pedido original, en palabras. Opcional.'
					}
				},
				required: ['operacion', 'hash', 'version'],
				additionalProperties: false
			}
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false
		},
		async run(ctx, args) {
			await requireEditing(ctx);
			const confirmedBy = cleanConfirmedBy(args.confirmado_por);
			const request = cleanRequest(args.pedido);
			const who = claudeLabel(confirmedBy);
			const p = await planChange(ctx, args);
			const version = typeof args.version === 'string' ? args.version : '';
			const refused = (/** @type {string} */ why, /** @type {string} */ message) => ({
				isError: true,
				result: { aplicado: false, motivo: why, mensaje: message },
				log: {
					summary: `${who}: no se aplicó ${whatOf(p)} (${why})`,
					...p.targetLog,
					detail: { operacion: p.operation, motivo: why }
				}
			});
			if (version !== p.base) {
				return refused(
					'cambió',
					'Esto cambió desde la vista previa (alguien guardó en el medio). No se guardó nada: hacé una vista previa nueva y volvé a pedir el OK.'
				);
			}
			if (!(await hashMatches(ctx.db, p, args.hash))) {
				return refused(
					'no coincide',
					'Las entradas no son las de la vista previa (o el hash no es el que dio). No se guardó nada: hacé una vista previa nueva con lo que se quiere cambiar.'
				);
			}
			// Como cuando le admin guarda en el panel: les admins son superadmins (HTML libre).
			const r = await runAsPanelAuthor(
				{
					login: ctx.user.login,
					name: null,
					superadmin: isAdmin(ctx.user),
					claude: { confirmedBy }
				},
				() => p.apply(ctx)
			);
			if (!r.ok) {
				return r.stale
					? refused(
							'cambió',
							'Esto cambió desde la vista previa (alguien guardó en el medio). No se guardó nada: hacé una vista previa nueva y volvé a pedir el OK.'
						)
					: refused('el panel no lo guardó', `No se guardó: ${r.message}`);
			}
			return {
				result: {
					aplicado: true,
					operacion: p.operation,
					objetivo: p.target,
					titulo: p.targetTitle,
					resumen: summaryText(p),
					avisos: r.warnings,
					confirmado_por: confirmedBy,
					enlaces: r.created?.links ?? p.links,
					...(r.created ? { creado: r.created.slug } : {})
				},
				log: {
					summary: `${who}: ${doneOf(p)}`,
					...p.targetLog,
					// Sin el texto del pedido (puede tener datos de alguien): solo si vino y su largo.
					detail: {
						operacion: p.operation,
						// Lo que cuenta ./avisoCambios.js (los cambios aplicados en la última hora).
						aplicado: true,
						campos: p.changes.map((c) => c.campo),
						confirmado_por: confirmedBy,
						pedido_largo: request ? request.length : 0
					}
				}
			};
		}
	}
};

export { CODE_FIELDS, EVENT_FIELDS };

/**
 * Las herramientas de cambios del conector de Claude (docs/conector-claude.md, «Cambios»):
 * `vista_previa` y `aplicar`. Solo con los interruptores `conector_claude` y
 * `conector_claude_edicion` prendidos; con el segundo apagado ni aparecen en `tools/list`.
 *
 * - `vista_previa` recibe la operación, el objetivo (por nombre o slug) y los cambios; los valida con
 *   las reglas del panel y devuelve el antes y después en palabras, la huella y la versión de lo
 *   que había. No guarda nada.
 * - `aplicar` recibe lo mismo más la huella y la versión. Si lo que hay cambió desde la vista previa,
 *   o las entradas no dan la misma huella, no guarda nada. Si no, guarda por el mismo código que el
 *   panel (./editarEvento.js, ./crearCodigo.js), con «confirmado por» en el historial y en
 *   Actividad, y cuenta para el tope por día (./cambios.js).
 */
import { runAsPanelAuthor } from '$lib/server/contenido/author.js';
import { eventHref } from '$lib/admin/nav.js';
import {
	changeHash,
	claudeLabel,
	cleanConfirmedBy,
	cleanRequest,
	editingOn,
	hashMatches,
	takeDailySlot
} from './cambios.js';
import {
	EVENT_FIELDS,
	EventChangeError,
	eventBase,
	eventState,
	normalizeEventInputs,
	planEventChange,
	savePanelEvent,
	VISIBILITY_VALUES
} from './editarEvento.js';
import {
	CODE_FIELDS,
	CodeChangeError,
	codeExists,
	describeCode,
	normalizeCodeInputs,
	savePanelCode,
	ticketedSlugs
} from './crearCodigo.js';
import { ToolInputError, resolveEvent } from './tools.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./tools.js').ToolOutput} ToolOutput */

/** Las operaciones que existen. */
export const OPERATIONS = Object.freeze(['editar_evento', 'crear_codigo']);

const OPERATION_TEXT = /** @type {Record<string, string>} */ ({
	editar_evento: 'editar un evento',
	crear_codigo: 'crear un código de descuento'
});

/** El esquema de entrada común (sin la huella). */
const BASE_PROPERTIES = {
	operacion: {
		type: 'string',
		enum: [...OPERATIONS],
		description:
			'`editar_evento`: cambia datos de un evento. `crear_codigo`: crea un código de descuento.'
	},
	evento: {
		type: 'string',
		description:
			'El evento, por slug o nombre. Obligatorio en `editar_evento`; en `crear_codigo`, el ' +
			'evento del código (sin `evento`, vale para todos).'
	},
	cambios: {
		type: 'object',
		description:
			'En `editar_evento`, alguno de: `titulo`; `inicio` y `fin` («AAAA-MM-DDTHH:MM», hora de ' +
			'Argentina; `fin` vacío saca la hora de fin; si cambia `inicio` sin `fin`, el fin se mueve ' +
			'igual); `lugar` (nombre o slug de un lugar que ya existe; vacío: sin lugar); `descripcion` ' +
			'(el texto, en markdown); `precios` (lista de `{ tipo, precio }`: el nombre de un tipo de ' +
			'entrada con precio fijo y el precio en pesos); `visibilidad` (`listado` o `no_listado`). ' +
			'En `crear_codigo`: `codigo` (3 a 32 letras, números, - o _), `tipo` (`porcentaje` o ' +
			'`monto`), `valor` (entero), y si hace falta `desde`, `hasta` («AAAA-MM-DDTHH:MM»), ' +
			'`usos_maximos`, `entradas_maximas`.',
		properties: {
			titulo: { type: 'string' },
			inicio: { type: 'string' },
			fin: { type: 'string' },
			lugar: { type: 'string' },
			descripcion: { type: 'string' },
			precios: {
				type: 'array',
				items: {
					type: 'object',
					properties: { tipo: { type: 'string' }, precio: { type: 'integer', minimum: 0 } },
					required: ['tipo', 'precio']
				}
			},
			visibilidad: { type: 'string', enum: [...VISIBILITY_VALUES] },
			codigo: { type: 'string' },
			tipo: { type: 'string', enum: ['porcentaje', 'monto'] },
			valor: { type: 'integer', minimum: 1 },
			desde: { type: 'string' },
			hasta: { type: 'string' },
			usos_maximos: { type: 'integer', minimum: 1 },
			entradas_maximas: { type: 'integer', minimum: 1 }
		},
		additionalProperties: false
	}
};

/**
 * @typedef {{
 *   operation: string,
 *   target: string,
 *   targetTitle: string,
 *   inputs: Record<string, unknown>,
 *   base: string,
 *   changes: Array<{ campo: string, antes: string, despues: string }>,
 *   warnings: string[],
 *   links: Record<string, string>,
 *   apply: (ctx: ToolContext) => Promise<{ ok: true, warnings: string[] } | { ok: false, stale: boolean, message: string }>
 * }} Plan
 */

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
	try {
		if (operation === 'editar_evento') {
			if (!eventQuery) throw new ToolInputError('Falta `evento` (slug o nombre).');
			const ev = await findEvent();
			const state = await eventState(ctx.db, ev.slug);
			if (!state) throw new ToolInputError('Ese evento no está en la base (o está borrado).');
			const inputs = normalizeEventInputs(args.cambios, state);
			const plan = await planEventChange(ctx.db, ev.slug, state, inputs);
			const base = eventBase(state);
			return {
				operation,
				target: ev.slug,
				targetTitle: state.title,
				inputs,
				base,
				changes: plan.changes,
				warnings: plan.warnings,
				links: { panel: eventHref(ev.slug), publico: `/calendario/${ev.slug}` },
				apply: async (c) => {
					const r = await savePanelEvent(c, {
						slug: ev.slug,
						content: plan.content,
						sha: state.sha,
						venue: plan.venue
					});
					if (r.ok) return r;
					// ¿Alguien guardó en el medio? (el panel lo dice con un mensaje general)
					const now = await eventState(c.db, ev.slug).catch(() => null);
					const stale = !now || eventBase(now) !== base;
					return { ok: false, stale, message: r.message };
				}
			};
		}
		// crear_codigo
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
			target: inputs.codigo,
			targetTitle: inputs.codigo,
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
		if (error instanceof EventChangeError || error instanceof CodeChangeError)
			throw new ToolInputError(error.message);
		throw error;
	}
}

/** El antes y después en un texto corto (lo que el bot muestra para pedir el ✅). @param {Plan} p */
export function summaryText(p) {
	const head =
		p.operation === 'editar_evento'
			? `Cambiar en «${p.targetTitle}»:`
			: `Crear el código de descuento ${p.target}:`;
	const lines = p.changes.map((c) =>
		c.antes ? `• ${c.campo}: ${c.antes} → ${c.despues}` : `• ${c.campo}: ${c.despues}`
	);
	return [head, ...lines, ...p.warnings.map((w) => `⚠️ ${w}`)].join('\n');
}

/** Para Actividad: de qué es el cambio. @param {Plan} p */
const whatOf = (p) =>
	p.operation === 'editar_evento'
		? `un cambio en el evento «${p.targetTitle}»`
		: `el código de descuento ${p.target}`;

/** Para Actividad: qué campos cambian (sin los valores, que pueden ser largos). @param {Plan} p */
const fieldsOf = (p) => p.changes.map((c) => c.campo).join(', ');

/** @param {Plan} p */
const targetLog = (p) =>
	p.operation === 'editar_evento'
		? { targetType: 'event', targetId: p.target }
		: { targetType: 'discount', targetId: p.target };

/** Sin el interruptor de cambios: un error claro. @param {ToolContext} ctx */
async function requireEditing(ctx) {
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
				required: ['operacion', 'cambios'],
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
					...targetLog(p),
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
				required: ['operacion', 'cambios', 'hash', 'version'],
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
					...targetLog(p),
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
			const slot = await takeDailySlot(ctx.db, ctx.now);
			if (!slot.ok) return refused('tope por día', slot.message);
			let r;
			try {
				r = await runAsPanelAuthor(
					{ login: ctx.user.login, name: null, superadmin: false, claude: { confirmedBy } },
					() => p.apply(ctx)
				);
			} catch (error) {
				await slot.release();
				throw error;
			}
			if (!r.ok) {
				await slot.release();
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
					enlaces: p.links
				},
				log: {
					summary: `${who}: ${p.operation === 'editar_evento' ? `editó el evento «${p.targetTitle}» (${fieldsOf(p)})` : `creó el código de descuento ${p.target}`}`,
					...targetLog(p),
					// Sin el texto del pedido (puede tener datos de alguien): solo si vino y su largo.
					detail: {
						operacion: p.operation,
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

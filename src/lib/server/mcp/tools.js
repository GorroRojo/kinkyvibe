/**
 * Las herramientas del conector de Claude (docs/conector-claude.md). Todas solo leen.
 *
 * - Nunca reciben SQL ni ids numéricos: un evento u objeto se pide por su dirección (slug) o por su
 *   nombre, y acá se resuelve. Si el nombre no alcanza (varios parecidos), se devuelven las
 *   opciones con su slug para volver a pedir.
 * - Lo mismo que ve un admin en el panel, con sus reglas: el DNI nunca sale (ni los últimos 3), ni
 *   el id del pago de Mercado Pago, las notas internas o las respuestas de inscripción; ningún
 *   secreto de los datos de un objeto (las claves de `sanitizeDetail`, como el registro).
 * - Los eventos de prueba de la venta (`prueba-entradas-*`) no aparecen fuera de `vite dev`, como en
 *   el buscador del panel.
 */
import { dev } from '$app/environment';
import { eventHref } from '$lib/admin/nav.js';
import { sanitizeDetail } from '$lib/server/admin/audit.js';
import { eventOrderRows } from '$lib/server/admin/eventOrders.js';
import { getAllCounts, summarizeEvent } from '$lib/server/admin/sales.js';
import { listEvents } from '$lib/server/eventos/index.js';
import { getObject, searchObjects } from '$lib/server/objects/read.js';
import { getEdges } from '$lib/server/objects/edges.js';
import {
	getEventTickets,
	isTestEventSlug,
	listTicketedEvents
} from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { getCounts, foldText } from '$lib/server/tickets/orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/**
 * @typedef {{
 *   db: D1Database,
 *   user: { id: number, login: string },
 *   fetch: typeof fetch,
 *   now: number
 * }} ToolContext
 *
 * @typedef {{
 *   result: Record<string, unknown>,
 *   log: { summary: string, targetType?: string, targetId?: string, detail?: unknown }
 * }} ToolOutput
 */

/** Los tipos de objeto que se pueden buscar y leer (las imágenes y archivos, no). */
export const OBJECT_TYPES = Object.freeze(['evento', 'material', 'perfil', 'etiqueta', 'lugar']);

/** Estados de una orden, como los dice el panel. */
const STATUS_LABEL = /** @type {Record<string, string>} */ ({
	pending: 'pendiente',
	awaiting_transfer: 'espera transferencia',
	approved: 'aprobada',
	rejected: 'rechazada',
	cancelled: 'cancelada',
	refunded: 'reembolsada',
	expired: 'vencida'
});

/** El filtro `estado` de `ventas` → estados de la orden. */
const STATUS_FILTER = /** @type {Record<string, string[] | null>} */ ({
	todas: null,
	aprobadas: ['approved'],
	pendientes: ['pending', 'awaiting_transfer'],
	reembolsadas: ['refunded'],
	vencidas: ['expired'],
	canceladas: ['cancelled', 'rejected']
});

/** Dónde vive cada tipo en el sitio público (como src/lib/server/seo/indexnow.js). */
const PUBLIC_PREFIX = /** @type {Record<string, string>} */ ({
	evento: '/calendario/',
	material: '/material/',
	perfil: '/amigues/',
	etiqueta: '/wiki/'
});

/** Texto corto, sin caracteres de control, para las entradas. @param {unknown} v @param {number} max */
function cleanText(v, max) {
	return typeof v === 'string'
		? v
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f]/g, ' ')
				.trim()
				.slice(0, max)
		: '';
}

/** Un entero entre `min` y `max`, o `fallback`. @param {unknown} v @param {number} min @param {number} max @param {number} fallback */
function intIn(v, min, max, fallback) {
	const n = typeof v === 'number' ? Math.floor(v) : NaN;
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** @param {unknown} t */
const objectType = (t) =>
	typeof t === 'string' && OBJECT_TYPES.includes(t) ? t : t == null || t === '' ? null : false;

/** Un error que se le devuelve a Claude como resultado de la herramienta (`isError`). */
export class ToolInputError extends Error {}

/** El viewer de les admins (ven lo oculto; nunca lo borrado). @param {ToolContext} ctx */
const viewerOf = (ctx) =>
	/** @type {import('$lib/server/objects/visibility.js').Viewer} */ ({
		role: 'admin',
		id: ctx.user.login
	});

/** Las direcciones de un objeto. @param {StoredObject} o */
function linksOf(o) {
	/** @type {Record<string, string>} */
	const out = {};
	if (PUBLIC_PREFIX[o.type]) out.publico = `${PUBLIC_PREFIX[o.type]}${o.slug}`;
	if (o.type === 'evento') out.panel = eventHref(o.slug);
	if (o.type === 'perfil') out.panel = `/admin/comunidad/perfiles/${encodeURIComponent(o.slug)}`;
	return out;
}

/** Una fila corta de un objeto (búsquedas y opciones). @param {StoredObject} o */
function brief(o) {
	return {
		tipo: o.type,
		slug: o.slug,
		titulo: o.title,
		visibilidad: o.visibility,
		...(o.type === 'evento' && typeof o.data?.start === 'string' ? { inicio: o.data.start } : {}),
		enlaces: linksOf(o)
	};
}

/** Los eventos que se pueden mostrar (sin los de prueba fuera de dev). */
async function visibleEvents() {
	return (await listEvents()).filter((e) => dev || !isTestEventSlug(e.slug));
}

/**
 * Un evento por slug o nombre: `{ event }` o `{ options }` si hay varios (o ninguno).
 * @param {string} query
 */
async function resolveEvent(query) {
	const events = await visibleEvents();
	const bySlug = events.find((e) => e.slug === query);
	if (bySlug) return { event: bySlug };
	const f = foldText(query);
	const exact = events.filter((e) => foldText(e.title) === f);
	if (exact.length === 1) return { event: exact[0] };
	const words = f.split(/\s+/).filter(Boolean);
	const found = (exact.length ? exact : events).filter((e) => {
		const hay = foldText(`${e.title} ${e.slug}`);
		return words.every((w) => hay.includes(w));
	});
	if (found.length === 1) return { event: found[0] };
	return {
		options: found.slice(0, 10).map((e) => ({ slug: e.slug, titulo: e.title, inicio: e.start }))
	};
}

/**
 * Un objeto por slug o nombre (y tipo, si se sabe): `{ object }` u `{ options }`.
 * @param {ToolContext} ctx
 * @param {string} query
 * @param {string | null} type
 */
async function resolveObject(ctx, query, type) {
	const viewer = viewerOf(ctx);
	const types = type ? [type] : OBJECT_TYPES;
	const bySlug = (
		await Promise.all(types.map((t) => getObject(ctx.db, { type: t, slug: query }, viewer)))
	).filter(/** @returns {o is StoredObject} */ (o) => o !== null);
	if (bySlug.length === 1) return { object: bySlug[0] };
	if (bySlug.length > 1) return { options: bySlug.map(brief) };
	const found = (await searchObjects(ctx.db, query, viewer, { limit: 20 })).filter((o) =>
		types.includes(o.type)
	);
	const f = foldText(query);
	const exact = found.filter((o) => foldText(o.title) === f);
	if (exact.length === 1) return { object: exact[0] };
	if (found.length === 1) return { object: found[0] };
	return { options: (exact.length ? exact : found).slice(0, 10).map(brief) };
}

/** @type {Record<string, { definition: Record<string, unknown>, run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolOutput> }>} */
export const TOOLS = {
	buscar: {
		definition: {
			name: 'buscar',
			title: 'Buscar en el sitio',
			description:
				'Busca eventos, material, perfiles (amigues), lugares y etiquetas de KinkyVibe por texto ' +
				'(sin mayúsculas ni tildes; cada palabra como comienzo). Incluye lo oculto, que ven les ' +
				'admins. Devuelve tipo, slug, título y enlaces; para ver todo, usá `leer` con el slug.',
			inputSchema: {
				type: 'object',
				properties: {
					texto: {
						type: 'string',
						description: 'Lo que se busca, p. ej. «shibari» o «fiesta latex».'
					},
					tipo: { type: 'string', enum: [...OBJECT_TYPES], description: 'Solo este tipo.' },
					limite: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
				},
				required: ['texto'],
				additionalProperties: false
			}
		},
		async run(ctx, args) {
			const texto = cleanText(args.texto, 100);
			const tipo = objectType(args.tipo);
			if (!texto) throw new ToolInputError('Falta `texto`.');
			if (tipo === false)
				throw new ToolInputError(`\`tipo\` es uno de: ${OBJECT_TYPES.join(', ')}.`);
			const limite = intIn(args.limite, 1, 50, 20);
			const found = await searchObjects(ctx.db, texto, viewerOf(ctx), {
				type: tipo ?? undefined,
				limit: tipo ? limite : 100
			});
			const items = found
				.filter((o) => OBJECT_TYPES.includes(o.type))
				.slice(0, limite)
				.map(brief);
			return {
				result: { resultados: items, total: items.length },
				log: {
					summary: `Claude: buscó «${texto}»${tipo ? ` (${tipo})` : ''}: ${items.length} resultados`,
					detail: { texto, tipo }
				}
			};
		}
	},

	leer: {
		definition: {
			name: 'leer',
			title: 'Leer un objeto',
			description:
				'Lee un evento, material, perfil, lugar o etiqueta por su slug o su nombre: todos sus ' +
				'campos (los públicos y los que ve el panel), quién y cuándo lo editó, sus relaciones y ' +
				'sus enlaces. Si el nombre coincide con varios, devuelve las opciones para elegir por slug.',
			inputSchema: {
				type: 'object',
				properties: {
					nombre: {
						type: 'string',
						description: 'El slug (p. ej. «2026-11-07-fiesta») o el nombre.'
					},
					tipo: { type: 'string', enum: [...OBJECT_TYPES] }
				},
				required: ['nombre'],
				additionalProperties: false
			}
		},
		async run(ctx, args) {
			const nombre = cleanText(args.nombre, 200);
			const tipo = objectType(args.tipo);
			if (!nombre) throw new ToolInputError('Falta `nombre`.');
			if (tipo === false)
				throw new ToolInputError(`\`tipo\` es uno de: ${OBJECT_TYPES.join(', ')}.`);
			const r = await resolveObject(ctx, nombre, tipo);
			if (!r.object) {
				return {
					result: {
						encontrado: false,
						mensaje: r.options?.length
							? 'Hay varios que coinciden: volvé a pedir con el slug (y el tipo).'
							: 'No encontré nada con ese nombre.',
						opciones: r.options ?? []
					},
					log: {
						summary: `Claude: buscó para leer «${nombre}» (sin uno solo)`,
						detail: { nombre, tipo }
					}
				};
			}
			const o = r.object;
			const edges = await getEdges(ctx.db, o.id, viewerOf(ctx)).catch(() => []);
			return {
				result: {
					encontrado: true,
					tipo: o.type,
					slug: o.slug,
					titulo: o.title,
					visibilidad: o.visibility,
					version: o.version,
					creado: { cuando: new Date(o.created_at).toISOString(), por: o.created_by },
					editado: { cuando: new Date(o.updated_at).toISOString(), por: o.updated_by },
					datos: sanitizeDetail(o.data),
					relaciones: edges.map((e) => ({
						tipo_de_relacion: e.kind,
						tipo: e.object.type,
						slug: e.object.slug,
						titulo: e.object.title
					})),
					enlaces: linksOf(o)
				},
				log: {
					summary: `Claude: leyó ${o.type} «${o.title}»`,
					targetType: o.type === 'evento' ? 'event' : o.type === 'perfil' ? 'profile' : o.type,
					targetId: o.slug
				}
			};
		}
	},

	ventas: {
		definition: {
			name: 'ventas',
			title: 'Ventas de un evento',
			description:
				'Resumen de la venta de entradas de un evento (vendidas, reservadas, cupo, recaudado, ' +
				'neto, Fondo, por tipo de entrada) y la lista de sus órdenes (referencia, nombre, mail, ' +
				'tipo, cantidad, total, medio de pago, estado, fecha, cuántes ingresaron). Sin DNI ni ' +
				'datos del pago. El evento va por slug o nombre.',
			inputSchema: {
				type: 'object',
				properties: {
					evento: { type: 'string', description: 'El slug o el nombre del evento.' },
					estado: {
						type: 'string',
						enum: Object.keys(STATUS_FILTER),
						default: 'todas',
						description: 'Qué órdenes listar.'
					},
					limite: { type: 'integer', minimum: 0, maximum: 500, default: 100 }
				},
				required: ['evento'],
				additionalProperties: false
			}
		},
		async run(ctx, args) {
			const query = cleanText(args.evento, 200);
			if (!query) throw new ToolInputError('Falta `evento`.');
			const estado = typeof args.estado === 'string' ? args.estado : 'todas';
			if (!(estado in STATUS_FILTER))
				throw new ToolInputError(`\`estado\` es uno de: ${Object.keys(STATUS_FILTER).join(', ')}.`);
			const limite = intIn(args.limite, 0, 500, 100);
			const r = await resolveEvent(query);
			if (!r.event) {
				return {
					result: {
						encontrado: false,
						mensaje: r.options?.length
							? 'Hay varios eventos que coinciden: volvé a pedir con el slug.'
							: 'No encontré ningún evento con ese nombre.',
						opciones: r.options ?? []
					},
					log: {
						summary: `Claude: buscó las ventas de «${query}» (sin un evento)`,
						detail: { query }
					}
				};
			}
			const { slug, title } = r.event;
			const fondo = await resolveFondoPercent({ db: ctx.db, fetch: ctx.fetch, staleOk: true });
			const config = await getEventTickets(slug, { fondoPercent: fondo.percent });
			const log = {
				summary: `Claude: miró las ventas de «${title}»`,
				targetType: 'event',
				targetId: slug
			};
			if (!config) {
				return {
					result: {
						encontrado: true,
						slug,
						titulo: title,
						vende_entradas: false,
						mensaje: 'Este evento no vende entradas (o no está publicado).'
					},
					log
				};
			}
			const [counts, { rows }] = await Promise.all([
				getCounts(ctx.db, slug, ctx.now),
				eventOrderRows(ctx.db, slug, config, ctx.now)
			]);
			const s = summarizeEvent({ slug, config }, counts, { now: ctx.now });
			const wanted = STATUS_FILTER[estado];
			const filtered = rows.filter((o) => !wanted || wanted.includes(o.status));
			/** @type {Record<string, number>} */
			const byStatus = {};
			for (const o of rows) {
				const k = STATUS_LABEL[o.status] ?? o.status;
				byStatus[k] = (byStatus[k] ?? 0) + 1;
			}
			return {
				result: {
					encontrado: true,
					slug,
					titulo: s.title,
					inicio: s.start,
					vende_entradas: true,
					resumen: {
						vendidas: s.sold,
						reservadas: s.held,
						cupo: s.capacity,
						recaudado: s.revenue,
						neto_sin_comision_mp: s.net,
						fondo_usado: s.fondoUsed,
						aportes_al_fondo: s.contribution,
						recargos: s.surcharge,
						meta: s.progress,
						por_tipo: s.types.map((t) => ({
							tipo: t.name,
							precio: t.price,
							gorra: t.gorra,
							cupo: t.capacity,
							vendidas: t.sold,
							reservadas: t.held,
							recaudado: t.revenue,
							pasado_de_cupo: t.over
						})),
						ordenes_por_estado: byStatus
					},
					ordenes: filtered.slice(0, limite).map((o) => ({
						referencia: o.reference,
						nombre: o.name,
						pronombres: o.pronouns || undefined,
						email: o.email,
						tipo: o.type,
						cantidad: o.quantity,
						total: o.total,
						codigo_de_descuento: o.discountCode || undefined,
						medio: o.method,
						estado: STATUS_LABEL[o.status] ?? o.status,
						fecha: new Date(o.createdAt).toISOString(),
						ingresaron: o.checkedIn,
						para_revisar: o.needsReview ? true : undefined
					})),
					ordenes_listadas: Math.min(limite, filtered.length),
					ordenes_en_total: filtered.length,
					panel: eventHref(slug, 'ordenes')
				},
				log: { ...log, detail: { estado } }
			};
		}
	},

	eventos_proximos: {
		definition: {
			name: 'eventos_proximos',
			title: 'Próximos eventos',
			description:
				'Los próximos eventos (desde hoy), del más cercano al más lejano: slug, título, fecha, ' +
				'lugar, si está oculto, sin publicar o es borrador, y si vende entradas, cuántas vendió ' +
				'y su cupo.',
			inputSchema: {
				type: 'object',
				properties: {
					dias: { type: 'integer', minimum: 1, maximum: 365, default: 60 },
					limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 }
				},
				additionalProperties: false
			}
		},
		async run(ctx, args) {
			const dias = intIn(args.dias, 1, 365, 60);
			const limite = intIn(args.limite, 1, 100, 30);
			const from = ctx.now - 12 * 60 * 60 * 1000;
			const to = ctx.now + dias * 24 * 60 * 60 * 1000;
			const upcoming = (await visibleEvents())
				.filter((e) => {
					const t = Date.parse(e.start);
					return Number.isFinite(t) && t >= from && t <= to;
				})
				.sort((a, b) => a.start.localeCompare(b.start))
				.slice(0, limite);
			const [ticketed, counts] = await Promise.all([
				listTicketedEvents(),
				getAllCounts(ctx.db, ctx.now)
			]);
			const configs = new Map(ticketed.map((t) => [t.slug, t.config]));
			const items = upcoming.map((e) => {
				const config = configs.get(e.slug);
				const s = config
					? summarizeEvent({ slug: e.slug, config }, counts.get(e.slug), { now: ctx.now })
					: null;
				return {
					slug: e.slug,
					titulo: e.title,
					inicio: e.start,
					fin: e.end || undefined,
					lugar: e.location || undefined,
					oculto: e.unlisted || undefined,
					sin_publicar: e.unpublished || undefined,
					borrador: e.draft || undefined,
					vende_entradas: Boolean(s),
					...(s ? { vendidas: s.sold, reservadas: s.held, cupo: s.capacity } : {}),
					panel: eventHref(e.slug)
				};
			});
			return {
				result: { eventos: items, total: items.length, hasta_dias: dias },
				log: { summary: `Claude: miró los próximos eventos (${dias} días): ${items.length}` }
			};
		}
	}
};

/** La lista para `tools/list`, todas marcadas como de solo lectura. */
export function toolList() {
	return Object.values(TOOLS).map((t) => ({
		...t.definition,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		}
	}));
}

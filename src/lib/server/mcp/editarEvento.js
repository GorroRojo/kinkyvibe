/**
 * Cambios de un evento del conector de Claude (docs/conector-claude.md, «Cambios»): todo lo que el
 * panel edita en la pestaña Editar, por el mismo guardado.
 *
 * - **Qué se puede cambiar**: lo común con el material (./editarPost.js: título, descripción,
 *   resumen, etiquetas, personas con su rol, visibilidad, imagen de la biblioteca, link y otras
 *   propiedades del texto) y lo propio del evento: fecha y hora, lugar (uno que ya existe), estado
 *   (anunciado, abierto, agotadas) y las entradas (precio fijo, a la gorra o por tandas, y el cupo
 *   de cada tipo; un tipo nuevo también). Los medios de pago, la meta, la lista de espera, la
 *   puerta y lo demás de la venta, desde el panel.
 * - **Nada que mande mails o mueva plata** ({@link eventMailGuard}): cancelar un evento se hace
 *   desde el panel (cierra la lista de espera, que avisa por mail a la gente anotada, y abre
 *   «Reembolsar todas»). Con gente en la lista de espera, tampoco se cambia el estado ni el cupo
 *   (un lugar que se libera le manda la oferta por mail a la próxima persona). Cambiar la fecha sí:
 *   el panel solo anota el cambio y ofrece «Avisar a les compradores», que nunca sale solo.
 * - **Cómo**: igual que el editor del panel (PostEditor.svelte, `build`): el texto del evento con
 *   las propiedades cambiadas (`applyFrontmatterChanges`), la fecha de «Actualizado» de hoy, las
 *   entradas por `applyTicketsToMarkdown`, y el lugar y la imagen en los campos aparte. `aplicar`
 *   lo manda a la acción «Guardar» de la pestaña Editar ({@link savePanelEvent}): las mismas
 *   validaciones, el control de que nadie guardó en el medio, el historial, el lugar, la lista de
 *   espera y el aviso de cambio de fecha. Nunca SQL a mano.
 * - **La versión** de lo que había: la versión del objeto (sube con cada guardado: el texto, el
 *   lugar o la imagen) y el sha del texto (el que el editor manda para que no se pise nada).
 * - **HTML libre**: la descripción se guarda con las reglas de HTML de le admin que autorizó, como
 *   cuando guarda en el panel (les admins son superadmins: HTML libre, decisiones 0003 y 0004).
 */
import { markdownToPost } from '$lib/server/contenido/markdown.js';
import {
	REMOVE,
	addDays,
	applyFrontmatterChanges,
	describeSchedule,
	formatEventDate,
	isValidDate,
	isValidTime,
	joinMarkdown,
	parseEventDate,
	readEventFields,
	splitMarkdown,
	todayInArgentina
} from '$lib/utils/eventDraft.js';
import { scheduleFromInputs, scheduleProblems, scheduleSpan } from '$lib/admin/schedule.js';
import {
	MAX_TIERS,
	TICKET_KEYS,
	applyTicketsToMarkdown,
	emptyTicketType,
	emptyTier,
	readTicketsForm
} from '$lib/utils/ticketsEditor.js';
import {
	extrasSalesFor,
	salesByType,
	ticketsFileErrors,
	waitlistLiveFor
} from '$lib/server/tickets/editor.js';
import { eventVenueChoice, venueOptions } from '$lib/server/amigues/eventFormVenue.js';
import { VENUE_FORM_FIELDS } from '$lib/utils/venueChoice.js';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { activeRoles, personasFileErrors } from '$lib/server/personas/index.js';
import { foldText } from '$lib/utils/text.js';
import { formatARS } from '$lib/utils/money.js';
import { parseDocument } from 'yaml';
import {
	COMMON_BLOCKED,
	COMMON_FIELDS,
	PostChangeError,
	VISIBILITY_VALUES,
	imageField,
	normalizeCommonInputs,
	planCommonChanges,
	postState
} from './editarPost.js';
import { oneLine, runPanelAction } from './objetos.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/venueChoice.js').VenueOption} VenueOption */
/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./editarPost.js').FieldChange} FieldChange */

export { VISIBILITY_VALUES };

/** Un error de las entradas, para devolverle a Claude. */
export const EventChangeError = PostChangeError;

/** Las claves de `cambios` que entiende `editar_evento` (y `editar_objeto` con `tipo: evento`). */
export const EVENT_FIELDS = Object.freeze([
	...COMMON_FIELDS,
	'inicio',
	'fin',
	'lugar',
	'estado',
	'precios',
	'entradas'
]);

/** Los estados que se eligen desde acá (cancelar, desde el panel). */
export const STATUS_VALUES = Object.freeze(['anunciado', 'abierto', 'agotadas']);

/** Las propiedades del evento que no van en `propiedades`. */
const EVENT_BLOCKED = Object.freeze([
	...COMMON_BLOCKED,
	'start',
	'end',
	'status',
	'tickets',
	...TICKET_KEYS,
	'meta_venta',
	'lista_espera'
]);

/** Cancelar, desde el panel (mails y reembolsos). */
export const CANCEL_MESSAGE =
	'Cancelar un evento no se hace desde el conector: cierra la lista de espera (le llega un mail a la gente anotada) y abre «Reembolsar todas». Hacelo desde la ficha del evento en el panel.';

const MAX_PRICE = 10_000_000;
const MAX_CAPACITY = 100_000;

/**
 * Una fecha y hora como la escribe Claude («2026-11-07T22:00», «2026-11-07 22:00», con o sin
 * segundos o «-03:00») → «2026-11-07T22:00» (hora de Argentina), o `null`.
 * @param {unknown} v
 */
export function normalizeDateTime(v) {
	if (typeof v !== 'string') return null;
	const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::00)?(?:-03:00)?$/.exec(v.trim());
	if (!m || !isValidDate(m[1]) || !isValidTime(m[2])) return null;
	return `${m[1]}T${m[2]}`;
}

/** «2026-11-07T22:00-03:00» (o lo que tenga el archivo) → «2026-11-07T22:00», o ''. @param {unknown} v */
function inputOf(v) {
	const { date, time } = parseEventDate(/** @type {any} */ (v));
	return date ? `${date}T${time || '00:00'}` : '';
}

/**
 * Un lugar por nombre o dirección, entre los perfiles de lugar: `{ venue }`, `{ options }` si hay
 * varios o ninguno.
 * @param {VenueOption[]} venues
 * @param {string} query
 */
export function findVenue(venues, query) {
	const bySlug = venues.find((v) => v.slug === query);
	if (bySlug) return { venue: bySlug };
	const f = foldText(query);
	const exact = venues.filter((v) => foldText(v.title) === f);
	if (exact.length === 1) return { venue: exact[0] };
	const words = f.split(/\s+/).filter(Boolean);
	const found = (exact.length ? exact : venues).filter((v) => {
		const hay = foldText(`${v.title} ${v.slug}`);
		return words.length > 0 && words.every((w) => hay.includes(w));
	});
	if (found.length === 1) return { venue: found[0] };
	return { options: found.slice(0, 10).map((v) => ({ slug: v.slug, nombre: v.title })) };
}

/**
 * @typedef {import('./editarPost.js').PostState & {
 *   venue: import('$lib/utils/venueChoice.js').VenueChoice,
 *   venues: VenueOption[]
 * }} EventState
 */

/**
 * Lo que hay ahora de un evento (el texto, su sha, la imagen y el lugar elegido), o `null`.
 * @param {ToolContext} ctx
 * @param {string} slug
 * @returns {Promise<EventState | null>}
 */
export async function eventState(ctx, slug) {
	const post = await postState(ctx, 'calendario', slug);
	if (!post) return null;
	const [venue, venues] = await Promise.all([eventVenueChoice(ctx.db, slug), venueOptions(ctx.db)]);
	return { ...post, venue, venues };
}

/** La versión de lo que hay: la del objeto y el sha del texto. @param {import('./editarPost.js').PostState} s */
export const eventBase = (s) => `${s.object.version}:${s.sha}`;

/**
 * Las entradas de `cambios` normalizadas (con los nombres resueltos contra lo que hay ahora). Tira
 * {@link EventChangeError} con lo que está mal.
 *
 * @param {ToolContext} ctx
 * @param {unknown} raw `cambios`
 * @param {EventState} state
 * @returns {Promise<Record<string, unknown>>}
 */
export async function normalizeEventInputs(ctx, raw, state) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new EventChangeError(
			`\`cambios\` es un objeto con alguno de: ${EVENT_FIELDS.join(', ')}.`
		);
	}
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !EVENT_FIELDS.includes(k));
	if (unknown.length) {
		throw new EventChangeError(
			`No se puede cambiar ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')} desde acá. ` +
				`Lo que sí: ${EVENT_FIELDS.join(', ')}.`
		);
	}
	const out = await normalizeCommonInputs(ctx, input, EVENT_BLOCKED);
	if (input.inicio !== undefined) {
		const d = normalizeDateTime(input.inicio);
		if (!d) throw new EventChangeError('`inicio` va como «AAAA-MM-DDTHH:MM» (hora de Argentina).');
		out.inicio = d;
	}
	if (input.fin !== undefined) {
		if (input.fin === '' || input.fin === null) out.fin = '';
		else {
			const d = normalizeDateTime(input.fin);
			if (!d)
				throw new EventChangeError(
					'`fin` va como «AAAA-MM-DDTHH:MM» (hora de Argentina), o vacío para sacar la hora de fin.'
				);
			out.fin = d;
		}
	}
	if (input.lugar !== undefined) {
		const q = oneLine(input.lugar, 200);
		if (!q) out.lugar = '';
		else {
			const r = findVenue(state.venues, q);
			if (!r.venue) {
				throw new EventChangeError(
					r.options?.length
						? `Hay varios lugares que coinciden con «${q}»: ${r.options
								.map((o) => `${o.nombre} (${o.slug})`)
								.join(', ')}. Volvé a pedir con la dirección (slug).`
						: `No encontré ningún lugar «${q}». Los lugares se crean desde el panel (Eventos → Lugares) o con \`crear_borrador\` (\`tipo: lugar\`).`
				);
			}
			out.lugar = r.venue.slug;
		}
	}
	if (input.estado !== undefined) {
		if (input.estado === 'cancelado') throw new EventChangeError(CANCEL_MESSAGE);
		if (typeof input.estado !== 'string' || !STATUS_VALUES.includes(input.estado))
			throw new EventChangeError(`\`estado\` es uno de: ${STATUS_VALUES.join(', ')}.`);
		out.estado = input.estado;
	}
	/** @type {Array<Record<string | symbol, unknown>>} */
	const tickets = [];
	if (input.precios !== undefined) {
		if (!Array.isArray(input.precios) || !input.precios.length || input.precios.length > 20) {
			throw new EventChangeError(
				'`precios` es una lista de `{ tipo, precio }` (el nombre del tipo de entrada y el precio en pesos).'
			);
		}
		for (const p of input.precios) {
			tickets.push({
				tipo: /** @type {any} */ (p)?.tipo,
				precio: /** @type {any} */ (p)?.precio,
				[ONLY_PRICE]: true
			});
		}
	}
	if (input.entradas !== undefined) {
		if (!Array.isArray(input.entradas) || !input.entradas.length || input.entradas.length > 20) {
			throw new EventChangeError(
				'`entradas` es una lista de tipos de entrada: `{ tipo, precio?, cupo?, a_la_gorra?, tandas? }`.'
			);
		}
		tickets.push(.../** @type {Array<Record<string, unknown>>} */ (input.entradas));
	}
	if (tickets.length) out.entradas = normalizeTickets(tickets, state);
	if (!Object.keys(out).length) throw new EventChangeError('No hay nada para cambiar.');
	return out;
}

/** Marca de una fila que vino de `precios`. */
const ONLY_PRICE = Symbol('precios');

/** Un entero entre `min` y `max`, o un error. @param {unknown} v @param {number} min @param {number} max @param {string} what */
function intField(v, min, max, what) {
	if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
		throw new EventChangeError(`${what} va como un número entero (de ${min} a ${max}).`);
	return v;
}

/**
 * `entradas` (y `precios`) → una fila por tipo, ordenada: `{ tipo, nuevo, precio?, cupo?, gorra?,
 * tandas? }`. `tipo`: el id del tipo que ya existe, o el nombre de uno nuevo.
 *
 * @param {Array<Record<string | symbol, unknown>>} items
 * @param {EventState} state
 */
function normalizeTickets(items, state) {
	const form = readTicketsForm(state.meta);
	if (!form.enabled) {
		throw new EventChangeError(
			'Este evento no vende entradas por el sitio: la venta se prende desde el panel (pestaña Editar → Entradas).'
		);
	}
	/** @type {Map<string, Record<string, unknown>>} */
	const out = new Map();
	for (const item of items) {
		if (!item || typeof item !== 'object')
			throw new EventChangeError('Cada tipo de entrada va como `{ tipo, … }`.');
		const name = oneLine(item.tipo, 100);
		if (!name) throw new EventChangeError('Cada tipo de entrada lleva `tipo` (su nombre).');
		const f = foldText(name);
		const type =
			form.types.find((t) => t.origId === name) ?? form.types.find((t) => foldText(t.name) === f);
		// `precios` (como en #607): solo un tipo que ya existe, con precio fijo.
		if (item[ONLY_PRICE] && !type)
			throw new EventChangeError(
				`No hay un tipo de entrada «${name}». Los tipos de este evento: ${form.types
					.map((t) => t.name || t.origId)
					.join(', ')}. Para sumar uno, usá \`entradas\`.`
			);
		if (item[ONLY_PRICE] && type && type.mode !== 'price')
			throw new EventChangeError(
				`«${type.name}» tiene ${type.mode === 'gorra' ? 'precio a la gorra' : 'precios por tandas'}: eso se cambia con \`entradas\` (\`a_la_gorra\` o \`tandas\`).`
			);
		const key = type ? type.origId || type.name : name;
		/** @type {Record<string, unknown>} */
		const row = { ...(out.get(key) ?? { tipo: key, nuevo: !type }) };
		const modes = ['precio', 'a_la_gorra', 'tandas'].filter((k) => item[k] !== undefined);
		if (modes.length > 1)
			throw new EventChangeError(
				`«${name}»: elegí uno solo entre \`precio\`, \`a_la_gorra\` y \`tandas\`.`
			);
		if (item.precio !== undefined)
			row.precio = intField(item.precio, 0, MAX_PRICE, `El precio de «${name}»`);
		if (item.a_la_gorra !== undefined) {
			const g = /** @type {any} */ (item.a_la_gorra);
			if (!g || typeof g !== 'object')
				throw new EventChangeError(`\`a_la_gorra\` de «${name}» va como \`{ minimo, sugerido }\`.`);
			const minimo = intField(g.minimo ?? 0, 0, MAX_PRICE, `El mínimo de «${name}»`);
			const sugerido =
				g.sugerido === undefined || g.sugerido === null
					? null
					: intField(g.sugerido, 0, MAX_PRICE, `El sugerido de «${name}»`);
			row.gorra = { minimo, sugerido };
		}
		if (item.tandas !== undefined) {
			const list = /** @type {any} */ (item.tandas);
			if (!Array.isArray(list) || !list.length || list.length > MAX_TIERS)
				throw new EventChangeError(
					`\`tandas\` de «${name}» es una lista de 1 a ${MAX_TIERS} \`{ nombre, precio, cantidad?, hasta? }\`.`
				);
			row.tandas = list.map((tr, i) => {
				const tn = oneLine(tr?.nombre, 60);
				if (!tn) throw new EventChangeError(`La tanda ${i + 1} de «${name}» lleva \`nombre\`.`);
				const until =
					tr?.hasta === undefined || tr?.hasta === null || tr?.hasta === ''
						? null
						: normalizeDateTime(tr.hasta);
				if (until === null && tr?.hasta)
					throw new EventChangeError(`\`hasta\` de «${tn}» va como «AAAA-MM-DDTHH:MM».`);
				return {
					nombre: tn,
					precio: intField(tr?.precio, 0, MAX_PRICE, `El precio de «${tn}»`),
					cantidad:
						tr?.cantidad === undefined || tr?.cantidad === null
							? null
							: intField(tr.cantidad, 1, MAX_CAPACITY, `La cantidad de «${tn}»`),
					hasta: until
				};
			});
		}
		if (item.cupo !== undefined) {
			row.cupo =
				item.cupo === null || item.cupo === ''
					? null
					: intField(item.cupo, 0, MAX_CAPACITY, `El cupo de «${name}»`);
		}
		if (!type && row.precio === undefined && !row.gorra && !row.tandas)
			throw new EventChangeError(
				`No hay un tipo de entrada «${name}». Los tipos de este evento: ${form.types
					.map((t) => t.name || t.origId)
					.join(', ')}. Para sumar uno nuevo, mandá su \`precio\` (o \`a_la_gorra\` o \`tandas\`).`
			);
		if (Object.keys(row).length <= 2)
			throw new EventChangeError(`«${name}»: decí qué cambia (precio, cupo, a la gorra o tandas).`);
		out.set(key, row);
	}
	return [...out.values()].sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)));
}

/** @param {string} start @param {string} end */
const scheduleText = (start, end) => (start ? describeSchedule(start, end) : 'sin fecha');

/**
 * Cómo se muestra el precio de un tipo de entrada del formulario.
 * @param {import('$lib/utils/ticketsEditor.js').TicketTypeForm} t
 */
function priceText(t) {
	const money = (/** @type {string} */ v) => (v === '' ? 'sin precio' : formatARS(Number(v)));
	if (t.mode === 'gorra')
		return `a la gorra (mínimo ${money(t.min || '0')}${t.suggested ? `, sugerido ${money(t.suggested)}` : ''})`;
	if (t.mode === 'tiers')
		return `por tandas: ${t.tiers
			.map(
				(tr) =>
					`${tr.name} ${money(tr.price)}${tr.quantity ? ` (${tr.quantity})` : ''}${tr.until ? ` hasta ${tr.until.replace('T', ' ')}` : ''}`
			)
			.join(' → ')}`;
	return money(t.price);
}

/** El cupo de un tipo de entrada del formulario. @param {import('$lib/utils/ticketsEditor.js').TicketTypeForm} t */
const capacityText = (t) => (t.capacity === '' ? 'sin límite' : t.capacity);

/**
 * @typedef {{
 *   content: string,
 *   venue: import('$lib/utils/venueChoice.js').VenueChoice | null,
 *   image: number | null | undefined,
 *   changes: FieldChange[],
 *   warnings: string[]
 * }} EventPlan
 */

/**
 * Arma el cambio: el texto nuevo (como lo armaría el editor del panel), el lugar, la imagen y el
 * antes y después en palabras. Valida con las reglas del panel (fecha, entradas, propiedades,
 * etiquetas, personas) y con {@link eventMailGuard}. Tira {@link EventChangeError} si algo no se
 * puede.
 *
 * @param {ToolContext} ctx
 * @param {string} slug
 * @param {EventState} state
 * @param {Record<string, any>} inputs ya normalizadas
 * @param {{ today?: string }} [opts]
 * @returns {Promise<EventPlan>}
 */
export async function planEventChange(
	ctx,
	slug,
	state,
	inputs,
	{ today = todayInArgentina() } = {}
) {
	const common = await planCommonChanges(ctx, state, inputs);
	const changes = [...common.changes];
	/** @type {string[]} */
	const warnings = [];
	/** @type {Record<string, any>} */
	const fm = { updated_date: today, ...common.fm };

	// Fecha y hora: como «Fecha y hora» del editor. Si cambia el inicio y no se dice el fin, el fin
	// sigue al inicio con la misma duración en días (endDateFollowingStart) y la misma hora.
	const oldStart = inputOf(state.meta.start);
	const oldEnd = inputOf(state.meta.end);
	if (inputs.inicio !== undefined || inputs.fin !== undefined) {
		const startIn = inputs.inicio ?? oldStart;
		let endIn = inputs.fin ?? oldEnd;
		if (inputs.inicio !== undefined && inputs.fin === undefined && oldEnd && oldStart) {
			const span = scheduleSpan(scheduleFromInputs(oldStart, oldEnd), { fixSameDayTypo: true });
			endIn = `${addDays(startIn.slice(0, 10), span)}T${oldEnd.slice(11)}`;
		}
		const schedule = scheduleFromInputs(startIn, endIn);
		const problems = scheduleProblems(schedule);
		if (problems.length) throw new EventChangeError(`Fecha y hora: ${problems.join(' ')}`);
		const [sd, st] = startIn.split('T');
		const start = formatEventDate(sd, st);
		const end = endIn ? formatEventDate(endIn.slice(0, 10), endIn.slice(11)) : '';
		const before = scheduleText(String(state.meta.start ?? ''), String(state.meta.end ?? ''));
		const after = scheduleText(start, end);
		if (startIn !== oldStart || endIn !== oldEnd) {
			if (startIn !== oldStart) fm.start = start;
			if (endIn !== oldEnd) fm.end = end || null;
			changes.push({ campo: 'fecha y hora', antes: before, despues: after });
			const sales = await salesByType(ctx.db, slug);
			const sold = sales ? Object.values(sales).reduce((n, s) => n + s.sold, 0) : 0;
			if (sold > 0) {
				warnings.push(
					`Tiene ${sold === 1 ? '1 entrada vendida' : `${sold} entradas vendidas`}: después, la ficha del evento ofrece «Avisar a les compradores» (no se manda nada solo).`
				);
			}
		}
	}

	if (inputs.estado !== undefined) {
		const before = String(state.meta.status ?? '');
		if (inputs.estado !== before) {
			fm.status = inputs.estado;
			changes.push({ campo: 'estado', antes: before || '(sin estado)', despues: inputs.estado });
		}
	}

	/** @type {import('$lib/utils/venueChoice.js').VenueChoice | null} */
	let venue = null;
	if (inputs.lugar !== undefined) {
		const current = state.venues.find((v) => v.id === state.venue.venueId) ?? null;
		const next = inputs.lugar ? state.venues.find((v) => v.slug === inputs.lugar) : null;
		if (inputs.lugar && !next) throw new EventChangeError('Ese lugar ya no existe.');
		if ((next?.id ?? null) !== state.venue.venueId) {
			venue = { venueId: next?.id ?? null, privacy: null };
			changes.push({
				campo: 'lugar',
				antes: current ? current.title : 'sin lugar elegido',
				despues: next ? next.title : 'sin lugar elegido'
			});
		}
	}

	// Entradas: como el editor, siempre por applyTicketsToMarkdown (con el lugar que va a quedar).
	const initialTickets = readTicketsForm(state.meta);
	const tickets = readTicketsForm(state.meta);
	if (inputs.entradas !== undefined) {
		for (const row of /** @type {Array<Record<string, any>>} */ (inputs.entradas)) {
			const i = initialTickets.types.findIndex((t) => (t.origId || t.name) === row.tipo);
			if (i < 0 && !row.nuevo)
				throw new EventChangeError(`Ese tipo de entrada ya no está: ${row.tipo}.`);
			const t = i >= 0 ? tickets.types[i] : { ...emptyTicketType(), name: row.tipo };
			const was = i >= 0 ? initialTickets.types[i] : null;
			if (row.precio !== undefined) {
				t.mode = 'price';
				t.price = String(row.precio);
			}
			if (row.gorra) {
				t.mode = 'gorra';
				t.min = String(row.gorra.minimo);
				t.suggested = row.gorra.sugerido === null ? '' : String(row.gorra.sugerido);
			}
			if (row.tandas) {
				t.mode = 'tiers';
				const old = i >= 0 ? initialTickets.types[i].tiers : [];
				t.tiers = row.tandas.map((/** @type {any} */ tr, /** @type {number} */ n) => {
					const kept = old.find((o) => foldText(o.name) === foldText(tr.nombre));
					return {
						...(kept ?? emptyTier(n)),
						name: tr.nombre,
						price: String(tr.precio),
						quantity: tr.cantidad === null ? '' : String(tr.cantidad),
						until: tr.hasta ?? ''
					};
				});
			}
			if (row.cupo !== undefined) t.capacity = row.cupo === null ? '' : String(row.cupo);
			if (i < 0) tickets.types.push(t);
			const name = t.name || row.tipo;
			if (!was) {
				changes.push({
					campo: `entrada nueva «${name}»`,
					antes: '',
					despues: `${priceText(t)}; cupo: ${capacityText(t)}`
				});
			} else {
				if (priceText(t) !== priceText(was))
					changes.push({
						campo: `precio de «${name}»`,
						antes: priceText(was),
						despues: priceText(t)
					});
				if (capacityText(t) !== capacityText(was))
					changes.push({
						campo: `cupo de «${name}»`,
						antes: capacityText(was),
						despues: capacityText(t)
					});
			}
		}
	}

	if (!changes.length) throw new EventChangeError('Eso ya está así: no hay nada para cambiar.');

	const hasVenue = (venue ? venue.venueId : state.venue.venueId) != null;
	let content;
	try {
		const md = joinMarkdown(applyFrontmatterChanges(state.frontmatter, fm), common.body);
		content = applyTicketsToMarkdown(md, tickets, initialTickets, { hasVenue });
	} catch (e) {
		throw new EventChangeError(`No se pudo armar el cambio: ${/** @type {Error} */ (e).message}`);
	}
	await checkEventContent(ctx, slug, state, content, { tagsChanged: 'etiquetas' in inputs });
	return { content, venue, image: common.image, changes, warnings };
}

/**
 * Las reglas del panel sobre el texto nuevo, antes de mostrar nada: las entradas (solo lo que
 * agrega este cambio, como el editor), las propiedades, las etiquetas, las personas y
 * {@link eventMailGuard}. Tira {@link EventChangeError}.
 *
 * @param {ToolContext} ctx
 * @param {string} slug
 * @param {EventState} state
 * @param {string} content
 * @param {{ tagsChanged?: boolean }} [opts]
 */
export async function checkEventContent(ctx, slug, state, content, { tagsChanged = true } = {}) {
	const [sales, waitlistLive, roles, extrasSales] = await Promise.all([
		salesByType(ctx.db, slug),
		waitlistLiveFor(ctx.db, slug),
		activeRoles(ctx.platform).catch(() => null),
		extrasSalesFor(ctx.db, slug)
	]);
	await eventMailGuard(state.meta, content, waitlistLive);
	const opts = { sales, waitlistLive, extrasSales };
	const before = ticketsFileErrors(state.raw, opts);
	const added = ticketsFileErrors(content, opts).filter((e) => !before.includes(e));
	if (added.length) throw new EventChangeError(added.join(' '));
	const mapped = markdownToPost('calendario', slug, content);
	if (mapped.error) throw new EventChangeError(`Revisá los datos: ${mapped.error}`);
	if (tagsChanged) {
		/** @type {string[]} */
		let tagErrors = [];
		try {
			tagErrors = validateEventTags(readEventFields(splitMarkdown(content).frontmatter).tags);
		} catch {
			tagErrors = [];
		}
		if (tagErrors.length) throw new EventChangeError(tagErrors.join(' '));
	}
	if (roles) {
		const was = personasFileErrors(state.raw, roles);
		const now = personasFileErrors(content, roles).filter((e) => !was.includes(e));
		if (now.length) throw new EventChangeError(now.join(' '));
	}
}

/** Lo de la venta que puede liberar lugares (todo menos los precios). @param {Record<string, any>} meta */
function capacitySignature(meta) {
	const strip = (/** @type {any} */ t) => {
		if (!t || typeof t !== 'object') return t;
		// eslint-disable-next-line no-unused-vars
		const { price, door_price, a_la_gorra, tiers, ...rest } = t;
		return {
			...rest,
			tiers: Array.isArray(tiers)
				? tiers.map((/** @type {any} */ tr) => ({ quantity: tr?.quantity, until: tr?.until }))
				: null
		};
	};
	return JSON.stringify({
		tickets: Array.isArray(meta.tickets) ? meta.tickets.map(strip) : (meta.tickets ?? null),
		open: meta.tickets_open ?? null,
		close: meta.tickets_close ?? null,
		status: meta.status ?? null
	});
}

/**
 * Nada que mande mails ni mueva plata: tira {@link EventChangeError} si el texto nuevo cancela el
 * evento, o si hay gente en la lista de espera y cambia el estado o algo de la venta que no sea
 * un precio (el cupo, un tipo nuevo, las tandas, el cierre): un lugar que se libera le manda la
 * oferta por mail a la próxima persona de la lista.
 *
 * @param {Record<string, any>} beforeMeta las propiedades de ahora
 * @param {string} content el texto nuevo
 * @param {Record<string, number> | null} waitlistLive gente anotada, por alcance
 */
export async function eventMailGuard(beforeMeta, content, waitlistLive) {
	let after;
	try {
		after = parseDocument(splitMarkdown(content).frontmatter).toJS() ?? {};
	} catch {
		return; // lo marca la validación de siempre
	}
	if (after.status === 'cancelado' && beforeMeta.status !== 'cancelado') {
		throw new EventChangeError(CANCEL_MESSAGE);
	}
	const live = waitlistLive ? Object.values(waitlistLive).reduce((n, c) => n + (c || 0), 0) : 0;
	if (live > 0 && capacitySignature(after) !== capacitySignature(beforeMeta)) {
		throw new EventChangeError(
			`Este evento tiene ${live === 1 ? '1 persona' : `${live} personas`} en la lista de espera: cambiar el estado o la venta (el cupo, las tandas, un tipo nuevo, el cierre) puede mandarles la oferta por mail. Eso se cambia desde el panel. Los precios sí se pueden cambiar desde acá.`
		);
	}
}

/**
 * El «Guardar» de la pestaña Editar del panel, con un pedido armado como el del formulario.
 * Devuelve `{ ok: true }` o el mensaje del panel.
 *
 * @param {ToolContext} ctx
 * @param {{ slug: string, content: string, sha: string, venue: import('$lib/utils/venueChoice.js').VenueChoice | null, image?: number | null }} change
 *   `image`: la imagen de la biblioteca (`null` = sacarla; sin pasar, como está)
 * @returns {Promise<{ ok: true, warnings: string[] } | { ok: false, message: string }>}
 */
export async function savePanelEvent(ctx, { slug, content, sha, venue, image }) {
	const { actions } =
		await import('../../../routes/(authed)/admin/eventos/[slug]/editar/+page.server.js');
	const form = new FormData();
	form.set('content', content);
	form.set('sha', sha);
	form.set('eol', 'lf');
	form.set('imageId', imageField(image));
	if (venue) {
		form.set(VENUE_FORM_FIELDS.touched, '1');
		form.set(VENUE_FORM_FIELDS.venue, venue.venueId === null ? '' : String(venue.venueId));
		form.set(VENUE_FORM_FIELDS.privacy, venue.privacy ?? '');
	}
	const result = /** @type {any} */ (
		await runPanelAction(ctx, actions.save, {
			path: `/admin/eventos/${encodeURIComponent(slug)}/editar?/save`,
			params: { slug },
			form
		})
	);
	if (result && typeof result === 'object' && 'save' in result) {
		return { ok: true, warnings: Array.isArray(result.warnings) ? result.warnings : [] };
	}
	const message =
		typeof result?.data?.error === 'string' ? result.data.error : 'No se pudo guardar.';
	return { ok: false, message };
}

export { REMOVE };

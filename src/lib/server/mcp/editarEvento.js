/**
 * Cambio `editar_evento` del conector de Claude (docs/conector-claude.md, «Cambios»): los datos de
 * un evento que el panel edita en su pestaña Editar, por el mismo guardado.
 *
 * - **Qué se puede cambiar**: título, fecha y hora (inicio y fin), lugar (un lugar que ya existe,
 *   por nombre o dirección), descripción (el texto), precios (el precio fijo de un tipo de entrada
 *   que ya existe) y si está listado. Los precios por tandas o a la gorra, el cupo, los medios de
 *   pago y lo demás de la venta, desde el panel.
 * - **Cómo**: igual que el editor del panel (PostEditor.svelte, `build`): el texto del evento con
 *   las propiedades cambiadas (`applyFrontmatterChanges`), la fecha de «Actualizado» de hoy, las
 *   entradas por `applyTicketsToMarkdown` y el lugar en los campos aparte. `aplicar` lo manda a la
 *   acción «Guardar» de la pestaña Editar ({@link savePanelEvent}): las mismas validaciones, el
 *   control de que nadie guardó en el medio (`FileChangedError`), el historial, el lugar, la lista
 *   de espera y el aviso de cambio de fecha. Nunca SQL a mano.
 * - **La versión** de lo que había: el sha del texto del evento (el mismo que el editor manda para
 *   que no se pise nada) y el lugar elegido (que no está en el texto).
 * - **Descripción con HTML libre**: si el texto del evento se muestra con HTML libre, no se cambia
 *   desde acá (se haría con la lista corta y se podría perder algo): desde el panel.
 */
import { findDbEvent } from '$lib/server/contenido/repo.js';
import { markdownToPost } from '$lib/server/contenido/markdown.js';
import {
	addDays,
	applyFrontmatterChanges,
	describeSchedule,
	formatEventDate,
	isValidDate,
	isValidTime,
	joinMarkdown,
	parseEventDate,
	splitMarkdown,
	todayInArgentina
} from '$lib/utils/eventDraft.js';
import { scheduleFromInputs, scheduleProblems, scheduleSpan } from '$lib/admin/schedule.js';
import { applyTicketsToMarkdown, readTicketsForm } from '$lib/utils/ticketsEditor.js';
import { salesByType, ticketsFileErrors, waitlistLiveFor } from '$lib/server/tickets/editor.js';
import { eventVenueChoice, venueOptions } from '$lib/server/amigues/eventFormVenue.js';
import { VENUE_FORM_FIELDS } from '$lib/utils/venueChoice.js';
import { foldText } from '$lib/utils/text.js';
import { formatARS } from '$lib/utils/money.js';
import { parseDocument } from 'yaml';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/venueChoice.js').VenueOption} VenueOption */

/** Las claves de `cambios` que entiende `editar_evento`. */
export const EVENT_FIELDS = Object.freeze([
	'titulo',
	'inicio',
	'fin',
	'lugar',
	'descripcion',
	'precios',
	'visibilidad'
]);

/** Los valores de `visibilidad` (el «No listado» del editor). */
export const VISIBILITY_VALUES = Object.freeze(['listado', 'no_listado']);

const VISIBILITY_TEXT = /** @type {Record<string, string>} */ ({
	listado: 'listado (aparece en las listas)',
	no_listado: 'no listado (no aparece en las listas; se ve con el link)'
});

const MAX_TITLE = 200;
const MAX_BODY = 20000;
const MAX_PRICE = 10_000_000;

/** Un error de las entradas, para devolverle a Claude. */
export class EventChangeError extends Error {}

/** Texto en una línea, sin caracteres de control. @param {unknown} v @param {number} max */
function oneLine(v, max) {
	return typeof v === 'string'
		? v
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, max)
		: '';
}

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

/** El texto de la descripción como queda en el archivo. @param {string} text */
const bodyOf = (text) => `\n${text}\n`;

/** La descripción normalizada (saltos de línea LF, sin espacios de más al final). @param {unknown} v */
function normalizeBody(v) {
	if (typeof v !== 'string') return null;
	const text = v
		.replace(/\r\n?/g, '\n')
		// eslint-disable-next-line no-control-regex -- sin caracteres de control (salvo el salto y el tab)
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
		.replace(/[ \t]+$/gm, '')
		.trim();
	return text.length <= MAX_BODY ? text : null;
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
 * @typedef {{
 *   raw: string,
 *   sha: string,
 *   meta: Record<string, any>,
 *   frontmatter: string,
 *   body: string,
 *   bodyHtml: string | null,
 *   title: string,
 *   venue: import('$lib/utils/venueChoice.js').VenueChoice,
 *   venues: VenueOption[]
 * }} EventState
 */

/**
 * Lo que hay ahora de un evento (el texto, su sha y el lugar elegido), o `null` si no está.
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<EventState | null>}
 */
export async function eventState(db, slug) {
	const file = await findDbEvent(db, slug);
	if (!file || file.deleted) return null;
	const { frontmatter, body } = splitMarkdown(file.raw);
	const doc = parseDocument(frontmatter);
	if (doc.errors.length) {
		throw new EventChangeError(
			'Las propiedades de este evento tienen un error de formato: arreglalo desde el panel.'
		);
	}
	const [venue, venues] = await Promise.all([eventVenueChoice(db, slug), venueOptions(db)]);
	const bodyHtml = file.object.data?.body_html;
	return {
		raw: file.raw,
		sha: file.sha,
		meta: doc.toJS() ?? {},
		frontmatter,
		body,
		bodyHtml: typeof bodyHtml === 'string' ? bodyHtml : null,
		title: file.object.title,
		venue,
		venues
	};
}

/** La versión de lo que hay: el sha del texto y el lugar elegido. @param {EventState} s */
export const eventBase = (s) => `${s.sha}:${s.venue.venueId ?? '-'}:${s.venue.privacy ?? '-'}`;

/**
 * Las entradas de `cambios` normalizadas (con los nombres resueltos contra lo que hay ahora). Tira
 * {@link EventChangeError} con lo que está mal.
 *
 * @param {unknown} raw `cambios`
 * @param {EventState} state
 * @returns {Record<string, unknown>}
 */
export function normalizeEventInputs(raw, state) {
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
	/** @type {Record<string, unknown>} */
	const out = {};
	if (input.titulo !== undefined) {
		const t = oneLine(input.titulo, MAX_TITLE + 1);
		if (!t) throw new EventChangeError('El título no puede quedar vacío.');
		if (t.length > MAX_TITLE)
			throw new EventChangeError(`El título puede tener hasta ${MAX_TITLE} caracteres.`);
		out.titulo = t;
	}
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
						: `No encontré ningún lugar «${q}». Los lugares se crean desde el panel (Eventos → Lugares).`
				);
			}
			out.lugar = r.venue.slug;
		}
	}
	if (input.descripcion !== undefined) {
		const b = normalizeBody(input.descripcion);
		if (b === null)
			throw new EventChangeError(`La descripción puede tener hasta ${MAX_BODY} caracteres.`);
		if (!b) throw new EventChangeError('La descripción no puede quedar vacía.');
		out.descripcion = b;
	}
	if (input.precios !== undefined) out.precios = normalizePrices(input.precios, state);
	if (input.visibilidad !== undefined) {
		if (typeof input.visibilidad !== 'string' || !VISIBILITY_VALUES.includes(input.visibilidad))
			throw new EventChangeError(`\`visibilidad\` es una de: ${VISIBILITY_VALUES.join(', ')}.`);
		out.visibilidad = input.visibilidad;
	}
	if (!Object.keys(out).length) throw new EventChangeError('No hay nada para cambiar.');
	return out;
}

/**
 * `precios` → `[{ tipo: <id o nombre del tipo>, precio }]`, ordenado. Solo tipos con precio fijo
 * que ya existen.
 * @param {unknown} raw
 * @param {EventState} state
 */
function normalizePrices(raw, state) {
	if (!Array.isArray(raw) || !raw.length || raw.length > 20) {
		throw new EventChangeError(
			'`precios` es una lista de `{ tipo, precio }` (el nombre del tipo de entrada y el precio en pesos).'
		);
	}
	const form = readTicketsForm(state.meta);
	if (!form.enabled || !form.types.length) {
		throw new EventChangeError(
			'Este evento no vende entradas por el sitio: no tiene precios para cambiar.'
		);
	}
	/** @type {Map<string, number>} */
	const out = new Map();
	for (const item of raw) {
		const tipo = oneLine(/** @type {any} */ (item)?.tipo, 100);
		const precio = /** @type {any} */ (item)?.precio;
		const f = foldText(tipo);
		const type =
			form.types.find((t) => t.origId === tipo) ?? form.types.find((t) => foldText(t.name) === f);
		if (!type) {
			throw new EventChangeError(
				`No hay un tipo de entrada «${tipo}». Los tipos de este evento: ${form.types.map((t) => t.name || t.origId).join(', ')}.`
			);
		}
		if (type.mode !== 'price') {
			throw new EventChangeError(
				`«${type.name}» tiene ${type.mode === 'gorra' ? 'precio a la gorra' : 'precios por tandas'}: eso se cambia desde el panel.`
			);
		}
		if (
			typeof precio !== 'number' ||
			!Number.isSafeInteger(precio) ||
			precio < 0 ||
			precio > MAX_PRICE
		) {
			throw new EventChangeError(`El precio de «${type.name}» va en pesos, un número entero.`);
		}
		out.set(type.origId || type.name, precio);
	}
	return [...out]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([tipo, precio]) => ({ tipo, precio }));
}

/**
 * @typedef {{ campo: string, antes: string, despues: string }} FieldChange
 *
 * @typedef {{
 *   content: string,
 *   venue: import('$lib/utils/venueChoice.js').VenueChoice | null,
 *   changes: FieldChange[],
 *   warnings: string[]
 * }} EventPlan
 */

/** @param {string} start @param {string} end */
const scheduleText = (start, end) => (start ? describeSchedule(start, end) : 'sin fecha');

/** @param {string} s */
const short = (s) => {
	const one = s.replace(/\s+/g, ' ').trim();
	return one.length > 160 ? `${one.slice(0, 160)}… (${s.length} caracteres)` : one || '(vacía)';
};

/**
 * Arma el cambio: el texto nuevo (como lo armaría el editor del panel), el lugar y el antes y
 * después en palabras. Valida con las reglas del panel (fecha, entradas, propiedades). Tira
 * {@link EventChangeError} si algo no se puede.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {EventState} state
 * @param {Record<string, any>} inputs ya normalizadas
 * @param {{ today?: string }} [opts]
 * @returns {Promise<EventPlan>}
 */
export async function planEventChange(
	db,
	slug,
	state,
	inputs,
	{ today = todayInArgentina() } = {}
) {
	/** @type {FieldChange[]} */
	const changes = [];
	/** @type {string[]} */
	const warnings = [];
	/** @type {Record<string, any>} */
	const fm = { updated_date: today };

	if (inputs.titulo !== undefined && inputs.titulo !== state.title) {
		fm.title = inputs.titulo;
		changes.push({ campo: 'título', antes: state.title, despues: inputs.titulo });
	}

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
			const sales = await salesByType(db, slug);
			const sold = sales ? Object.values(sales).reduce((n, s) => n + s.sold, 0) : 0;
			if (sold > 0) {
				warnings.push(
					`Tiene ${sold === 1 ? '1 entrada vendida' : `${sold} entradas vendidas`}: después, la ficha del evento ofrece «Avisar a les compradores» (no se manda nada solo).`
				);
			}
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

	let body = state.body;
	if (inputs.descripcion !== undefined) {
		const before = state.body.trim();
		if (inputs.descripcion !== before) {
			if (state.bodyHtml === 'libre') {
				throw new EventChangeError(
					'El texto de este evento se muestra con HTML libre: la descripción se cambia desde el panel.'
				);
			}
			body = bodyOf(inputs.descripcion);
			changes.push({
				campo: 'descripción',
				antes: short(before),
				despues: short(inputs.descripcion)
			});
		}
	}

	// Entradas: como el editor, siempre por applyTicketsToMarkdown (con el lugar que va a quedar).
	const initialTickets = readTicketsForm(state.meta);
	const tickets = readTicketsForm(state.meta);
	if (inputs.precios !== undefined) {
		for (const { tipo, precio } of /** @type {{ tipo: string, precio: number }[]} */ (
			inputs.precios
		)) {
			const i = initialTickets.types.findIndex((t) => (t.origId || t.name) === tipo);
			const t = i >= 0 ? tickets.types[i] : undefined;
			if (!t || t.mode !== 'price')
				throw new EventChangeError(`Ese tipo de entrada ya no está: ${tipo}.`);
			const before = Number(initialTickets.types[i].price);
			if (String(precio) !== initialTickets.types[i].price) {
				t.price = String(precio);
				changes.push({
					campo: `precio de «${t.name || tipo}»`,
					antes:
						Number.isFinite(before) && initialTickets.types[i].price !== ''
							? formatARS(before)
							: 'sin precio',
					despues: formatARS(precio)
				});
			}
		}
	}

	if (!changes.length) throw new EventChangeError('Eso ya está así: no hay nada para cambiar.');

	const hasVenue = (venue ? venue.venueId : state.venue.venueId) != null;
	let content;
	try {
		const md = joinMarkdown(applyFrontmatterChanges(state.frontmatter, fm), body);
		content = applyTicketsToMarkdown(md, tickets, initialTickets, { hasVenue });
	} catch (e) {
		throw new EventChangeError(`No se pudo armar el cambio: ${/** @type {Error} */ (e).message}`);
	}

	// Las reglas del panel: las entradas (solo lo que agrega este cambio, como el editor) y las
	// propiedades del evento.
	const [sales, waitlistLive] = await Promise.all([
		salesByType(db, slug),
		waitlistLiveFor(db, slug)
	]);
	const opts = { sales, waitlistLive };
	const before = ticketsFileErrors(state.raw, opts);
	const added = ticketsFileErrors(content, opts).filter((e) => !before.includes(e));
	if (added.length) throw new EventChangeError(added.join(' '));
	const mapped = markdownToPost('calendario', slug, content);
	if (mapped.error) throw new EventChangeError(`Revisá los datos: ${mapped.error}`);

	return { content, venue, changes, warnings };
}

/**
 * El «Guardar» de la pestaña Editar del panel, con un pedido armado como el del formulario.
 * Devuelve `{ ok: true }` o el mensaje del panel.
 *
 * @param {{ db: D1Database, platform?: App.Platform, fetch: typeof fetch, origin: string, user: { id: number, login: string } }} ctx
 * @param {{ slug: string, content: string, sha: string, venue: import('$lib/utils/venueChoice.js').VenueChoice | null }} change
 * @returns {Promise<{ ok: true, warnings: string[] } | { ok: false, message: string }>}
 */
export async function savePanelEvent(ctx, { slug, content, sha, venue }) {
	const { actions } =
		await import('../../../routes/(authed)/admin/eventos/[slug]/editar/+page.server.js');
	const form = new FormData();
	form.set('content', content);
	form.set('sha', sha);
	form.set('eol', 'lf');
	if (venue) {
		form.set(VENUE_FORM_FIELDS.touched, '1');
		form.set(VENUE_FORM_FIELDS.venue, venue.venueId === null ? '' : String(venue.venueId));
		form.set(VENUE_FORM_FIELDS.privacy, venue.privacy ?? '');
	}
	const url = new URL(`${ctx.origin}/admin/eventos/${encodeURIComponent(slug)}/editar?/save`);
	const event = {
		params: { slug },
		locals: {
			user: { id: ctx.user.id, login: ctx.user.login, name: null },
			user_token: 'conector-claude'
		},
		request: new Request(url, { method: 'POST', body: form }),
		url,
		platform: ctx.platform,
		fetch: ctx.fetch
	};
	const result = /** @type {any} */ (await actions.save(/** @type {any} */ (event)));
	if (result && typeof result === 'object' && 'save' in result) {
		return { ok: true, warnings: Array.isArray(result.warnings) ? result.warnings : [] };
	}
	const message =
		typeof result?.data?.error === 'string' ? result.data.error : 'No se pudo guardar.';
	return { ok: false, message };
}

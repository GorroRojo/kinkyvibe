/**
 * Agenda editable del panel (/admin/eventos/agenda): una fila por evento próximo, como la
 * planilla de planificación, con los campos principales editables en el lugar.
 *
 * Funciones puras compartidas por la página (validación en vivo) y por el servidor (validación
 * de nuevo, detección de conflictos y cambios en el archivo del evento):
 * - `agendaRowFromMeta`: la fila a partir del frontmatter de un evento;
 * - `validateAgendaRow`: errores por campo;
 * - `changedAgendaFields`: qué campos cambian entre dos versiones de una fila;
 * - `applyAgendaChange`: aplica un cambio a un archivo (frontmatter + cuerpo), sin tocar lo demás,
 *   y avisa si alguien cambió esos mismos campos mientras tanto.
 */
import {
	REMOVE,
	addDays,
	applyFrontmatterChanges,
	daysBetween,
	formatEventDate,
	isValidDate,
	isValidTime,
	joinMarkdown,
	parseEventDate,
	readEventFields,
	splitMarkdown,
	validateSchedule
} from './eventDraft.js';
import { splitEventTags } from './adminTags.js';

/** Estados que se eligen en la agenda (cómo se ve el evento en el sitio). */
export const AGENDA_STATES = /** @type {const} */ ([
	{ value: 'publicado', label: 'Publicado', help: 'Aparece en el calendario y en las listas' },
	{ value: 'no-listado', label: 'No listado', help: 'Solo se ve con el link (borrador)' },
	{ value: 'cancelado', label: 'Cancelado', help: 'Se muestra como cancelado' }
]);

/** @typedef {'publicado' | 'no-listado' | 'cancelado'} AgendaState */

/** Campos editables de una fila, en el orden de las columnas. */
export const AGENDA_FIELDS = /** @type {const} */ ([
	'date',
	'startTime',
	'endTime',
	'title',
	'locationName',
	'place',
	'state'
]);

/** @typedef {(typeof AGENDA_FIELDS)[number]} AgendaField */

/** Nombres de los campos para los mensajes. */
export const AGENDA_FIELD_LABELS = /** @type {Record<AgendaField, string>} */ ({
	date: 'Fecha',
	startTime: 'Empieza',
	endTime: 'Termina',
	title: 'Título',
	locationName: 'Lugar',
	place: 'Región',
	state: 'Estado'
});

/** Largo máximo de los textos de una fila (un título real tiene < 120). */
export const AGENDA_MAX_TEXT = 200;

/**
 * @typedef {{
 *   date: string, startTime: string, endTime: string, title: string, locationName: string,
 *   place: string, state: AgendaState
 * }} AgendaValues
 */
/**
 * @typedef {AgendaValues & {
 *   slug: string,
 *   endDays: number,
 *   status: string
 * }} AgendaRow
 * `endDays`: días entre el inicio y el final en el archivo (0 = termina el mismo día). Solo se
 * respeta si es 2 o más (eventos de varios días); si no, se deduce de las horas.
 * `status`: el `status` del archivo (anunciado, abierto…), para mostrar.
 */

/**
 * @param {{ status?: unknown, force_unlisted?: unknown }} meta
 * @returns {AgendaState}
 */
export function agendaState(meta) {
	if (meta.status === 'cancelado') return 'cancelado';
	if (meta.force_unlisted === true) return 'no-listado';
	return 'publicado';
}

/**
 * La fila de un evento a partir de su frontmatter (el de `readEventFields` o el del bundle).
 *
 * @param {string} slug
 * @param {{ title?: unknown, start?: unknown, end?: unknown, location_name?: unknown,
 *   tags?: unknown, status?: unknown, force_unlisted?: unknown }} meta
 * @returns {AgendaRow}
 */
export function agendaRowFromMeta(slug, meta) {
	const start = parseEventDate(/** @type {any} */ (meta.start));
	const end = parseEventDate(/** @type {any} */ (meta.end));
	const tags = Array.isArray(meta.tags)
		? meta.tags.map(String)
		: meta.tags
			? [String(meta.tags)]
			: [];
	return {
		slug,
		title: String(meta.title ?? '').trim(),
		date: start.date,
		startTime: start.time,
		endTime: end.time,
		endDays: start.date && end.date ? Math.max(0, daysBetween(start.date, end.date)) : 0,
		locationName: meta.location_name ? String(meta.location_name).trim() : '',
		place: splitEventTags(tags).place,
		state: agendaState(meta),
		status: String(meta.status ?? '')
	};
}

/**
 * Días entre el inicio y el final para guardar: los eventos de varios días (2 o más) lo
 * conservan; si no, termina el día siguiente cuando la hora de fin no es posterior a la de inicio
 * (una fiesta de 22:00 a 03:00).
 *
 * @param {Pick<AgendaRow, 'startTime' | 'endTime'> & { endDays?: number }} row
 */
export function endDaysFor(row) {
	if ((row.endDays ?? 0) >= 2) return /** @type {number} */ (row.endDays);
	return row.endTime && row.startTime && row.endTime <= row.startTime ? 1 : 0;
}

/**
 * `start` y `end` en el formato del sitio para una fila (end vacío si no tiene hora de fin).
 *
 * @param {Pick<AgendaRow, 'date' | 'startTime' | 'endTime'> & { endDays?: number }} row
 */
export function agendaSchedule(row) {
	const start = formatEventDate(row.date, row.startTime);
	const end = row.endTime ? formatEventDate(addDays(row.date, endDaysFor(row)), row.endTime) : '';
	return { start, end };
}

/**
 * Errores por campo de una fila ({} = está bien).
 *
 * @param {Partial<AgendaValues> & { endDays?: number }} row
 * @param {{ places: string[], allowEmptyPlace?: boolean }} options `places`: las regiones
 *   válidas (hojas de "lugar"); `allowEmptyPlace`: si el evento ya no tenía región (no se obliga a
 *   elegirla para cambiar otra cosa).
 * @returns {Partial<Record<AgendaField, string>>}
 */
export function validateAgendaRow(row, { places, allowEmptyPlace = false }) {
	/** @type {Partial<Record<AgendaField, string>>} */
	const errors = {};
	const title = String(row.title ?? '');
	if (!title.trim()) errors.title = 'Falta el título.';
	else if (title.length > AGENDA_MAX_TEXT) errors.title = `Máximo ${AGENDA_MAX_TEXT} caracteres.`;
	else if (/[\r\n]/.test(title)) errors.title = 'El título va en una sola línea.';
	if (!isValidDate(String(row.date ?? ''))) errors.date = 'Fecha inválida.';
	if (!isValidTime(String(row.startTime ?? ''))) errors.startTime = 'Hora inválida (hh:mm).';
	if (row.endTime && !isValidTime(String(row.endTime))) errors.endTime = 'Hora inválida (hh:mm).';
	const locationName = String(row.locationName ?? '');
	if (locationName.length > AGENDA_MAX_TEXT)
		errors.locationName = `Máximo ${AGENDA_MAX_TEXT} caracteres.`;
	else if (/[\r\n]/.test(locationName)) errors.locationName = 'Va en una sola línea.';
	const place = String(row.place ?? '');
	if (place ? !places.includes(place) : !allowEmptyPlace) errors.place = 'Elegí una región.';
	if (!AGENDA_STATES.some((s) => s.value === row.state)) errors.state = 'Estado inválido.';
	if (!errors.date && !errors.startTime && !errors.endTime && row.endTime) {
		const { start, end } = agendaSchedule(/** @type {AgendaRow} */ (row));
		const problem = validateSchedule(start, end);
		if (problem) errors.endTime = problem;
	}
	return errors;
}

/**
 * Normaliza lo que llega de un formulario (strings recortados, sin campos de más).
 *
 * @param {Record<string, unknown>} raw
 * @returns {AgendaValues}
 */
export function readAgendaValues(raw) {
	/** @param {unknown} v */
	const s = (v) =>
		String(v ?? '')
			.slice(0, AGENDA_MAX_TEXT + 50)
			.trim();
	return {
		date: s(raw.date),
		startTime: s(raw.startTime),
		endTime: s(raw.endTime),
		title: s(raw.title),
		locationName: s(raw.locationName),
		place: s(raw.place),
		state: /** @type {AgendaState} */ (s(raw.state))
	};
}

/**
 * Campos que cambian entre `a` y `b`.
 *
 * @param {Partial<AgendaValues>} a
 * @param {Partial<AgendaValues>} b
 * @returns {AgendaField[]}
 */
export function changedAgendaFields(a, b) {
	return AGENDA_FIELDS.filter((f) => String(a[f] ?? '') !== String(b[f] ?? ''));
}

/**
 * `tags` con la región cambiada: reemplaza la etiqueta de lugar que tenía (en su lugar de la
 * lista) o la agrega al final. Las demás etiquetas no se tocan.
 *
 * @param {string[]} tags
 * @param {string} place
 */
export function replacePlaceTag(tags, place) {
	const out = [];
	let placed = false;
	for (const tag of tags) {
		const isPlace = splitEventTags([tag]).places.length > 0;
		if (!isPlace) out.push(tag);
		else if (!placed && place) {
			out.push(place);
			placed = true;
		}
	}
	if (!placed && place) out.push(place);
	return out;
}

/**
 * Aplica el cambio de una fila al archivo de un evento.
 *
 * Conflictos: para cada campo que cambia, si en el archivo actual ya no vale lo que la persona
 * vio (`before`) ni lo que quiere poner (`after`), alguien lo cambió mientras tanto: se devuelve
 * en `conflicts` y no se cambia nada. Los campos que no cambian no se comparan (otra persona pudo
 * haber editado el texto o las entradas y no pasa nada).
 *
 * @param {string} raw el archivo actual del evento
 * @param {{ before: AgendaValues, after: AgendaValues }} change
 * @returns {{ content: string, current: AgendaRow, changed: AgendaField[], conflicts: AgendaField[] }}
 */
export function applyAgendaChange(raw, { before, after }) {
	const { frontmatter, body } = splitMarkdown(raw);
	const fields = readEventFields(frontmatter);
	const current = agendaRowFromMeta('', fields);
	const changed = changedAgendaFields(before, after);
	const conflicts = changed.filter(
		(f) =>
			String(current[f] ?? '') !== String(before[f] ?? '') &&
			String(current[f] ?? '') !== String(after[f] ?? '')
	);
	const pending = changed.filter((f) => String(current[f] ?? '') !== String(after[f] ?? ''));
	if (conflicts.length || !pending.length)
		return { content: raw, current, changed: pending, conflicts };

	/** @type {Record<string, any>} */
	const changes = {};
	const next = { ...current, ...pick(after, pending) };
	if (pending.some((f) => f === 'date' || f === 'startTime' || f === 'endTime')) {
		const { start, end } = agendaSchedule({ ...next, endDays: current.endDays });
		changes.start = start;
		changes.end = end || null;
	}
	if (pending.includes('title')) changes.title = next.title;
	if (pending.includes('locationName')) changes.location_name = next.locationName || null;
	if (pending.includes('place')) changes.tags = replacePlaceTag(fields.tags, next.place);
	if (pending.includes('state')) {
		if (next.state === 'cancelado') {
			changes.status = 'cancelado';
		} else {
			// Deja de estar cancelado: vuelve a "anunciado" (la inscripción se abre desde el editor).
			if (current.state === 'cancelado') changes.status = 'anunciado';
			changes.force_unlisted =
				next.state === 'no-listado' ? true : fields.force_unlisted ? REMOVE : undefined;
		}
	}
	return {
		content: joinMarkdown(applyFrontmatterChanges(frontmatter, changes), body),
		current,
		changed: pending,
		conflicts
	};
}

/**
 * @template {object} T
 * @param {T} obj
 * @param {readonly (keyof T)[]} keys
 * @returns {Partial<T>}
 */
function pick(obj, keys) {
	/** @type {Partial<T>} */
	const out = {};
	for (const k of keys) out[k] = obj[k];
	return out;
}

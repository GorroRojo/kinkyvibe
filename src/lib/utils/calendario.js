/**
 * Agenda del panel como calendario (/admin/eventos/agenda): funciones puras que conectan las filas
 * de la agenda (`AgendaRow`, ver agenda.js) con el calendario (`Calendario.svelte`, que envuelve
 * la librería @event-calendar/core) y con el formulario de evento nuevo.
 *
 * - `CALENDAR_VIEWS` / `parseCalendarView` / `defaultCalendarView`: las vistas y la elegida;
 * - `calendarEvent` / `calendarEvents`: una fila → un evento en el formato de la librería
 *   (fechas "naive" en hora de Argentina, sin zona: la librería las muestra tal cual);
 * - `rescheduleProblem` / `dropTarget` / `movedAgendaValues`: si se puede mover un evento, adónde
 *   va al soltarlo (en la vista semana solo cambia el día, nunca la hora) y cómo queda la fila; se
 *   guarda por el mismo camino que la planilla; `dragSnapDuration`: el arrastre de la semana se
 *   ve igual (la vista previa no cambia de hora);
 * - `newEventQuestion` / `newEventHref` / `readNewEventPrefill` / `applyNewEventPrefill`: la
 *   pregunta antes de cargar un evento en un día vacío, el link al formulario de evento nuevo con el
 *   día (y las horas) elegidos (y el evento a duplicar), su lectura del lado del formulario y cómo
 *   queda el formulario con eso.
 */
import { endDaysFor, validateAgendaRow } from './agenda.js';
import { addDays, describeDate, isValidDate, isValidTime, validateSlug } from './eventDraft.js';
import { eventBadges } from '$lib/admin/eventFormat.js';

/** Vistas de la agenda: las tres del calendario y la planilla editable de siempre. */
export const CALENDAR_VIEWS = /** @type {const} */ ([
	{ id: 'mes', label: 'Mes', ec: 'dayGridMonth' },
	{ id: 'semana', label: 'Semana', ec: 'timeGridWeek' },
	{ id: 'lista', label: 'Lista', ec: 'listMonth' },
	{ id: 'planilla', label: 'Planilla', ec: '' }
]);

/** @typedef {(typeof CALENDAR_VIEWS)[number]['id']} CalendarView */

/** Clave de localStorage con la vista elegida (por navegador). */
export const CALENDAR_VIEW_KEY = 'kv-agenda-vista';

/** Hasta este ancho (px) la vista por defecto es la lista. */
export const PHONE_MAX_WIDTH = 640;

/**
 * La vista por defecto según el ancho de la pantalla: lista en el celu, mes en desktop.
 * @param {number} width
 * @returns {CalendarView}
 */
export function defaultCalendarView(width) {
	return width <= PHONE_MAX_WIDTH ? 'lista' : 'mes';
}

/**
 * Una vista guardada (o cualquier cosa) → una vista válida, o `fallback`.
 * @param {unknown} value
 * @param {CalendarView} fallback
 * @returns {CalendarView}
 */
export function parseCalendarView(value, fallback) {
	return CALENDAR_VIEWS.some((v) => v.id === value)
		? /** @type {CalendarView} */ (value)
		: fallback;
}

/** @param {string} time hh:mm @returns {number} */
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** @param {number} m @returns {string} hh:mm (da la vuelta a las 24 h) */
const hhmm = (m) => {
	const d = ((m % 1440) + 1440) % 1440;
	return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

/**
 * Chips de estado de una fila (los de `eventBadges`, como en el resto del panel): borrador,
 * cancelado, abierto, anunciado… `state` es lo último (la planilla puede haberlo cambiado);
 * `status`, lo que decía el archivo.
 * @param {Pick<import('./agenda.js').AgendaRow, 'state' | 'status'>} row
 */
export function rowBadges(row) {
	const status =
		row.state === 'cancelado' ? 'cancelado' : row.status === 'cancelado' ? 'anunciado' : row.status;
	return eventBadges({ status, unlisted: row.state === 'no-listado' });
}

/**
 * Tono del chip en el calendario: el del primer chip de estado.
 * @param {Pick<import('./agenda.js').AgendaRow, 'state' | 'status'>} row
 * @returns {'ok' | 'warn' | 'bad' | 'info' | 'neutral'}
 */
export function eventTone(row) {
	return rowBadges(row)[0]?.tone ?? 'neutral';
}

/**
 * Por qué no se puede mover un evento arrastrándolo (null = se puede). Se mueve por el mismo
 * camino que la planilla, que valida la fila entera: si la fila ya tiene algo que no pasa la
 * validación (sin hora, una región que no existe más…), mejor no ofrecer el arrastre.
 * @param {import('./agenda.js').AgendaValues} row
 * @param {string[]} places
 * @returns {string | null}
 */
export function rescheduleProblem(row, places) {
	if (!isValidTime(row.startTime))
		return 'No tiene hora de inicio: cambiala desde la planilla o la ficha.';
	const errors = validateAgendaRow(row, { places, allowEmptyPlace: row.place === '' });
	const first = Object.values(errors)[0];
	return first ? `Revisalo en la planilla o la ficha: ${first}` : null;
}

/** Lo que termina al día siguiente hasta esta hora se dibuja solo en el día que empieza. */
export const OVERNIGHT_UNTIL = '09:00';

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   start: string,
 *   end: string,
 *   allDay: boolean,
 *   startEditable: boolean,
 *   durationEditable: false,
 *   classNames: string[],
 *   styles?: string[],
 *   extendedProps: { slug: string, tone: string, time: string, problem: string | null, pending: boolean, draft?: boolean, missing?: string[], note?: boolean }
 * }} CalendarEventInput
 * `styles` y `extendedProps.note`: solo las notas de los días (ver dayNotes.js).
 * `draft`: es un borrador (no listado, «a confirmar»); `missing`: lo que le falta (ver
 * eventMissing.js), solo en los borradores.
 */

/**
 * Una fila de la agenda → un evento de @event-calendar/core. Las fechas van sin zona horaria
 * ("2026-12-12T21:00"): la librería las toma como hora local y las muestra tal cual, así que se ve
 * la hora de Argentina en cualquier navegador. Solo para dibujarlo: sin hora de fin dura una hora,
 * y lo que termina a la madrugada (hasta `OVERNIGHT_UNTIL`) llega hasta las 23:59 de su día. La hora
 * real se muestra en el chip (`extendedProps.time`). Una fila con `pending` (movida y sin guardar,
 * ver pendingMoves.js) lleva la clase `kv-ev-pendiente`.
 *
 * @param {import('./agenda.js').AgendaRow & { pending?: boolean, missing?: { label: string }[] }} row
 * @param {{ places: string[], canEdit?: boolean }} options `canEdit`: se puede arrastrar
 * @returns {CalendarEventInput}
 */
export function calendarEvent(row, { places, canEdit = true }) {
	const timed = isValidTime(row.startTime);
	const problem = canEdit ? rescheduleProblem(row, places) : 'No tenés permiso para moverlo.';
	let start = row.date;
	let end = addDays(row.date, 1);
	if (timed) {
		start = `${row.date}T${row.startTime}`;
		const days = endDaysFor(row);
		if (!isValidTime(row.endTime)) {
			end = `${addDays(row.date, minutes(row.startTime) >= 23 * 60 ? 1 : 0)}T${hhmm(minutes(row.startTime) + 60)}`;
		} else if (days === 1 && row.endTime <= OVERNIGHT_UNTIL) {
			// Una fiesta de 22:00 a 05:00 se dibuja en su día (si no, ocupa dos días en el mes).
			end = `${row.date}T23:59`;
		} else {
			end = `${addDays(row.date, days)}T${row.endTime}`;
		}
	}
	const tone = eventTone(row);
	const draft = row.state === 'no-listado';
	return {
		id: row.slug,
		title: row.title || row.slug,
		start,
		end,
		allDay: !timed,
		startEditable: !problem,
		durationEditable: false,
		classNames: [
			'kv-ev',
			`kv-ev-${tone}`,
			...(row.state === 'cancelado' ? ['kv-ev-cancelado'] : []),
			...(row.pending ? ['kv-ev-pendiente'] : [])
		],
		extendedProps: {
			slug: row.slug,
			tone,
			time: timed ? (row.endTime ? `${row.startTime} – ${row.endTime}` : row.startTime) : '',
			problem,
			pending: Boolean(row.pending),
			...(draft ? { draft, missing: (row.missing ?? []).map((m) => m.label) } : {})
		}
	};
}

/**
 * Solo los borradores (filtro «a confirmar» de la agenda), o todas si `onlyDrafts` es false.
 * @template {Pick<import('./agenda.js').AgendaRow, 'state'>} R
 * @param {R[]} rows
 * @param {boolean} onlyDrafts
 * @returns {R[]}
 */
export function draftRows(rows, onlyDrafts) {
	return onlyDrafts ? rows.filter((r) => r.state === 'no-listado') : rows;
}

/**
 * Las filas que tienen fecha → eventos del calendario.
 * @param {Array<import('./agenda.js').AgendaRow & { pending?: boolean }>} rows
 * @param {{ places: string[], canEdit?: boolean }} options
 */
export function calendarEvents(rows, options) {
	return rows.filter((r) => isValidDate(r.date)).map((r) => calendarEvent(r, options));
}

/**
 * Día y hora "de pared" de un Date de la librería (que los devuelve en hora local del navegador,
 * con los mismos números que le pasamos).
 * @param {Date} d
 * @returns {{ date: string, time: string }}
 */
export function localDateParts(d) {
	const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
	return {
		date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
		time: `${p(d.getHours())}:${p(d.getMinutes())}`
	};
}

/**
 * Adónde va un evento que soltaron en el calendario. En la vista semana el arrastre cambia SOLO
 * el día: aunque lo suelten en otra franja horaria (o en "Todo el día"), conserva su hora de
 * inicio y de fin. En el mes (y la lista) la librería ya conserva la hora, así que va tal cual.
 * `null` = no cambió nada (lo soltaron en el mismo día, o en la misma hora en el mes): quien llama
 * deshace el arrastre en el calendario.
 *
 * @param {string} view vista de la librería (`dayGridMonth`, `timeGridWeek`, `listMonth`)
 * @param {{ date: string, time: string }} from dónde estaba (día y hora "de pared")
 * @param {{ date: string, time: string }} to dónde lo soltaron
 * @returns {{ date: string, time?: string } | null}
 */
export function dropTarget(view, from, to) {
	if (view === 'timeGridWeek') return to.date === from.date ? null : { date: to.date };
	if (to.date === from.date && to.time === from.time) return null;
	return { date: to.date, time: to.time };
}

/**
 * El paso (`snapDuration` de la librería) mientras arrastran un evento ya cargado. En la vista
 * semana es un día entero: la franja donde está el puntero no cuenta, así que la vista previa del
 * arrastre se queda en su hora y solo se corre de día en día (lo mismo que después hace
 * `dropTarget` al soltarlo). Sin esto la vista previa seguía al puntero a otra hora y, al soltar,
 * volvía a la hora original. `undefined` = el paso de siempre (una franja), que es el que usan
 * tocar un día vacío y arrastrar un rango para cargar un evento nuevo.
 * @param {string} view vista de la librería
 * @returns {string | undefined}
 */
export function dragSnapDuration(view) {
	return view === 'timeGridWeek' ? '24:00' : undefined;
}

/**
 * La pregunta antes de cargar un evento nuevo al tocar un día vacío (o arrastrar un rango en la
 * vista semana): "¿Cargar un evento el sábado 12 de diciembre de 2099?" (con "a las 21:00" si
 * eligieron una hora).
 * @param {{ date: string, startTime?: string }} prefill
 */
export function newEventQuestion({ date, startTime }) {
	const day = describeDate(date);
	if (!day) return '¿Cargar un evento nuevo?';
	const at = startTime && isValidTime(startTime) ? ` a las ${startTime}` : '';
	return `¿Cargar un evento el ${day}${at}?`;
}

/**
 * La fila después de soltar el evento en otro día (y hora, en la vista semana). La hora de fin se
 * corre lo mismo que la de inicio, así el evento dura lo mismo; los de varios días conservan sus
 * días al guardar (`endDays`, en el servidor).
 *
 * @param {import('./agenda.js').AgendaValues} values
 * @param {{ date: string, time?: string }} to
 * @returns {import('./agenda.js').AgendaValues}
 */
export function movedAgendaValues(values, { date, time }) {
	const startTime = time && isValidTime(time) ? time : values.startTime;
	let endTime = values.endTime;
	if (endTime && isValidTime(endTime) && isValidTime(values.startTime)) {
		endTime = hhmm(minutes(endTime) + minutes(startTime) - minutes(values.startTime));
	}
	return { ...values, date, startTime, endTime };
}

/**
 * Link al formulario de evento nuevo con el día (y opcionalmente las horas) ya puestos. Con `from`
 * (el slug de un evento), el formulario duplica ese evento en ese día.
 * @param {{ date?: string, startTime?: string, endTime?: string, from?: string }} prefill
 */
export function newEventHref({ date = '', startTime, endTime, from }) {
	const q = new URLSearchParams();
	if (from && !validateSlug(from)) q.set('desde', from);
	if (isValidDate(date)) q.set('fecha', date);
	if (startTime && isValidTime(startTime)) q.set('hora', startTime);
	if (endTime && isValidTime(endTime)) q.set('hasta', endTime);
	const s = q.toString();
	return s ? `/admin/eventos/nuevo?${s}` : '/admin/eventos/nuevo';
}

/**
 * Pone en el formulario de evento nuevo (o en la copia de un evento) el día y las horas que
 * vinieron de la agenda. El día manda; las horas del original se conservan si no eligieron otras.
 * `span` (días entre el inicio y el fin del original) se recalcula si cambian las horas: una
 * copia de 20:00 a 23:00 que pasa a empezar a las 23:30 termina al día siguiente; los eventos de
 * varios días (2 o más) conservan sus días.
 *
 * @template {{ startDate: string, startTime: string, endDate: string, endTime: string, hasEnd: boolean }} V
 * @param {V} values el formulario (de `formFromSource`)
 * @param {number} span
 * @param {{ date: string, startTime: string, endTime: string }} prefill de `readNewEventPrefill`
 * @returns {{ values: V, span: number }}
 */
export function applyNewEventPrefill(values, span, prefill) {
	if (!isValidDate(prefill.date)) return { values: { ...values }, span };
	const next = { ...values, startDate: prefill.date };
	if (prefill.startTime) next.startTime = prefill.startTime;
	if (prefill.endTime) {
		next.endTime = prefill.endTime;
		next.hasEnd = true;
	}
	const days = prefill.startTime
		? endDaysFor({ startTime: next.startTime, endTime: next.endTime, endDays: span })
		: span;
	next.endDate = addDays(prefill.date, days);
	return { values: next, span: days };
}

/**
 * Lo que trae el link de `newEventHref`, validado (lo inválido queda vacío).
 * @param {URLSearchParams} params
 * @returns {{ date: string, startTime: string, endTime: string }}
 */
export function readNewEventPrefill(params) {
	const date = String(params.get('fecha') ?? '');
	const startTime = String(params.get('hora') ?? '');
	const endTime = String(params.get('hasta') ?? '');
	const ok = isValidDate(date);
	return {
		date: ok ? date : '',
		startTime: ok && isValidTime(startTime) ? startTime : '',
		endTime: ok && isValidTime(startTime) && isValidTime(endTime) ? endTime : ''
	};
}

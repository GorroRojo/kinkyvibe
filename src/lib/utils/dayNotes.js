/**
 * Notas en los días de la agenda del panel (tabla `agenda_day_notes`, migración 0030): una nota
 * corta en un día ("feriado", "no reservar el lugar") con un color de una paleta fija. Solo para
 * admins: se ven en el calendario y en la planilla de /admin/eventos/agenda, nunca en páginas
 * públicas ni en el .ics.
 *
 * Funciones puras (las usan el servidor y el navegador):
 * - `DAY_NOTE_COLORS` / `dayNoteColor` / `dayNoteStyles`: la paleta (sale de los tokens del panel,
 *   así anda en claro y oscuro) y las variables CSS de un color;
 * - `validateDayNote`: lo que manda el formulario → una nota válida o los errores por campo;
 * - `notesByDate` / `upsertDayNote` / `removeDayNote`: la lista de notas de la página;
 * - `dayNoteEvent` / `noteIdFromEventId`: una nota → un evento de todo el día del calendario.
 */
import { addDays, isValidDate } from './eventDraft.js';

/** Largo máximo del texto de una nota (es para una o dos palabras, no para párrafos). */
export const DAY_NOTE_MAX = 120;

/**
 * La paleta: cada color usa un par de tokens del panel (`--warn` / `--warn-bg`, etc.), que ya
 * tienen su versión oscura. `id` es lo que se guarda en la base.
 */
export const DAY_NOTE_COLORS = /** @type {const} */ ([
	{ id: 'amarillo', label: 'Amarillo', tone: 'warn' },
	{ id: 'rosa', label: 'Rosa', tone: 'bad' },
	{ id: 'violeta', label: 'Violeta', tone: 'info' },
	{ id: 'verde', label: 'Verde', tone: 'ok' },
	{ id: 'gris', label: 'Gris', tone: 'neutral' }
]);

/** @typedef {(typeof DAY_NOTE_COLORS)[number]['id']} DayNoteColor */

/** @type {DayNoteColor} */
export const DEFAULT_DAY_NOTE_COLOR = 'amarillo';

/**
 * @typedef {{
 *   id: number,
 *   date: string,
 *   body: string,
 *   color: DayNoteColor,
 *   updatedAt: number,
 *   updatedBy: string
 * }} DayNote
 */

/**
 * Un color guardado (o cualquier cosa) → uno de la paleta; si no está, el de por defecto.
 * @param {unknown} value
 * @returns {DayNoteColor}
 */
export function dayNoteColor(value) {
	const found = DAY_NOTE_COLORS.find((c) => c.id === value);
	return found ? found.id : DEFAULT_DAY_NOTE_COLOR;
}

/**
 * Las variables CSS `--tone` (borde, texto fuerte) y `--tone-bg` (fondo) de un color, como las
 * usan los chips del calendario. Para `style=` hay que unirlas con "; ".
 * @param {unknown} color
 * @returns {string[]}
 */
export function dayNoteStyles(color) {
	const tone = DAY_NOTE_COLORS.find((c) => c.id === dayNoteColor(color))?.tone ?? 'warn';
	if (tone === 'neutral') return ['--tone: var(--muted)', '--tone-bg: var(--surface-2)'];
	return [`--tone: var(--${tone})`, `--tone-bg: var(--${tone}-bg)`];
}

/**
 * El texto de una nota, limpio: una sola línea, sin caracteres de control ni espacios de más.
 * @param {unknown} raw
 */
export function cleanDayNoteText(raw) {
	return (
		String(raw ?? '')
			// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/**
 * Valida lo que manda el formulario de una nota.
 * @param {{ date?: unknown, body?: unknown, color?: unknown }} raw
 * @returns {{ ok: true, value: { date: string, body: string, color: DayNoteColor } }
 *   | { ok: false, errors: { date?: string, body?: string, color?: string } }}
 */
export function validateDayNote(raw) {
	const date = String(raw?.date ?? '').trim();
	const body = cleanDayNoteText(raw?.body);
	const color = String(raw?.color ?? '');
	/** @type {{ date?: string, body?: string, color?: string }} */
	const errors = {};
	if (!isValidDate(date)) errors.date = 'Elegí un día.';
	if (!body) errors.body = 'Escribí la nota.';
	else if (body.length > DAY_NOTE_MAX) errors.body = `Hasta ${DAY_NOTE_MAX} caracteres.`;
	if (!DAY_NOTE_COLORS.some((c) => c.id === color)) errors.color = 'Elegí un color de la lista.';
	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, value: { date, body, color: /** @type {DayNoteColor} */ (color) } };
}

/**
 * Orden de las notas: por día y, dentro del día, la más vieja primero.
 * @param {DayNote} a
 * @param {DayNote} b
 */
function byDateThenId(a, b) {
	return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;
}

/**
 * Las notas agrupadas por día (cada día, en el orden en que se cargaron).
 * @param {readonly DayNote[]} notes
 * @returns {Record<string, DayNote[]>}
 */
export function notesByDate(notes) {
	/** @type {Record<string, DayNote[]>} */
	const out = {};
	for (const n of [...notes].sort(byDateThenId)) (out[n.date] ??= []).push(n);
	return out;
}

/**
 * La lista con `note` agregada o reemplazada (mismo id), ordenada.
 * @param {readonly DayNote[]} notes
 * @param {DayNote} note
 * @returns {DayNote[]}
 */
export function upsertDayNote(notes, note) {
	return [...notes.filter((n) => n.id !== note.id), note].sort(byDateThenId);
}

/**
 * @param {readonly DayNote[]} notes
 * @param {number} id
 * @returns {DayNote[]}
 */
export function removeDayNote(notes, id) {
	return notes.filter((n) => n.id !== id);
}

/** Prefijo del id de las notas en el calendario (los eventos usan su slug, que no lleva ":"). */
export const NOTE_EVENT_PREFIX = 'nota:';

/**
 * El id de la nota de un evento del calendario, o null si es un evento de verdad.
 * @param {unknown} eventId
 * @returns {number | null}
 */
export function noteIdFromEventId(eventId) {
	const s = String(eventId ?? '');
	if (!s.startsWith(NOTE_EVENT_PREFIX)) return null;
	const id = Number(s.slice(NOTE_EVENT_PREFIX.length));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Una nota → un evento de todo el día del calendario, que no se arrastra. Lleva la clase
 * `kv-nota` y los colores en `styles`; `extendedProps.note` lo distingue de los eventos.
 * @param {DayNote} note
 * @returns {import('./calendario.js').CalendarEventInput}
 */
export function dayNoteEvent(note) {
	return {
		id: `${NOTE_EVENT_PREFIX}${note.id}`,
		title: note.body,
		start: note.date,
		end: addDays(note.date, 1),
		allDay: true,
		startEditable: false,
		durationEditable: false,
		classNames: ['kv-ev', 'kv-nota'],
		styles: dayNoteStyles(note.color),
		extendedProps: {
			slug: '',
			tone: dayNoteColor(note.color),
			time: '',
			problem: null,
			pending: false,
			note: true
		}
	};
}

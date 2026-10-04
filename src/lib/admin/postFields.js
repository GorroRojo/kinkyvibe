/**
 * Los campos de la sección «Datos» del editor de publicaciones (PostEditor: la pestaña Editar de
 * un evento y /edit/<categoría>/<slug>), y cómo pasar cada valor del archivo al input y del input
 * a lo que se guarda. Movido tal cual desde PostEditor.svelte.
 *
 * Sin imports de Svelte: corre en el navegador y en vitest.
 */
import {
	STATUS_OPTIONS,
	formatEventDate,
	formatPostDate,
	isValidDate,
	isValidTime,
	parseEventDate
} from '$lib/utils/eventDraft.js';

/**
 * @typedef {object} Field
 * @prop {string} key
 * @prop {string} label
 * @prop {'text'|'textarea'|'url'|'email'|'tel'|'date'|'datetime'|'checkbox'|'select'} type
 * @prop {string} [placeholder]
 * @prop {string} [help]
 * @prop {boolean} [required]
 * @prop {boolean} [wide]
 * @prop {Array<{value: string, label: string}>} [options]
 */

/** @type {Field[]} */
const common = [
	{ key: 'title', label: 'Título', type: 'text', required: true, wide: true },
	{
		key: 'summary',
		label: 'Resumen corto',
		type: 'textarea',
		wide: true,
		placeholder: 'Aparece en las listas y cuando se comparte el link'
	},
	{ key: 'published_date', label: 'Publicado', type: 'date', required: true },
	{
		key: 'updated_date',
		label: 'Actualizado',
		type: 'date',
		help: 'Se pone la fecha de hoy al guardar.'
	}
];
/** @type {Record<string, Field[]>} */
const byCategory = {
	calendario: [
		{
			key: 'status',
			label: 'Estado',
			type: 'select',
			wide: true,
			options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} — ${o.help}` }))
		},
		{ key: 'start', label: 'Empieza', type: 'datetime', required: true },
		{ key: 'end', label: 'Termina', type: 'datetime' },
		{
			key: 'location',
			label: 'Dónde',
			type: 'text',
			placeholder: 'Ej.: Calle 123, Ciudad · o «Plaza Lavalle, frente a la fuente»',
			help: 'Para un lugar de una sola vez. Dejalo vacío si es online. Con un lugar elegido, la página muestra el lugar y no este texto.'
		},
		{
			key: 'location_map',
			label: 'Link al mapa (opcional)',
			type: 'url',
			placeholder: 'https://www.openstreetmap.org/…',
			help: 'De OpenStreetMap o Google Maps (https).'
		},
		{
			key: 'location_name',
			label: 'Nombre del lugar',
			type: 'text',
			placeholder: 'Ej.: El Surco'
		},
		{
			key: 'link',
			label: 'Link de inscripción / entradas',
			type: 'url',
			placeholder: 'https://forms.gle/...',
			help: 'Solo se muestra cuando el estado es «Abierto».'
		},
		{ key: 'link_text', label: 'Texto del botón', type: 'text', placeholder: 'Ej.: Inscribirme' }
	],
	amigues: [
		{
			key: 'pronoun',
			label: 'Pronombres',
			type: 'text',
			placeholder: 'Ej.: https://pronombr.es/elle&el'
		},
		{ key: 'gender_identity', label: 'Género', type: 'text' },
		{ key: 'job_title', label: 'Qué hace', type: 'text', placeholder: 'Ej.: Educadore BDSM' },
		{ key: 'link', label: 'Link', type: 'url', placeholder: 'https://instagram.com/...' },
		{ key: 'email', label: 'Mail', type: 'email' },
		{ key: 'tel', label: 'Teléfono', type: 'tel', placeholder: 'Ej.: +54 11 1234 5678' },
		{ key: 'location', label: 'Dirección', type: 'text', placeholder: 'Ej.: Calle 123, Ciudad' },
		{ key: 'bday', label: 'Cumpleaños', type: 'date' }
	],
	material: [
		{ key: 'link', label: 'Link', type: 'url', placeholder: 'https://...' },
		{ key: 'link_text', label: 'Texto del link', type: 'text', placeholder: 'Ej.: Ir al sitio' },
		{ key: 'redirect', label: 'Redireccionar directo al link', type: 'checkbox', wide: true },
		{ key: 'access_date', label: 'Última fecha de acceso', type: 'date' },
		{ key: 'original_published_date', label: 'Fecha de publicación original', type: 'date' }
	],
	wiki: []
};
/** @type {Field[]} */
const tail = [
	{
		key: 'force_unlisted',
		label: 'No listado (no aparece en las listas, se ve con el link)',
		type: 'checkbox',
		wide: true
	}
];

/**
 * Los campos de «Datos» de una publicación de `category`, en orden.
 * @param {string} category
 * @returns {Field[]}
 */
export function postFields(category) {
	return [...common, ...(byCategory[category] ?? []), ...tail];
}

/**
 * Valor del archivo → valor del input.
 * @param {Field} f
 * @param {any} v
 */
export function toInput(f, v) {
	if (f.type === 'checkbox') return v === true;
	if (v === undefined || v === null) return '';
	if (f.type === 'date') return String(v).slice(0, 10);
	if (f.type === 'datetime') {
		const { date, time } = parseEventDate(v);
		return date ? `${date}T${time || '00:00'}` : '';
	}
	return String(v);
}

/**
 * Valor del input → valor para `applyFrontmatterChanges` (`null` = sacar la propiedad).
 * @param {Field} f
 * @param {any} v
 * @returns {any}
 */
export function fromInput(f, v) {
	if (f.type === 'checkbox') return v ? true : null;
	if (v === '' || v === undefined || v === null) return null;
	if (f.type === 'date') return isValidDate(v) ? formatPostDate(v) : v;
	if (f.type === 'datetime') {
		const [date, time] = String(v).split('T');
		return isValidDate(date) && isValidTime(time) ? formatEventDate(date, time) : v;
	}
	if (f.type === 'textarea')
		return String(v)
			.replace(/\s*\n\s*/g, ' ')
			.trim();
	return String(v).trim();
}

/**
 * Lo que crear un evento no muestra en «Datos»: las fechas de publicación las pone el servidor y
 * «No listado» se elige al final («Guardar como no listado»).
 */
const NOT_IN_NEW_EVENT = ['published_date', 'updated_date', 'force_unlisted'];

/**
 * Los campos de la sección «📝 Datos» (DatosSection), los mismos al crear un evento y al editar
 * cualquier publicación. Empieza y Termina no están: van en «📅 ¿Cuándo es?» (ScheduleSection).
 * @param {'nuevo' | 'editar'} mode
 * @param {string} [category]
 * @returns {Field[]}
 */
export function datosFields(mode, category = 'calendario') {
	return postFields(category)
		.filter((f) => f.type !== 'datetime')
		.filter((f) => mode !== 'nuevo' || !NOT_IN_NEW_EVENT.includes(f.key))
		.map((f) =>
			category === 'calendario' && f.key === 'title'
				? { ...f, placeholder: 'Ej.: Picantearla (62ª Edición)' }
				: f
		);
}

/**
 * El id del input de cada campo de «Datos»: `ev-<campo>` al crear (con guiones: `ev-link-text`),
 * `<campo>-input` al editar (los de siempre de cada editor).
 * @param {'nuevo' | 'editar'} mode
 * @returns {(key: string) => string}
 */
export function datosFieldId(mode) {
	return mode === 'nuevo' ? (key) => `ev-${key.replace(/_/g, '-')}` : (key) => `${key}-input`;
}

/**
 * El «Dónde» en texto libre de un evento (`location`, `location_map`, `location_name`): van en la
 * sección «📍 Lugar» (PlaceSection), junto al lugar elegido, no en «📝 Datos».
 */
export const PLACE_FIELD_KEYS = Object.freeze(['location', 'location_map', 'location_name']);

/**
 * Los campos de «Datos» separados en los de «📝 Datos» y los del «Dónde» en texto libre (solo en
 * los eventos; las demás categorías quedan como están).
 * @param {Field[]} fields
 * @param {string} [category]
 * @returns {{ datos: Field[], place: Field[] }}
 */
export function splitPlaceFields(fields, category = 'calendario') {
	if (category !== 'calendario') return { datos: fields, place: [] };
	const isPlace = (/** @type {Field} */ f) => PLACE_FIELD_KEYS.includes(f.key);
	return { datos: fields.filter((f) => !isPlace(f)), place: fields.filter(isPlace) };
}

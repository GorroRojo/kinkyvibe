/**
 * El formulario de eventos en una página (`$lib/components/admin/event-form/EventForm.svelte`):
 * qué secciones tiene, para el índice de secciones, y cómo nombrar las partes de un borrador.
 *
 * Lo usan /admin/eventos/nuevo (crear o duplicar), PostEditor (la pestaña Editar de la ficha y
 * /edit/<categoría>/<slug>) y ContentEditor (material y amigues en el panel). Sin imports de
 * Svelte: corre en el navegador y en vitest.
 */
import { changedKeys } from './draft.js';

/**
 * @typedef {object} FormSection
 * @prop {string} id id del elemento de la sección en la página (el índice salta ahí)
 * @prop {string} icon
 * @prop {string} label
 */

/**
 * Las secciones del formulario, en el orden en que aparecen.
 * @param {object} o
 * @param {'nuevo' | 'editar' | 'contenido'} o.mode crear/duplicar un evento, editar una
 *   publicación, o crear/editar material o un perfil de amigue en el panel (ContentEditor)
 * @param {string} [o.category] la categoría (editar); los eventos son `calendario`
 * @param {string} [o.idPrefix] el de TicketsEditor (`ev` al crear, `edit` al editar)
 * @param {boolean} [o.hasImage] editar: la publicación tiene sección de imagen (los eventos)
 * @param {boolean} [o.hasPersonas] editar: sección de personas (interruptor personas_eventos)
 * @param {boolean} [o.parseError] editar: el archivo se edita como texto (sin secciones)
 * @returns {FormSection[]}
 */
export function formSections({
	mode,
	category = 'calendario',
	idPrefix = mode === 'nuevo' ? 'ev' : 'edit',
	hasImage = false,
	hasPersonas = false,
	parseError = false
}) {
	const tickets = { id: `${idPrefix}-tickets`, icon: '🎟️', label: 'Entradas' };
	const cuando = { id: 'sec-cuando', icon: '📅', label: 'Fecha y hora' };
	// El lugar elegido y el «Dónde» en texto libre (PlaceSection).
	const lugar = { id: 'sec-lugar', icon: '📍', label: 'Lugar' };
	if (mode === 'nuevo')
		return [
			cuando,
			{ id: 'sec-datos', icon: '📝', label: 'Datos' },
			lugar,
			{ id: 'sec-direccion', icon: '🔗', label: 'Dirección' },
			{ id: 'sec-etiquetas', icon: '🏷️', label: 'Etiquetas' },
			tickets,
			{ id: 'sec-imagen', icon: '🖼️', label: 'Imagen' },
			{ id: 'sec-texto', icon: '📄', label: 'Texto' }
		];
	if (parseError) return [];
	if (mode === 'contenido')
		return [
			{ id: 'sec-datos', icon: '📝', label: 'Datos' },
			{ id: 'sec-imagen', icon: '🖼️', label: 'Imagen' },
			{ id: 'sec-etiquetas', icon: '🏷️', label: 'Etiquetas' },
			{ id: 'sec-texto', icon: '📄', label: 'Texto' },
			{ id: 'sec-lista', icon: '👀', label: 'En la lista' }
		];
	const isEvent = category === 'calendario';
	return /** @type {FormSection[]} */ (
		[
			isEvent && cuando,
			{ id: 'sec-datos', icon: '📝', label: 'Datos' },
			isEvent && lugar,
			hasPersonas && { id: 'sec-personas', icon: '👥', label: 'Personas' },
			hasImage && { id: 'sec-imagen', icon: '🖼️', label: 'Imagen' },
			{ id: 'sec-etiquetas', icon: '🏷️', label: 'Etiquetas' },
			isEvent && tickets,
			{ id: 'sec-texto', icon: '📄', label: 'Texto' }
		].filter(Boolean)
	);
}

/**
 * En qué sección está cada parte del borrador (las claves del snapshot que guarda el formulario).
 * @type {Record<string, string>}
 */
export const DRAFT_PART_SECTION = {
	schedule: 'Fecha y hora',
	values: 'Datos',
	authors: 'Datos',
	venue: 'Lugar',
	slug: 'Dirección',
	slugEdited: 'Dirección',
	tagRules: 'Etiquetas',
	freeTags: 'Etiquetas',
	tickets: 'Entradas',
	personas: 'Personas',
	featuredMode: 'Imagen',
	body: 'Texto',
	rawText: 'Texto'
};

/**
 * Las secciones (sin repetir, en el orden de `keys`) a las que corresponden las partes de un
 * borrador que difieren de lo guardado. Las claves que no conoce no se nombran.
 * @param {string[]} keys por ejemplo, lo que devuelve `changedKeys` de `$lib/admin/draft.js`
 * @param {Record<string, string>} [map]
 * @returns {string[]}
 */
export function draftSectionLabels(keys, map = DRAFT_PART_SECTION) {
	return [...new Set(keys.map((k) => map[k]).filter(Boolean))];
}

/**
 * En qué sección está cada parte del formulario de ContentEditor (`f` en su borrador).
 * @type {Record<string, string>}
 */
export const CONTENT_FORM_SECTION = {
	values: 'Datos',
	authors: 'Datos',
	featured: 'Imagen',
	tags: 'Etiquetas',
	body: 'Texto'
};

/**
 * Las secciones en las que un borrador de ContentEditor (`{ f, slug, slugTouched, rawText }`)
 * difiere de lo que hay en la página, para el aviso de «Tenés un borrador sin guardar».
 * @param {unknown} draft
 * @param {unknown} current
 * @returns {string[]}
 */
export function contentDraftLabels(draft, current) {
	/** @param {unknown} v @returns {Record<string, unknown>} */
	const obj = (v) => (v && typeof v === 'object' ? /** @type {any} */ (v) : {});
	const top = changedKeys(draft, current);
	const inForm = top.includes('f') ? changedKeys(obj(draft).f, obj(current).f) : [];
	return draftSectionLabels([...inForm, ...top.filter((k) => k !== 'f')], {
		...CONTENT_FORM_SECTION,
		slug: 'Datos',
		slugTouched: 'Datos',
		rawText: 'Texto'
	});
}

/**
 * La sección visible para el índice: la última cuyo comienzo ya pasó la línea de lectura (o la
 * primera, si ninguna pasó todavía). Al llegar al final de la página, la última: las secciones
 * cortas del final nunca llegan a la línea de lectura.
 * @param {Array<{ id: string, top: number }>} tops posición de cada sección respecto de la
 *   pantalla (`getBoundingClientRect().top`), en orden
 * @param {number} line altura de la línea de lectura (px desde arriba de la pantalla)
 * @param {boolean} [atEnd] la página está scrolleada hasta abajo de todo
 * @returns {string} id de la sección, o '' si no hay secciones
 */
export function currentSection(tops, line, atEnd = false) {
	if (atEnd && tops.length) return tops[tops.length - 1].id;
	let current = tops[0]?.id ?? '';
	for (const t of tops) if (t.top <= line) current = t.id;
	return current;
}

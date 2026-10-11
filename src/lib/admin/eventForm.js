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
 * Qué ícono lleva cada sección en el índice: SectionIndex lo traduce a un ícono de Lucide (los
 * emoji quedan para el contenido y las etiquetas, ver docs/estilo.md).
 * @typedef {'cuando' | 'datos' | 'personas' | 'lugar' | 'direccion' | 'etiquetas' | 'entradas'
 *   | 'imagen' | 'texto' | 'lista' | 'partes'} SectionIcon
 */

/**
 * @typedef {object} FormSection
 * @prop {string} id id del elemento de la sección en la página (el índice salta ahí)
 * @prop {SectionIcon} icon
 * @prop {string} label
 */

/**
 * El nombre de cada sección, el mismo en el índice (SectionIndex) y en el título de la sección
 * (SectionHeading, con el mismo ícono de Lucide): una sola fuente para las dos cosas.
 * @type {Record<SectionIcon, string>}
 */
export const SECTION_LABELS = {
	cuando: 'Fecha y hora',
	datos: 'Datos',
	personas: 'Personas',
	lugar: 'Lugar',
	direccion: 'Dirección',
	etiquetas: 'Etiquetas',
	entradas: 'Entradas',
	imagen: 'Imagen',
	texto: 'Texto',
	lista: 'En la lista',
	partes: 'Partes'
};

/**
 * La entrada del índice de una sección.
 * @param {SectionIcon} key
 * @param {string} id
 * @returns {FormSection}
 */
function section(key, id) {
	return { id, icon: key, label: SECTION_LABELS[key] };
}

/**
 * Las secciones del formulario, en el orden en que aparecen.
 * @param {object} o
 * @param {'nuevo' | 'editar' | 'contenido'} o.mode crear/duplicar un evento, editar una
 *   publicación, o crear/editar material o un perfil de amigue en el panel (ContentEditor)
 * @param {string} [o.category] la categoría (editar); los eventos son `calendario`
 * @param {string} [o.idPrefix] el de TicketsEditor (`ev` al crear, `edit` al editar)
 * @param {boolean} [o.hasImage] editar: la publicación tiene sección de imagen (los eventos)
 * @param {boolean} [o.hasPersonas] la sección «Personas» (quiénes organizan o escriben y con
 *   qué rol): al crear un evento siempre; al editar y en el panel, si la publicación tiene
 *   personas (no los perfiles de amigues)
 * @param {boolean} [o.hasPartes] editar un evento: la sección «Partes» (talleres en varias partes)
 * @param {boolean} [o.parseError] editar: el archivo se edita como texto (sin secciones)
 * @returns {FormSection[]}
 */
export function formSections({
	mode,
	category = 'calendario',
	idPrefix = mode === 'nuevo' ? 'ev' : 'edit',
	hasImage = false,
	hasPersonas = mode === 'nuevo',
	hasPartes = false,
	parseError = false
}) {
	const tickets = section('entradas', `${idPrefix}-tickets`);
	const cuando = section('cuando', 'sec-cuando');
	const personas = hasPersonas && section('personas', 'sec-personas');
	// El lugar elegido y el «Dónde» en texto libre (PlaceSection).
	const lugar = section('lugar', 'sec-lugar');
	if (mode === 'nuevo')
		return /** @type {FormSection[]} */ (
			[
				cuando,
				section('datos', 'sec-datos'),
				personas,
				lugar,
				section('direccion', 'sec-direccion'),
				section('etiquetas', 'sec-etiquetas'),
				tickets,
				section('imagen', 'sec-imagen'),
				section('texto', 'sec-texto')
			].filter(Boolean)
		);
	if (parseError) return [];
	if (mode === 'contenido')
		return /** @type {FormSection[]} */ (
			[
				section('datos', 'sec-datos'),
				personas,
				section('imagen', 'sec-imagen'),
				section('etiquetas', 'sec-etiquetas'),
				section('texto', 'sec-texto'),
				section('lista', 'sec-lista')
			].filter(Boolean)
		);
	const isEvent = category === 'calendario';
	return /** @type {FormSection[]} */ (
		[
			isEvent && cuando,
			section('datos', 'sec-datos'),
			personas,
			isEvent && lugar,
			hasImage && section('imagen', 'sec-imagen'),
			section('etiquetas', 'sec-etiquetas'),
			isEvent && tickets,
			section('texto', 'sec-texto'),
			// Talleres en varias partes: la sección se guarda por su cuenta (PartesEditor).
			isEvent && hasPartes && section('partes', 'partes')
		].filter(Boolean)
	);
}

/**
 * En qué sección está cada parte del borrador (las claves del snapshot que guarda el formulario).
 * @type {Record<string, string>}
 */
export const DRAFT_PART_SECTION = {
	schedule: SECTION_LABELS.cuando,
	values: SECTION_LABELS.datos,
	// Los borradores de antes de juntar «Organizan» y «Personas» guardaban `authors`.
	authors: SECTION_LABELS.personas,
	people: SECTION_LABELS.personas,
	venue: SECTION_LABELS.lugar,
	slug: SECTION_LABELS.direccion,
	slugEdited: SECTION_LABELS.direccion,
	tagRules: SECTION_LABELS.etiquetas,
	freeTags: SECTION_LABELS.etiquetas,
	tickets: SECTION_LABELS.entradas,
	personas: SECTION_LABELS.personas,
	featuredMode: SECTION_LABELS.imagen,
	body: SECTION_LABELS.texto,
	rawText: SECTION_LABELS.texto
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
	values: SECTION_LABELS.datos,
	authors: SECTION_LABELS.personas,
	personas: SECTION_LABELS.personas,
	people: SECTION_LABELS.personas,
	featured: SECTION_LABELS.imagen,
	tags: SECTION_LABELS.etiquetas,
	body: SECTION_LABELS.texto
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
		slug: SECTION_LABELS.datos,
		slugTouched: SECTION_LABELS.datos,
		rawText: SECTION_LABELS.texto
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

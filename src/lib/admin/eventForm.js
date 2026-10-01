/**
 * El formulario de eventos en una página (`$lib/components/admin/event-form/EventForm.svelte`):
 * qué secciones tiene, para el índice de secciones, y cómo nombrar las partes de un borrador.
 *
 * Lo usan /admin/eventos/nuevo (crear o duplicar) y PostEditor (la pestaña Editar de la ficha y
 * /edit/<categoría>/<slug>). Sin imports de Svelte: corre en el navegador y en vitest.
 */

/**
 * @typedef {object} FormSection
 * @prop {string} id id del elemento de la sección en la página (el índice salta ahí)
 * @prop {string} icon
 * @prop {string} label
 */

/**
 * Las secciones del formulario, en el orden en que aparecen.
 * @param {object} o
 * @param {'nuevo' | 'editar'} o.mode crear/duplicar un evento, o editar una publicación
 * @param {string} [o.category] la categoría (editar); los eventos son `calendario`
 * @param {string} [o.idPrefix] el de TicketsEditor (`ev` al crear, `edit` al editar)
 * @param {boolean} [o.hasImage] editar: la publicación tiene sección de imagen (los eventos)
 * @param {boolean} [o.parseError] editar: el archivo se edita como texto (sin secciones)
 * @returns {FormSection[]}
 */
export function formSections({
	mode,
	category = 'calendario',
	idPrefix = mode === 'nuevo' ? 'ev' : 'edit',
	hasImage = false,
	parseError = false
}) {
	const tickets = { id: `${idPrefix}-tickets`, icon: '🎟️', label: 'Entradas' };
	if (mode === 'nuevo')
		return [
			{ id: 'sec-cuando', icon: '📅', label: 'Fecha y hora' },
			{ id: 'sec-datos', icon: '📝', label: 'Datos' },
			{ id: 'sec-direccion', icon: '🔗', label: 'Dirección' },
			{ id: 'sec-etiquetas', icon: '🏷️', label: 'Etiquetas' },
			tickets,
			{ id: 'sec-imagen', icon: '🖼️', label: 'Imagen' },
			{ id: 'sec-texto', icon: '📄', label: 'Texto' }
		];
	if (parseError) return [];
	const isEvent = category === 'calendario';
	return /** @type {FormSection[]} */ (
		[
			{ id: 'sec-datos', icon: '📝', label: 'Datos' },
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
	values: 'Datos',
	authors: 'Datos',
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
 * La sección visible para el índice: la última cuyo comienzo ya pasó la línea de lectura (o la
 * primera, si ninguna pasó todavía).
 * @param {Array<{ id: string, top: number }>} tops posición de cada sección respecto de la
 *   pantalla (`getBoundingClientRect().top`), en orden
 * @param {number} line altura de la línea de lectura (px desde arriba de la pantalla)
 * @returns {string} id de la sección, o '' si no hay secciones
 */
export function currentSection(tops, line) {
	let current = tops[0]?.id ?? '';
	for (const t of tops) if (t.top <= line) current = t.id;
	return current;
}

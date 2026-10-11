/**
 * Los textos de la vista previa al compartir un link (títulos, descripciones, frases de los
 * filtros y los nombres que van en las imágenes), editables desde el panel en Ajustes ›
 * Comunicación › Vistas previas al compartir. Acá están los originales (los que aprobó gorrite,
 * 11/10) y cómo se validan; se guardan solo los cambiados (src/lib/server/previewTexts.js). Sin
 * dependencias: lo leen el sitio, el panel y las pruebas. Ver docs/compartir.md.
 */

/** La frase oficial de gorrite, tal cual (con la coma antes de «y»). */
export const SITE_TAGLINE = 'Educación crítica, cultura transformativa, y comunidad disidente.';

/** El lugar del valor que cambia en una frase («con la etiqueta {x}»). */
export const PLACEHOLDER = '{x}';

/**
 * @typedef {object} PreviewTextField
 * @property {string} key la clave (`calendario.description`)
 * @property {string} group el grupo de la página del panel ({@link PREVIEW_TEXT_GROUPS})
 * @property {string} label qué es, para quien edita
 * @property {string} [help] dónde se ve o qué cuidar
 * @property {string} value el original
 * @property {number} max largo máximo
 * @property {boolean} [placeholder] tiene que llevar `{x}`
 * @property {boolean} [card] va escrito en una imagen
 */

/** Los grupos de la página del panel, en orden. */
export const PREVIEW_TEXT_GROUPS = Object.freeze([
	{ id: 'inicio', label: 'Inicio' },
	{ id: 'calendario', label: 'Calendario' },
	{ id: 'material', label: 'Material' },
	{ id: 'amigues', label: 'Amigues' },
	{ id: 'todo', label: 'Todo el contenido' },
	{ id: 'wiki', label: 'Kinkipedia' },
	{ id: 'filtros', label: 'Listas filtradas' },
	{ id: 'materialTipo', label: 'Qué es cada material' }
]);

const HEADING_HELP =
	'El título del link de la sección. Lo que va después de « · » es también el subtítulo de la imagen.';
const ITEMS_HELP =
	'Cómo se llama lo que lista, al principio de una lista filtrada: «{nombre} con la etiqueta…».';
const SHORT_HELP = 'El nombre corto, en el título de una lista filtrada: «{nombre} · terapia».';
const CARD_HELP = 'Va escrito grande en la imagen de la sección.';

/** @param {string} group @param {string} name @param {string} title @param {string} heading @param {string} description @param {string} items */
function section(group, name, title, heading, description, items) {
	return [
		{
			key: `${group}.heading`,
			group,
			label: 'Título',
			help: HEADING_HELP,
			value: heading,
			max: 120
		},
		{ key: `${group}.description`, group, label: 'Descripción', value: description, max: 200 },
		{
			key: `${group}.title`,
			group,
			label: 'Nombre corto',
			help: SHORT_HELP,
			value: title,
			max: 40
		},
		{
			key: `${group}.items`,
			group,
			label: 'Lo que lista',
			help: ITEMS_HELP,
			value: items,
			max: 40
		},
		...(name
			? [
					{
						key: `${group}.cardName`,
						group,
						label: 'Nombre en la imagen',
						help: CARD_HELP,
						value: name,
						max: 24,
						card: true
					}
				]
			: [])
	];
}

/** @type {ReadonlyArray<Readonly<PreviewTextField>>} */
export const PREVIEW_TEXT_FIELDS = Object.freeze(
	/** @type {PreviewTextField[]} */ ([
		{ key: 'home.title', group: 'inicio', label: 'Título', value: 'Kinky Vibe', max: 60 },
		{
			key: 'home.description',
			group: 'inicio',
			label: 'Descripción',
			help: 'La descripción del inicio.',
			value: SITE_TAGLINE,
			max: 200
		},
		{
			key: 'home.cardText',
			group: 'inicio',
			label: 'Frase de la imagen',
			help: 'Va escrita grande en la imagen del inicio, de todo el contenido y de las páginas sin imagen propia.',
			value: SITE_TAGLINE,
			max: 90,
			card: true
		},
		...section(
			'calendario',
			'Calendario',
			'Calendario',
			'Calendario · Próximos talleres, encuentros y eventos cuir y kinky',
			'Talleres, encuentros y eventos de Kinky Vibe y la comunidad, con fecha, lugar y entradas.',
			'Eventos'
		),
		{
			key: 'calendario.upcomingPrefix',
			group: 'calendario',
			label: 'Antes de los próximos eventos',
			help: 'Al principio de la descripción: «Próximos: Taller (5/10) y Jam (12/10).»',
			value: 'Próximos:',
			max: 30
		},
		...section(
			'material',
			'Material',
			'Material',
			'Material · Guías, artículos, libros y descargables sobre BDSM y kink',
			'Guías, artículos, libros, fanzines y descargables sobre BDSM y kink: material inicial para quienes empiezan y por práctica, como cuerdas, impacto o electro.',
			'Material'
		),
		...section(
			'amigues',
			'Amigues',
			'Amigues',
			'Amigues · Emprendimientos y profesionales de la comunidad',
			'Profesionales, proyectos y lugares cuir y kinky de la comunidad: sesiones, clases, terapia, arte, tiendas y más.',
			'Amigues'
		),
		...section(
			'todo',
			'',
			'Todo el contenido',
			'Todo el contenido · Eventos, material y amigues',
			'Todo Kinky Vibe en un mismo lugar: eventos, material y amigues. Filtrá por un tema, como shibari, y encontrá libros, talleres y les profesionales que dan clases.',
			'Contenido'
		),
		{
			key: 'wiki.title',
			group: 'wiki',
			label: 'Título',
			help: HEADING_HELP,
			value: 'Kinkipedia · Glosario cuir y kinky',
			max: 120
		},
		{
			key: 'wiki.description',
			group: 'wiki',
			label: 'Descripción',
			value:
				'Glosario cuir, kinky y BDSM de Kinky Vibe: qué es cada práctica, rol, implemento y término, con su material, eventos y amigues, y las series de encuentros que se repiten.',
			max: 200
		},
		{
			key: 'wiki.cardName',
			group: 'wiki',
			label: 'Nombre en la imagen',
			help: CARD_HELP,
			value: 'Kinkipedia',
			max: 24,
			card: true
		},
		{
			key: 'filtros.oneTag',
			group: 'filtros',
			label: 'Una etiqueta',
			help: '«Amigues con la etiqueta terapia.» {x} es la etiqueta.',
			value: 'con la etiqueta {x}',
			max: 60,
			placeholder: true
		},
		{
			key: 'filtros.manyTags',
			group: 'filtros',
			label: 'Varias etiquetas',
			help: '«Eventos con las etiquetas shibari y cuerdas.» {x} son las etiquetas.',
			value: 'con las etiquetas {x}',
			max: 60,
			placeholder: true
		},
		{
			key: 'filtros.text',
			group: 'filtros',
			label: 'Una búsqueda',
			help: '«Material que mencionan «sogas».» {x} es lo que se buscó.',
			value: 'que mencionan «{x}»',
			max: 60,
			placeholder: true
		},
		{
			key: 'materialTipo.downloadSuffix',
			group: 'materialTipo',
			label: 'Después del formato, si se descarga',
			help: '«Guía descargable · …» (con el espacio adelante).',
			value: ' descargable',
			max: 30
		},
		{
			key: 'materialTipo.downloadOnly',
			group: 'materialTipo',
			label: 'Si solo se sabe que se descarga',
			help: '«Descargable · …»',
			value: 'Descargable',
			max: 30
		}
	]).map((f) => Object.freeze(f))
);

/** @typedef {Record<string, string>} PreviewTexts */

/** Los textos originales, por clave. @type {Readonly<PreviewTexts>} */
export const PREVIEW_TEXT_DEFAULTS = Object.freeze(
	Object.fromEntries(PREVIEW_TEXT_FIELDS.map((f) => [f.key, f.value]))
);

/** @type {ReadonlyMap<string, Readonly<PreviewTextField>>} */
const FIELD_BY_KEY = new Map(PREVIEW_TEXT_FIELDS.map((f) => [f.key, f]));

/** ¿Es una clave de los textos? @param {string} key */
export const isPreviewTextKey = (key) => FIELD_BY_KEY.has(key);

/**
 * Los textos en uso: los originales con los cambiados encima (solo claves conocidas y textos no
 * vacíos; lo demás se ignora, así un dato viejo o roto nunca rompe una página).
 * @param {unknown} [overrides]
 * @returns {Readonly<PreviewTexts>}
 */
export function mergePreviewTexts(overrides) {
	if (!overrides || typeof overrides !== 'object') return PREVIEW_TEXT_DEFAULTS;
	/** @type {PreviewTexts} */
	const out = { ...PREVIEW_TEXT_DEFAULTS };
	for (const [key, value] of Object.entries(overrides)) {
		const field = FIELD_BY_KEY.get(key);
		if (!field || typeof value !== 'string' || !value.trim()) continue;
		if (validField(field, value) !== null) continue;
		out[key] = value;
	}
	return Object.freeze(out);
}

/**
 * El texto en una línea. Los espacios de adelante se guardan si el original los tiene (el sufijo
 * « descargable» va pegado al formato).
 * @param {Readonly<PreviewTextField>} field
 * @param {string} raw
 */
function cleanValue(field, raw) {
	const flat = raw.replace(/\s+/g, ' ');
	return field.value.startsWith(' ') ? ' ' + flat.trim() : flat.trim();
}

/**
 * El error de un texto, o `null` si está bien.
 * @param {Readonly<PreviewTextField>} field
 * @param {string} value ya limpio
 */
function validField(field, value) {
	if (value.length > field.max) return `Hasta ${field.max} caracteres.`;
	if (/[<>]/.test(value)) return 'Sin < ni >.';
	const braces = value.match(/\{[^}]*\}|[{}]/g) ?? [];
	if (field.placeholder) {
		if (!value.includes(PLACEHOLDER))
			return `Tiene que llevar ${PLACEHOLDER}: ahí va lo que cambia.`;
		if (braces.length !== 1) return `Solo un ${PLACEHOLDER}, sin otras llaves.`;
	} else if (braces.length) {
		return 'Sin llaves { }: este texto no lleva nada que cambie.';
	}
	return null;
}

/**
 * Valida el formulario del panel (una entrada por clave; un campo vacío o igual al original
 * vuelve al original). `value` trae solo los cambiados: es lo que se guarda.
 * @param {Record<string, unknown>} form
 * @returns {{ ok: true, value: PreviewTexts } | { ok: false, errors: Record<string, string>, values: PreviewTexts }}
 */
export function validatePreviewTexts(form) {
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {PreviewTexts} */
	const value = {};
	/** @type {PreviewTexts} */
	const values = {};
	for (const field of PREVIEW_TEXT_FIELDS) {
		const raw = form[field.key];
		if (typeof raw !== 'string') continue;
		const v = cleanValue(field, raw);
		values[field.key] = v;
		if (!v.trim() || v === field.value) continue;
		const error = validField(field, v);
		if (error) errors[field.key] = error;
		else value[field.key] = v;
	}
	return Object.keys(errors).length ? { ok: false, errors, values } : { ok: true, value };
}

/**
 * La frase con el valor en lugar de `{x}`.
 * @param {string} template
 * @param {string} x
 */
export const fillPlaceholder = (template, x) => template.split(PLACEHOLDER).join(x);

/**
 * El subtítulo de una imagen: lo que va después del primer « · » del título («Calendario ·
 * Próximos talleres…» → «Próximos talleres…»); sin « · », nada.
 * @param {string} heading
 */
export function cardSubtitle(heading) {
	const i = heading.indexOf(' · ');
	return i === -1 ? '' : heading.slice(i + 3).trim();
}

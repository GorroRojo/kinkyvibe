/**
 * Publicaciones inventadas de la versión 2 de «Filtros en el celu»: dos listas (calendario y
 * material) para ver la misma barra en las dos. Títulos y textos de ejemplo; las etiquetas son
 * las del árbol del sitio, así los chips tienen su color y su emoji. Solo las usa el prototipo.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Fecha a N días de hoy, a la hora UTC dada (22 = 19 h en Argentina). */
const at = (/** @type {number} */ days, /** @type {number} */ utcHour) => {
	const d = new Date(Date.now() + days * DAY);
	d.setUTCHours(utcHour, 0, 0, 0);
	return d.toISOString();
};

/** @type {[string, string[], number][]} */
const EVENTOS = [
	[
		'Taller de prueba: nudos básicos',
		['taller', 'jam de cuerdas', 'Presencial', 'AMBA', 'pago'],
		3
	],
	['Fiesta de ejemplo en Lugar Inventado', ['fiesta', 'Presencial', 'AMBA', 'pago'], 5],
	['Charla debate de muestra', ['charla debate', 'Online', 'gratis', 'español'], 6],
	['Cine de prueba: función inventada', ['cine', 'Presencial', 'Córdoba', 'a la gorra'], 8],
	['Grupo de apoyo de ejemplo', ['grupo', 'Online', 'gratis', 'español'], 9],
	['Taller de muestra en LSA', ['taller', 'Online', 'LSA', 'pago'], 11],
	['Jam de cuerdas inventada', ['jam de cuerdas', 'Presencial', 'Rosario', 'a la gorra'], 12],
	['Feria de prueba', ['feria', 'Presencial', 'AMBA', 'gratis'], 14],
	// Muchas etiquetas y nombres largos: para ver el buscador con 5 o más elegidas.
	[
		'Charla de prueba con muchas etiquetas',
		[
			'charla debate',
			'Presencial',
			'AMBA',
			'gratis',
			'español',
			'género y salud sexual',
			'despatologización',
			'neurodivergencia',
			'cuidados posteriores',
			'antipunitivismo'
		],
		15
	],
	['Laboratorio de ejemplo', ['laboratorio', 'taller', 'Presencial', 'La Plata', 'pago'], 17],
	['Perfo de muestra', ['perfo', 'cabaret', 'Presencial', 'AMBA', 'pago'], 19],
	['Taller de prueba en inglés', ['taller', 'Online', 'inglés', 'pago'], 22],
	['Rancheadita inventada', ['rancheadita', 'Presencial', 'Montevideo', 'gratis'], 25],
	['Taller de prueba que ya pasó', ['taller', 'Presencial', 'AMBA', 'pago'], -10],
	['Fiesta de ejemplo que ya pasó', ['fiesta', 'Presencial', 'Córdoba', 'pago'], -20]
];

/** @type {[string, string[], number][]} */
const MATERIALES = [
	['Guía de ejemplo sobre negociación', ['guía', 'web', 'negociación', 'español', 'gratis'], -30],
	[
		'Fanzine inventado de cuidados',
		['fanzine', 'descargable', 'cuidados posteriores', 'gratis'],
		-45
	],
	['Checklist de prueba antes de jugar', ['checklist', 'descargable', 'seguridad', 'gratis'], -60],
	[
		'Artículo de muestra sobre consentimiento',
		['artículo', 'web', 'consentimiento', 'español'],
		-75
	],
	['Libro de ejemplo (en inglés)', ['libro', 'descargable', 'inglés', 'pago'], -90],
	['Video inventado: nudos para empezar', ['video', 'web', 'seguridad', 'español', 'gratis'], -120],
	['Juego de prueba para negociar', ['interactivo', 'web', 'negociación', 'gratis'], -150],
	[
		'Guía de muestra para después de la sesión',
		['guía', 'descargable', 'cuidados posteriores', 'pago'],
		-200
	]
];

/** @type {any[]} */
export const eventos = EVENTOS.map(([title, tags, days], i) => ({
	path: `/estilo/prototipos/filtros-celu-v2#evento-${i + 1}`,
	meta: {
		title,
		summary: 'Evento inventado para el prototipo: no existe.',
		tags,
		category: 'calendario',
		start: at(days, 22),
		end: at(days, 25)
	}
}));

/** @type {any[]} */
export const materiales = MATERIALES.map(([title, tags, days], i) => ({
	path: `/estilo/prototipos/filtros-celu-v2#material-${i + 1}`,
	meta: {
		title,
		summary: 'Material inventado para el prototipo: no existe.',
		tags,
		category: 'material',
		authors: ['Colectivo de Ejemplo'],
		published_date: at(days, 15)
	}
}));

/**
 * Etiquetas del sistema: las que el código nombra literalmente (por su id), así que se rompería
 * algo si se renombran o se fusionan con otra desde /admin/etiquetas. `applyTagOps`
 * (./tagConfig.js) lo frena, y por ahí pasan los dos modos del editor (archivo y `etiquetas_db`),
 * Series y el panel. Se les puede cambiar el nombre visible, el ícono, la descripción, etc.
 *
 * Si agregás un nombre literal de etiqueta en src/, sumalo acá con el motivo.
 * Sin imports: lo usan el navegador, el servidor y vitest.
 */

/** @type {Readonly<Record<string, string>>} id de la etiqueta → para qué la usa el código */
export const SYSTEM_TAGS = Object.freeze({
	KinkyVibe:
		'marca lo que organiza KinkyVibe (tarjetas, propinas al Fondo, entradas: isKinkyVibePost, isKinkyVibeEvent)',
	'evento recurrente': 'es la madre de las series (sus hijas son las series de eventos)',
	calendario: 'es la raíz de las etiquetas de eventos',
	material: 'es la raíz de las etiquetas de material',
	amigues: 'es la raíz de las etiquetas de amigues',
	lugar: 'agrupa los lugares de los eventos (el editor de eventos elige uno)',
	idioma: 'agrupa los idiomas (el editor de eventos y de material elige uno)',
	precio: 'agrupa los precios (el editor de eventos y de material)',
	Online: 'es el lugar de los eventos online («online» y «virtual» se leen como esta)',
	Presencial: 'agrupa los lugares presenciales (el editor de eventos y de amigues)',
	Argentina: 'agrupa los lugares de Argentina (el editor de eventos y de amigues)',
	Uruguay: 'agrupa los lugares de Uruguay (el editor de eventos)',
	web: 'es la etiqueta de material web, que el editor de eventos esconde (antes «online»)',
	español: 'es el idioma por defecto de los eventos',
	LSA: 'es la interpretación en lengua de señas, que va además del idioma hablado',
	'tipo de material': 'arma los atajos del editor de material',
	'formato de material': 'arma los atajos del editor de material',
	'tipo de perfil': 'arma los atajos del editor de amigues',
	servicio: 'arma los atajos del editor de amigues'
});

/**
 * ¿Es una etiqueta del sistema? (por id exacto, como las nombra el código)
 * @param {unknown} id
 */
export const isSystemTag = (id) =>
	typeof id === 'string' && Object.prototype.hasOwnProperty.call(SYSTEM_TAGS, id);

/**
 * El mensaje para quien intenta renombrar o fusionar una etiqueta del sistema.
 * @param {string} id
 * @param {'rename' | 'merge'} action
 */
export function systemTagMessage(id, action) {
	const what = action === 'merge' ? 'fusionar con otra' : 'renombrar';
	return `«${id}» es una etiqueta del sistema (${SYSTEM_TAGS[id]}): el sitio la usa por su nombre, así que no se puede ${what}. Podés cambiarle el nombre visible, el ícono o la descripción.`;
}

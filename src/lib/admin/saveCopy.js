/**
 * Los textos de los formularios sobre guardar: todo lo que el panel guarda va a la base y se ve
 * enseguida (decisión 0032; ya no hay textos de GitHub, PRs ni deploys).
 *
 * Lo usan /admin/eventos/nuevo (crear y duplicar), PostEditor (editar), ContentEditor (material y
 * amigues), FilePreview y las acciones del servidor de esas páginas (los mensajes de error).
 */

/**
 * @typedef {object} SaveCopy
 * @prop {string} editHelp debajo del formulario de Editar (PostEditor)
 * @prop {boolean} askGorrite si después de `editHelp` va «Si pasa más tiempo, avisale a» (Telegram de gorrite)
 * @prop {string} contentHelp en la barra de guardar de ContentEditor
 * @prop {string} contentSaved ContentEditor, guardado sin PR
 * @prop {string} contentCreated ContentEditor, recién creado sin PR
 * @prop {string} checkingSlug mientras se comprueba si la dirección está libre
 * @prop {string} confirmPublish «¿Publicar … en el calendario?» (después del título)
 * @prop {string} saving mientras se guarda el evento nuevo
 * @prop {string} filePreview el título plegable de FilePreview
 * @prop {string} eventReadFailed error al leer el evento original (al duplicar)
 * @prop {string} postReadFailed error al leer la publicación
 * @prop {string} slugCheckFailed error al comprobar la dirección
 * @prop {string} saveFailed error al guardar el evento nuevo
 * @prop {string} slugTaken la dirección de la publicación nueva ya existe
 * @prop {string} pathExists al guardar, la dirección elegida ya existe
 * @prop {string} changedMeanwhile alguien guardó la misma publicación mientras se editaba
 */

/** @type {Readonly<SaveCopy>} */
const DB = Object.freeze({
	editHelp: 'Al guardar, el cambio se ve enseguida en el sitio y queda en el historial.',
	askGorrite: false,
	contentHelp: 'Los cambios se ven enseguida en el sitio (una imagen nueva tarda unos minutos).',
	contentSaved: 'Guardado. Ya se ve en el sitio.',
	contentCreated: 'Ya se ve en el sitio (y en la lista).',
	checkingSlug: 'Comprobando…',
	confirmPublish: 'Se va a ver en el sitio enseguida.',
	saving: 'Guardando…',
	filePreview: 'Ver los datos que se van a guardar (en formato de archivo .md)',
	eventReadFailed: 'No pudimos leer el evento: ',
	postReadFailed: 'No pudimos leer la publicación: ',
	slugCheckFailed: 'No pudimos comprobar la dirección: ',
	saveFailed: 'No se pudo guardar: ',
	slugTaken: 'Ya existe una publicación (o su carpeta de imágenes) con esa dirección.',
	pathExists: 'Ya existe una publicación con esa dirección. Elegí otra.',
	changedMeanwhile:
		'Alguien cambió esta publicación mientras la editabas. Copiá tus cambios, recargá la página y volvé a intentar.'
});

/**
 * Los textos de guardar. El argumento no cuenta: lo siguen pasando algunos formularios
 * (`data.savesToDb`, siempre `true`) hasta que se limpien.
 *
 * @param {unknown} [_savesToDb]
 * @returns {Readonly<SaveCopy>}
 */
export function saveCopy(_savesToDb) {
	return DB;
}

/**
 * La confirmación corta de la barra de guardar (y la que se anuncia a los lectores de pantalla)
 * después de guardar bien. Todo va a la base, así que es siempre la misma; el argumento (lo que
 * devolvió el guardado) queda hasta que los formularios dejen de pasarlo.
 *
 * @param {{ savedToDb?: boolean | null, pr?: unknown }} [_result]
 */
export function savedSummary(_result) {
	return 'Guardado. Se ve enseguida en el sitio.';
}

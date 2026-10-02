/**
 * Los textos de los formularios de eventos y material que dependen de adónde se guarda: con el
 * interruptor `contenido_db` prendido (y un post que está en la base, o uno nuevo de una categoría
 * que va a la base) se guarda en la base y se ve enseguida; apagado, cada guardado es un PR en
 * GitHub que se publica solo cuando pasan las pruebas (tarda unos minutos).
 *
 * Con el interruptor apagado los textos son exactamente los de siempre.
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
 * @prop {string} changedMeanwhile alguien guardó la misma publicación mientras se editaba
 */

/** @type {Readonly<SaveCopy>} */
const GITHUB = Object.freeze({
	editHelp:
		'Al guardar, el cambio pasa por las pruebas automáticas y se publica solo: tarda unos minutos (normalmente menos de 15) en verse.',
	askGorrite: true,
	contentHelp: 'Los cambios tardan unos minutos (normalmente entre 2 y 5) en verse en el sitio.',
	contentSaved: 'Guardado. El sitio se actualiza en unos minutos.',
	contentCreated: 'Se ve en el sitio (y en la lista) cuando termina el deploy, en unos minutos.',
	checkingSlug: 'Comprobando en GitHub…',
	confirmPublish: 'Se va a ver en el sitio en unos minutos.',
	saving: 'Guardando en GitHub…',
	filePreview: 'Ver el archivo que se va a guardar',
	eventReadFailed: 'No pudimos leer el evento desde GitHub: ',
	postReadFailed: 'No pudimos leer la publicación desde GitHub: ',
	slugCheckFailed: 'No pudimos consultar GitHub: ',
	saveFailed: 'No se pudo guardar en GitHub: ',
	slugTaken: 'Ya existe una publicación (o su carpeta de imágenes) con esa dirección en GitHub.',
	changedMeanwhile:
		'Alguien cambió esta publicación en GitHub mientras la editabas. Copiá tus cambios, recargá la página y volvé a intentar.'
});

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
	changedMeanwhile:
		'Alguien cambió esta publicación mientras la editabas. Copiá tus cambios, recargá la página y volvé a intentar.'
});

/**
 * Los textos según adónde se guarda.
 *
 * @param {boolean | null | undefined} savesToDb
 * @returns {Readonly<SaveCopy>}
 */
export function saveCopy(savesToDb) {
	return savesToDb ? DB : GITHUB;
}

/**
 * «Ya existe <ruta>»: con GitHub, la ruta del archivo; con la base, sin rutas.
 *
 * @param {boolean | null | undefined} savesToDb
 * @param {string} path
 */
export function pathExistsMessage(savesToDb, path) {
	return savesToDb
		? 'Ya existe una publicación con esa dirección. Elegí otra.'
		: `Ya existe ${path} en GitHub. Elegí otra dirección.`;
}

/**
 * La confirmación corta de la barra de guardar (y la que se anuncia a los lectores de pantalla)
 * después de guardar bien.
 *
 * @param {{ savedToDb?: boolean | null, pr?: null | undefined | { state?: string } }} result
 *   `savedToDb`: el post se guardó en la base; `pr`: el PR de GitHub (con la base, solo si además
 *   había una imagen nueva, que sigue yendo al repo)
 */
export function savedSummary({ savedToDb, pr }) {
	if (savedToDb && pr)
		return 'Guardado. Se ve enseguida en el sitio; la imagen nueva tarda unos minutos.';
	if (savedToDb) return 'Guardado. Se ve enseguida en el sitio.';
	if (pr?.state === 'open') return 'Guardado, pero no se publica solo: mirá el aviso de arriba.';
	if (pr?.state === 'merged')
		return 'Guardado y publicado. El sitio se actualiza en un par de minutos.';
	if (pr) return 'Guardado. Se publica en unos minutos, cuando pasen las pruebas.';
	return 'Guardado.';
}

/**
 * ¿El guardado fue a la base? Lo que devuelve `commitFiles` con el interruptor prendido trae
 * `db` con los posts que guardó ($lib/server/contenido/repo.js).
 *
 * @param {unknown} commit
 */
export function commitSavedToDb(commit) {
	const db = /** @type {{ db?: unknown } | null | undefined} */ (commit)?.db;
	return Array.isArray(db) && db.length > 0;
}

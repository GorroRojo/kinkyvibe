/**
 * Las imágenes viejas del repo (las de las carpetas `media/` de cada publicación y las de
 * `src/lib/assets`), que ya no están en el repo (decisión 0032): cada una tiene su copia en la
 * biblioteca (R2, docs/imagenes.md), con la misma clave por contenido. Este mapa dice cuál es.
 *
 * Lo siguen nombrando los datos de la base que todavía usan la forma vieja: el `featured` numérico
 * o con nombre de archivo de un evento o material sin edge `portada`, la foto o el logo de un
 * perfil sin edge `avatar`, la `image` de una serie sin edge `imagen` y las imágenes que un texto
 * importa de su carpeta (`./media/<carpeta>/1.webp`). Así esos datos se siguen viendo igual sin
 * reescribirlos.
 *
 * `legacyMedia.json` se generó una vez, con el SHA-256 de cada archivo, antes de borrarlos; cada
 * dirección se verificó contra la biblioteca de producción. Es fijo: lo nuevo va siempre a la
 * biblioteca.
 *
 * En producción la dirección es la del propio sitio (`/media/img/…`). En local, en las pruebas y
 * en los previews (que no tienen esas imágenes en su R2) se usa la del sitio público, como las
 * copias de eventos reales del modo demo ($lib/utils/media.js, `isPublicMediaUrl`).
 *
 * Sin dependencias de servidor: corre en el navegador, en el servidor y en vitest.
 */
import map from './legacyMedia.json';

/** @type {Readonly<Record<string, string>>} */
const MAP = map;

/** El sitio público, para lo que no corre en producción. */
const ORIGIN = __DEPLOY_BRANCH__ === 'main' ? '' : 'https://kinkyvibe.ar';

/** El orden en que se buscaba la imagen numerada de una publicación. */
const NUMBERED_EXTS = ['jpeg', 'jfif', 'jpg', 'png', 'webp'];

const SAFE = /^[\w.-]+$/;

/** @param {string | undefined} path */
const urlOf = (path) => (path ? ORIGIN + path : undefined);

/**
 * La imagen de la biblioteca de un archivo de la carpeta de medios de una publicación vieja
 * (`calendario`, `material`, `amigues`), por nombre de archivo («5.webp», «spoiler.webp»).
 *
 * @param {string} category
 * @param {string} folder la carpeta (la dirección vieja de la publicación)
 * @param {string} file
 * @returns {string | undefined}
 */
export function legacyMediaURL(category, folder, file) {
	if (!SAFE.test(String(category)) || !SAFE.test(String(folder)) || !SAFE.test(String(file))) {
		return undefined;
	}
	return urlOf(MAP[`posts/${category}/media/${folder}/${file}`]);
}

/**
 * La imagen numerada de una publicación vieja (`featured: 2`), con cualquiera de las extensiones
 * de siempre.
 *
 * @param {string} category
 * @param {string} folder
 * @param {string | number} n
 * @returns {string | undefined}
 */
export function legacyNumberedURL(category, folder, n) {
	if (!/^\d+$/.test(String(n))) return undefined;
	for (const ext of NUMBERED_EXTS) {
		const url = legacyMediaURL(category, folder, `${n}.${ext}`);
		if (url) return url;
	}
	return undefined;
}

/**
 * La imagen de la biblioteca de un archivo de `src/lib/assets` («serie.webp»).
 *
 * @param {string} file
 * @returns {string | undefined}
 */
export function legacyAssetURL(file) {
	return SAFE.test(String(file)) ? urlOf(MAP[`assets/${file}`]) : undefined;
}

/** Los nombres de los archivos de `src/lib/assets` que había, ordenados. */
export function legacyAssetNames() {
	return Object.keys(MAP)
		.filter((k) => k.startsWith('assets/'))
		.map((k) => k.slice('assets/'.length))
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Las carpetas de medios que tenía una categoría (sus nombres son direcciones viejas: no se
 * reusan, así una publicación nueva no hereda las imágenes de otra).
 *
 * @param {string} category
 * @returns {string[]}
 */
export function legacyMediaFolders(category) {
	const prefix = `posts/${category}/media/`;
	/** @type {Set<string>} */
	const out = new Set();
	for (const k of Object.keys(MAP))
		if (k.startsWith(prefix)) out.add(k.slice(prefix.length).split('/')[0]);
	return [...out].sort();
}

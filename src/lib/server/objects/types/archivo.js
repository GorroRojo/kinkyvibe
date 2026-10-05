/**
 * Tipo núcleo `archivo`: un documento (PDF, ODT, ODS, ODP) o un video (MP4, WebM) de la
 * biblioteca, guardado en R2 (bucket `MEDIA`) como las imágenes. Ver docs/imagenes.md.
 *
 * Es un tipo hermano de `imagen` (y no un `imagen` con otro `mime`) para que ningún uso de una
 * imagen (portada, avatar, imagen de una serie) pueda apuntar a un PDF o a un video: los edges
 * dicen hacia qué TIPO van, y esos siguen siendo solo `imagen`.
 *
 * - El archivo vive en R2 con una clave por contenido (`file/<sha-256>.<ext>`): el mismo archivo
 *   subido dos veces es el mismo objeto. El `slug` es ese mismo hash (único por tipo).
 * - `title` (del objeto) es el nombre que se muestra y con el que se busca: obligatorio al subir
 *   (en vez del texto alternativo de una imagen).
 * - Un texto que lo enlaza (`/media/file/<hash>.pdf`) lo nombra por su dirección, como un texto
 *   que muestra una imagen: no hay ids adentro del JSON. Además, un material tiene un edge
 *   `adjunto` hacia cada archivo que su texto enlaza; ese edge sigue al texto: lo calcula cada
 *   guardado ({@link fileKeysInText}, {@link liveFileIds}; ver `deriveEdges` en ./material.js).
 * - Solo les admins suben archivos (src/lib/server/media/access.js y /imagenes).
 * - Borrar es el borrado suave del objeto: `/media/…` deja de servirlo; el archivo queda en R2.
 *
 * Solo usa imports relativos.
 */

/** Tipos de archivo que se guardan (detectados por los bytes, src/lib/server/media/sniff.js). */
export const FILE_MIMES = /** @type {const} */ ([
	'application/pdf',
	'video/mp4',
	'video/webm',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.presentation'
]);

/** Clave en R2: `file/<sha-256 en hex>.<ext>`. */
export const FILE_KEY = /^file\/[0-9a-f]{64}\.(?:pdf|mp4|webm|odt|ods|odp)$/;

/**
 * Un enlace a un archivo de la biblioteca dentro de un texto: `/media/file/<sha-256>.<ext>` (con o
 * sin el dominio adelante). Lo de después de la extensión no puede seguir la palabra (así
 * `….pdfx` no cuenta).
 */
const FILE_URL = /\/media\/(file\/[0-9a-f]{64}\.(?:pdf|mp4|webm|odt|ods|odp))(?![0-9A-Za-z_])/g;

/**
 * Pura: las claves (`file/<hash>.<ext>`) de los archivos que estos textos enlazan, sin repetir y en
 * el orden en que aparecen.
 *
 * @param {readonly unknown[]} texts
 * @returns {string[]}
 */
export function fileKeysInText(texts) {
	/** @type {Set<string>} */
	const keys = new Set();
	for (const text of texts) {
		if (typeof text !== 'string') continue;
		for (const m of text.matchAll(FILE_URL)) keys.add(m[1]);
	}
	return [...keys];
}

/**
 * Los ids de los archivos VIVOS (sin borrar) con esas claves, en el orden de `keys`. Una clave que
 * no es de ningún archivo vivo no está (no hay a qué apuntar).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {readonly string[]} keys
 * @returns {Promise<number[]>}
 */
export async function liveFileIds(db, keys) {
	if (!keys.length) return [];
	const { results } = await db
		.prepare(
			`SELECT id, json_extract(data, '$.key') AS key FROM objects
			WHERE type = 'archivo' AND deleted_at IS NULL
			AND slug IN (SELECT substr(value, 6, 64) FROM json_each(?1))
			AND json_extract(data, '$.key') IN (SELECT value FROM json_each(?1))`
		)
		.bind(JSON.stringify(keys))
		.all();
	const byKey = new Map(results.map((r) => [String(r.key), Number(r.id)]));
	return keys.flatMap((k) => (byKey.has(k) ? [/** @type {number} */ (byKey.get(k))] : []));
}

/** @type {import('./index.js').CoreType} */
const archivo = {
	type: 'archivo',
	label: 'Archivo',
	fields: {
		key: { kind: 'text', label: 'Archivo', required: true, max: 100 },
		mime: { kind: 'option', label: 'Tipo de archivo', options: FILE_MIMES, required: true },
		size: { kind: 'integer', label: 'Peso (bytes)', min: 1, required: true },
		original_name: { kind: 'text', label: 'Nombre del archivo original', max: 200 },
		// De dónde salió un archivo que se pasó del repo (`src/lib/posts/material/media/…/1.pdf`):
		// así ese paso no lo duplica y se sabe qué reemplaza.
		source_path: { kind: 'text', label: 'Archivo del repo', max: 300 }
	},
	edges: {},
	check(data) {
		/** @type {import('../fields.js').FieldError[]} */
		const errors = [];
		if (data.key !== undefined && !FILE_KEY.test(String(data.key))) {
			errors.push({ path: 'key', message: 'Archivo: clave de archivo inválida' });
		}
		return errors;
	},
	searchText(data) {
		return [data.original_name].filter(Boolean).join('\n');
	}
};

export default archivo;

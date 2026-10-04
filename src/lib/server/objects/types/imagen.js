/**
 * Tipo núcleo `imagen`: un archivo de imagen guardado en R2 (bucket `MEDIA`), con su texto
 * alternativo y sus medidas. Ver docs/imagenes.md.
 *
 * - El archivo vive en R2 con una clave por contenido (`img/<sha-256>.<ext>`): el mismo archivo
 *   subido dos veces es la misma imagen. El `slug` del objeto es ese mismo hash (único por tipo).
 * - `title` es el nombre para buscarla (por defecto, el nombre del archivo).
 * - Quién la subió y cuándo: `created_by` / `created_at` del objeto (solo les admins lo ven).
 * - Cada USO es un edge HACIA la imagen, nunca un id en el JSON: evento → imagen `portada`,
 *   material → imagen `portada`, etiqueta (serie) → imagen `imagen`, perfil → imagen `avatar`.
 * - Borrar es el borrado suave del objeto: deja de aparecer en la biblioteca y `/media/…` deja de
 *   servirla. El archivo queda en R2 (es barato y permite deshacer).
 *
 * Solo usa imports relativos.
 */

/** Tipos de archivo que se guardan (lo que manda el navegador después de achicar). */
export const IMAGE_MIMES = /** @type {const} */ ([
	'image/webp',
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/avif'
]);

/** Clave en R2: `img/<sha-256 en hex>.<ext>`. */
export const MEDIA_KEY = /^img\/[0-9a-f]{64}\.(?:webp|jpg|png|gif|avif)$/;

/** Texto alternativo: como mucho. */
export const ALT_MAX = 1000;

/** @type {import('./index.js').CoreType} */
const imagen = {
	type: 'imagen',
	label: 'Imagen',
	fields: {
		key: { kind: 'text', label: 'Archivo', required: true, max: 100 },
		mime: { kind: 'option', label: 'Tipo de archivo', options: IMAGE_MIMES, required: true },
		size: { kind: 'integer', label: 'Peso (bytes)', min: 1, required: true },
		width: { kind: 'integer', label: 'Ancho', min: 1, max: 20_000 },
		height: { kind: 'integer', label: 'Alto', min: 1, max: 20_000 },
		alt: { kind: 'longtext', label: 'Texto alternativo', max: ALT_MAX },
		original_name: { kind: 'text', label: 'Nombre del archivo original', max: 200 },
		// De dónde salió una imagen importada del repo (`src/lib/posts/…/media/…/1.webp` o
		// `src/lib/assets/…`): así la importación no la duplica y se sabe qué reemplaza.
		source_path: { kind: 'text', label: 'Archivo del repo', max: 300 }
	},
	edges: {},
	check(data) {
		/** @type {import('../fields.js').FieldError[]} */
		const errors = [];
		if (data.key !== undefined && !MEDIA_KEY.test(String(data.key))) {
			errors.push({ path: 'key', message: 'Archivo: clave de imagen inválida' });
		}
		return errors;
	},
	searchText(data) {
		return [data.alt, data.original_name].filter(Boolean).join('\n');
	}
};

export default imagen;

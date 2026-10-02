/**
 * Tipo núcleo `etiqueta` (paso 3 de 0026, «Etiquetas a objetos»; diseño de gorrite, ver
 * docs/etiquetas.md). Cada etiqueta es un nodo central: su texto de la wiki es el `body`, y los
 * eventos, el material y les amigues la nombran por su `key`.
 *
 * - `key` es el nombre EXACTO con el que los posts la nombran en `tags:` (con mayúsculas, tildes y
 *   espacios: «Rancheadita Kinky»). Es lo que hoy es el `id` en src/lib/utils/hardcodedTags.js.
 *   Es única entre las etiquetas vivas (índice `objects_etiqueta_key`, migración 0029).
 * - El `title` del objeto es el nombre para mostrar (el `visible_name` de hoy); sin uno propio, es
 *   igual a `key`.
 * - Relaciones (edges salientes):
 *   - `hijo_de` → etiqueta: sus madres (varias: es un grafo, no un árbol). `data.orden` es el lugar
 *     entre las hijas de esa madre (el orden de `children` en el archivo de hoy);
 *   - `relacionada_con` → etiqueta: las relacionadas declaradas acá (al leer se muestran en los
 *     dos sentidos, como hoy);
 *   - `alias_de` → etiqueta (una sola): esta etiqueta es otro nombre de aquella. Un alias no tiene
 *     más datos que su `key` (lo controla quien guarda: src/lib/server/etiquetas/).
 * - Las series son etiquetas hijas de «evento recurrente», con imagen (decisión 0005).
 *
 * Solo usa imports relativos (lo usa el cron nocturno, que no pasa por Vite).
 */

/**
 * @typedef {{
 *   key: string,
 *   icon?: string,
 *   color?: string,
 *   description?: string,
 *   image?: string,
 *   body?: string,
 *   wiki_title?: string,
 *   wiki_summary?: string,
 *   wiki_authors?: string[]
 * }} EtiquetaData
 */

export const TAG_TYPE = 'etiqueta';

export const KEY_MAX = 100;
export const ICON_MAX = 16;
export const DESCRIPTION_MAX = 2000;
export const WIKI_BODY_MAX = 50_000;

/** Los campos que puede tener un alias (nada más que su nombre). */
export const ALIAS_FIELDS = Object.freeze(['key']);

/**
 * Colores como los de hoy: un nombre (`darkblue`), un hex (`#ff4444`) o una variable del tema
 * (`var(--3-dark)`). Nada que pueda cerrar el `style` donde se usa.
 */
export const COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,30}|var\(--[a-z0-9-]{1,30}\))$/i;

/**
 * Una imagen de src/lib/assets (el nombre del archivo, como `image` de las series hoy:
 * «picantearla-miniatura.webp») o la de un evento, `calendario:<evento>/<archivo>`
 * (src/lib/posts/calendario/media/<evento>/<archivo>, ver seriesImage en $lib/utils/series.js).
 * Sin otras carpetas ni links de afuera.
 */
export const IMAGE_KEY =
	/^(?:calendario:[A-Za-z0-9][A-Za-z0-9_-]{0,150}\/)?[A-Za-z0-9][A-Za-z0-9_.-]{0,150}\.(?:webp|png|jpe?g|jfif|gif|avif)$/;

/** @type {import('./index.js').CoreType} */
const etiqueta = {
	type: TAG_TYPE,
	label: 'Etiqueta',
	fields: {
		key: { kind: 'text', label: 'Nombre en los posts', required: true, max: KEY_MAX },
		icon: { kind: 'text', label: 'Ícono', max: ICON_MAX },
		color: { kind: 'text', label: 'Color', max: 40 },
		description: { kind: 'longtext', label: 'Descripción', max: DESCRIPTION_MAX },
		image: { kind: 'text', label: 'Imagen', max: 160 },
		body: { kind: 'longtext', label: 'Texto de la wiki', max: WIKI_BODY_MAX },
		wiki_title: { kind: 'text', label: 'Título de la wiki', max: 200 },
		wiki_summary: { kind: 'longtext', label: 'Resumen de la wiki', max: 1000 },
		wiki_authors: { kind: 'list', label: 'Autores de la wiki', max: 20 }
	},
	edges: {
		hijo_de: { label: 'Etiqueta madre', to: [TAG_TYPE] },
		relacionada_con: { label: 'Relacionada con', to: [TAG_TYPE] },
		alias_de: { label: 'Alias de', to: [TAG_TYPE], max: 1 }
	},
	check(data) {
		/** @type {import('../fields.js').FieldError[]} */
		const errors = [];
		const key = String(data.key ?? '');
		if (key && /[[\]]/.test(key)) {
			errors.push({ path: 'key', message: 'Nombre en los posts: no puede tener corchetes' });
		}
		if (data.color !== undefined && !COLOR.test(String(data.color))) {
			errors.push({
				path: 'color',
				message: 'Color: un nombre (darkblue), un código (#ff4444) o una variable (var(--1))'
			});
		}
		if (data.image !== undefined && !IMAGE_KEY.test(String(data.image))) {
			errors.push({
				path: 'image',
				message: 'Imagen: tiene que ser una imagen del sitio (por ejemplo serie-miniatura.webp)'
			});
		}
		return errors;
	},
	searchText(data) {
		return [data.key, data.description, data.wiki_title, data.wiki_summary]
			.filter(Boolean)
			.join('\n');
	}
};

export default etiqueta;

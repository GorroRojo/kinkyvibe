/**
 * Tipo núcleo `evento`. Los campos siguen los nombres del frontmatter de los .md de calendario
 * (src/lib/utils/eventDraft.js), así la importación es directa (src/lib/server/contenido/eventos.js
 * tiene el mapa completo, ida y vuelta). El lugar NO es un campo: es un edge `lugar` hacia el
 * perfil del lugar; tampoco los perfiles de `personas` (edges `persona`, ver `edges` abajo).
 *
 * - `start`/`end` llevan su zona; las columnas generadas `start_at`/`end_at` (migración 0031) los
 *   tienen en ms para ordenar y filtrar. `event_status` y `unlisted` también son columnas.
 * - `unlisted` es el `force_unlisted` de los .md (se ve con el link, no en las listas). El
 *   `force_unpublished` no es un campo: es la visibilidad `hidden` del objeto.
 * - `extra`: lo que el frontmatter tiene y el tipo todavía no conoce como campo propio
 *   (configuración de entradas, colores del carrusel…), tal cual, para que nada se pierda al
 *   importar. Cuando algo de ahí se use desde la base, se pasa a un campo propio.
 *
 * El sitio lo lee solo de la base (docs/contenido.md, «En la base»).
 */

import { eventLinkProblem } from '../../../utils/eventLink.js';
import { personaItemsProblems } from '../../../utils/personasList.js';

/**
 * @typedef {{
 *   summary?: string,
 *   status?: 'anunciado' | 'abierto' | 'agotadas' | 'cancelado',
 *   start: string,
 *   end?: string,
 *   link?: string,
 *   link_text?: string,
 *   body?: string,
 *   body_html?: 'libre' | 'corta',
 *   tags?: string[],
 *   authors?: string[],
 *   personas?: import('../../../utils/personasList.js').PersonaItem[],
 *   featured?: string,
 *   logo?: string,
 *   location?: string,
 *   location_name?: string,
 *   location_map?: string,
 *   published_date?: string,
 *   updated_date?: string,
 *   unlisted?: boolean,
 *   redirect?: boolean,
 *   extra?: Record<string, unknown>
 * }} EventoData
 */

export const EVENT_STATUSES = /** @type {const} */ ([
	'anunciado',
	'abierto',
	'agotadas',
	'cancelado'
]);

/** Cuántas etiquetas y autores como mucho (los .md de hoy tienen hasta ~20 etiquetas). */
export const EVENT_TAGS_MAX = 60;
export const EVENT_AUTHORS_MAX = 30;

/**
 * ¿Qué tiene de malo el link de acción? `null` si está bien: https:// o http://, `mailto:` (con
 * una dirección), `tel:`, o una dirección del mismo sitio («/calendario/…», «#entradas»). La
 * regla es la de todo el sitio: {@link eventLinkProblem} (src/lib/utils/eventLink.js), la misma
 * del editor, la importación de la planilla y la página pública.
 */
export const linkProblem = eventLinkProblem;

/** @type {import('./index.js').CoreType} */
const evento = {
	type: 'evento',
	label: 'Evento',
	fields: {
		summary: { kind: 'text', label: 'Resumen', max: 1000 },
		status: { kind: 'option', label: 'Estado', options: EVENT_STATUSES },
		start: { kind: 'datetime', label: 'Empieza', required: true },
		end: { kind: 'datetime', label: 'Termina' },
		// Texto con su propia regla (`check`, {@link linkProblem}): además de https:// hay eventos
		// con `mailto:` o con un link a otra página del sitio («/calendario/…»).
		link: { kind: 'text', label: 'Link de acción', max: 2000 },
		link_text: { kind: 'text', label: 'Texto del link', max: 80 },
		body: { kind: 'longtext', label: 'Descripción' },
		// Cómo se muestra el texto (decisión 0004): 'libre' (HTML libre: lo importado del repo y lo
		// que guarda une superadmin, se ve como hoy) o 'corta' (la lista corta de HTML). Se decide al
		// guardar, según quién escribió el texto (src/lib/server/contenido/render.js).
		body_html: { kind: 'option', label: 'HTML del texto', options: ['libre', 'corta'] },
		tags: { kind: 'list', label: 'Etiquetas', max: EVENT_TAGS_MAX },
		// Forma de antes (lo importado antes de «Personas en una sola sección»): se sigue leyendo; lo
		// que se guarda ahora va en `personas`.
		authors: { kind: 'list', label: 'Quiénes organizan', max: EVENT_AUTHORS_MAX },
		// Personas con su rol, quienes organizan incluides: `[{ name, role }]`
		// (src/lib/utils/personasList.js). En los .md siguen siendo `authors:` y `personas:`. Los
		// perfiles NO van acá: son edges `persona` (abajo). Solo queda `{ profile, role }` para una
		// dirección que no es de ningún perfil vivo (no hay a qué apuntar: no es una relación).
		personas: { kind: 'json', array: true, label: 'Personas', max: 30_000 },
		// Número de la imagen en la carpeta del evento («1») o archivo de src/lib/assets
		// («cabaret-astral-miniatura.webp»). Las imágenes siguen en el repo (R2 es un paso aparte).
		featured: { kind: 'text', label: 'Imagen principal', max: 200 },
		logo: { kind: 'text', label: 'Logo', max: 200 },
		location: { kind: 'text', label: 'Dónde', max: 500 },
		location_name: { kind: 'text', label: 'Nombre del lugar', max: 200 },
		location_map: { kind: 'url', label: 'Link al mapa' },
		// Como en los .md («2024-02-17Z-03:00»): no es una fecha ISO, se guarda como texto.
		published_date: { kind: 'text', label: 'Publicado', max: 40 },
		updated_date: { kind: 'text', label: 'Actualizado', max: 40 },
		unlisted: { kind: 'boolean', label: 'No listado' },
		redirect: { kind: 'boolean', label: 'Ir directo al link' },
		extra: { kind: 'json', label: 'Otros datos del archivo', max: 50_000 }
	},
	edges: {
		// «Sucede en» (docs/amigues.md): un perfil de tipo lugar (`perfil` con `kind: 'lugar'`; el
		// tipo `lugar` es el de ejemplo de 0012). `data: { privacy }` es el nivel propio del evento
		// («Sólo Nombre», «Oculto»…, src/lib/utils/venues.js); sin `data`, el del lugar. Lo escriben
		// setEventVenue/removeEventVenue (src/lib/server/amigues/venues.js), con saveObject().
		lugar: { label: 'Lugar', to: ['lugar', 'perfil'], max: 1 },
		// Personas con rol (B7): un edge por perfil, `data: { roles: ['Organiza', …], at: [0, …] }`:
		// cada rol con su lugar en la lista única de personas (`at`), así la lista se arma igual que
		// antes (src/lib/server/contenido/personasEdges.js). Los nombres sin perfil no son relaciones:
		// quedan en `data.personas`.
		persona: { label: 'Personas con rol', to: ['perfil'] },
		// Talleres en varias partes (docs/talleres-partes.md): del taller (que es la parte 1) a cada
		// una de las otras partes, en orden (`position`), sin `data`. Que una parte sea de un solo
		// taller y que no haya partes de partes lo controla src/lib/server/eventos/partes.js.
		parte: { label: 'Partes', to: ['evento'], max: 20 },
		// Etiquetas y series (docs/objetos.md, «Etiquetas de los eventos»): un edge por etiqueta viva,
		// `data: { at: [0, …] }`: su lugar en la lista de `tags` (src/lib/server/contenido/
		// etiquetasEdges.js). Un nombre que no es de ninguna etiqueta queda en `data.tags`.
		etiqueta: { label: 'Etiquetas', to: ['etiqueta'], max: EVENT_TAGS_MAX }
	},
	check(data) {
		/** @type {import('../fields.js').FieldError[]} */
		const errors = [];
		const start = Date.parse(String(data.start));
		const end = data.end ? Date.parse(String(data.end)) : NaN;
		if (!Number.isNaN(end) && end < start) {
			errors.push({ path: 'end', message: 'Termina: no puede ser antes de que empiece' });
		}
		const link = data.link ? linkProblem(String(data.link)) : null;
		if (link) errors.push({ path: 'link', message: `Link de acción: ${link}` });
		for (const message of personaItemsProblems(data.personas))
			errors.push({ path: 'personas', message });
		return errors;
	},
	searchText(data) {
		return [data.summary, data.body].filter(Boolean).join('\n');
	}
};

export default evento;

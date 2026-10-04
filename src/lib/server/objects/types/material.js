/**
 * Tipo núcleo `material`: guías, artículos, fanzines y descargables (src/lib/posts/material/*.md).
 * Los campos siguen los nombres del frontmatter (src/lib/server/contenido/material.js tiene el
 * mapa completo, ida y vuelta), como `evento`:
 *
 * - `unlisted` es el `force_unlisted` de los .md; `force_unpublished` es la visibilidad `hidden`.
 * - `extra`: lo que el frontmatter tiene y el tipo todavía no conoce, tal cual.
 * - Las imágenes y archivos (PDF, video) siguen en la carpeta del post en el repo (R2 es un paso
 *   aparte).
 *
 * El sitio lo lee solo de la base (docs/contenido.md, «En la base»).
 */
import { linkProblem } from './evento.js';
import { personaItemsProblems } from '../../../utils/personasList.js';

/** @type {import('./index.js').CoreType} */
const material = {
	type: 'material',
	label: 'Material',
	fields: {
		summary: { kind: 'text', label: 'Resumen', max: 1000 },
		body: { kind: 'longtext', label: 'Texto' },
		// Cómo se muestra el texto (decisión 0004), como en `evento`: 'libre' o 'corta'
		// (src/lib/server/contenido/render.js).
		body_html: { kind: 'option', label: 'HTML del texto', options: ['libre', 'corta'] },
		tags: { kind: 'list', label: 'Etiquetas', max: 60 },
		// Forma de antes (lo importado antes de «Personas en una sola sección»): se sigue leyendo; lo
		// que se guarda ahora va en `personas`.
		authors: { kind: 'list', label: 'Autores', max: 30 },
		// Personas con su rol, autores incluides: `[{ profile?, name?, role }]`
		// (src/lib/utils/personasList.js). En los .md siguen siendo `authors:` y `personas:`.
		personas: { kind: 'json', array: true, label: 'Personas', max: 30_000 },
		featured: { kind: 'text', label: 'Imagen principal', max: 200 },
		// Texto con su propia regla (`check`): un link web, un mail, una página del sitio o el número
		// de un archivo de la carpeta del post (`link: 1`, como algunos .md de hoy).
		link: { kind: 'text', label: 'Link', max: 2000 },
		link_text: { kind: 'text', label: 'Texto del botón del link', max: 80 },
		redirect: { kind: 'boolean', label: 'Ir directo al link' },
		// Como en los .md («2024-02-17Z-03:00»): texto.
		published_date: { kind: 'text', label: 'Publicado', max: 40 },
		updated_date: { kind: 'text', label: 'Actualizado', max: 40 },
		original_published_date: { kind: 'text', label: 'Publicación original', max: 40 },
		access_date: { kind: 'text', label: 'Último acceso al link', max: 40 },
		unlisted: { kind: 'boolean', label: 'No listado' },
		extra: { kind: 'json', label: 'Otros datos del archivo', max: 50_000 }
	},
	edges: {
		// Etiquetas, como en `evento`: un edge por etiqueta viva, `data: { at: [0, …] }` (su lugar en
		// la lista de `tags`, src/lib/server/contenido/etiquetasEdges.js). Un nombre que no es de
		// ninguna etiqueta queda en `data.tags`.
		etiqueta: { label: 'Etiquetas', to: ['etiqueta'], max: 60 }
	},
	check(data) {
		const link = data.link ? String(data.link) : '';
		const problem = link && !/^\d+$/.test(link) ? linkProblem(link) : null;
		return [
			...(problem ? [{ path: 'link', message: `Link: ${problem}` }] : []),
			...personaItemsProblems(data.personas).map((message) => ({ path: 'personas', message }))
		];
	},
	searchText(data) {
		return [data.summary, data.body].filter(Boolean).join('\n');
	}
};

export default material;

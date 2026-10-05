/**
 * Tipo núcleo `material`: guías, artículos, fanzines y descargables (src/lib/posts/material/*.md).
 * Los campos siguen los nombres del frontmatter (src/lib/server/contenido/material.js tiene el
 * mapa completo, ida y vuelta), como `evento`:
 *
 * - `unlisted` es el `force_unlisted` de los .md; `force_unpublished` es la visibilidad `hidden`.
 * - `extra`: lo que el frontmatter tiene y el tipo todavía no conoce, tal cual.
 * - Los perfiles de `personas` no van en `data`: son edges `persona` (ver `edges` abajo).
 * - La imagen principal es el edge `portada` hacia una `imagen` (R2, docs/imagenes.md); `featured`
 *   es la imagen vieja del repo. Los archivos (PDF, video) siguen en la carpeta del post en el repo
 *   hasta que se pasen a la biblioteca (objetos `archivo`, docs/imagenes.md).
 * - El texto enlaza los archivos de la biblioteca por su dirección (`/media/file/<hash>.pdf`) y el
 *   material tiene un edge `adjunto` hacia cada uno: lo calcula cada guardado (`deriveEdges`).
 *
 * El sitio lo lee solo de la base (docs/contenido.md, «En la base»).
 */
import { fileKeysInText, liveFileIds } from './archivo.js';
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
		// La imagen principal (docs/imagenes.md); sin este edge, `featured` (la del repo).
		portada: { label: 'Imagen principal', to: ['imagen'], max: 1 },
		// Personas con rol, como en `evento`: un edge por perfil, `data: { roles: ['Autore', …],
		// at: [0, …] }` (cada rol con su lugar en la lista única, src/lib/server/contenido/
		// personasEdges.js; migración 0043 para lo ya guardado). Los nombres sin perfil no son
		// relaciones: quedan en `data.personas`.
		persona: { label: 'Personas con rol', to: ['perfil'] },
		// Etiquetas, como en `evento`: un edge por etiqueta viva, `data: { at: [0, …] }` (su lugar en
		// la lista de `tags`, src/lib/server/contenido/etiquetasEdges.js). Un nombre que no es de
		// ninguna etiqueta queda en `data.tags`.
		etiqueta: { label: 'Etiquetas', to: ['etiqueta'], max: 60 },
		// Los archivos de la biblioteca (`archivo`) que el texto enlaza (`/media/file/<hash>.<ext>`
		// en `body` o en `link`): uno por archivo vivo, en el orden del texto, sin `data`. SIGUE AL
		// TEXTO: cada guardado lo recalcula (`deriveEdges`) y nadie lo manda a mano. Un enlace a un
		// archivo que no existe o está borrado no es edge (el próximo guardado lo saca).
		adjunto: { label: 'Archivos enlazados', to: ['archivo'], derived: true }
	},
	async deriveEdges(db, data) {
		return { adjunto: await liveFileIds(db, fileKeysInText([data.body, data.link])) };
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

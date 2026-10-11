/**
 * Contenido › Biblioteca (/admin/contenido/biblioteca; docs/imagenes.md): a dónde lleva cada uso,
 * cómo se muestra el peso y la dirección de la página con sus filtros. Sin dependencias de
 * SvelteKit: corre en el navegador, en el servidor y en vitest.
 */
import { eventHref, navItem, wikiEditHref } from './nav.js';
import { profileHref } from './links.js';

/** La página (su dirección sale del menú, así no se repite). */
export const BIBLIOTECA_HREF = navItem('biblioteca')?.href ?? '/admin/contenido/biblioteca';

/**
 * Lo que usa algo de la biblioteca, en el panel: el evento (su ficha), el material (su editor), el
 * perfil (su ficha) o la etiqueta (las series, o el texto de su wiki). `null` si no se puede
 * enlazar (un uso que quien mira no ve).
 * @param {import('$lib/server/media/library.js').LibraryUse} use
 * @returns {string | null}
 */
export function useHref(use) {
	if (use.hidden) return null;
	if (use.type === 'evento') return eventHref(use.slug);
	if (use.type === 'material') {
		const base = navItem('material')?.href ?? '/admin/contenido/material';
		return `${base}/${encodeURIComponent(use.slug)}`;
	}
	if (use.type === 'perfil') return profileHref(use.id);
	if (use.type === 'etiqueta') return navItem('eventos-series')?.href ?? wikiEditHref(use.slug);
	return null;
}

/**
 * El peso para mostrar: «850 KB», «2,4 MB».
 * @param {number} bytes
 */
export function sizeText(bytes) {
	const n = Number(bytes) || 0;
	if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
	return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * La página con un texto buscado y un filtro por tipo (sin lo que está por defecto).
 * @param {string} q
 * @param {string} kind
 */
export function bibliotecaHref(q, kind) {
	const params = new URLSearchParams();
	if (q.trim()) params.set('q', q.trim());
	if (kind && kind !== 'todo') params.set('tipo', kind);
	const qs = params.toString();
	return qs ? `${BIBLIOTECA_HREF}?${qs}` : BIBLIOTECA_HREF;
}

/**
 * La página siguiente («Cargar más»), por la búsqueda de la biblioteca.
 * @param {string} q
 * @param {string} kind
 * @param {number} offset las que ya se muestran
 */
export const moreHref = (q, kind, offset) =>
	`/imagenes?q=${encodeURIComponent(q.trim())}&tipo=${encodeURIComponent(kind)}&desde=${offset}`;

/**
 * El texto de la confirmación de borrar: dónde se usa (si se usa) y qué pasa.
 * @param {{ kind: string, usedIn: string[] }} item
 */
export function deleteText(item) {
	const what = item.kind === 'imagen' ? 'la imagen' : 'el archivo';
	const where = item.usedIn.length
		? `Se usa en: ${item.usedIn.join(', ')}. Ahí deja de verse ${what}. `
		: 'No se usa en ningún lado. ';
	return `${where}Podés deshacerlo enseguida, o volver a subir el mismo archivo más adelante.`;
}

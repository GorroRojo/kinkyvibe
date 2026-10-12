/**
 * «+ Crear ▾» de la barra de arriba del panel (opción C, parte 2, gorrite 11/10): todo lo que se
 * puede crear hoy desde el panel, en un solo menú, y lo que viene como «Próximamente» (gris, sin
 * link). Reemplaza al botón «+ Cargar evento». También son acciones de «Ir a…» (`paletteActions.js`).
 *
 * Cada ítem:
 * - `id`: estable (lo usan las pruebas y el buscador: `create:<id>`).
 * - `label`: qué se crea («Evento», «Código de descuento»…).
 * - `hint`: dónde queda (la sección), para el buscador y como línea chica del menú.
 * - `href`: la página o el formulario que lo crea (con `?crear` o `#ancla` cuando el formulario es
 *   parte de una lista). Sin `href` en lo que viene.
 * - `section`: el id de la sección de `nav.js` donde vive. Lo que viene toma su «Próximamente» de
 *   esa sección (`soon`, `phase`): cuando la sección se construye, el PR que la hace le pone `href`.
 * - `keywords`: palabras extra para el buscador.
 */
import {
	BookOpen,
	CalendarPlus,
	FileSpreadsheet,
	IdCard,
	Library,
	ListPlus,
	MapPin,
	Repeat,
	ShoppingBag,
	Tags,
	TicketPercent,
	Video
} from '@lucide/svelte';
import { navItem, navState } from './nav.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   hint: string,
 *   href?: string,
 *   section: string,
 *   icon: import('./nav.js').NavItem['icon'],
 *   keywords: string
 * }} CreateItem
 */

/** @type {readonly CreateItem[]} */
export const CREATE_ITEMS = Object.freeze([
	{
		id: 'evento',
		label: 'Evento',
		hint: 'Eventos',
		href: '/admin/eventos/nuevo',
		section: 'eventos-nuevo',
		icon: CalendarPlus,
		keywords: 'cargar nuevo crear evento fiesta taller'
	},
	{
		id: 'serie',
		label: 'Serie de eventos',
		hint: 'Eventos › Series',
		href: '/admin/eventos/series?crear',
		section: 'eventos-series',
		icon: Repeat,
		keywords: 'nueva crear serie recurrente repetir ediciones'
	},
	{
		id: 'lugar',
		label: 'Lugar',
		hint: 'Eventos › Lugares',
		href: '/admin/eventos/lugares#nuevo',
		section: 'eventos-lugares',
		icon: MapPin,
		keywords: 'nuevo crear lugar venue espacio direccion'
	},
	{
		id: 'importar',
		label: 'Eventos desde una planilla',
		hint: 'Eventos › Importar planilla',
		href: '/admin/eventos/importar',
		section: 'eventos-importar',
		icon: FileSpreadsheet,
		keywords: 'importar planilla excel sheet varios eventos'
	},
	{
		id: 'rol',
		label: 'Rol de personas en eventos',
		hint: 'Eventos › Roles y preguntas',
		href: '/admin/eventos/roles#nuevo-rol',
		section: 'ajustes-personas',
		icon: ListPlus,
		keywords: 'nuevo crear rol organiza facilita personas'
	},
	{
		id: 'codigo',
		label: 'Código de descuento',
		hint: 'Ventas › Códigos',
		href: '/admin/ventas/codigos#nuevo',
		section: 'entradas-codigos',
		icon: TicketPercent,
		keywords: 'nuevo crear codigo descuento cupon'
	},
	{
		id: 'perfil',
		label: 'Perfil (amigue, proyecto o lugar)',
		hint: 'Comunidad › Perfiles',
		href: '/admin/comunidad/perfiles/nuevo',
		section: 'amigues',
		icon: IdCard,
		keywords: 'nuevo crear perfil amigue persona proyecto ficha'
	},
	{
		id: 'material',
		label: 'Material',
		hint: 'Contenido › Material',
		href: '/admin/contenido/material/nuevo',
		section: 'material',
		icon: BookOpen,
		keywords: 'nuevo crear material guia articulo nota publicacion'
	},
	{
		// Las entradas de la Kinkipedia son el texto de una etiqueta: se elige (o se crea) la
		// etiqueta y se escribe su entrada (docs/etiquetas.md, «La Kinkipedia»).
		id: 'kinkipedia',
		label: 'Entrada de la Kinkipedia',
		hint: 'Etiquetas · elegí la etiqueta y escribí su entrada',
		href: '/admin/etiquetas',
		section: 'etiquetas',
		icon: Tags,
		keywords: 'nueva crear entrada kinkipedia wiki etiqueta texto'
	},
	// Próximamente (sin `href`): salen de la sección que todavía no existe.
	{
		id: 'producto',
		label: 'Producto de la tienda',
		hint: 'Ventas › Tienda',
		section: 'tienda',
		icon: ShoppingBag,
		keywords: 'nuevo crear producto tienda merch'
	},
	{
		id: 'coleccion',
		label: 'Colección',
		hint: 'Contenido › Colecciones',
		section: 'colecciones',
		icon: Library,
		keywords: 'nueva crear coleccion lista'
	},
	{
		id: 'video',
		label: 'Video',
		hint: 'Contenido › Videos',
		section: 'videos',
		icon: Video,
		keywords: 'nuevo crear video taller transmision'
	}
]);

/**
 * Los ítems del menú «Crear» con su estado: los que existen (`soon: false`, con `href`) primero y
 * lo que viene al final (`soon: true`, con la fase de su sección), salvo con «Ocultar lo que viene»
 * (`hideSoon`). Un ítem cuya sección está oculta (interruptor apagado y 404) no aparece.
 * @param {{ flags?: Record<string, boolean>, hideSoon?: boolean }} [opts]
 * @returns {(CreateItem & { soon: boolean, phase?: number })[]}
 */
export function createItems({ flags = {}, hideSoon = false } = {}) {
	const out = CREATE_ITEMS.flatMap((c) => {
		const section = navItem(c.section);
		if (!section) return [];
		const state = navState(section, flags);
		if (state === 'hidden') return [];
		const soon = state === 'soon' || !c.href;
		if (soon && hideSoon) return [];
		return [{ ...c, soon, ...(soon && section.phase ? { phase: section.phase } : {}) }];
	});
	return [...out.filter((c) => !c.soon), ...out.filter((c) => c.soon)];
}

/**
 * Todas las acciones de la paleta de comandos (SearchBox): las de `buildCommands` (secciones del
 * menú, «Nuevo código de descuento», «Abrir la puerta de hoy»…) más las que no son secciones:
 * «Para revisar», crear e importar, y las preferencias de cada persona (tema, «Ocultar lo que
 * viene»). Y la regla de qué va arriba: las acciones o los registros. Sin dependencias del
 * navegador.
 */
import { REVIEW_LINK } from './nav.js';
import { buildCommands, fold } from './commands.js';

/**
 * Una acción; `run` dice qué hace la paleta en vez de ir a `href`: la hoja de atajos, cambiar el
 * tema u ocultar o mostrar lo que viene.
 * @typedef {Omit<import('./commands.js').Command, 'run'> & { run?: 'help' | 'theme' | 'hide-soon' }} Command
 */

/**
 * Atajos a páginas que no están en el menú (o que son un botón dentro de una sección). Van
 * después de las secciones: con la misma coincidencia, gana la sección.
 * @type {readonly Command[]}
 */
export const EXTRA_COMMANDS = Object.freeze([
	{
		id: 'review',
		label: REVIEW_LINK.label,
		hint: 'Inicio',
		keywords: 'revisar pendientes pedidos aprobar problemas avisos',
		icon: 'check',
		href: REVIEW_LINK.href
	},
	{
		id: 'new-material',
		label: 'Nuevo material',
		hint: 'Material',
		keywords: 'nuevo crear material guia articulo nota publicacion kinkipedia',
		icon: 'book',
		href: '/admin/contenido/material/nuevo'
	},
	{
		id: 'new-profile',
		label: 'Nuevo perfil',
		hint: 'Perfiles',
		keywords: 'nuevo crear perfil amigues persona proyecto lugar ficha',
		icon: 'profile',
		href: '/admin/comunidad/perfiles/nuevo'
	},
	{
		id: 'import-profiles',
		label: 'Importar perfiles',
		hint: 'Perfiles · importar y clasificar',
		keywords: 'importar perfiles amigues clasificar base migrar',
		icon: 'sheet',
		href: '/admin/comunidad/perfiles/importar'
	},
	{
		id: 'import-places',
		label: 'Importar lugares',
		hint: 'Lugares · desde los eventos',
		keywords: 'importar lugares venues espacios direcciones eventos',
		icon: 'map-pin',
		href: '/admin/eventos/lugares/importar'
	},
	{
		id: 'link-places',
		label: 'Vincular lugares',
		hint: 'Lugares · el «sucede en» de cada evento',
		keywords: 'vincular lugares eventos sucede en venues espacios unir',
		icon: 'map-pin',
		href: '/admin/eventos/lugares/vincular'
	},
	{
		id: 'import-tags',
		label: 'Importar etiquetas',
		hint: 'Etiquetas · a la base',
		keywords: 'importar etiquetas tags base migrar arbol',
		icon: 'tag',
		href: '/admin/etiquetas/importar'
	}
]);

/**
 * Preferencias de cada persona (las guarda el navegador; ver theme.js y navPrefs.js). No llevan a
 * otra página: la paleta avisa al layout, que es quien las cambia.
 * @param {{ hideSoon?: boolean }} [opts] `hideSoon`: si ahora están ocultas las secciones
 *   «Próximamente» (cambia el nombre de la acción)
 * @returns {Command[]}
 */
export function preferenceCommands({ hideSoon = false } = {}) {
	return [
		{
			id: 'theme',
			label: 'Cambiar tema',
			hint: 'Claro → oscuro → automático',
			keywords: 'tema oscuro claro modo noche dark light automatico colores',
			icon: 'theme',
			run: 'theme'
		},
		{
			id: 'hide-soon',
			label: hideSoon ? 'Mostrar lo que viene' : 'Ocultar lo que viene',
			hint: 'Las secciones «Próximamente» del menú',
			keywords: 'ocultar mostrar lo que viene proximamente secciones menu',
			icon: hideSoon ? 'eye' : 'eye-off',
			run: 'hide-soon'
		}
	];
}

/**
 * Las acciones de la paleta, en orden: las de `buildCommands`, después las de
 * {@link EXTRA_COMMANDS} y las preferencias.
 * @param {{ today?: { slug: string, title: string, href: string }[], hideSoon?: boolean }} [opts]
 * @returns {Command[]}
 */
export function paletteCommands({ today = [], hideSoon = false } = {}) {
	return [...buildCommands({ today }), ...EXTRA_COMMANDS, ...preferenceCommands({ hideSoon })];
}

/**
 * ¿Los registros van arriba de las acciones? Sí cuando lo buscado es claramente un registro:
 * 1. algún registro coincide entero (`exact`: el mismo nombre, título, email, código o
 *    referencia `KV-…`, sin mayúsculas ni tildes), y ninguna acción se llama exactamente así; o
 * 2. hay registros y ninguna acción coincide por su nombre (solo por palabras extra, como
 *    «analytics» → Visitas al sitio).
 * Si no, las acciones van primero, como siempre.
 *
 * @param {string} q
 * @param {string[]} actionLabels los nombres de las acciones que coincidieron
 * @param {{ items: { exact?: boolean }[] }[]} groups los grupos de registros
 */
export function recordsFirst(q, actionLabels, groups) {
	const f = fold(q);
	if (!f || !groups.some((g) => g.items.length)) return false;
	const labels = actionLabels.map(fold);
	if (labels.includes(f)) return false;
	if (groups.some((g) => g.items.some((i) => i.exact))) return true;
	// Coincidir por el nombre, como en matchCommands: al comienzo, al comienzo de una palabra o,
	// desde 4 letras, en el medio.
	return !labels.some(
		(l) =>
			l.startsWith(f) ||
			l.split(' ').some((w) => w.startsWith(f)) ||
			(f.length >= 4 && l.includes(f))
	);
}

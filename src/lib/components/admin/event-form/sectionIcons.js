/**
 * El ícono de Lucide de cada sección del formulario (`icon` en `formSections`,
 * `$lib/admin/eventForm.js`): el mismo en el índice (SectionIndex) y en el título de la sección
 * (SectionHeading). Los emoji quedan para el contenido y las etiquetas (docs/estilo.md).
 */
import {
	CalendarClock,
	Eye,
	FileText,
	Image as ImageIcon,
	Link2,
	MapPin,
	Puzzle,
	Tags,
	TextAlignStart,
	Ticket,
	Users
} from '@lucide/svelte';

/** @type {Record<import('$lib/admin/eventForm.js').SectionIcon, typeof CalendarClock>} */
export const SECTION_ICONS = {
	cuando: CalendarClock,
	datos: FileText,
	personas: Users,
	lugar: MapPin,
	direccion: Link2,
	etiquetas: Tags,
	entradas: Ticket,
	imagen: ImageIcon,
	texto: TextAlignStart,
	lista: Eye,
	partes: Puzzle
};

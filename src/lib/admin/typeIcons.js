/**
 * El ícono grande del tipo de un objeto, para el encabezado de su página en el panel cuando no tiene
 * imagen (PageHeader con `icon`, como la ficha de un evento): evento, serie, material, perfil según
 * su tipo (persona, proyecto o lugar).
 */
import { BookOpen, CalendarDays, MapPin, Repeat, User, Users } from '@lucide/svelte';

/** @type {Record<string, any>} */
const PROFILE_ICONS = { persona: User, proyecto: Users, lugar: MapPin };

/**
 * @param {string} type `evento`, `serie`, `material`, `perfil` (o `amigues`, los perfiles en .md)
 * @param {string} [kind] el tipo de perfil
 * @returns {any} el componente de Lucide
 */
export function typeIcon(type, kind = '') {
	if (type === 'evento') return CalendarDays;
	// El mismo de Eventos › Series en el menú.
	if (type === 'serie') return Repeat;
	if (type === 'material') return BookOpen;
	if (type === 'perfil' || type === 'amigues') return PROFILE_ICONS[kind] ?? User;
	return BookOpen;
}

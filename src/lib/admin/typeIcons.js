/**
 * El ícono grande del tipo de un objeto, para el encabezado de su página en el panel cuando no tiene
 * imagen (PageHeader con `icon`, como la ficha de un evento): evento, material, perfil según su
 * tipo (persona, proyecto o lugar).
 */
import { BookOpen, CalendarDays, MapPin, User, Users } from '@lucide/svelte';

/** @type {Record<string, any>} */
const PROFILE_ICONS = { persona: User, proyecto: Users, lugar: MapPin };

/**
 * @param {string} type `evento`, `material`, `perfil` (o `amigues`, los perfiles en .md)
 * @param {string} [kind] el tipo de perfil
 * @returns {any} el componente de Lucide
 */
export function typeIcon(type, kind = '') {
	if (type === 'evento') return CalendarDays;
	if (type === 'material') return BookOpen;
	if (type === 'perfil' || type === 'amigues') return PROFILE_ICONS[kind] ?? User;
	return BookOpen;
}

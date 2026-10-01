/**
 * Links a páginas del panel que se arman desde varios lugares (Inicio, buscador, Cuentas). Todas
 * las pestañas de la ficha del evento ya existen (`EVENT_TABS` de nav.js).
 */
import { eventHref, eventPanelLink } from './nav.js';

/**
 * Ficha de un evento en el panel.
 * @param {string} slug
 * @param {{ tickets?: boolean }} [opts] `tickets`: si el evento vende entradas
 */
export function eventLink(slug, { tickets = false } = {}) {
	return eventPanelLink(slug, { tickets });
}

/**
 * Modo puerta (check-in) de un evento.
 * @param {string} slug
 */
export function checkinHref(slug) {
	return eventHref(slug, 'ingreso');
}

/**
 * Dónde se ve una orden: la pestaña Órdenes de la ficha, filtrada por la orden si se pasa.
 * @param {string} slug
 * @param {string} [orderId]
 */
export function orderHref(slug, orderId) {
	const base = eventHref(slug, 'ordenes');
	return orderId ? `${base}?orden=${encodeURIComponent(orderId.slice(0, 8))}` : base;
}

/**
 * Transferencias pendientes de un evento.
 * @param {string} slug
 */
export function transfersHref(slug) {
	return eventHref(slug, 'transferencias');
}

/**
 * Link de la transmisión de un evento online (está en el Resumen de la ficha).
 * @param {string} slug
 */
export function streamHref(slug) {
	return eventHref(slug);
}

/**
 * Editar un evento (la pestaña Editar de la ficha).
 * @param {string} slug
 */
export function editEventHref(slug) {
	return eventHref(slug, 'editar');
}

/**
 * Ficha de una cuenta del público en Cuentas.
 * @param {string} id
 */
export function accountHref(id) {
	return `/admin/cuentas/${encodeURIComponent(id)}`;
}

/**
 * Ficha de un perfil (moderación: quiénes lo gestionan, revisar, aprobar, ocultar, borrar). Se
 * entra desde Comunidad › Perfiles (/admin/amigues).
 * @param {number | string} id
 */
export function profileHref(id) {
	return `/admin/cuentas/perfiles/${encodeURIComponent(String(id))}`;
}

/** Comunidad › Perfiles, solo los creados por cuentas que esperan revisión. */
export const PROFILES_TO_REVIEW_HREF = '/admin/amigues?estado=sin-revisar';

/** Comunidad › Perfiles, pestaña de los pedidos "Es mi perfil". */
export const PROFILE_CLAIMS_HREF = '/admin/amigues?vista=pedidos';

/**
 * Links a páginas del panel que todavía se están mudando (la ficha del evento y el modo puerta).
 * Siguen solos a `EVENT_TABS` de nav.js: cuando el PR de cada pestaña pone `soon: false`, estos
 * links pasan a la página nueva sin tocar nada acá.
 */
import { EVENT_TABS, eventHref, eventPanelLink } from './nav.js';

/** @param {string} id */
const tabReady = (id) => EVENT_TABS.find((t) => t.id === id)?.soon === false;

/**
 * Ficha de un evento en el panel (o lo que haga sus veces hoy).
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
	if (tabReady('ingreso')) return eventHref(slug, 'ingreso');
	return `/admin/entradas/${encodeURIComponent(slug)}/ingreso`;
}

/**
 * Dónde se ve una orden: la pestaña Órdenes de la ficha (o la página de entradas del evento).
 * @param {string} slug
 * @param {string} [orderId]
 */
export function orderHref(slug, orderId) {
	const base = tabReady('ordenes')
		? eventHref(slug, 'ordenes')
		: `/admin/entradas/${encodeURIComponent(slug)}`;
	return orderId ? `${base}?orden=${encodeURIComponent(orderId.slice(0, 8))}` : base;
}

/**
 * Transferencias pendientes de un evento.
 * @param {string} slug
 */
export function transfersHref(slug) {
	if (tabReady('transferencias')) return eventHref(slug, 'transferencias');
	return `/admin/entradas/${encodeURIComponent(slug)}#transferencias`;
}

/**
 * Link de la transmisión de un evento online.
 * @param {string} slug
 */
export function streamHref(slug) {
	if (tabReady('resumen')) return eventHref(slug);
	return `/admin/entradas/${encodeURIComponent(slug)}#transmision`;
}

/**
 * Editar un evento (la pestaña Editar, o el editor de markdown de hoy).
 * @param {string} slug
 */
export function editEventHref(slug) {
	if (tabReady('editar')) return eventHref(slug, 'editar');
	return `/edit/calendario/${encodeURIComponent(slug)}`;
}

/**
 * Ficha de una cuenta del público en Cuentas.
 * @param {string} id
 */
export function accountHref(id) {
	return `/admin/cuentas/${encodeURIComponent(id)}`;
}

/**
 * Ficha de un perfil en Cuentas → Perfiles.
 * @param {number | string} id
 */
export function profileHref(id) {
	return `/admin/cuentas/perfiles/${encodeURIComponent(String(id))}`;
}

/** Cuentas → Perfiles, solo los que esperan revisión. */
export const PROFILES_TO_REVIEW_HREF = '/admin/cuentas/perfiles?filtro=sin-revisar';

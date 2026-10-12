/**
 * La lista de eventos de la puerta por Telegram (`/telegram/puerta`, decisión 0037): qué evento
 * queda elegido al abrir y cómo se muestra cada uno. Funciones puras, también para el navegador.
 */

import { argDateList, argTime } from './dates.js';

/** @typedef {{ slug: string, title: string, start: number, today: boolean }} DoorEvent */

/**
 * El evento elegido al abrir: el de `?evento=` si vino; si no, el único de hoy; si hay varios o
 * ninguno, ninguno (se elige de la lista).
 *
 * @param {DoorEvent[]} events
 * @param {string} [slug] el de `?evento=`
 * @returns {string}
 */
export function defaultDoorSlug(events, slug = '') {
	if (slug) return slug;
	const today = events.filter((e) => e.today);
	return today.length === 1 ? today[0].slug : '';
}

/**
 * «Hoy 21:00» o, otro día, como en las listas del sitio («sáb 11 ene · 21:30»), en hora de
 * Argentina. Vacío si la fecha no se lee.
 *
 * @param {DoorEvent} event
 * @param {number} [now]
 * @returns {string}
 */
export function doorEventWhen(event, now = Date.now()) {
	if (!Number.isFinite(event.start)) return '';
	return event.today ? `Hoy ${argTime(event.start)}` : argDateList(event.start, { now });
}

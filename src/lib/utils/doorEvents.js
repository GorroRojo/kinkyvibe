/**
 * La lista de eventos de la puerta por Telegram (`/telegram/puerta`, decisión 0037): qué evento
 * queda elegido al abrir y cómo se muestra cada uno. Y la misma regla para la Puerta del panel
 * (`/admin/checkin`): con un solo evento hoy, entra directo a ese. Funciones puras, también para
 * el navegador.
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
	return onlyTodaySlug(events.filter((e) => e.today));
}

/**
 * El slug del único evento de hoy, o `''` si hay ninguno o varios (entonces se elige de la lista).
 * La regla de la Mini App de Telegram y de la Puerta del panel.
 *
 * @param {{ slug: string }[]} today los eventos de hoy (`checkinGroup` → `'hoy'`)
 * @returns {string}
 */
export function onlyTodaySlug(today) {
	return today.length === 1 ? today[0].slug : '';
}

/** `/admin/checkin?lista`: muestra la lista aunque haya un solo evento hoy («Otro evento»). */
export const CHECKIN_LIST_PARAM = 'lista';
/** `…/ingreso?hoy`: el modo puerta se abrió solo, desde `/admin/checkin` (muestra «Otro evento»). */
export const DOOR_AUTO_PARAM = 'hoy';

/**
 * A qué modo puerta entra `/admin/checkin` sin mostrar la lista: el del único evento de hoy que
 * la puerta puede operar (los de `groups.hoy`), salvo que se haya pedido la lista
 * ({@link CHECKIN_LIST_PARAM}). `''`: se muestra la lista.
 *
 * @param {{ slug: string }[]} today
 * @param {URLSearchParams} params los de `/admin/checkin`
 * @returns {string}
 */
export function checkinAutoSlug(today, params) {
	if (params.has(CHECKIN_LIST_PARAM)) return '';
	return onlyTodaySlug(today);
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

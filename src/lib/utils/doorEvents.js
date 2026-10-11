/**
 * La lista de eventos de la puerta por Telegram (`/telegram/puerta`, decisión 0037): qué evento
 * queda elegido al abrir y cómo se muestra cada uno. Funciones puras, también para el navegador.
 */

const TZ = 'America/Argentina/Buenos_Aires';

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
 * «Hoy 21:00» o «sáb 15/10 21:00», en hora de Argentina.
 *
 * @param {DoorEvent} event
 * @returns {string}
 */
export function doorEventWhen(event) {
	const date = new Date(event.start);
	if (Number.isNaN(date.getTime())) return '';
	const time = date.toLocaleTimeString('es-AR', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	if (event.today) return `Hoy ${time}`;
	/** @param {Intl.DateTimeFormatOptions} opts */
	const part = (opts) =>
		new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...opts }).format(date).replace('.', '');
	return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })}/${part({ month: 'numeric' })} ${time}`;
}

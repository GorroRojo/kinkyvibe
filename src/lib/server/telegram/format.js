/**
 * Textos del bot de Telegram (decisión 0029). Todo en español rioplatense, con el lenguaje
 * inclusivo del sitio. Funciones puras: reciben datos ya listos y devuelven HTML de Telegram
 * (`parse_mode: 'HTML'`), que solo admite unas pocas etiquetas (`<b>`, `<a>`).
 */

/**
 * Lo mínimo que el bot sabe de un evento. Nada de lugar, entradas ni datos de compradores.
 *
 * @typedef {{ slug: string, title: string, start: string, end?: string }} BotEvent
 */

/** Telegram corta los mensajes de más de 4096 caracteres: la lista se limita antes. */
export const LIST_MAX = 8;

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Escapa para el HTML de Telegram, también dentro de un atributo (`href="…"`): las comillas
 * dobles se escapan para que un valor no pueda cerrar el atributo.
 *
 * @param {string} text
 */
export function escapeHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * "sáb 10 may · 21:00", en hora de Argentina. Vacío si la fecha no se puede leer.
 *
 * @param {string} iso
 */
export function formatWhen(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('es-AR', {
			timeZone: TIME_ZONE,
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(date)
			.map((p) => [p.type, p.value])
	);
	const weekday = String(parts.weekday).replace('.', '');
	const month = String(parts.month).replace('.', '');
	return `${weekday} ${parts.day} ${month} · ${parts.hour}:${parts.minute}`;
}

/**
 * @param {string} origin
 * @param {string} slug
 */
export function eventUrl(origin, slug) {
	return `${origin}/calendario/${encodeURIComponent(slug)}`;
}

/**
 * @param {BotEvent} event
 * @param {string} origin
 */
function eventLine(event, origin) {
	const when = formatWhen(event.start);
	const link = `<a href="${escapeHtml(eventUrl(origin, event.slug))}">${escapeHtml(event.title)}</a>`;
	return when ? `${escapeHtml(when)}\n${link}` : link;
}

/**
 * @param {BotEvent[]} events
 * @param {string} origin
 */
export function formatEventList(events, origin) {
	if (events.length === 0) {
		return `Por ahora no hay eventos próximos. Mirá el calendario en ${escapeHtml(origin)}/calendario`;
	}
	const shown = events.slice(0, LIST_MAX);
	const lines = shown.map((e) => eventLine(e, origin));
	const rest = events.length - shown.length;
	const more =
		rest > 0
			? `\n\nHay ${rest} más en <a href="${escapeHtml(origin)}/calendario">el calendario</a>.`
			: '';
	return `<b>Próximos eventos</b>\n\n${lines.join('\n\n')}${more}`;
}

/**
 * @param {BotEvent} event
 * @param {string} origin
 */
export function formatEvent(event, origin) {
	const when = formatWhen(event.start);
	const head = `<b>${escapeHtml(event.title)}</b>`;
	const date = when ? `\n${escapeHtml(when)}` : '';
	return `${head}${date}\n\nEntradas y todos los detalles: ${escapeHtml(eventUrl(origin, event.slug))}`;
}

/**
 * Varios eventos coinciden con lo que se buscó: se muestran para que elija.
 *
 * @param {BotEvent[]} events
 * @param {string} origin
 */
export function formatChoices(events, origin) {
	const lines = events.slice(0, LIST_MAX).map((e) => eventLine(e, origin));
	return `Encontré varios eventos. ¿Cuál querés ver?\n\n${lines.join('\n\n')}`;
}

/** @param {string} origin */
export function formatHelp(origin) {
	return (
		'Hola, soy el bot de KinkyVibe. Podés pedirme:\n\n' +
		'/proximos: los próximos eventos\n' +
		'/evento &lt;nombre&gt;: el detalle de un evento\n\n' +
		`Para comprar entradas y ver todo lo demás, entrá a ${escapeHtml(origin)}`
	);
}

export const NOT_FOUND_TEXT =
	'No encontré ese evento entre los próximos. Probá con /proximos para ver la lista.';

export const ASK_EVENT_TEXT = 'Decime qué evento buscás, por ejemplo: /evento taller de shibari';

export const UNKNOWN_TEXT = 'No entendí ese comando. Probá con /ayuda.';

export const ERROR_TEXT = 'Algo salió mal de nuestro lado. Probá de nuevo en un rato.';

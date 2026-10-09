/**
 * Textos del bot de Telegram (decisión 0029). Todo en español rioplatense, con el lenguaje
 * inclusivo del sitio. Funciones puras: reciben datos ya listos y devuelven HTML de Telegram
 * (`parse_mode: 'HTML'`), que solo admite unas pocas etiquetas (`<b>`, `<a>`).
 */
import { argDateList } from '$lib/utils/dates.js';

/**
 * Lo mínimo que el bot sabe de un evento. Nada de lugar, entradas ni datos de compradores.
 *
 * @typedef {{ slug: string, title: string, start: string, end?: string }} BotEvent
 */

/** Telegram corta los mensajes de más de 4096 caracteres: la lista se limita antes. */
export const LIST_MAX = 8;

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
 * "sáb 10 may · 21:00", en hora de Argentina (`argDateList`, como las listas del sitio; con el año
 * al final si no es el de este año). Vacío si la fecha no se puede leer.
 *
 * @param {string} iso
 * @param {string|number|Date} [now]
 */
export function formatWhen(iso, now = Date.now()) {
	return argDateList(iso, { now });
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
	return `Encontré varios eventos. ¿Cuál querés ver? Tocá uno.\n\n${lines.join('\n\n')}`;
}

/**
 * La lista para elegir con botones (`/evento` sin nada).
 *
 * @param {BotEvent[]} events
 * @param {string} origin
 */
export function formatPickList(events, origin) {
	if (events.length === 0) return formatEventList(events, origin);
	return `${PICK_EVENT_TEXT}\n\n${formatEventList(events, origin)}`;
}

/**
 * @param {string} origin
 * @param {{ accounts?: boolean }} [opts] `accounts`: con la fase 2 prendida, suma los comandos de
 *   la cuenta
 */
export function formatHelp(origin, { accounts = false } = {}) {
	const account = accounts
		? '\nCon tu cuenta del sitio (por chat privado):\n' +
			'/vincular &lt;código&gt;: conectá este chat (el código está en Mi rincón → Lo que sigo)\n' +
			'/silenciar: pausá todos los avisos · /reanudar: volvé a recibirlos\n' +
			'/desvincular: desconectá este chat\n'
		: '';
	return (
		'Hola, soy el bot de Kinky Vibe. Podés pedirme:\n\n' +
		'/proximos: los próximos eventos (tocá uno para ver el detalle)\n' +
		'/evento: elegí un evento de la lista\n' +
		'/evento &lt;nombre&gt;: buscá un evento por nombre o por fecha (por ejemplo «sábado» o «15/10»)\n' +
		account +
		`\nPara comprar entradas y ver todo lo demás, entrá a ${escapeHtml(origin)}`
	);
}

/**
 * Un aviso de «Lo que sigo» por Telegram: solo título, fecha y link (nada de lugar ni de quién
 * más sigue lo mismo).
 *
 * @param {{ kind: 'nuevo' | 'recordatorio', title: string, start: string, url: string }} notice
 */
export function formatFollowNotice({ kind, title, start, url }) {
	const head = kind === 'nuevo' ? '🆕 Se anunció algo nuevo' : '⏰ Recordatorio: falta poco';
	const when = formatWhen(start);
	return `${head}\n\n<b>${escapeHtml(title)}</b>${when ? `\n${escapeHtml(when)}` : ''}\n${escapeHtml(url)}`;
}

/** @param {string} origin */
export function formatLinked(origin) {
	return (
		'Listo: este chat quedó conectado a tu cuenta de Kinky Vibe. ' +
		`Elegí qué avisos querés por Telegram en Mi rincón → Lo que sigo: ${escapeHtml(origin)}/mi-rincon/sigo\n\n` +
		'Para pausarlos: /silenciar. Para desconectar: /desvincular.'
	);
}

export const LINK_ASK_CODE_TEXT =
	'Mandame el código que aparece en Mi rincón → Lo que sigo → «Conectar Telegram», así: /vincular ABCD-2345';

export const LINK_INVALID_TEXT =
	'Ese código no sirve: puede estar mal escrito, ya usado o vencido (duran 15 minutos). Pedí uno nuevo en Mi rincón → Lo que sigo.';

export const LINK_TOO_MANY_TEXT =
	'Probaste muchos códigos seguidos. Esperá un rato y probá de nuevo.';

export const PRIVATE_ONLY_TEXT =
	'Esto se hace por chat privado con el bot, no en grupos: escribime directamente.';

export const ACCOUNTS_OFF_TEXT = 'Todavía no se puede conectar una cuenta con el bot.';

export const NOT_LINKED_TEXT =
	'Este chat no está conectado a ninguna cuenta. Para conectarlo: /vincular &lt;código&gt;.';

export const UNLINKED_TEXT =
	'Listo: desconecté este chat de tu cuenta. No te va a llegar ningún aviso más por acá.';

export const MUTED_TEXT =
	'Listo: pausé todos los avisos por Telegram. Cuando quieras volver a recibirlos: /reanudar.';

export const UNMUTED_TEXT = 'Listo: vas a volver a recibir los avisos que elegiste en Lo que sigo.';

export const NOT_FOUND_TEXT =
	'No encontré ese evento entre los próximos. Probá con /proximos para ver la lista.';

export const PICK_EVENT_TEXT =
	'Tocá el evento que querés ver. También podés decirme qué evento buscás, por ejemplo: /evento taller de shibari';

export const UNAVAILABLE_TEXT = 'Ese evento ya no está disponible.';

export const UNKNOWN_TEXT = 'No entendí ese comando. Probá con /ayuda.';

export const ERROR_TEXT = 'Algo salió mal de nuestro lado. Probá de nuevo en un rato.';

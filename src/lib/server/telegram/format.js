/**
 * Textos del bot de Telegram (decisión 0029). Todo en español rioplatense, con el lenguaje
 * inclusivo del sitio. Funciones puras: reciben datos ya listos y devuelven HTML de Telegram
 * (`parse_mode: 'HTML'`), que solo admite unas pocas etiquetas (`<b>`, `<a>`).
 *
 * Las palabras salen de «Textos del bot» (`$lib/utils/botTexts.js`, editables en el panel): cada
 * función pide el texto de este pedido con `botText` (./texts.js). Las funciones de antes que ya no
 * usa el bot (`formatEventList`, `formatEvent`, `formatChoices`, `formatPickList`) quedan con los
 * originales.
 */
import { argDateList } from '$lib/utils/dates.js';
import { renderBotText } from '$lib/utils/botTexts.js';
import { botText } from './texts.js';

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
 * @param {{ title?: string, empty?: string }} [opts] el título (en negrita) y el texto sin eventos
 */
export function formatEventList(events, origin, { title = 'Próximos eventos', empty } = {}) {
	if (events.length === 0) {
		return (
			empty ??
			`Por ahora no hay eventos próximos. Mirá el calendario en ${escapeHtml(origin)}/calendario`
		);
	}
	const shown = events.slice(0, LIST_MAX);
	const lines = shown.map((e) => eventLine(e, origin));
	const rest = events.length - shown.length;
	const more =
		rest > 0
			? `\n\nHay ${rest} más en <a href="${escapeHtml(origin)}/calendario">el calendario</a>.`
			: '';
	return `<b>${escapeHtml(title)}</b>\n\n${lines.join('\n\n')}${more}`;
}

/**
 * Título y texto vacío de `/hoy`, `/semana` y `/finde`, con su original (las pantallas piden los
 * de este pedido con `botText`; ver screens.js).
 */
export const WINDOW_TEXTS = Object.freeze({
	hoy: { title: renderBotText('eventos.titulo_hoy'), empty: renderBotText('eventos.vacio_hoy') },
	semana: {
		title: renderBotText('eventos.titulo_semana'),
		empty: renderBotText('eventos.vacio_semana')
	},
	finde: {
		title: renderBotText('eventos.titulo_finde'),
		empty: renderBotText('eventos.vacio_finde')
	}
});

/**
 * La lista de `/hoy`, `/semana` o `/finde`.
 *
 * @param {keyof typeof WINDOW_TEXTS} window
 * @param {BotEvent[]} events ya filtrados por la ventana
 * @param {string} origin
 */
export function formatWindowList(window, events, origin) {
	return formatEventList(events, origin, WINDOW_TEXTS[window]);
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
	const cuenta = accounts ? `\n${botText('inicio.ayuda_cuenta')}\n` : '';
	return botText('inicio.ayuda', { cuenta, sitio: origin });
}

/**
 * Un aviso de «Lo que sigo» por Telegram: solo título, fecha y link (nada de lugar ni de quién
 * más sigue lo mismo).
 *
 * @param {{ kind: 'nuevo' | 'recordatorio', title: string, start: string, url: string }} notice
 * @param {import('$lib/utils/botTexts.js').BotTexts | null} [texts] los textos cambiados (el cron
 *   los lee una vez por corrida)
 */
export function formatFollowNotice({ kind, title, start, url }, texts) {
	const key = kind === 'nuevo' ? 'seguir.aviso_nuevo' : 'seguir.aviso_recordatorio';
	const head = botText(key, {}, texts);
	const when = formatWhen(start);
	return `${head}\n\n<b>${escapeHtml(title)}</b>${when ? `\n${escapeHtml(when)}` : ''}\n${escapeHtml(url)}`;
}

/** @param {string} origin */
export function formatLinked(origin) {
	return botText('vincular.listo', { link: `${origin}/mi-rincon/sigo` });
}

/**
 * `/start adm_<código>` salió bien (la puerta por Telegram, adminLink.js).
 *
 * @param {string} login el de GitHub de le admin
 */
export function formatAdminLinked(login) {
	return botText('puerta.listo', { login });
}

// Los textos fijos, con su original (los cambiados en el panel los pide el router con `botText`
// en cada pedido; estas constantes quedan para las pruebas y para quien necesite el original).
// Los que también son avisos de un botón (`toast`) son texto solo: en un mensaje van escapados.

export const LINK_ASK_CODE_TEXT = renderBotText('vincular.pedir_codigo');
export const LINK_INVALID_TEXT = renderBotText('vincular.codigo_malo');
export const LINK_TOO_MANY_TEXT = renderBotText('vincular.muchos');
export const PRIVATE_ONLY_TEXT = renderBotText('vincular.solo_privado');
export const ACCOUNTS_OFF_TEXT = renderBotText('vincular.apagado');
export const ADMIN_LINK_INVALID_TEXT = renderBotText('puerta.link_malo');
export const ADMIN_LINK_OFF_TEXT = renderBotText('puerta.apagada');
export const NOT_LINKED_TEXT = renderBotText('vincular.sin_vincular');
export const UNLINKED_TEXT = renderBotText('vincular.desvinculado');
export const MUTED_TEXT = renderBotText('vincular.silenciado');
export const UNMUTED_TEXT = renderBotText('vincular.reanudado');
export const NOT_FOUND_TEXT = renderBotText('eventos.no_encontrado');
export const PICK_EVENT_TEXT = renderBotText('eventos.elegir');
export const UNAVAILABLE_TEXT = renderBotText('errores.no_disponible');
export const UNKNOWN_TEXT = renderBotText('errores.no_entendi');
export const ERROR_TEXT = renderBotText('errores.algo_salio_mal');
export const FOLLOW_ALREADY_TEXT = renderBotText('seguir.ya');
export const FOLLOW_GONE_TEXT = renderBotText('seguir.no_esta');
export const FOLLOW_FULL_TEXT = renderBotText('seguir.lleno');
export const FOLLOW_TOO_MANY_TEXT = renderBotText('seguir.muchos');

/** La línea que se suma cuando seguir desde el bot prendió los avisos por Telegram. */
export const FOLLOW_TELEGRAM_LINE = renderBotText('seguir.listo_telegram');

/** Lo que Telegram deja en el aviso de un botón (`answerCallbackQuery`). */
export const TOAST_MAX = 200;

/**
 * El aviso del botón al seguir algo (Telegram lo corta en 200 caracteres: se acorta el nombre, no
 * la línea de los avisos).
 *
 * @param {string} title
 * @param {{ telegram?: boolean }} [opts] `telegram`: se prendieron los avisos por Telegram
 */
export const followedText = (title, { telegram = false } = {}) => {
	const line = telegram ? `\n${botText('seguir.listo_telegram')}` : '';
	const head = botText('seguir.listo', { nombre: title });
	return head.length + line.length <= TOAST_MAX
		? head + line
		: `${head.slice(0, TOAST_MAX - line.length - 2)}….${line}`;
};

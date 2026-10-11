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

/** Título y texto vacío de `/hoy`, `/semana` y `/finde`. */
export const WINDOW_TEXTS = Object.freeze({
	hoy: {
		title: 'Hoy',
		empty: 'Hoy no hay eventos públicos. Mirá lo que viene con /proximos.'
	},
	semana: {
		title: 'En los próximos 7 días',
		empty: 'No hay eventos públicos en los próximos 7 días. Mirá lo que viene con /proximos.'
	},
	finde: {
		title: 'Este finde',
		empty: 'Este finde no hay eventos públicos. Mirá lo que viene con /proximos.'
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
	const account = accounts
		? '\nCon tu cuenta del sitio (por chat privado):\n' +
			'/vincular &lt;código&gt;: conectá este chat (el código está en Mi rincón → Lo que sigo)\n' +
			'/silenciar: pausá todos los avisos · /reanudar: volvé a recibirlos\n' +
			'/desvincular: desconectá este chat\n'
		: '';
	return (
		'Hola, soy el bot de Kinky Vibe. Podés pedirme:\n\n' +
		'/proximos: los próximos eventos (tocá uno para ver el detalle)\n' +
		'/hoy, /semana, /finde: lo que hay hoy, en los próximos 7 días o este fin de semana\n' +
		'/evento: elegí un evento de la lista\n' +
		'/evento &lt;nombre&gt;: buscá un evento por nombre o por fecha (por ejemplo «sábado» o «15/10»)\n' +
		'/buscar: escribí lo que buscás y te muestro lo que encuentre\n' +
		'/fondo: cuánto juntó el Fondo Kinky Vibe este mes\n' +
		'/start: el inicio, con botones para todo\n' +
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

/**
 * `/start adm_<código>` salió bien (prototipo de la puerta, adminLink.js).
 *
 * @param {string} login el de GitHub de le admin
 */
export function formatAdminLinked(login) {
	return (
		`Listo: este Telegram quedó vinculado a le admin <b>${escapeHtml(login)}</b> del panel, ` +
		'para la puerta. Para desvincularlo: panel → Ajustes → Admins.'
	);
}

export const ADMIN_LINK_INVALID_TEXT =
	'Ese link no sirve: puede estar vencido (duran 15 minutos), ya usado o incompleto. Generá otro en el panel → Ajustes → Admins → «Vincular Telegram».';

export const ADMIN_LINK_OFF_TEXT = 'Ahora no se puede vincular una cuenta de admin con el bot.';

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

export const FOLLOW_ALREADY_TEXT = 'Ya lo seguías.';

export const FOLLOW_GONE_TEXT = 'Esa etiqueta ya no está para seguir.';

export const FOLLOW_FULL_TEXT =
	'Ya seguís el máximo de cosas: dejá de seguir alguna en Mi rincón → Lo que sigo.';

/** @param {string} title */
export const followedText = (title) => `Listo: ahora seguís ${title}.`.slice(0, 200);

export const FOLLOW_TOO_MANY_TEXT =
	'Hiciste muchos cambios seguidos. Esperá un rato y probá de nuevo.';

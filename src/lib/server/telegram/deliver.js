/**
 * Cómo se manda una pantalla (screens.js) según dónde se pidió (docs/telegram.md, «Grupos y
 * efímeros»). Funciones puras: devuelven un {@link BotPlan} con los métodos de la API a llamar.
 *
 * | Dónde                                    | Cómo                                                     |
 * | ---------------------------------------- | -------------------------------------------------------- |
 * | Chat privado, comando                    | `sendMessage` (o `sendPhoto` para una tarjeta con foto)   |
 * | Chat privado, botón                      | Edita el mismo mensaje: `editMessageText` o `editMessageMedia` (texto → foto); de foto a texto, borra y manda de nuevo |
 * | Grupo, comando efímero (Bot API 10.2)    | `sendMessage` efímero: solo lo ve quien preguntó          |
 * | Grupo, comando común                     | Una respuesta pública (solo lo público), nunca una pantalla que edite cualquiera |
 * | Grupo, botón de un mensaje efímero       | `editEphemeralMessageText`: cambia solo la vista de quien tocó |
 * | Grupo, botón de un mensaje público       | `sendMessage` efímero con `replace_callback_query_message` (10.3): quien tocó ve la pantalla en lugar del mensaje; les demás siguen viendo el original |
 *
 * En los grupos no hay fotos (la tarjeta va con vista previa grande del link: un efímero de foto
 * no puede volver a texto) ni nada que necesite cuenta.
 *
 * Si algo falla (cliente sin efímeros, mensaje borrado o viejo, foto que Telegram no pudo bajar),
 * `fallback` dice qué probar una sola vez; en un grupo, lo más privado posible: contestar el botón
 * con el link al chat privado con el bot.
 */
import { botText } from './texts.js';

/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {{ method: string } & Record<string, any>} BotMethod */
/**
 * @typedef {{ steps: BotMethod[], fallback?: BotMethod[],
 *   callback?: { id: string, text?: string, url?: string,
 *     onFail?: { text: string, url?: string } } }} BotPlan
 *   `steps`: en orden (si falla uno que no sea `deleteMessage`, se corta); `fallback`: si falla el
 *   primero; `callback`: contestar el botón al final (corta el «cargando»), con `onFail` en lugar
 *   de `text`/`url` si no se pudo mostrar la pantalla.
 */
/**
 * @typedef {{ kind: 'command', chatId: number | string, group: boolean,
 *     userId?: number, ephemeralId?: number }
 *   | { kind: 'callback', callbackId: string, chatId: number | string, group: boolean,
 *     messageId?: number, userId?: number, ephemeralId?: number, isPhoto?: boolean }} Where
 */

/**
 * Los parámetros de texto de un mensaje: HTML, vista previa grande del link de la tarjeta (arriba
 * del texto) o sin vista previa.
 *
 * @param {Screen} screen
 */
function textParams(screen) {
	return {
		text: screen.text,
		parse_mode: 'HTML',
		link_preview_options: screen.preview
			? { url: screen.preview, prefer_large_media: true, show_above_text: true }
			: { is_disabled: true }
	};
}

/**
 * Los botones (y `force_reply`, Bot API 10.3). `undefined` sin botones: así un `sendMessage` sale
 * sin teclado y una edición lo saca.
 *
 * @param {Screen} screen
 */
const markup = (screen) =>
	screen.keyboard.length || screen.forceReply
		? { inline_keyboard: screen.keyboard, ...(screen.forceReply ? { force_reply: true } : {}) }
		: undefined;

/**
 * `reply_markup` solo si hay botones.
 *
 * @param {Screen} screen
 */
const withMarkup = (screen) => {
	const m = markup(screen);
	return m ? { reply_markup: m } : {};
};

/**
 * @param {Screen} screen
 * @param {number | string} chatId
 * @returns {BotMethod}
 */
const sendText = (screen, chatId) => ({
	method: 'sendMessage',
	chat_id: chatId,
	...textParams(screen),
	...withMarkup(screen)
});

/**
 * @param {Screen} screen
 * @param {number | string} chatId
 * @returns {BotMethod}
 */
const sendPhoto = (screen, chatId) => ({
	method: 'sendPhoto',
	chat_id: chatId,
	photo: screen.photo,
	caption: screen.text,
	parse_mode: 'HTML',
	...withMarkup(screen)
});

/**
 * ¿Va con foto? Solo en privado, si la pantalla tiene una y se puede llamar a la API con el
 * token (`media`): sin token el webhook contesta un solo método y no podría volver a texto.
 *
 * @param {Screen} screen
 * @param {boolean} group
 * @param {boolean} media
 */
const withPhoto = (screen, group, media) => Boolean(screen.photo && media && !group);

/**
 * El link al chat privado con el bot, para cuando un grupo no deja mostrar la pantalla a una sola
 * persona.
 *
 * @param {string | null | undefined} privateLink
 */
const privateFallback = (privateLink) =>
	privateLink
		? { text: botText('errores.grupo_link'), url: privateLink }
		: { text: botText('errores.grupo') };

/**
 * El plan para mostrar una pantalla.
 *
 * @param {Screen} screen
 * @param {Where} where
 * @param {{ media?: boolean, privateLink?: string | null }} [opts] `media`: hay token (se puede
 *   usar foto y llamar a la API); `privateLink`: `t.me/<bot>?start=…` para los grupos
 * @returns {BotPlan}
 */
export function deliverScreen(screen, where, { media = false, privateLink = null } = {}) {
	const { chatId, group } = where;
	if (where.kind === 'command') {
		if (group && where.ephemeralId && where.userId) {
			// Comando efímero: la respuesta también, y solo la ve quien preguntó (15 s para
			// contestar; el webhook contesta enseguida).
			return {
				steps: [
					{
						...sendText(screen, chatId),
						ephemeral_message_parameters: { receiver_user_id: where.userId },
						reply_parameters: { ephemeral_message_id: where.ephemeralId }
					}
				]
			};
		}
		if (withPhoto(screen, group, media)) {
			return { steps: [sendPhoto(screen, chatId)], fallback: [sendText(screen, chatId)] };
		}
		return { steps: [sendText(screen, chatId)] };
	}

	const callback = { id: where.callbackId };
	if (screen.forceReply) {
		// Buscar: `force_reply` no se puede poner editando, va en un mensaje nuevo.
		return { steps: [sendText(screen, chatId)], callback };
	}
	if (group) {
		if (!where.userId)
			return { steps: [], callback: { ...callback, ...privateFallback(privateLink) } };
		if (where.ephemeralId) {
			return {
				steps: [
					{
						method: 'editEphemeralMessageText',
						chat_id: chatId,
						receiver_user_id: where.userId,
						ephemeral_message_id: where.ephemeralId,
						...textParams(screen),
						...withMarkup(screen)
					}
				],
				callback: { ...callback, onFail: privateFallback(privateLink) }
			};
		}
		return {
			steps: [
				{
					...sendText(screen, chatId),
					ephemeral_message_parameters: {
						receiver_user_id: where.userId,
						callback_query_id: where.callbackId,
						replace_callback_query_message: true
					}
				}
			],
			callback: { ...callback, onFail: privateFallback(privateLink) }
		};
	}

	if (typeof where.messageId !== 'number') {
		// No hay mensaje que cambiar (muy viejo o inaccesible): uno nuevo.
		return {
			steps: [
				withPhoto(screen, group, media) ? sendPhoto(screen, chatId) : sendText(screen, chatId)
			],
			callback
		};
	}
	const target = { chat_id: chatId, message_id: where.messageId };
	if (withPhoto(screen, group, media)) {
		return {
			steps: [
				{
					method: 'editMessageMedia',
					...target,
					media: { type: 'photo', media: screen.photo, caption: screen.text, parse_mode: 'HTML' },
					...withMarkup(screen)
				}
			],
			// Si Telegram no pudo bajar la foto: la misma tarjeta como texto con vista previa.
			fallback: where.isPhoto
				? [{ method: 'deleteMessage', ...target }, sendText(screen, chatId)]
				: [{ method: 'editMessageText', ...target, ...textParams(screen), ...withMarkup(screen) }],
			callback
		};
	}
	if (where.isPhoto) {
		// Una foto no se puede editar a texto: se borra y se manda la pantalla de nuevo.
		return {
			steps: [{ method: 'deleteMessage', ...target }, sendText(screen, chatId)],
			callback
		};
	}
	return {
		steps: [{ method: 'editMessageText', ...target, ...textParams(screen), ...withMarkup(screen) }],
		// Mensaje borrado o muy viejo para editar: la pantalla en uno nuevo.
		fallback: [sendText(screen, chatId)],
		callback
	};
}

/**
 * Solo contestar el botón (evento que ya no está, error, el contador «1/3»).
 *
 * @param {string} callbackId
 * @param {string} [text]
 * @returns {BotPlan}
 */
export function answerOnly(callbackId, text) {
	return { steps: [], callback: { id: callbackId, ...(text ? { text } : {}) } };
}

/**
 * Sin token, el webhook contesta un solo método en el mismo pedido: el primer paso, o contestar
 * el botón si no hay pasos. `null` si no hay nada que contestar.
 *
 * @param {BotPlan | null} plan
 * @returns {BotMethod | null}
 */
export function singleMethod(plan) {
	if (!plan) return null;
	if (plan.steps.length > 0) return plan.steps[0];
	if (!plan.callback) return null;
	const { id, text, url } = plan.callback;
	return {
		method: 'answerCallbackQuery',
		callback_query_id: id,
		...(text ? { text } : {}),
		...(url ? { url } : {})
	};
}

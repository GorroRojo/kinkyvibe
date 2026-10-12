/**
 * «Textos del bot» del lado del servidor: lo cambiado en el panel (Ajustes › Comunicación › Textos
 * del bot), guardado en `ticket_settings` (la tabla clave → valor de los ajustes del panel,
 * migración 0002), en una sola fila `telegram_bot_texts` con un JSON de los textos cambiados. Sin
 * tabla nueva ni migración, como los textos de las vistas previas (src/lib/server/linkPreview.js).
 * Los originales y el formato están en `$lib/utils/botTexts.js`.
 *
 * **Una lectura por pedido**: el webhook lee la fila una vez, después de chequear el secreto, y
 * corre todo el pedido (también lo que sigue en `waitUntil`) con {@link runWithBotTexts}; así las
 * pantallas, que son funciones puras, piden cada texto con {@link botText} sin pasar nada de mano
 * en mano. El cron (avisos y comandos) los lee una vez por corrida y los pasa explícitos. Sin
 * fila, sin base o si algo falla: los originales (el bot nunca se queda mudo por esto).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { cleanBotTextOverrides, renderBotText } from '$lib/utils/botTexts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/botTexts.js').BotTexts} BotTexts */

/** La fila de `ticket_settings` con los textos cambiados (JSON). */
export const BOT_TEXTS_SETTING = 'telegram_bot_texts';

/** @type {AsyncLocalStorage<BotTexts>} */
const store = new AsyncLocalStorage();

/**
 * Corre `fn` con estos textos cambiados (se limpian antes: solo claves conocidas y válidas).
 *
 * @template T
 * @param {unknown} overrides
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithBotTexts(overrides, fn) {
	return store.run(cleanBotTextOverrides(overrides), fn);
}

/** Los textos cambiados de este pedido, o `null` (fuera de un pedido del bot: los originales). */
export const currentBotTexts = () => store.getStore() ?? null;

/**
 * El texto de una clave: lo cambiado en el panel o el original (ver `renderBotText`).
 *
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @param {BotTexts | null} [overrides] por defecto, los de este pedido
 */
export function botText(key, vars = {}, overrides = currentBotTexts()) {
	return renderBotText(key, vars, overrides);
}

/**
 * Lo guardado (solo lo que vale; ver `cleanBotTextOverrides`). Sin base, sin la fila o con un
 * JSON roto: nada.
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<{ overrides: BotTexts, updatedAt: number | null, updatedBy: string | null }>}
 */
export async function readBotTextOverrides(db) {
	const none = { overrides: {}, updatedAt: null, updatedBy: null };
	if (!db) return none;
	try {
		const row = await db
			.prepare('SELECT value, updated_at, updated_by FROM ticket_settings WHERE key = ?1')
			.bind(BOT_TEXTS_SETTING)
			.first();
		if (!row) return none;
		return {
			overrides: cleanBotTextOverrides(JSON.parse(String(row.value))),
			updatedAt: Number(row.updated_at) || null,
			updatedBy: row.updated_by ? String(row.updated_by) : null
		};
	} catch (error) {
		console.error(
			'[telegram] no se pudieron leer los textos del bot:',
			/** @type {Error} */ (error)?.message
		);
		return none;
	}
}

/**
 * Solo los textos cambiados (para el bot). Nunca tira.
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<BotTexts>}
 */
export async function botTextOverrides(db) {
	return (await readBotTextOverrides(db)).overrides;
}

/**
 * Guarda los textos cambiados (todos juntos: lo que no viene vuelve al original). Sin cambios,
 * borra la fila.
 *
 * @param {D1Database} db
 * @param {BotTexts} overrides ya validados (`validateBotTexts`)
 * @param {{ by: string, now?: number }} who
 */
export async function saveBotTextOverrides(db, overrides, { by, now = Date.now() }) {
	if (!Object.keys(overrides).length) {
		await db.prepare('DELETE FROM ticket_settings WHERE key = ?1').bind(BOT_TEXTS_SETTING).run();
		return;
	}
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
				updated_by = excluded.updated_by`
		)
		.bind(BOT_TEXTS_SETTING, JSON.stringify(overrides), now, by)
		.run();
}

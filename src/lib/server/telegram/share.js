/**
 * Compartir desde la Mini App del calendario (docs/telegram.md, «Mensajes enriquecidos y
 * compartir»), detrás de `telegram_enriquecido` (y el bot prendido):
 *
 * - **«📤 Mandar a un chat»**: la Mini App manda su `initData` y la dirección del evento; el
 *   servidor valida el `initData` (initData.js), arma **la misma tarjeta del modo inline** (inline.js,
 *   enriquecida si se puede) y la guarda con `savePreparedInlineMessage` (Bot API 8.0) para ese
 *   usuario de Telegram. La Mini App abre el selector de chats con `shareMessage(id)`: la persona
 *   elige a quién mandarla. No se guarda nada de nadie (el tope por persona usa la tabla de topes,
 *   que se limpia sola).
 * - **El link directo** `t.me/<bot>?startapp=ev-<id>` (la Main Mini App, `miniAppEventLink` de
 *   inline.js) abre el calendario marcando ese evento: llega como `tgWebAppStartParam` (o
 *   `start_param` en el `initData`) y se compara con el de cada evento ({@link appStartParam}).
 *
 * Solo lo público: el evento tiene que estar en el índice público de la búsqueda (inlineSource.js)
 * y no haber empezado; el lugar y la venta salen de las mismas funciones que su página (events.js).
 */
import { renderBotText } from '$lib/utils/botTexts.js';
import { isFlagOn } from '$lib/server/flags.js';
import { validateInitData } from './initData.js';
import { eventSlugOf, inlineArticle } from './inline.js';
import { startParam } from './nav.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./inline.js').InlineSource} InlineSource */
/** @typedef {import('./inline.js').InlineEventInfo} InlineEventInfo */
/**
 * @typedef {(method: string, body: Record<string, unknown>) =>
 *   Promise<{ ok: boolean, status: number | null, result?: unknown }>} ShareCall
 */

/** Cuántas veces por hora puede preparar algo para compartir cada usuario de Telegram. */
export const SHARE_RATE_LIMIT = Object.freeze({ limit: 30, windowSeconds: 60 * 60 });

/** El largo máximo de la dirección de un evento que se acepta. */
const SLUG_MAX = 200;

/**
 * ¿Se puede compartir desde la Mini App? El bot y `telegram_enriquecido` prendidos.
 *
 * @param {D1Database | null | undefined} db
 */
export async function shareEnabled(db) {
	if (!db) return false;
	const [bot, rich] = await Promise.all([
		isFlagOn(db, 'telegram_bot'),
		isFlagOn(db, 'telegram_enriquecido')
	]);
	return bot && rich;
}

/**
 * Los textos de la Mini App para compartir: lo cambiado en «Textos del bot» o el original. Texto
 * solo (la página lo escapa).
 *
 * @param {import('$lib/utils/botTexts.js').BotTexts | null} [overrides]
 */
export function miniAppShareTexts(overrides = null) {
	return {
		boton: renderBotText('compartir.miniapp_boton', {}, overrides),
		mandado: renderBotText('compartir.miniapp_mandado', {}, overrides),
		error: renderBotText('compartir.miniapp_error', {}, overrides),
		destacado: renderBotText('compartir.miniapp_destacado', {}, overrides)
	};
}

/**
 * Lo que trae el link directo para abrir la Mini App en un evento (`ev-<id>`, como los deep links
 * del bot).
 *
 * @param {string} slug
 */
export const appStartParam = (slug) => startParam({ screen: 'event', slug });

/**
 * El evento marcado por el link directo, entre los que muestra la Mini App. `null` si no está.
 *
 * @param {{ events: { slug: string }[] }[]} days
 * @param {unknown} param `tgWebAppStartParam`
 */
export function focusedSlug(days, param) {
	if (typeof param !== 'string' || !param || param.length > 64) return null;
	for (const day of days) {
		for (const ev of day.events) if (appStartParam(ev.slug) === param) return ev.slug;
	}
	return null;
}

/**
 * Prepara la tarjeta de un evento para que la Mini App la comparta (`savePreparedInlineMessage`).
 *
 * @param {{
 *   initData: unknown, slug: unknown, token: string, origin: string, now?: number,
 *   source: () => Promise<InlineSource | null>,
 *   events?: (metas: Record<string, any>[]) => Promise<Map<string, InlineEventInfo>>,
 *   botUsername?: string | null, rich?: boolean,
 *   allow?: (telegramUserId: number) => Promise<boolean>,
 *   call: ShareCall
 * }} input `rich`: probar primero la tarjeta enriquecida (si Telegram la rechaza, la de siempre).
 *   `allow`: el tope por persona.
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function prepareShare({
	initData,
	slug,
	token,
	origin,
	now = Date.now(),
	source,
	events,
	botUsername = null,
	rich = false,
	allow,
	call
}) {
	const v = await validateInitData(initData, token, { now });
	if (!v.ok) return { status: 401, body: { error: 'bad_init_data' } };
	if (typeof slug !== 'string' || !slug || slug.length > SLUG_MAX) {
		return { status: 400, body: { error: 'bad_request' } };
	}
	if (allow && !(await allow(v.user.id))) return { status: 429, body: { error: 'too_many' } };

	const src = await source();
	// Solo un evento del índice público que todavía no empezó (lo mismo que muestra la Mini App).
	const doc = src?.docs.find(
		(d) => eventSlugOf(d) === slug && Boolean(d.d) && Date.parse(/** @type {string} */ (d.d)) > now
	);
	if (!src || !doc) return { status: 404, body: { error: 'not_found' } };
	const extra = src.extras.get(doc.h);

	/** @type {InlineEventInfo | undefined} */
	let info;
	if (extra?.meta && events) {
		try {
			info = (await events([extra.meta])).get(slug);
		} catch (error) {
			// Sin lugar ni venta: mejor que no poder mandarlo.
			console.error(
				'[telegram] compartir: sin lugar ni venta:',
				/** @type {Error} */ (error)?.name
			);
		}
	}

	for (const useRich of rich ? [true, false] : [false]) {
		const result = inlineArticle('compartir', doc, extra, info, {
			origin,
			now,
			...(useRich ? { rich: true } : {}),
			...(botUsername ? { botUsername } : {})
		});
		const r = await call('savePreparedInlineMessage', {
			user_id: v.user.id,
			result,
			allow_user_chats: true,
			allow_group_chats: true,
			allow_channel_chats: true
		});
		const id = r.ok ? /** @type {any} */ (r.result)?.id : null;
		if (typeof id === 'string' && id) return { status: 200, body: { id } };
		if (r.status === 429) break;
	}
	return { status: 502, body: { error: 'telegram' } };
}

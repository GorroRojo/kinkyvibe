/**
 * Ajustes → Admins: quién puede entrar al panel. La lista es de solo lectura: vive en
 * `src/lib/server/auth.js` (ADMINS, por id numérico de GitHub).
 *
 * «Tu Telegram para la puerta»: «Vincular Telegram» (la puerta por Telegram, decisión 0037,
 * $lib/server/telegram/adminLink.js): crea un código de un solo uso, que vence en 15 minutos, y
 * muestra el link `t.me/<bot>?start=adm_<código>` (y su QR). «Desvincular» lo borra. Las dos
 * cosas quedan en el registro; vincular lo anota el bot cuando se usa el código.
 */
import { fail } from '@sveltejs/kit';
import { ADMINS, requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import {
	adminStartParam,
	createAdminLinkCode,
	getAdminTelegramLink,
	linkedAdminIds,
	unlinkAdminTelegram
} from '$lib/server/telegram/adminLink.js';
import { startLink } from '$lib/server/telegram/nav.js';
import { botUsername } from '$lib/server/telegram/web.js';
import { qrSvg } from '$lib/server/tickets/qr.js';

/**
 * Por qué no se puede vincular ahora (o `null` si se puede).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 */
async function linkingBlocked(db) {
	if (!db) return 'No hay base de datos disponible.';
	if (!(await isFlagOn(db, 'telegram_bot')))
		return 'El bot de Telegram está apagado (Ajustes → Interruptores).';
	if (!(await isFlagOn(db, 'telegram_puerta')))
		return 'La puerta por Telegram está apagada (Ajustes → Interruptores).';
	if (!botUsername()) return 'Falta la variable TELEGRAM_BOT_USERNAME (el usuario del bot).';
	return null;
}

/**
 * Le admin con sesión, como lo guarda el vínculo (id de GitHub y login).
 *
 * @param {NonNullable<App.Locals['user']>} user
 */
const identity = (user) => ({ id: Number(user.id), login: String(user.login ?? '') });

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	const me = identity(requireAdmin(locals, url));
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Set<number>} */
	let linked = new Set();
	/** @type {{ linkedAt: number } | null} */
	let myLink = null;
	if (db && Number.isSafeInteger(me.id)) {
		try {
			linked = await linkedAdminIds(db);
			myLink = await getAdminTelegramLink(db, me.id);
		} catch (error) {
			logDBError('admins: vínculos de Telegram', error);
		}
	}
	return {
		admins: ADMINS.map((a) => ({
			id: a.id,
			login: a.login,
			// Por id (no por login): el id de GitHub no cambia aunque cambie el nombre de usuarie.
			avatar: `https://avatars.githubusercontent.com/u/${a.id}?s=96`,
			me: a.id === me.id,
			telegram: linked.has(a.id)
		})),
		telegram: {
			linkedAt: myLink?.linkedAt ?? null,
			blocked: await linkingBlocked(db)
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	vincularTelegram: async ({ locals, url, platform }) => {
		const me = identity(requireAdmin(locals, url));
		const db = getDB(platform);
		const blocked = await linkingBlocked(db);
		const bot = botUsername();
		if (blocked || !db || !bot) return fail(503, { telegramError: blocked ?? 'No se puede.' });
		let r;
		try {
			r = await createAdminLinkCode(db, me);
		} catch (error) {
			logDBError('admins: código de Telegram', error);
			return fail(500, { telegramError: 'No se pudo crear el link. Probá de nuevo.' });
		}
		if (!r.ok) {
			return fail(r.reason === 'too_many' ? 429 : 403, {
				telegramError:
					r.reason === 'too_many'
						? 'Pediste muchos links seguidos. Esperá un rato y probá de nuevo.'
						: 'Tu cuenta no puede vincular Telegram.'
			});
		}
		const link = /** @type {string} */ (startLink(bot, adminStartParam(r.code)));
		return { telegramLink: link, telegramQr: qrSvg(link), telegramExpiresAt: r.expiresAt };
	},

	desvincularTelegram: async ({ locals, url, platform }) => {
		const me = identity(requireAdmin(locals, url));
		const db = getDB(platform);
		if (!db) return fail(503, { telegramError: 'No hay base de datos disponible.' });
		try {
			await unlinkAdminTelegram(db, { user: me });
		} catch (error) {
			logDBError('admins: desvincular Telegram', error);
			return fail(500, { telegramError: 'No se pudo desvincular. Probá de nuevo.' });
		}
		return { telegramMessage: 'Listo: tu Telegram quedó desvinculado de la puerta.' };
	}
};

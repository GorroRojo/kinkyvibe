/**
 * Ajustes → Admins: quién puede entrar al panel. La lista es de solo lectura: vive en
 * `src/lib/server/auth.js` (ADMINS, por id numérico de GitHub).
 *
 * «Tu Telegram en el bot»: «Vincular Telegram» (la puerta por Telegram, decisión 0037, y el estado y
 * los avisos de admins, decisión 0041;
 * $lib/server/telegram/adminLink.js): crea un código de un solo uso, que vence en 15 minutos, y
 * muestra el link `t.me/<bot>?start=adm_<código>` (y su QR). «Desvincular» lo borra. Las dos
 * cosas quedan en el registro; vincular lo anota el bot cuando se usa el código.
 *
 * «Conector de Claude» (interruptor `conector_claude`, docs/conector-claude.md): la dirección para
 * sumarlo en claude.ai, «Cerrar mis conexiones» (ningún token tuyo de antes vale) y «Cerrar las de
 * todes» (cambia la clave de las firmas). Las dos quedan en el registro.
 *
 * «Llaves para rutinas» (docs/conector-claude.md, $lib/server/mcp/llaves.js): llaves de larga
 * duración para las rutinas programadas de cada admin. La llave se muestra una sola vez, al crearla;
 * cada admin ve y revoca solo las suyas. «Cerrar mis conexiones» también revoca las tuyas, y
 * «Cerrar las de todes», las de todes. Crear y revocar quedan en el registro (sin la llave).
 */
import { fail } from '@sveltejs/kit';
import { ADMINS, requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { closeConnections, resourceOf, rotateKey } from '$lib/server/mcp/oauth.js';
import {
	LLAVES_MAX,
	createLlave,
	isLive,
	listLlaves,
	revokeAllLlaves,
	revokeLlave
} from '$lib/server/mcp/llaves.js';
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
	// Vincular sirve para la puerta (0037) y para el estado y los avisos de admins (0041).
	const [puerta, admin] = await Promise.all([
		isFlagOn(db, 'telegram_puerta'),
		isFlagOn(db, 'telegram_admin')
	]);
	if (!puerta && !admin)
		return 'La puerta por Telegram está apagada, y «Telegram para admins» también (Ajustes → Interruptores).';
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
	/** @type {import('$lib/server/mcp/llaves.js').Llave[]} */
	let llaves = [];
	if (db && Number.isSafeInteger(me.id)) {
		try {
			linked = await linkedAdminIds(db);
			myLink = await getAdminTelegramLink(db, me.id);
		} catch (error) {
			logDBError('admins: vínculos de Telegram', error);
		}
		try {
			llaves = await listLlaves(db, me.id);
		} catch (error) {
			logDBError('admins: llaves del conector', error);
		}
	}
	const now = Date.now();
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
		},
		claude: {
			on: db ? await isFlagOn(db, 'conector_claude') : false,
			url: resourceOf(url.origin),
			llaves: llaves.map((l) => ({ ...l, live: isLive(l, now) })),
			llavesMax: LLAVES_MAX
		}
	};
}

/**
 * Para las acciones del conector: la base y le admin, o el error del formulario.
 * @param {App.Locals} locals
 * @param {URL} url
 * @param {App.Platform | undefined} platform
 */
function claudeAction(locals, url, platform) {
	const me = identity(requireAdmin(locals, url));
	const db = getDB(platform);
	return { me, db };
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
	},

	cerrarClaude: async ({ locals, url, platform }) => {
		const { me, db } = claudeAction(locals, url, platform);
		if (!db) return fail(503, { claudeError: 'No hay base de datos disponible.' });
		try {
			await closeConnections(db, me);
			await revokeAllLlaves(db, me.id);
		} catch (error) {
			logDBError('admins: cerrar conexiones de Claude', error);
			return fail(500, { claudeError: 'No se pudieron cerrar. Probá de nuevo.' });
		}
		await logAdminAction(db, locals, {
			action: 'conector.cerrar',
			summary: 'Conector de Claude: cerró sus conexiones'
		});
		return {
			claudeMessage:
				'Listo: Claude ya no puede usar tus conexiones de antes ni tus llaves para rutinas.'
		};
	},

	cerrarClaudeTodes: async ({ locals, url, platform }) => {
		const { db } = claudeAction(locals, url, platform);
		if (!db) return fail(503, { claudeError: 'No hay base de datos disponible.' });
		try {
			await rotateKey(db);
			await revokeAllLlaves(db, null);
		} catch (error) {
			logDBError('admins: cerrar todas las conexiones de Claude', error);
			return fail(500, { claudeError: 'No se pudieron cerrar. Probá de nuevo.' });
		}
		await logAdminAction(db, locals, {
			action: 'conector.cerrar_todes',
			summary: 'Conector de Claude: cerró las conexiones de todes'
		});
		return {
			claudeMessage:
				'Listo: ninguna conexión ni llave para rutinas de Claude de antes sirve más, de nadie.'
		};
	},

	crearLlave: async ({ locals, url, platform, request }) => {
		const { me, db } = claudeAction(locals, url, platform);
		if (!db) return fail(503, { llaveError: 'No hay base de datos disponible.' });
		const form = await request.formData();
		let r;
		try {
			r = await createLlave(db, me, form.get('nombre'));
		} catch (error) {
			logDBError('admins: crear llave del conector', error);
			return fail(500, { llaveError: 'No se pudo crear. Probá de nuevo.' });
		}
		if (!r.ok) return fail(400, { llaveError: r.message });
		await logAdminAction(db, locals, {
			action: 'conector.llave_crear',
			summary: `Conector de Claude: creó la llave para rutinas «${r.llave.name}»`,
			detail: { id: r.llave.id }
		});
		// La llave se muestra esta sola vez (no se guarda: solo su huella).
		return { llaveNueva: r.token, llaveNombre: r.llave.name };
	},

	revocarLlave: async ({ locals, url, platform, request }) => {
		const { me, db } = claudeAction(locals, url, platform);
		if (!db) return fail(503, { llaveError: 'No hay base de datos disponible.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		let ok;
		try {
			ok = await revokeLlave(db, me, id);
		} catch (error) {
			logDBError('admins: revocar llave del conector', error);
			return fail(500, { llaveError: 'No se pudo revocar. Probá de nuevo.' });
		}
		if (!ok) return fail(404, { llaveError: 'Esa llave no está (o ya estaba revocada).' });
		await logAdminAction(db, locals, {
			action: 'conector.llave_revocar',
			summary: 'Conector de Claude: revocó una llave para rutinas',
			detail: { id: Number(id) }
		});
		return { llaveMessage: 'Listo: esa llave ya no sirve.' };
	},

	revocarLlaves: async ({ locals, url, platform }) => {
		const { me, db } = claudeAction(locals, url, platform);
		if (!db) return fail(503, { llaveError: 'No hay base de datos disponible.' });
		let n;
		try {
			n = await revokeAllLlaves(db, me.id);
		} catch (error) {
			logDBError('admins: revocar llaves del conector', error);
			return fail(500, { llaveError: 'No se pudieron revocar. Probá de nuevo.' });
		}
		await logAdminAction(db, locals, {
			action: 'conector.llave_revocar',
			summary: `Conector de Claude: revocó todas sus llaves para rutinas (${n})`
		});
		return { llaveMessage: 'Listo: ninguna de tus llaves sirve más.' };
	}
};

/**
 * Mi rincón → Telegram (fase 2 del bot, docs/telegram.md): conectar la cuenta con el bot por un
 * código de un solo uso y desconectarla. Interruptores `telegram_bot`, `lo_que_sigo` y `cuentas`
 * (con cualquiera apagado, 404).
 *
 * La tarjeta vive en Mi rincón → Lo que sigo (`TelegramCard.svelte`) y manda sus formularios
 * acá; esta página es lo que se ve sin JavaScript (la misma tarjeta, con el código). El código se
 * guarda solo como hash: se muestra una vez, cuando se crea.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { createLinkCode, displayLinkCode, unlinkAccount } from '$lib/server/telegram/link.js';
import { telegramCardData, telegramLinkingEnabled } from '$lib/server/telegram/web.js';

const LOGIN = '/ingresar?next=%2Fmi-rincon%2Fsigo';

/** @param {import('@sveltejs/kit').RequestEvent} event */
async function requireMember(event) {
	if (!(await telegramLinkingEnabled(event.platform))) error(404, 'Not found');
	const db = /** @type {import('@cloudflare/workers-types').D1Database} */ (getDB(event.platform));
	const member = event.locals.member;
	if (!member) redirect(303, LOGIN);
	return { db, member };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireMember(event);
	return { telegram: await telegramCardData(event.platform, db, member.id) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	codigo: async (event) => {
		const { db, member } = await requireMember(event);
		const r = await createLinkCode(db, member.id);
		if (!r.ok) {
			return fail(429, {
				action: 'codigo',
				error: 'Pediste muchos códigos seguidos. Esperá un rato y probá de nuevo.'
			});
		}
		return { action: 'codigo', ok: true, code: displayLinkCode(r.code), expiresAt: r.expiresAt };
	},
	desconectar: async (event) => {
		const { db, member } = await requireMember(event);
		await unlinkAccount(db, member.id);
		return { action: 'desconectar', ok: true };
	}
};

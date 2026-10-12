/**
 * La Mini App del calendario (`/telegram/app`, decisión 0034): sin login, solo lo público.
 * Ver $lib/server/telegram/miniapp.js y docs/telegram.md.
 *
 * Con `telegram_enriquecido` (share.js): «📤 Mandar a un chat» en cada evento, y el evento que
 * marca el link directo (`t.me/<bot>?startapp=ev-<id>`, que llega como `tgWebAppStartParam`).
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { miniAppData } from '$lib/server/telegram/miniapp.js';
import {
	appStartParam,
	focusedSlug,
	miniAppShareTexts,
	shareEnabled
} from '$lib/server/telegram/share.js';
import { botTextOverrides } from '$lib/server/telegram/texts.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, url, setHeaders }) {
	// Lo mismo para todes (sin cuenta): se puede guardar un rato, y no va a los buscadores.
	setHeaders({ 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' });
	const db = getDB(platform);
	const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
	const [data, enabled] = await Promise.all([
		miniAppData(platform, url.origin),
		token ? shareEnabled(db) : false
	]);
	// Cada evento con lo que trae su link directo, para marcarlo también desde el `initData`.
	const days = data.days.map((day) => ({
		...day,
		events: day.events.map((ev) => ({ ...ev, start: appStartParam(ev.slug) }))
	}));
	const focus = focusedSlug(days, url.searchParams.get('tgWebAppStartParam'));
	return {
		...data,
		days,
		share: enabled,
		focus,
		// Los textos de compartir solo hacen falta con el interruptor o un evento marcado.
		shareTexts: miniAppShareTexts(enabled || focus ? await botTextOverrides(db) : null)
	};
}

/**
 * Link del mail para confirmar "Avisame si se repite" (doble confirmación). GET solo muestra el
 * botón; el POST confirma (ver MailLinkCard.svelte). Interruptor `series`: apagado, 404.
 */
import { fail } from '@sveltejs/kit';
import { confirmSubscription } from '$lib/server/series/subscriptions.js';
import { siteTags } from '$lib/server/series/index.js';
import { requireSeries, requireSeriesDB } from '$lib/server/series/web.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, setHeaders }) {
	await requireSeries(platform);
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex',
		'referrer-policy': 'no-referrer'
	});
	return {};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform }) => {
		const db = await requireSeriesDB(platform);
		const tag = await confirmSubscription(db, params.token);
		if (!tag)
			return fail(400, {
				error: 'El link venció o ya se usó. Si querés el aviso, pedilo de nuevo desde la serie.'
			});
		return { ok: true, seriesName: siteTags().get(tag)?.visible_name ?? tag };
	}
};

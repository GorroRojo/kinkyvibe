/**
 * Link del mail para confirmar "Avisame si se repite" (doble confirmación). GET solo muestra el
 * botón; el POST confirma (ver MailLinkCard.svelte).
 */
import { fail } from '@sveltejs/kit';
import { confirmSubscription } from '$lib/server/series/subscriptions.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { requireSeriesDB } from '$lib/server/series/web.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, setHeaders }) {
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
		const tags = await siteTagManager(platform);
		return { ok: true, seriesName: tags.get(tag)?.visible_name ?? tag };
	}
};

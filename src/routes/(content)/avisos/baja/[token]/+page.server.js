/**
 * Link de baja de "Avisame si se repite" (va en cada mail). GET muestra el botón; el POST borra la
 * suscripción (con el mail). Darse de baja tiene que andar siempre (solo hace falta la base).
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import {
	checkUnsubscribeToken,
	subscriptionSeries,
	unsubscribe
} from '$lib/server/series/subscriptions.js';
import { siteTags } from '$lib/server/series/index.js';

/** @param {string | null} tag */
const nameOf = (tag) => (tag ? (siteTags().get(tag)?.visible_name ?? tag) : null);

/** @param {App.Platform | undefined} platform */
function requireDB(platform) {
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	return db;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, setHeaders }) {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex',
		'referrer-policy': 'no-referrer'
	});
	const db = requireDB(platform);
	const id = await checkUnsubscribeToken(db, params.token);
	if (!id) return { valid: false, seriesName: null };
	return { valid: true, seriesName: nameOf(await subscriptionSeries(db, id)) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform }) => {
		const db = requireDB(platform);
		const r = await unsubscribe(db, params.token);
		if (!r.ok) return fail(400, { error: 'Este link no es válido.' });
		return { ok: true, seriesName: nameOf(r.seriesTag) };
	}
};

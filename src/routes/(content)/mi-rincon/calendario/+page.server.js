/**
 * Mi rincón → Calendario (interruptores `cuentas` y `series`): el calendario personal ("lo
 * tuyo": los eventos con entradas de esta cuenta) con un link secreto que se puede revocar, y las
 * series de las que la cuenta pide aviso. Ver $lib/server/series/feeds.js.
 *
 * El token del link se guarda solo como hash: se muestra una vez, cuando se crea.
 */
import { fail, redirect } from '@sveltejs/kit';
import { requireCuentas } from '$lib/server/cuentas/web.js';
import { createFeedToken, feedInfo, revokeFeeds } from '$lib/server/series/feeds.js';
import { accountSubscriptions, unsubscribeAccount } from '$lib/server/series/subscriptions.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { requireSeries } from '$lib/server/series/web.js';
import { tagPagePath } from '$lib/utils/series.js';

const LOGIN = '/ingresar?next=%2Fmi-rincon%2Fcalendario';

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
async function requireMember(event) {
	await requireSeries(event.platform);
	const db = await requireCuentas(event.platform);
	const member = event.locals.member;
	if (!member) redirect(303, LOGIN);
	return { db, member };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireMember(event);
	const tags = await siteTagManager(event.platform);
	return {
		feed: await feedInfo(db, member.id),
		series: (await accountSubscriptions(db, member.id)).map((id) => ({
			id,
			name: tags.get(id)?.visible_name ?? id,
			href: tagPagePath(id)
		}))
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	crear: async (event) => {
		const { db, member } = await requireMember(event);
		const token = await createFeedToken(db, member.id);
		return { action: 'crear', path: `/ics/mio/${token}.ics` };
	},
	revocar: async (event) => {
		const { db, member } = await requireMember(event);
		await revokeFeeds(db, member.id);
		return { action: 'revocar', ok: true };
	},
	baja: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const id = String(form.get('serie') ?? '').slice(0, 100);
		if (!id) return fail(400, { action: 'baja', error: 'Falta la serie.' });
		await unsubscribeAccount(db, member.id, id);
		return { action: 'baja', ok: true };
	}
};

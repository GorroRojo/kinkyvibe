/**
 * "Avisame si se repite" (interruptor `series`): suscribirse a una serie de eventos para recibir
 * un mail cuando se publique una nueva edición. Los formularios de la página de un evento y de la
 * serie mandan acá (?/suscribir); sin JavaScript, esta página muestra el resultado. Con cuenta
 * del público y sesión abierta, se puede usar la cuenta en vez del mail (y darse de baja acá).
 * Ver $lib/server/series/subscriptions.js.
 */
import { error, fail } from '@sveltejs/kit';
import { seriesPage } from '$lib/server/series/index.js';
import { markEditionsSeen } from '$lib/server/series/notify.js';
import {
	subscribeAccount,
	subscribeEmail,
	unsubscribeAccount
} from '$lib/server/series/subscriptions.js';
import { requireSeriesDB, seriesAccountState, seriesSender } from '$lib/server/series/web.js';
import { clientOf } from '$lib/server/cuentas/web.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/** @param {FormData} form @param {string} key */
const field = (form, key) => {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, 300) : '';
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ url, platform, locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const series = await seriesPage(url.searchParams.get('serie') ?? '', {
		tags: await siteTagManager(platform),
		platform
	});
	if (!series) error(404, 'Esa serie no existe.');
	return {
		series: {
			id: series.id,
			name: series.name,
			icon: series.icon,
			href: series.href,
			image: series.image ?? null,
			next: series.upcoming[0] ?? null
		},
		account: await seriesAccountState(platform, locals)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	suscribir: async (event) => {
		const { request, platform, locals, url, fetch } = event;
		const db = await requireSeriesDB(platform);
		const form = await request.formData();
		const series = await seriesPage(field(form, 'serie'), {
			tags: await siteTagManager(platform),
			platform
		});
		if (!series) return fail(400, { error: 'Esa serie no existe.' });
		const now = Date.now();
		// Las ediciones que ya están anunciadas no le llegan como "nuevas" a quien se suscribe ahora.
		await markEditionsSeen(
			db,
			series.upcoming.map((e) => ({ series: series.id, slug: e.slug })),
			now
		);
		const member = locals.member;
		const email = field(form, 'email');
		const r =
			member && field(form, 'cuenta') === '1'
				? await subscribeAccount({ db, seriesTag: series.id, accountId: member.id, now })
				: await subscribeEmail({
						db,
						seriesTag: series.id,
						seriesName: series.name,
						email,
						client: await clientOf(event),
						send: seriesSender(db, fetch),
						origin: siteOrigin(url),
						now
					});
		if (!r.ok) return fail(r.status, { error: r.message, email });
		return { ok: true, status: r.status, seriesName: series.name };
	},
	baja: async ({ request, platform, locals }) => {
		const db = await requireSeriesDB(platform);
		if (!locals.member) return fail(401, { error: 'Ingresá a tu cuenta para darte de baja.' });
		const form = await request.formData();
		const series = await seriesPage(field(form, 'serie'), {
			tags: await siteTagManager(platform),
			platform
		});
		if (!series) return fail(400, { error: 'Esa serie no existe.' });
		await unsubscribeAccount(db, locals.member.id, series.id);
		return { ok: true, status: 'removed', seriesName: series.name };
	}
};

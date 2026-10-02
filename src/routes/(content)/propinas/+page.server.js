/**
 * /propinas: la form action del bloque "Dejá una propina" de las publicaciones (docs/propinas.md).
 * Con el interruptor `propinas` apagado, 404. Sin JavaScript (o si algo falló), muestra el mismo
 * formulario con los errores.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { propinasEnabled } from '$lib/server/flags.js';
import { readTipForm, startTip } from '$lib/server/propinas/checkout.js';
import { findTipPost } from '$lib/server/propinas/posts.js';
import { getGateway, siteOrigin } from '$lib/server/tickets/index.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { tipPost } from '$lib/utils/propinas.js';

/** @param {App.Platform | undefined} platform */
async function requireOn(platform) {
	if (!(await propinasEnabled(platform))) error(404, 'Not found');
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, url, setHeaders }) {
	await requireOn(platform);
	setHeaders({ 'x-robots-tag': 'noindex' });
	// `?de=material/<slug>`: desde qué publicación (para el formulario sin JavaScript).
	const [category, slug] = (url.searchParams.get('de') ?? '').split('/');
	return { post: tipPost(category, slug) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async (event) => {
		const { platform, request, url, fetch } = event;
		await requireOn(platform);
		const db = getDB(platform);
		const values = readTipForm(await request.formData());
		if (!db) {
			return fail(503, { values, error: 'Las propinas no están disponibles ahora.', errors: {} });
		}
		// DEV ONLY: las pruebas E2E mandan todo desde la misma conexión (localhost).
		const relaxed = dev && env.TICKETS_DEV_RELAX_LIMITS === '1';
		const result = await startTip({
			db,
			gateway: await getGateway(fetch),
			values,
			client: relaxed ? `dev-${crypto.randomUUID()}` : await clientHash(clientAddress(event)),
			origin: siteOrigin(url),
			findPost: (category, slug) => findTipPost(category, slug, platform)
		});
		if (!result.ok) {
			return fail(result.status, { values, error: result.error, errors: result.errors });
		}
		redirect(303, result.checkoutUrl);
	}
};

/**
 * /propinas: la form action del bloque "Dejá una propina" de las publicaciones (docs/propinas.md).
 * Sin JavaScript (o si algo falló), muestra el mismo formulario con los errores.
 *
 * `?de=fondo` (con el interruptor `propinas_fondo`): el formulario para dejar una propina para el
 * Fondo Kinky Vibe sin publicación, al que lleva «Una vez» de fondo.kinkyvibe.ar. `&monto=<n>`
 * solo elige el monto de entrada si está dentro del mínimo y el máximo; el servidor vuelve a
 * validar el monto del POST (`validateTip`).
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { readTipForm, startTip } from '$lib/server/propinas/checkout.js';
import { findTipPost } from '$lib/server/propinas/posts.js';
import { getGateway, siteOrigin } from '$lib/server/tickets/index.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { propinasFondoEnabled } from '$lib/server/flags.js';
import { TIP_SOURCE_FONDO, presetFromQuery, tipPost } from '$lib/utils/propinas.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ url, setHeaders, platform }) {
	setHeaders({ 'x-robots-tag': 'noindex' });
	const de = url.searchParams.get('de') ?? '';
	const fondoEnabled = await propinasFondoEnabled(platform);
	// `?de=fondo`: desde fondo.kinkyvibe.ar (sin publicación).
	if (de === TIP_SOURCE_FONDO && fondoEnabled) {
		return {
			post: null,
			fondo: true,
			monto: presetFromQuery(url.searchParams.get('monto')),
			fondoEnabled
		};
	}
	// `?de=material/<slug>`: desde qué publicación (para el formulario sin JavaScript).
	const [category, slug] = de.split('/');
	return { post: tipPost(category, slug), fondo: false, monto: null, fondoEnabled };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async (event) => {
		const { platform, request, url, fetch } = event;
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
			findPost: (category, slug) => findTipPost(category, slug, platform),
			fondoEnabled: values.source === TIP_SOURCE_FONDO && (await propinasFondoEnabled(platform))
		});
		if (!result.ok) {
			return fail(result.status, { values, error: result.error, errors: result.errors });
		}
		redirect(303, result.checkoutUrl);
	}
};

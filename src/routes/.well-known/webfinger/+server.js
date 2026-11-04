/**
 * WebFinger (RFC 7033). Con el interruptor `fediverso` prendido, contesta por la agenda
 * (`acct:agenda@kinkyvibe.ar`, src/lib/utils/activitypub.js). Todo lo demás (y todo, apagado) va
 * a fed.brid.gy como siempre: es el puente de Bridgy Fed de @kinkyvibe.ar@kinkyvibe.ar (lo mismo
 * que hace ../[param] para el resto de /.well-known).
 */
import { redirect } from '@sveltejs/kit';
import { fediversoEnabled } from '$lib/server/flags.js';
import { apJson, webfingerFor } from '$lib/utils/activitypub.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, platform }) {
	const jrd = webfingerFor(url.searchParams.get('resource'));
	if (jrd && (await fediversoEnabled(platform))) {
		return apJson(jrd, { type: 'application/jrd+json; charset=utf-8' });
	}
	const bridgy = new URL(url);
	bridgy.protocol = 'https:';
	bridgy.hostname = 'fed.brid.gy';
	bridgy.port = '';
	redirect(303, bridgy);
}

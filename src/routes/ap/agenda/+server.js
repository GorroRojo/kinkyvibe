/** El actor de la agenda en el fediverso (prototipo, interruptor `fediverso`). Apagado, 404. */
import { error } from '@sveltejs/kit';
import { fediversoEnabled } from '$lib/server/flags.js';
import { actorDocument, apJson } from '$lib/utils/activitypub.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	if (!(await fediversoEnabled(platform))) error(404, 'Not found');
	return apJson(actorDocument());
}

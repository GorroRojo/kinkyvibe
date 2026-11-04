/**
 * El inbox de la agenda (prototipo, interruptor `fediverso`). ActivityPub pide que el actor tenga
 * uno, pero el prototipo **no procesa nada**: no lee el cuerpo, no guarda nada y no contesta
 * (un «Seguir» queda pendiente para siempre). 202 vacío prendido; apagado, 404.
 */
import { error } from '@sveltejs/kit';
import { fediversoEnabled } from '$lib/server/flags.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ platform }) {
	if (!(await fediversoEnabled(platform))) error(404, 'Not found');
	return new Response(null, { status: 202 });
}

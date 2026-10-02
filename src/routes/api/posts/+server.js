import { json } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';

// Dinámico (antes se prerenderizaba): con el interruptor `contenido_db` prendido los eventos salen
// de la base y pueden cambiar sin un deploy. Apagado, da lo mismo que el archivo de siempre.

/** @type {import("./$types").RequestHandler} */
export async function GET({ platform }) {
	return json(await sitePosts(platform), {
		headers: { 'Cache-Control': 'public, max-age=300' }
	});
}

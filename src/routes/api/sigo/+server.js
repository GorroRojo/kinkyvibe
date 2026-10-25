/**
 * GET /api/sigo?tipo=<etiqueta|perfil>&clave=<clave>: para el botón «Seguir»
 * ($lib/components/FollowButton.svelte) donde la página no lo trae con la carga (la de un evento
 * lo pide al cargar). Con `lo_que_sigo` apagado, o si no hay nada que seguir con esa clave, 404
 * (y el botón no se muestra).
 *
 * Responde `{ member: false }` sin sesión, o `{ member: true, kind, key, following }` con la
 * clave canónica (un alias de etiqueta se resuelve al nombre): followButtonState en
 * $lib/server/sigo/button.js. Solo dice si **esta** cuenta lo sigue: nunca quién más ni cuántes
 * (docs/lo-que-sigo.md). Privado y sin caché.
 */
import { error, json } from '@sveltejs/kit';
import { followButtonState } from '$lib/server/sigo/button.js';

const HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const state = await followButtonState(
		event,
		event.url.searchParams.get('tipo'),
		event.url.searchParams.get('clave')
	);
	if (!state) error(404, 'Not found');
	return json(state, { headers: HEADERS });
}

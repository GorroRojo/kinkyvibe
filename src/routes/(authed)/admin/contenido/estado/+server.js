import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { contentPullStatus } from '$lib/server/admin/contentPulls.js';
import { usesLocalRepo } from '$lib/server/eventos';

/**
 * `GET /admin/contenido/estado?pr=N` → `{ status, url }`: en qué quedó un PR de contenido (ver
 * $lib/server/admin/contentPulls.js). Lo consulta cada tanto el aviso de «Guardado» del editor
 * para decir si ya se publicó o si falló una prueba. Solo admins y solo PRs `contenido/*`.
 */
/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	if (usesLocalRepo()) throw error(404, 'Sin GitHub en este modo.');
	const number = Number(url.searchParams.get('pr'));
	if (!Number.isInteger(number) || number <= 0) throw error(400, 'PR inválido.');
	let pull;
	try {
		pull = await contentPullStatus(String(locals.user_token), number);
	} catch (e) {
		throw error(502, 'No pudimos consultar GitHub.');
	}
	if (!pull) throw error(404, 'Ese PR no es de contenido.');
	return json({ status: pull.status, url: pull.url });
}

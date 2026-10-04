/**
 * GET /api/sigo?tipo=<etiqueta|perfil>&clave=<clave>: para el botón «Seguir»
 * ($lib/components/FollowButton.svelte), que lo pide al cargar porque las páginas de etiquetas
 * pueden estar prerenderizadas. Con `lo_que_sigo` apagado, o si no hay nada que
 * seguir con esa clave, 404 (y el botón no se muestra).
 *
 * Responde `{ member: false }` sin sesión, o `{ member: true, kind, key, following }` con la
 * clave canónica (un alias de etiqueta se resuelve al nombre). Solo dice si **esta** cuenta lo
 * sigue: nunca quién más ni cuántes (docs/lo-que-sigo.md). Privado y sin caché.
 */
import { error, json } from '@sveltejs/kit';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { getFollow } from '$lib/server/sigo/follows.js';
import { resolveTag, resolveTarget } from '$lib/server/sigo/targets.js';
import { requireSigo } from '$lib/server/sigo/web.js';
import { parseTarget } from '$lib/utils/sigo.js';

const HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const db = await requireSigo(event.platform);
	const target = parseTarget(
		event.url.searchParams.get('tipo'),
		event.url.searchParams.get('clave')
	);
	if (!target) error(404, 'Not found');
	const member = event.locals.member;
	if (!member) {
		// Sin sesión no se resuelven perfiles (su visibilidad depende de quién mira): el botón
		// lleva a /ingresar, y al volver ya se mira con la cuenta.
		if (target.kind === 'etiqueta' && !resolveTag(await siteTagManager(event.platform), target.key))
			error(404, 'Not found');
		return json({ member: false }, { headers: HEADERS });
	}
	const tags = await siteTagManager(event.platform);
	const found = await resolveTarget({ db, tags, accountId: member.id }, target);
	if (!found) error(404, 'Not found');
	const row = await getFollow(db, member.id, found.target);
	return json(
		{ member: true, kind: found.target.kind, key: found.target.key, following: Boolean(row) },
		{ headers: HEADERS }
	);
}

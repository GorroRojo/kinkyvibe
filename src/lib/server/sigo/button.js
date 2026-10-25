/**
 * Lo que necesita el botón «Seguir» ($lib/components/FollowButton.svelte) para una etiqueta o un
 * perfil. Lo usan la carga de las páginas (/wiki/<etiqueta>, /amigues/<perfil>), así el botón
 * llega con la página, y GET /api/sigo (la página de un evento lo pide al cargar).
 */
import { getDB } from '$lib/server/db';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { getFollow } from './follows.js';
import { resolveTag, resolveTarget } from './targets.js';
import { sigoEnabled } from './web.js';
import { parseTarget } from '$lib/utils/sigo.js';

/**
 * @typedef {{ member: false } | { member: true, kind: string, key: string, following: boolean }}
 *   FollowButtonState
 */

/**
 * `null` (no se muestra el botón) con `lo_que_sigo` apagado o si no hay nada que seguir con esa
 * clave. Sin sesión, `{ member: false }`; con sesión, `{ member: true, kind, key, following }`
 * con la clave canónica (un alias de etiqueta se resuelve al nombre). Solo dice si **esta**
 * cuenta lo sigue: nunca quién más ni cuántes (docs/lo-que-sigo.md).
 *
 * @param {{ platform: App.Platform | undefined, locals: App.Locals }} event
 * @param {unknown} kind `etiqueta` o `perfil`
 * @param {unknown} key
 * @param {{ tags?: TagManager }} [loaded] el árbol de etiquetas, si quien llama ya lo leyó
 * @returns {Promise<FollowButtonState | null>}
 */
export async function followButtonState({ platform, locals }, kind, key, loaded = {}) {
	if (!(await sigoEnabled(platform))) return null;
	const target = parseTarget(kind, key);
	if (!target) return null;
	const tags = () => loaded.tags ?? siteTagManager(platform);
	const member = locals.member;
	if (!member) {
		// Sin sesión no se resuelven perfiles (su visibilidad depende de quién mira): el botón
		// lleva a /ingresar, y al volver ya se mira con la cuenta.
		if (target.kind === 'etiqueta' && !resolveTag(await tags(), target.key)) return null;
		return { member: false };
	}
	const db = /** @type {import('@cloudflare/workers-types').D1Database} */ (getDB(platform));
	// Un perfil se guarda con la clave tal cual (el id): si lo sigue se lee a la par.
	const [found, early] = await Promise.all([
		resolveTarget({ db, tags: await tags(), accountId: member.id }, target),
		target.kind === 'perfil' ? getFollow(db, member.id, target) : null
	]);
	if (!found) return null;
	const row = target.kind === 'perfil' ? early : await getFollow(db, member.id, found.target);
	return { member: true, kind: found.target.kind, key: found.target.key, following: Boolean(row) };
}

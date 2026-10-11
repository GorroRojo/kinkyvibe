/**
 * «Seguir» desde el bot (decisión 0034): la primera acción que escribe. Solo por **chat privado
 * vinculado a una cuenta** y con «Lo que sigo» prendido (lo decide router.js; acá no se mira el
 * tipo de chat). Usa el mismo camino que el botón «Seguir» del sitio
 * (`/mi-rincon/sigo?/seguir`): `resolveTag` para saber si la etiqueta existe y `follow` de
 * $lib/server/sigo/follows.js, con su tope de cambios por cuenta y de cosas seguidas.
 *
 * Desde el bot se siguen las **etiquetas y series de un evento** (las que tienen página en el
 * sitio). Perfiles y lugares, por ahora desde el sitio.
 *
 * Lo que sigue cada cuenta es privado (docs/lo-que-sigo.md): como en el sitio, no va al registro
 * de actividad del panel (que ven les admins); queda una línea en el log sin cuenta ni etiqueta.
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { follow, listFollows } from '$lib/server/sigo/follows.js';
import { describeFollows, resolveTag } from '$lib/server/sigo/targets.js';
import { DEFAULT_FOLLOW_OPTIONS } from '$lib/utils/sigo.js';
import { shortHash } from './nav.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ key: string, title: string, series: boolean, hash: string }} FollowTarget */
/**
 * @typedef {{
 *   accountFor: (chatId: number | string) => Promise<string | null>,
 *   targets: (slug: string) => Promise<FollowTarget[]>,
 *   following: (accountId: string, keys: string[]) => Promise<Set<string>>,
 *   follow: (accountId: string, key: string) =>
 *     Promise<'created' | 'already' | 'not_found' | 'full' | 'too_many'>,
 *   titles: (accountId: string) => Promise<string[]>
 * }} BotFollows
 */

/** Cuántas etiquetas de un evento se ofrecen, como mucho. */
export const FOLLOW_TARGETS_MAX = 5;

/**
 * Las etiquetas de un evento que se pueden seguir: las que existen en el árbol del sitio, por su
 * nombre canónico, primero las series y sin repetir. Pura (para los tests).
 *
 * @param {unknown} tags las del evento
 * @param {TagManager} manager
 * @returns {FollowTarget[]}
 */
export function followTargets(tags, manager) {
	/** @type {Map<string, FollowTarget>} */
	const out = new Map();
	for (const raw of Array.isArray(tags) ? tags : []) {
		const found = resolveTag(manager, String(raw));
		if (!found || out.has(found.target.key)) continue;
		out.set(found.target.key, {
			key: found.target.key,
			title: found.title,
			series: Boolean(found.series),
			hash: shortHash(found.target.key)
		});
	}
	return [...out.values()]
		.sort((a, b) => Number(b.series) - Number(a.series))
		.slice(0, FOLLOW_TARGETS_MAX);
}

/**
 * La cuenta vinculada a un chat (y no borrada), o `null`. Se mira en cada mensaje (0029).
 *
 * @param {D1Database} db
 * @param {number | string} chatId
 */
export async function chatAccount(db, chatId) {
	const row = await db
		.prepare(
			`SELECT c.account_id FROM telegram_chats c
			JOIN accounts a ON a.id = c.account_id AND a.deleted_at IS NULL
			WHERE c.chat_id = ?1`
		)
		.bind(String(chatId))
		.first();
	return row ? String(row.account_id) : null;
}

/**
 * Lo que el bot puede hacer con «Lo que sigo».
 *
 * @param {D1Database} db
 * @param {App.Platform | undefined} platform
 * @returns {BotFollows}
 */
export function botFollows(db, platform) {
	/** @type {Promise<TagManager> | null} */
	let tags = null;
	const manager = () => (tags ??= siteTagManager(platform));
	return {
		accountFor: (chatId) => chatAccount(db, chatId),
		targets: async (slug) => {
			const post = (await sitePosts(platform)).find(
				(p) => p.meta?.category === 'calendario' && String(p.meta.postID) === slug
			);
			return post ? followTargets(post.meta.tags, await manager()) : [];
		},
		following: async (accountId, keys) => {
			const rows = await listFollows(db, accountId);
			const want = new Set(keys);
			return new Set(
				rows.filter((r) => r.kind === 'etiqueta' && want.has(r.key)).map((r) => r.key)
			);
		},
		follow: async (accountId, key) => {
			const found = resolveTag(await manager(), key);
			if (!found) return 'not_found';
			const r = await follow(db, accountId, found.target, { options: DEFAULT_FOLLOW_OPTIONS });
			if (r.ok) {
				// Sin cuenta ni etiqueta: lo que sigue cada cuenta es privado.
				console.log(`[telegram] seguir desde el bot: ${r.created ? 'nuevo' : 'ya lo seguía'}`);
				return r.created ? 'created' : 'already';
			}
			return r.status === 429 ? 'too_many' : 'full';
		},
		titles: async (accountId) => {
			const views = await describeFollows(
				{ db, tags: await manager(), accountId },
				await listFollows(db, accountId)
			);
			return views.filter((v) => v.available).map((v) => v.title);
		}
	};
}

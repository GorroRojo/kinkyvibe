/**
 * La parte de «Lo que sigo» del cron de mails (POST /api/cron/recordatorios): con `lo_que_sigo`
 * o `cuentas` apagado no hace nada (`null`). Ver notify.js.
 */
import { fetchMarkdownPosts } from '$lib/utils';
import { siteTags } from '$lib/server/series/index.js';
import { seriesSender } from '$lib/server/series/web.js';
import { avisameViaSigo } from './avisame.js';
import { runFollowNotifications } from './notify.js';

/**
 * @param {{ db: import('@cloudflare/workers-types').D1Database, origin: string,
 *   fetch: typeof fetch, now?: number }} input
 */
export async function runSigoCron({ db, origin, fetch: fetchFn, now = Date.now() }) {
	if (!(await avisameViaSigo(db))) return null;
	return runFollowNotifications({
		db,
		posts: await fetchMarkdownPosts(),
		tags: siteTags(),
		origin,
		send: seriesSender(db, fetchFn),
		now
	});
}

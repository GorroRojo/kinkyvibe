/**
 * La parte de «Lo que sigo» del cron de mails (POST /api/cron/recordatorios): con `lo_que_sigo`
 * o `cuentas` apagado no hace nada (`null`). Ver notify.js.
 *
 * Los eventos salen de la capa compartida de contenido (`sitePosts`, interruptor `contenido_db`):
 * de la base o de los `.md`, solo lo listado y visible para cualquiera (nada oculto ni no
 * listado). notify.js se queda con los que todavía no empezaron.
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { siteTags } from '$lib/server/series/index.js';
import { seriesSender } from '$lib/server/series/web.js';
import { avisameViaSigo } from './avisame.js';
import { runFollowNotifications } from './notify.js';

/**
 * @param {{ db: import('@cloudflare/workers-types').D1Database,
 *   platform: App.Platform | undefined, origin: string, fetch: typeof fetch, now?: number,
 *   send?: import('./notify.js').FollowSend }} input `send`: para las pruebas (si no, Resend)
 */
export async function runSigoCron({
	db,
	platform,
	origin,
	fetch: fetchFn,
	now = Date.now(),
	send
}) {
	if (!(await avisameViaSigo(db))) return null;
	return runFollowNotifications({
		db,
		posts: await sitePosts(platform),
		tags: siteTags(),
		origin,
		send: send ?? seriesSender(db, fetchFn),
		now
	});
}

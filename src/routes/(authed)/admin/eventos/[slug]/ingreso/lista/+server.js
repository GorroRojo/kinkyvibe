/**
 * Lista de entradas del evento para validar sin conexión en el modo puerta (el celu la guarda en
 * localStorage). Solo admins. Lleva el hash del token (no el token) y los últimos 3 dígitos del
 * DNI (no el DNI): ver `offlineList` en $lib/server/tickets/door.js. De los avisos de puerta, solo
 * si la entrada coincide (`notice`), nunca el motivo (decisión 0053), y hasta cuándo puede quedar
 * esa marca en el celu (`noticeUntil`: unos días después del evento, `doorNoticeKeepUntil`).
 */
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { doorCounts, offlineList } from '$lib/server/tickets/door.js';
import { doorNoticeMatcher, isKinkyVibeDoor } from '$lib/server/tickets/doorNotices.js';
import { doorNoticeKeepUntil } from '$lib/utils/doorNotices.js';
import { overlayPartCheckins, partDoorCounts } from '$lib/server/tickets/partCheckins.js';
import { NO_STORE, cachedPrior, doorContext } from '../context.server.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	requireAdmin(event.locals, event.url);
	// En una parte de un taller (docs/talleres-partes.md): las entradas del taller con el ingreso
	// a esta parte.
	const { db, config, typeNames, ticketSlug: slug, part } = await doorContext(event);
	const [prior, notices] = await Promise.all([
		cachedPrior(db, slug, event.platform),
		doorNoticeMatcher(db, { kinkyVibe: isKinkyVibeDoor(config) })
	]);
	const [all, counts] = await Promise.all([
		offlineList(db, { slug, typeNames, prior, notices }),
		part ? partDoorCounts(db, slug, part.slug) : doorCounts(db, slug)
	]);
	const tickets = part
		? await overlayPartCheckins(db, part.slug, all, { id: 'ticketId', at: 'at', by: 'by' })
		: all;
	const now = Date.now();
	const noticeUntil = doorNoticeKeepUntil({ start: config.start, end: config.end, now });
	return json({ at: now, noticeUntil, tickets, counts }, { headers: NO_STORE });
}

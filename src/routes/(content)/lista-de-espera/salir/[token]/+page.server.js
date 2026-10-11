/**
 * Link para salir de la lista de espera (va en cada mail, firmado). GET muestra el botón; el POST
 * saca a la persona de la fila (la anotación queda `cancelled`; sin confirmar, se borra). Salir
 * tiene que andar siempre: no depende del interruptor (solo de la base).
 */
import { fail } from '@sveltejs/kit';
import { LIVE_STATUSES } from '$lib/server/tickets/waitlist.js';
import { checkWaitlistLinkToken } from '$lib/server/tickets/waitlistMail.js';
import { leaveByToken, waitlistEntryInfo } from '$lib/server/tickets/waitlistSignup.js';
import { PRIVATE_HEADERS, eventLabel, requireWaitlistDB } from '../../shared.server.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, setHeaders }) {
	setHeaders({ ...PRIVATE_HEADERS });
	const db = await requireWaitlistDB(platform, { flag: false });
	const id = await checkWaitlistLinkToken(db, 'leave', params.token);
	if (!id) return { valid: false, event: null, live: false };
	const info = await waitlistEntryInfo(db, id);
	return {
		valid: true,
		event: await eventLabel(info?.eventSlug),
		live: Boolean(info && /** @type {readonly string[]} */ (LIVE_STATUSES).includes(info.status))
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform }) => {
		const db = await requireWaitlistDB(platform, { flag: false });
		const r = await leaveByToken(db, params.token);
		if (!r.ok) return fail(400, { error: 'Este link no es válido. Revisá que esté completo.' });
		return { ok: true, left: r.left, event: await eventLabel(r.eventSlug) };
	}
};

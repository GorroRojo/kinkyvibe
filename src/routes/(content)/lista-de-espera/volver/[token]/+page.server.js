/**
 * «Volver a anotarme», el link del mail de «se venció tu lugar» (firmado). GET muestra el botón;
 * el POST vuelve a anotar a la persona al final de la fila, sin confirmar el mail de nuevo
 * (respuesta 4 de gorrite). Detrás del interruptor `lista_espera` (apagado, 404).
 */
import { fail } from '@sveltejs/kit';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { checkWaitlistLinkToken } from '$lib/server/tickets/waitlistMail.js';
import { rejoinByToken, waitlistEntryInfo } from '$lib/server/tickets/waitlistSignup.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';
import { PRIVATE_HEADERS, eventLabel, requireWaitlistDB } from '../../shared.server.js';

/** Qué dice la página si no se pudo. */
const ERRORS = Object.freeze({
	invalid: 'Este link no es válido. Revisá que esté completo.',
	closed: 'La lista de espera de este evento ya cerró.',
	gone: 'Con este link ya no se puede volver a anotar. Si querés, anotate desde la página de entradas del evento.'
});

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, setHeaders }) {
	setHeaders({ ...PRIVATE_HEADERS });
	const db = await requireWaitlistDB(platform);
	const id = await checkWaitlistLinkToken(db, 'rejoin', params.token);
	if (!id) return { valid: false, event: null };
	const info = await waitlistEntryInfo(db, id);
	return { valid: true, event: await eventLabel(info?.eventSlug) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform, fetch, url }) => {
		const db = await requireWaitlistDB(platform);
		const r = await rejoinByToken(db, params.token, { configOf: (slug) => getEventTickets(slug) });
		if (!r.ok) return fail(400, { error: ERRORS[r.reason] });
		// Si justo hay un lugar libre, que le llegue a quien le toque.
		if (r.status === 'waiting')
			queueWaitlistAdvance({
				platform,
				db,
				eventSlug: r.eventSlug,
				fetch,
				origin: siteOrigin(url)
			});
		return { ok: true, status: r.status, event: await eventLabel(r.eventSlug) };
	}
};

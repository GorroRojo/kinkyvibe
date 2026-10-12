/**
 * Link del mail para confirmar la lista de espera (doble confirmación). GET solo muestra el botón;
 * el POST confirma (ver MailLinkCard.svelte): los antivirus del correo abren los links solos.
 * Detrás del interruptor `lista_espera` (apagado, 404).
 */
import { fail } from '@sveltejs/kit';
import { confirmByToken } from '$lib/server/tickets/waitlistSignup.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';
import { PRIVATE_HEADERS, eventLabel, requireWaitlistDB } from '../../shared.server.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, setHeaders }) {
	setHeaders({ ...PRIVATE_HEADERS });
	await requireWaitlistDB(platform);
	return {};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform, fetch, url }) => {
		const db = await requireWaitlistDB(platform);
		const entry = await confirmByToken(db, params.token);
		// Entró a la fila: si hay lugar libre, se le ofrece; si confirmó después del cierre de la
		// lista, el motor la cierra (y le avisa).
		if (entry)
			queueWaitlistAdvance({
				platform,
				db,
				eventSlug: entry.eventSlug,
				fetch,
				origin: siteOrigin(url)
			});
		if (!entry)
			return fail(400, {
				error:
					'El link venció o ya se usó. Si querés, anotate de nuevo desde la página de entradas del evento.'
			});
		return { ok: true, event: await eventLabel(entry.eventSlug) };
	}
};

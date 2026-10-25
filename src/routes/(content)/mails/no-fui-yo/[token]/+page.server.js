/**
 * Link «No fui yo» del pie de los mails a una dirección sin confirmar (entradas gratis, reservas
 * por transferencia, confirmar la lista de espera o «Avisame si se repite»; ver
 * src/lib/server/email/suppressions.js y docs/mails.md). GET muestra el botón; el POST anota la
 * dirección y no le sale ningún mail más que no sea de una compra pagada. Solo hace falta la base.
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { checkOptOutToken, suppressByToken } from '$lib/server/email/suppressions.js';

/** @param {App.Platform | undefined} platform */
function requireDB(platform) {
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	return db;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, setHeaders }) {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex',
		// same-origin y no no-referrer: con no-referrer el POST del formulario sale con `Origin: null` y
		// SvelteKit lo rechaza («Cross-site POST form submissions are forbidden»). Afuera no se manda nada.
		'referrer-policy': 'same-origin'
	});
	const db = requireDB(platform);
	return { valid: Boolean(await checkOptOutToken(db, params.token)) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform }) => {
		const db = requireDB(platform);
		if (!(await suppressByToken(db, params.token)))
			return fail(400, { error: 'Este link no es válido.' });
		return { ok: true };
	}
};

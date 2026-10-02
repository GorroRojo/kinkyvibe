/**
 * Link de los mails de «Lo que sigo» para no recibir más (docs/lo-que-sigo.md). GET muestra el
 * botón; el POST apaga todos los mails de lo que sigue la cuenta (lo seguido y el calendario
 * quedan). Anda sin sesión y aunque los interruptores estén apagados: dejar de recibir mails
 * tiene que andar siempre (solo hace falta la base).
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { checkStopMailToken, stopMailWithToken } from '$lib/server/sigo/notify.js';

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
		'referrer-policy': 'no-referrer'
	});
	const db = requireDB(platform);
	return { valid: Boolean(await checkStopMailToken(db, params.token)) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform }) => {
		const db = requireDB(platform);
		if (!(await stopMailWithToken(db, params.token)))
			return fail(400, { error: 'Este link no es válido.' });
		return { ok: true };
	}
};

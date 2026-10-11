/**
 * La Mini App del calendario (`/telegram/app`, decisión 0034): sin login, solo lo público.
 * Ver $lib/server/telegram/miniapp.js y docs/telegram.md.
 */
import { miniAppData } from '$lib/server/telegram/miniapp.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, url, setHeaders }) {
	// Lo mismo para todes (sin cuenta): se puede guardar un rato, y no va a los buscadores.
	setHeaders({ 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' });
	return miniAppData(platform, url.origin);
}

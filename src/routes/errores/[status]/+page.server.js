import { error } from '@sveltejs/kit';

/**
 * Preview of the error page: /errores/404 renders exactly what a real 404 shows.
 * Harmless on purpose (no data, no side effects), so it can stay in production.
 * @type {import('./$types').PageServerLoad}
 */
export function load({ params }) {
	const status = Number(params.status);
	if (!Number.isInteger(status) || status < 400 || status > 599) {
		throw error(404, 'Ese código de error no existe.');
	}
	throw error(status);
}

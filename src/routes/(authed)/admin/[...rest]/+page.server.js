/**
 * Cualquier dirección de /admin que no es de ninguna página: 404 dentro del panel. Sin esta ruta,
 * SvelteKit usa la página de error del sitio (sin el menú ni la barra de arriba del panel), porque
 * cuando ninguna ruta coincide no llega a cargar el layout del panel. Las páginas que existen y
 * las "Próximamente" (`[...section=soon]`) ganan siempre: esta es la ruta de menor prioridad.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
	// Sin sesión, al login; sin permiso, 403 (como el resto del panel).
	requireAdmin(locals, url);
	error(404, 'Not Found');
}

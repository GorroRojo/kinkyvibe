/**
 * Contenido → En la base: «Descargar todo» (decisión 0004: lo resguardan los backups y este botón).
 * Los eventos y el material viven solo en la base (decisión 0032: ya no hay .md en el repo, ni nada
 * que importar). Solo admins.
 */
import { requireAdmin } from '$lib/server/auth';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	return {};
}

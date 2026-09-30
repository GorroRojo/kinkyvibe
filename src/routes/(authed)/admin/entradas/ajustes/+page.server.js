/**
 * Ajustes de venta se mudaron a /admin/ajustes/cobros (y /fondo, /mails). La dirección vieja
 * sigue andando: links guardados y el aviso de transferencia del editor de entradas.
 */
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export function load() {
	redirect(308, '/admin/ajustes/cobros');
}

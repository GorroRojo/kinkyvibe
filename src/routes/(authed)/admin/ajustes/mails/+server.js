/**
 * `/admin/ajustes/mails` ya no es una página: la configuración de los mails (remitente, pie,
 * recordatorios, envíos en tandas) se mudó a Mensajes › Configuración
 * (`/admin/mensajes/configuracion`), así todo lo de mails queda en Mensajes (gorrite, 11/10).
 * Redirige (308, para siempre y con el mismo método) para que los favoritos y links viejos sigan
 * andando, con lo que viniera después del `?`. Es una excepción a la regla «sin redirecciones»
 * del mapa del panel, aprobada por gorrite (docs/panel.md).
 */
import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';

const NEW_PATH = '/admin/mensajes/configuracion';

/** @type {import('./$types').RequestHandler} */
export function GET({ locals, url }) {
	requireAdmin(locals, url);
	redirect(308, `${NEW_PATH}${url.search}`);
}

// Un formulario abierto antes de la mudanza (?/save) sigue guardando: 308 conserva el POST.
export const POST = GET;

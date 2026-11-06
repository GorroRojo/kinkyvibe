/**
 * `/admin/ajustes/propinas` se mudó a Estadísticas › Propinas (`/admin/estadisticas/propinas`):
 * las propinas que entraron son estadísticas; lo que se cambia (cotización, ajuste y retiros de
 * PayPal) quedó en Ajustes › PayPal. Redirige (308) para que los favoritos y links viejos sigan
 * andando, con lo que viniera después del `?`. Excepción a la regla «sin redirecciones» del mapa
 * del panel, pedida por gorrite (docs/panel.md).
 */
import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';

const NEW_PATH = '/admin/estadisticas/propinas';

/** @type {import('./$types').RequestHandler} */
export function GET({ locals, url }) {
	requireAdmin(locals, url);
	redirect(308, `${NEW_PATH}${url.search}`);
}

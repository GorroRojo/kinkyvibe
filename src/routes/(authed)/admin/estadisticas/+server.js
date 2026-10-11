/**
 * `/admin/estadisticas` ya no es una página: Estadísticas tiene tres pestañas (Ventas, Asistencia
 * y Visitas al sitio, ver `$lib/admin/nav.js`). Redirige (307) a Ventas para que los favoritos
 * viejos sigan andando, con el mismo `?periodo=` si venía. Es una excepción a la regla «sin
 * redirecciones» del mapa del panel, aprobada por gorrite (11/10; docs/panel.md).
 */
import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';

/** @type {import('./$types').RequestHandler} */
export function GET({ locals, url }) {
	requireAdmin(locals, url);
	redirect(307, `/admin/estadisticas/ventas${url.search}`);
}

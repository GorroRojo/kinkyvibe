import { soonItemAt } from '$lib/admin/nav.js';

/**
 * URLs reservadas de las secciones "Próximamente" del panel (`soon: true` en
 * `$lib/admin/nav.js`), sin el `/admin/` del principio. Las páginas que existen ganan siempre:
 * esta ruta es la de menor prioridad.
 * @type {import('@sveltejs/kit').ParamMatcher}
 */
export function match(param) {
	return Boolean(soonItemAt(`/admin/${param}`));
}

import { SOON_HREFS } from '$lib/admin/soonSections.js';

/**
 * URLs reservadas de las secciones "Próximamente" del panel (`soon: true` en
 * `$lib/admin/nav.js`), sin el `/admin/` del principio. Las páginas que existen ganan siempre:
 * esta ruta es la de menor prioridad. Usa la lista sin íconos de `$lib/admin/soonSections.js`: los
 * matchers van en el JavaScript de todas las páginas del sitio.
 * @type {import('@sveltejs/kit').ParamMatcher}
 */
export function match(param) {
	return SOON_HREFS.includes(`/admin/${param}`.replace(/\/+$/, ''));
}

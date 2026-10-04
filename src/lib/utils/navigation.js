/**
 * Helpers puros de la navegación del sitio público: la sección activa del menú y las migas de pan
 * (las visibles y su versión en datos estructurados).
 */

/**
 * ¿La ruta `pathname` está dentro de la sección `href`? Compara por segmentos: `/calendario` y
 * `/calendario/…` sí, `/mi-rincon/calendario` o `/calendarios` no. Los links externos
 * (`https://…`) nunca están activos.
 *
 * @param {string} pathname ruta actual (`$page.url.pathname`)
 * @param {string} href link de la sección (`/calendario`)
 */
export function isSectionActive(pathname, href) {
	if (!href || !href.startsWith('/') || href.startsWith('//')) return false;
	const section = href.length > 1 ? href.replace(/\/+$/, '') : href;
	if (section === '/') return pathname === '/';
	return pathname === section || pathname.startsWith(section + '/');
}

/**
 * La miga de pan de la sección de una publicación: lo que muestra el sitio y adónde lleva.
 *
 * @param {string | undefined | null} category `amigues`, `calendario`, `material`, `wiki`…
 * @returns {{ name: string, path: string } | null}
 */
export function sectionCrumb(category) {
	if (!category) return null;
	return { name: category == 'wiki' ? 'Kinkipedia' : category, path: '/' + category };
}

/**
 * `BreadcrumbList` de schema.org para las migas visibles (Inicio › sección), con URLs absolutas.
 *
 * @param {string | undefined | null} category
 * @param {string} origin origen del sitio (`$page.url.origin`)
 * @returns {(import('schema-dts').BreadcrumbList & { '@context': string }) | null}
 */
export function breadcrumbLd(category, origin) {
	const crumb = sectionCrumb(category);
	if (!crumb) return null;
	const base = origin.replace(/\/+$/, '');
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'Inicio', item: base + '/' },
			{ '@type': 'ListItem', position: 2, name: crumb.name, item: base + crumb.path }
		]
	};
}

/**
 * ¿La página tiene su propio link para volver y no lleva las migas de pan? La compra de entradas
 * (/calendario/<evento>/entradas) muestra un solo «← Volver al evento»: con las migas eran tres
 * links para irse.
 *
 * @param {string} pathname
 */
export function ownBackLink(pathname) {
	return /^\/calendario\/[^/]+\/entradas\/?$/.test(pathname);
}

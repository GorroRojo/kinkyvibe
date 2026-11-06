/**
 * La tarjeta «Visitas» de las fichas del panel (docs/analiticas.md, «Visitas de una página»): las
 * direcciones públicas de un objeto y sus visitas (`loadPageVisits`). La ficha la pide sin esperar
 * (la devuelve como promesa en el `load`, SvelteKit la manda cuando llega), así nunca demora la
 * página. Nunca rechaza.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { findDbPostObject } from '$lib/server/contenido/repo.js';
import { loadPageVisits, pagePaths } from '$lib/server/analytics/page.js';
import { analyticsConfig } from '$lib/server/analytics/sql.js';

/** Las variables para leer Analytics Engine (las mismas de Estadísticas › Visitas). */
export function analyticsEnv() {
	return { CF_ACCOUNT_ID: env.CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN: env.CF_ANALYTICS_TOKEN };
}

/**
 * Las direcciones de un evento o un material: la de la página (la vieja del .md importado si
 * tiene, si no la del objeto), la del objeto y la del panel. Sin base o si falla, solo la del panel.
 *
 * @param {App.Platform | undefined} platform
 * @param {'calendario' | 'material'} category
 * @param {string} slug
 * @returns {Promise<string[]>}
 */
export async function postSlugs(platform, category, slug) {
	const db = getDB(platform);
	if (!db) return [slug];
	try {
		const found = await findDbPostObject(db, category, slug);
		return found ? [found.urlSlug, found.object.slug, slug] : [slug];
	} catch (error) {
		console.warn('[analiticas] direcciones de la página', error);
		return [slug];
	}
}

/**
 * Las visitas de la página de un objeto, para su ficha. Nunca rechaza.
 *
 * @param {App.Platform | undefined} platform
 * @param {{ kind: 'evento' | 'material' | 'perfil' | 'wiki', slugs?: string[], slug?: string,
 *   tickets?: boolean }} o `slugs`: las direcciones ya conocidas (perfil, Kinkipedia); `slug`: la
 *   del panel, para buscar las demás en la base (evento, material).
 * @returns {Promise<import('$lib/server/analytics/page.js').PageVisits>}
 */
export async function objectPageVisits(platform, { kind, slugs, slug, tickets = false }) {
	const vars = analyticsEnv();
	let all = slugs ?? (slug ? [slug] : []);
	// Sin configuración no hace falta buscar las otras direcciones (la tarjeta dice qué falta).
	if (!slugs && slug && analyticsConfig(vars).ok) {
		all = await postSlugs(platform, kind === 'evento' ? 'calendario' : 'material', slug);
	}
	return loadPageVisits({
		env: vars,
		paths: pagePaths(kind, all),
		tickets,
		// El fetch global (no el de SvelteKit): la API de Cloudflare es externa.
		fetch: globalThis.fetch
	});
}

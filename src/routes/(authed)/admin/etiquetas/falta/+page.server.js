import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { missingLinks } from '$lib/server/contenido/enlacesFalta.js';
import { contentEditLink } from '$lib/admin/nav.js';

/**
 * Etiquetas › «Enlaces que faltan» (plan `enlaces-falta`, docs/enlaces.md): los `[[…]]`, `@` y `#`
 * de los cuerpos que no llevan a nada, con cuántas veces se escriben y dónde. Solo admins (nombra
 * objetos ocultos). Se calcula al abrir la página (src/lib/server/contenido/enlacesFalta.js).
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'Sin base de datos.');
	const started = Date.now();
	const found = await missingLinks(db);
	const ms = Date.now() - started;
	if (ms > 2000) console.warn(`[enlaces que faltan] ${found.scanned} cuerpos en ${ms} ms`);
	return {
		...found,
		ms,
		items: found.items.map((item) => ({
			...item,
			sources: item.sources.map((s) => ({
				...s,
				editHref: s.path ? contentEditLink(s.path) : null
			}))
		}))
	};
}

import { publicSearchIndex } from '$lib/server/search/publicIndex.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: the tags, events and material come from the database (docs/etiquetas.md,
// docs/contenido.md), and so do the amigues profiles; the database can't be read at build time.
// What goes in the index is decided in $lib/server/search/siteIndex.js (pure, with tests); it is
// built and remembered in $lib/server/search/publicIndex.js (shared with the Telegram bot's inline
// mode, docs/telegram.md).
export const prerender = false;

/**
 * Índice para la búsqueda global (ver $lib/utils/search.js y SearchPalette.svelte).
 * Sólo lo que alcanza cualquiera navegando el sitio (sin cuenta): el índice es el mismo para todes.
 * @type {import("./$types").RequestHandler}
 */
export async function GET({ platform }) {
	const { json } = await publicSearchIndex(platform);
	return new Response(json, {
		headers: { 'content-type': 'application/json', ...TAGGED_CACHE }
	});
}

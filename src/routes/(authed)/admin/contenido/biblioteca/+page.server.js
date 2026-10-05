/**
 * Contenido › Biblioteca: todo lo de la biblioteca (imágenes, documentos y videos) con dónde se usa
 * cada cosa, para buscar, subir y sacar (docs/imagenes.md). Buscar y «Cargar más» van por
 * `/imagenes` (la misma búsqueda que los selectores); subir, por POST `/imagenes`; sacar, por
 * DELETE `/imagenes/<id>` (borrado suave). Deshacer es la acción `recuperar` de acá.
 *
 * Solo admins (como todo el panel).
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { LIBRARY_PAGE, browseLibrary, restoreLibraryItem } from '$lib/server/media/library.js';
import { libraryKind } from '$lib/utils/libraryFiles.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	// Los loads corren en paralelo con el del layout: se controla acá también.
	const user = requireAdmin(locals, url);
	const q = (url.searchParams.get('q') ?? '').slice(0, 200);
	const kind = libraryKind(url.searchParams.get('tipo')) ?? 'todo';
	const db = getDB(platform);
	if (!db) {
		return { q, kind, items: [], more: false, error: 'Todavía no hay base en este sitio.' };
	}
	try {
		const { items, more } = await browseLibrary(db, {
			q,
			kind,
			viewer: { role: 'admin', id: user.login },
			limit: LIBRARY_PAGE
		});
		return { q, kind, items, more, error: '' };
	} catch (e) {
		console.log('biblioteca: no se pudo leer', e);
		return { q, kind, items: [], more: false, error: 'No pudimos leer la biblioteca.' };
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	/** «Deshacer» después de sacar algo: vuelve a la biblioteca. */
	recuperar: async ({ locals, url, platform, request }) => {
		const user = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Todavía no hay base en este sitio.' });
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id <= 0) return fail(400, { error: 'Falta qué recuperar.' });
		const done = await restoreLibraryItem(db, id, { actor: user.login });
		if (!done) return fail(404, { error: 'Ya no está borrado (o no existe).' });
		return { restored: id };
	}
};

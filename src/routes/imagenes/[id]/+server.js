/**
 * DELETE /imagenes/<id>: sacar una imagen de la biblioteca. Es el borrado suave del objeto
 * `imagen`: deja de aparecer y `/media/…` deja de servirla, pero el archivo queda en R2
 * (docs/imagenes.md). Solo desde el mismo sitio (Origin), porque no es un formulario.
 *
 * - Admins: cualquier imagen o archivo (como siempre, aunque se use), con su fila en
 *   `panel_deletions` para «Recuperar» en Actividad (`deleteLibraryItem`).
 * - Una cuenta que gestiona un perfil: solo una imagen que subió ella y que nada usa
 *   (`deleteOwnImage`); si se usa, 409 con dónde. La de otra persona: 404 (como si no existiera).
 * - Nadie más: 404.
 */
import { error, json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { imageAccess } from '$lib/server/media/access.js';
import { deleteOwnImage } from '$lib/server/media/library.js';
import { deleteLibraryItem } from '$lib/server/admin/deletions.js';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, platform, params, request, url }) {
	const db = getDB(platform);
	const access = await imageAccess(locals, db);
	if (!access || !db) error(404, 'No existe.');
	if (request.headers.get('origin') !== url.origin) error(403, 'Pedido de otro sitio.');
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id <= 0) error(404, 'No existe.');
	if (access.role !== 'admin') {
		const res = await deleteOwnImage(db, id, { actor: access.actor, viewer: access.viewer });
		if (!res.ok) {
			if (res.status === 404) error(404, 'No existe.');
			return json({ error: res.error, usedIn: res.usedIn ?? [] }, { status: res.status });
		}
		return json({ deleted: true });
	}
	// Con su fila para «Recuperar» en Actividad (y anotado en Actividad).
	const { deleted, deletion } = await deleteLibraryItem(db, { login: access.actor, locals }, id);
	if (!deleted) error(404, 'No existe.');
	return json({ deleted: true, deletion });
}

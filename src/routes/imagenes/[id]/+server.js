/**
 * DELETE /imagenes/<id>: sacar una imagen de la biblioteca (solo admins). Es el borrado suave del
 * objeto `imagen`: deja de aparecer y `/media/…` deja de servirla, pero el archivo queda en R2
 * (docs/imagenes.md). Solo desde el mismo sitio (Origin), porque no es un formulario.
 */
import { error, json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { imageAccess } from '$lib/server/media/access.js';
import { deleteImage } from '$lib/server/media/library.js';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, platform, params, request, url }) {
	const db = getDB(platform);
	const access = await imageAccess(locals, db);
	if (!access || !db || access.role !== 'admin') error(404, 'No existe.');
	if (request.headers.get('origin') !== url.origin) error(403, 'Pedido de otro sitio.');
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id <= 0) error(404, 'No existe.');
	const done = await deleteImage(db, id, { actor: access.actor });
	if (!done) error(404, 'No existe.');
	return json({ deleted: true });
}

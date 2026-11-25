/**
 * La foto de una respuesta («Foto», docs/formularios.md) para la página de respuestas del panel:
 * `…/respuestas/fotos/<sha-256>.<ext>`, desde R2 (`formularios/<formulario>/…`). Solo admins (las
 * rutas `+server.js` no pasan por el layout: lo chequea `requireFormsAdmin`), privada y sin caché.
 * Una foto de otro formulario o que no existe: 404.
 */
import { error } from '@sveltejs/kit';
import { formOr404, requireFormsAdmin } from '$lib/server/formularios/admin.js';
import { photoResponse } from '$lib/server/formularios/photos.js';
import { photoKey } from '$lib/utils/formularios.js';

const FILE = /^([0-9a-f]{64})\.(jpg|png|webp|gif|avif)$/;

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const { db } = await requireFormsAdmin(event);
	const form = await formOr404(db, event.params.id);
	const m = FILE.exec(event.params.file);
	if (!m) error(404, 'No existe.');
	const res = await photoResponse(event.platform?.env?.MEDIA, photoKey(form.id, m[1], m[2]));
	if (!res) error(404, 'No existe.');
	return res;
}

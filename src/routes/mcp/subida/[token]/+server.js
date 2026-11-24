/**
 * El PUT de una subida grande del conector de Claude (docs/conector-claude.md, «Subir a la
 * biblioteca»): `pedir_subida` da esta dirección firmada (vale 15 minutos, para une admin y un
 * tipo), quien sube manda los bytes en el cuerpo (y, de una imagen, sus copias chicas con
 * `?parte=360` y `?parte=720`) y `confirmar_subida` los guarda en la biblioteca. Acá solo se
 * reciben: se miran la firma, el tipo real y el peso, y quedan esperando en R2
 * ($lib/server/mcp/biblioteca.js, `receiveUploadPart`).
 *
 * Sin el conector o sin los cambios prendidos, 404. El cuerpo va como `application/octet-stream`
 * (con un tipo de formulario, el chequeo CSRF de SvelteKit lo frena).
 */
import { error } from '@sveltejs/kit';
import { readBytesCapped } from '$lib/server/http/body.js';
import { connectorDB, noStoreJson } from '$lib/server/mcp/http.js';
import { editingOn } from '$lib/server/mcp/cambios.js';
import { receiveUploadPart } from '$lib/server/mcp/biblioteca.js';

/** @type {import('./$types').RequestHandler} */
export async function PUT({ params, platform, request, url }) {
	const db = await connectorDB(platform);
	if (!(await editingOn(db))) error(404, 'No encontrado');
	const r = await receiveUploadPart(db, platform?.env?.MEDIA, {
		token: params.token,
		part: url.searchParams.get('parte'),
		bytes: (max) => readBytesCapped(request, max)
	});
	return noStoreJson(r.body, r.status);
}

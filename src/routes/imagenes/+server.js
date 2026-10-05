/**
 * La biblioteca de imágenes para el selector de imágenes de los editores (docs/imagenes.md):
 *
 * - GET `?q=<texto>`: buscar por nombre o texto alternativo (sin texto, las más nuevas);
 *   `?para=<tipo>:<dirección>`: las imágenes «De este evento» (del objeto y de sus series).
 * - POST (multipart: `file`, `alt`, `name`, `width`, `height`): subir una imagen. El navegador
 *   ya la achicó y la pasó a WEBP; acá se revisan el peso, el tipo real (por los bytes) y el texto
 *   alternativo. Va a R2 y a la base al momento (sin commit ni deploy).
 *
 * Solo admins y cuentas que gestionan un perfil (src/lib/server/media/access.js); el resto, 404
 * (como si no existiera). Una cuenta del público busca solo entre lo que subió (con dónde se usa
 * cada una, para saber si la puede borrar: /imagenes/<id>) y pide «De este…» solo para un perfil
 * que gestiona.
 */
import { error, json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { imageAccess } from '$lib/server/media/access.js';
import {
	ALT_REQUIRED,
	ImageError,
	contextImages,
	imageUsage,
	imageUses,
	searchImages,
	storeImage
} from '$lib/server/media/library.js';
import { parseTarget, targetObjectId } from '$lib/server/media/targets.js';
import { getManagedProfile } from '$lib/server/cuentas/perfiles.js';
import { seriesTagIds } from '$lib/utils/series.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';

const NO_STORE = { 'cache-control': 'private, no-store' };

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, platform, url }) {
	const db = getDB(platform);
	const access = await imageAccess(locals, db);
	if (!access || !db) error(404, 'No existe.');
	const para = url.searchParams.get('para');
	if (para !== null) {
		const target = parseTarget(para);
		if (!target) return json({ images: [] }, { headers: NO_STORE });
		if (access.role === 'member') {
			const managed =
				target.type === 'perfil' && access.accountId
					? await getManagedProfile(db, access.accountId, target.slug)
					: null;
			if (!managed) return json({ images: [] }, { headers: NO_STORE });
		}
		const id = await targetObjectId(db, target);
		const images = id
			? await contextImages(db, id, access.viewer, {
					seriesKeys: seriesTagIds(currentSiteTags())
				})
			: [];
		return json({ images }, { headers: NO_STORE });
	}
	const found = await searchImages(db, {
		q: url.searchParams.get('q') ?? '',
		viewer: access.viewer,
		createdBy: access.createdBy
	});
	// Les admins ven dónde se usa cada una (así una portada de otro material no parece del evento).
	// Una cuenta del público ve todo lo que usa cada imagen suya (lo que no ve, como «otra
	// publicación»): sin usos, la puede borrar.
	const ids = found.map((i) => i.id);
	const uses =
		access.role === 'admin'
			? await imageUses(db, ids, access.viewer)
			: await imageUsage(db, ids, access.viewer);
	const images = found.map((i) => ({ ...i, usedIn: uses.get(i.id) ?? [] }));
	return json({ images }, { headers: NO_STORE });
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, platform, request }) {
	const db = getDB(platform);
	const access = await imageAccess(locals, db);
	if (!access || !db) error(404, 'No existe.');
	let form;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'No llegó la imagen. Probá de nuevo.' }, { status: 400 });
	}
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'No llegó ningún archivo. Volvé a elegir la imagen.' }, { status: 400 });
	}
	const alt = String(form.get('alt') ?? '').trim();
	if (!alt) return json({ error: ALT_REQUIRED }, { status: 400 });
	try {
		const { image, created } = await storeImage(
			db,
			platform?.env?.MEDIA,
			{
				bytes: new Uint8Array(await file.arrayBuffer()),
				name: String(form.get('name') ?? file.name ?? ''),
				alt,
				width: Number(form.get('width')),
				height: Number(form.get('height'))
			},
			{ actor: access.actor }
		);
		return json({ image, created }, { status: created ? 201 : 200, headers: NO_STORE });
	} catch (e) {
		if (e instanceof ImageError) return json({ error: e.message }, { status: e.status });
		console.log('imagenes: no se pudo guardar', e);
		return json({ error: 'No se pudo guardar la imagen. Probá de nuevo.' }, { status: 502 });
	}
}

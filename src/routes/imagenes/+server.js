/**
 * La biblioteca (docs/imagenes.md), para el selector de imágenes de los editores y para enlazar
 * documentos y videos en el material:
 *
 * - GET `?q=<texto>`: buscar imágenes por nombre o texto alternativo (sin texto, las más nuevas);
 *   `?para=<tipo>:<dirección>`: las imágenes «De este evento» (del objeto y de sus series).
 *   Con `&tipo=todo|imagen|documento|video` (solo admins): toda la biblioteca, con filtro por
 *   tipo (cada cosa con `kind`, `typeLabel` y dónde se usa); con `&desde=<n>`, la página
 *   siguiente de Contenido › Biblioteca ({@link LIBRARY_PAGE}), con `more` si hay más.
 * - POST (multipart: `file`, `alt`, `name`, `width`, `height`): subir. El tipo sale de los bytes:
 *   - una imagen (el navegador ya la achicó y la pasó a WEBP): pide texto alternativo;
 *   - un documento o un video (PDF, MP4, WebM, ODT, ODS, ODP): solo admins, pide `name` y pesa
 *     hasta 25 MB ({@link MAX_FILE_BYTES}). Responde `{ file }` en vez de `{ image }`.
 *   Va a R2 y a la base al momento (sin commit ni deploy).
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
	MAX_FILE_BYTES,
	contextImages,
	imageUsage,
	LIBRARY_PAGE,
	browseLibrary,
	imageUses,
	searchImages,
	storeFile,
	storeImage
} from '$lib/server/media/library.js';
import { sniffDocument, sniffImage } from '$lib/server/media/sniff.js';
import { fileSizeProblem, libraryKind } from '$lib/utils/libraryFiles.js';
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
	const kind = libraryKind(url.searchParams.get('tipo'));
	if (kind && access.role === 'admin') {
		// `desde`: «Cargar más» de Contenido › Biblioteca (las que ya se mostraron).
		const desde = Number(url.searchParams.get('desde') ?? 0);
		const { items, more } = await browseLibrary(db, {
			q: url.searchParams.get('q') ?? '',
			kind,
			viewer: access.viewer,
			limit: url.searchParams.has('desde') ? LIBRARY_PAGE : 24,
			offset: Number.isSafeInteger(desde) && desde > 0 ? desde : 0
		});
		return json({ images: items, more }, { headers: NO_STORE });
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
	// Lo que no puede entrar ni como documento, ni se lee: se avisa antes de leer el cuerpo
	// (Cloudflare corta antes, en 100 MB, con un error sin explicación).
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + 64 * 1024) {
		return json({ error: fileSizeProblem(declared) }, { status: 413 });
	}
	let form;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'No llegó el archivo. Probá de nuevo.' }, { status: 400 });
	}
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'No llegó ningún archivo. Volvé a elegirlo.' }, { status: 400 });
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const name = String(form.get('name') ?? file.name ?? '');
	if (sniffDocument(bytes)) {
		// Documentos y videos: solo admins. Una cuenta del público sube solo imágenes.
		if (access.role !== 'admin') {
			return json(
				{ error: 'Acá podés subir solo imágenes (JPG, PNG, WEBP, GIF o AVIF).' },
				{ status: 415 }
			);
		}
		try {
			const { file: saved, created } = await storeFile(
				db,
				platform?.env?.MEDIA,
				{ bytes, title: String(form.get('name') ?? ''), name: file.name },
				{ actor: access.actor }
			);
			return json({ file: saved, created }, { status: created ? 201 : 200, headers: NO_STORE });
		} catch (e) {
			if (e instanceof ImageError) return json({ error: e.message }, { status: e.status });
			console.log('imagenes: no se pudo guardar el archivo', e);
			return json({ error: 'No se pudo guardar el archivo. Probá de nuevo.' }, { status: 502 });
		}
	}
	if (!sniffImage(bytes)) {
		return json(
			{
				error:
					access.role === 'admin'
						? 'El archivo no es una imagen (JPG, PNG, WEBP, GIF o AVIF), ni un PDF, un video MP4 o WebM, ni un documento ODT, ODS u ODP.'
						: 'El archivo no es una imagen JPG, PNG, WEBP, GIF o AVIF.'
			},
			{ status: 415 }
		);
	}
	const alt = String(form.get('alt') ?? '').trim();
	if (!alt) return json({ error: ALT_REQUIRED }, { status: 400 });
	try {
		const { image, created } = await storeImage(
			db,
			platform?.env?.MEDIA,
			{
				bytes,
				name,
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

/**
 * Importación (una vez) de las imágenes que todavía están en el repo a la biblioteca de imágenes
 * (docs/imagenes.md): cada archivo de `src/lib/posts/<categoría>/media/**` y de `src/lib/assets`
 * va a R2 y a un objeto `imagen`, y cada evento, material o serie que lo usa por su campo viejo
 * (`featured` o `image`) recibe su edge (`portada` o `imagen`). Lo que ya tiene edge no se toca.
 *
 * Idempotente: el mismo archivo es la misma imagen (clave por contenido), así que correrla de nuevo
 * no duplica nada. Con `dryRun` no escribe nada: solo dice qué haría.
 *
 * La usa scripts/import-images.js (local o preview; nunca producción desde un PR). Solo imports
 * relativos: corre en Node sin Vite.
 */
import { IMAGE_TYPE, IMAGE_USES, linkImage, storeImage } from './library.js';
import { sha256Hex, sniffImage } from './sniff.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/** Las carpetas del repo que se importan (para el script y para resolver los campos viejos). */
export const POSTS_MEDIA = 'src/lib/posts';
export const ASSETS_DIR = 'src/lib/assets';

const IMAGE_EXTS = ['jpeg', 'jfif', 'jpg', 'png', 'webp', 'gif', 'avif'];
/** El orden en que el sitio busca la imagen numerada de un post (thumbURL). */
const NUMBERED_EXTS = ['jpeg', 'jfif', 'jpg', 'png', 'webp'];

/** ¿Es un archivo de imagen de las carpetas que se importan? @param {string} path */
export function isImportablePath(path) {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	if (!IMAGE_EXTS.includes(ext)) return false;
	return (
		/^src\/lib\/posts\/[a-z]+\/media\/[^/]+\/[^/]+$/.test(path) ||
		new RegExp(`^${ASSETS_DIR}/[^/]+$`).test(path)
	);
}

/**
 * La ruta del repo a la que apunta el `featured` de un evento o material: un número es un archivo
 * de la carpeta del post (con cualquiera de las extensiones de siempre); un nombre, un archivo de
 * src/lib/assets.
 *
 * @param {string} category 'calendario' | 'material'
 * @param {string} folder la carpeta del post (su dirección vieja)
 * @param {unknown} featured
 * @param {Set<string>} paths las rutas que existen
 * @returns {string | null}
 */
export function featuredPath(category, folder, featured, paths) {
	const f = String(featured ?? '').trim();
	if (!f) return null;
	if (/^\d+$/.test(f)) {
		for (const ext of NUMBERED_EXTS) {
			const p = `${POSTS_MEDIA}/${category}/media/${folder}/${f}.${ext}`;
			if (paths.has(p)) return p;
		}
		return null;
	}
	if (f.includes('/') || f.includes('..')) return null;
	const p = `${ASSETS_DIR}/${f}`;
	return paths.has(p) ? p : null;
}

/**
 * La ruta del repo de la imagen vieja de una serie (`image` de su etiqueta): un archivo de
 * src/lib/assets o `calendario:<evento>/<archivo>`.
 *
 * @param {unknown} image
 * @param {Set<string>} paths
 */
export function seriesImagePath(image, paths) {
	const v = String(image ?? '').trim();
	if (!v || v.includes('..')) return null;
	const m = /^calendario:([A-Za-z0-9][\w-]*)\/([\w.-]+)$/.exec(v);
	const p = m ? `${POSTS_MEDIA}/calendario/media/${m[1]}/${m[2]}` : `${ASSETS_DIR}/${v}`;
	return !v.includes('/') || m ? (paths.has(p) ? p : null) : null;
}

/**
 * @typedef {{ path: string, bytes: Uint8Array }} RepoFile
 * @typedef {{ type: string, id: number, slug: string, kind: string, path: string, title: string }} PlannedLink
 * @typedef {{
 *   files: number, skipped: string[], newImages: number, knownImages: number,
 *   links: PlannedLink[], missing: Array<{ type: string, slug: string, value: string }>,
 *   errors: Array<{ path: string, message: string }>
 * }} ImportSummary
 */

/**
 * Lo que hay que enlazar: cada evento, material o serie vivo sin edge de imagen cuyo campo viejo
 * apunta a un archivo del repo.
 *
 * @param {D1Database} db
 * @param {Set<string>} paths
 * @returns {Promise<{ links: PlannedLink[], missing: ImportSummary['missing'] }>}
 */
export async function planLinks(db, paths) {
	/** @type {PlannedLink[]} */
	const links = [];
	/** @type {ImportSummary['missing']} */
	const missing = [];
	const { results: posts } = await db
		.prepare(
			`SELECT o.id, o.type, o.slug, o.title, s.legacy_slug,
				json_extract(o.data, '$.featured') AS featured
			FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id
			WHERE o.type IN ('evento', 'material') AND o.deleted_at IS NULL AND json_valid(o.data)
			AND json_extract(o.data, '$.featured') IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.from_id = o.id AND e.kind = 'portada')
			ORDER BY o.id`
		)
		.all();
	for (const r of posts) {
		const category = r.type === 'evento' ? 'calendario' : 'material';
		const folder = String(r.legacy_slug ?? r.slug);
		const path = featuredPath(category, folder, r.featured, paths);
		const type = String(r.type);
		if (!path) {
			missing.push({ type, slug: folder, value: String(r.featured) });
			continue;
		}
		links.push({
			type,
			id: Number(r.id),
			slug: folder,
			kind: IMAGE_USES[/** @type {'evento'} */ (type)],
			path,
			title: String(r.title)
		});
	}
	const { results: tags } = await db
		.prepare(
			`SELECT o.id, o.title, json_extract(o.data, '$.key') AS tag,
				json_extract(o.data, '$.image') AS image
			FROM objects o
			WHERE o.type = 'etiqueta' AND o.deleted_at IS NULL AND json_valid(o.data)
			AND json_extract(o.data, '$.image') IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.from_id = o.id AND e.kind = 'imagen')
			ORDER BY o.id`
		)
		.all();
	for (const r of tags) {
		const path = seriesImagePath(r.image, paths);
		if (!path) {
			missing.push({ type: 'etiqueta', slug: String(r.tag), value: String(r.image) });
			continue;
		}
		links.push({
			type: 'etiqueta',
			id: Number(r.id),
			slug: String(r.tag),
			kind: IMAGE_USES.etiqueta,
			path,
			title: String(r.tag ?? r.title)
		});
	}
	return { links, missing };
}

/**
 * Importa (o, con `dryRun`, solo cuenta) las imágenes del repo y sus usos.
 *
 * @param {D1Database} db
 * @param {R2Bucket | null | undefined} bucket
 * @param {{ files: RepoFile[], actor: string, dryRun?: boolean, now?: number }} opts
 * @returns {Promise<ImportSummary>}
 */
export async function importRepoImages(db, bucket, { files, actor, dryRun = false, now }) {
	const usable = files.filter((f) => isImportablePath(f.path));
	const skipped = files.filter((f) => !isImportablePath(f.path)).map((f) => f.path);
	const paths = new Set(usable.map((f) => f.path));
	const { links, missing } = await planLinks(db, paths);
	/** El primer uso de cada archivo: de ahí sale su nombre y su texto alternativo. */
	/** @type {Map<string, PlannedLink>} */
	const firstUse = new Map();
	for (const l of links) if (!firstUse.has(l.path)) firstUse.set(l.path, l);

	/** @type {ImportSummary} */
	const summary = {
		files: usable.length,
		skipped,
		newImages: 0,
		knownImages: 0,
		links,
		missing,
		errors: []
	};
	/** @type {Map<string, number>} ruta del repo → id de la imagen */
	const imageIds = new Map();
	for (const f of usable) {
		const sniffed = sniffImage(f.bytes);
		if (!sniffed) {
			summary.errors.push({ path: f.path, message: 'no es una imagen que se acepte' });
			continue;
		}
		const hash = await sha256Hex(f.bytes);
		const known = await db
			.prepare('SELECT id, deleted_at FROM objects WHERE type = ?1 AND slug = ?2')
			.bind(IMAGE_TYPE, hash)
			.first();
		if (known && known.deleted_at == null) summary.knownImages++;
		else summary.newImages++;
		if (dryRun) continue;
		const use = firstUse.get(f.path);
		const name = f.path.split('/').pop() ?? f.path;
		try {
			const { image } = await storeImage(
				db,
				bucket,
				{
					bytes: f.bytes,
					name,
					title: use ? `${use.title} (${name})` : `${f.path.split('/').slice(-2).join('/')}`,
					alt: use ? `Imagen de «${use.title}»` : '',
					sourcePath: f.path
				},
				{ actor, now }
			);
			imageIds.set(f.path, image.id);
		} catch (e) {
			summary.errors.push({ path: f.path, message: e instanceof Error ? e.message : String(e) });
		}
	}
	if (dryRun) return summary;
	for (const l of links) {
		const imageId = imageIds.get(l.path);
		if (!imageId) continue;
		try {
			await linkImage(db, l.id, l.kind, imageId, { actor, now });
		} catch (e) {
			summary.errors.push({
				path: `${l.type}:${l.slug}`,
				message: e instanceof Error ? e.message : String(e)
			});
		}
	}
	return summary;
}

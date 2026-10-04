/**
 * La biblioteca de imágenes (docs/imagenes.md): cada imagen es un objeto `imagen` en la base y
 * su archivo está en R2 (binding `MEDIA`). Cada uso es un edge hacia la imagen (evento → imagen
 * `portada`, material → `portada`, etiqueta de serie → `imagen`, perfil → `avatar`).
 *
 * Todas las escrituras pasan por saveObject(); las lecturas, por la visibilidad
 * (`visibleWhere`/`canSee`). Sin imports de SvelteKit: lo usan las rutas, el script de
 * importación y vitest.
 *
 * Solo usa imports relativos.
 */
import { ObjectError } from '../objects/errors.js';
import { OBJECT_COLUMNS, forViewer, rowToObject } from '../objects/read.js';
import { saveObject } from '../objects/save.js';
import { ANON, canSee, visibleWhere } from '../objects/visibility.js';
import { MEDIA_KEY } from '../objects/types/imagen.js';
import { mediaKey, mediaPath, sha256Hex, sniffImage } from './sniff.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */
/** @typedef {import('../objects/visibility.js').Viewer} Viewer */
/** @typedef {import('../objects/read.js').StoredObject} StoredObject */

export const IMAGE_TYPE = 'imagen';

/**
 * Peso máximo de lo que llega al servidor. El navegador achica antes de subir (lado mayor 2000
 * px, WEBP), así que esto casi nunca se alcanza: es el tope para un archivo que no se pudo achicar.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Cómo se guarda en caché un archivo: para siempre (la clave cambia si cambia el contenido). */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Los usos de una imagen: qué edge, desde qué tipo. */
export const IMAGE_USES = Object.freeze({
	evento: 'portada',
	material: 'portada',
	etiqueta: 'imagen',
	perfil: 'avatar'
});

/** Sin texto alternativo no se sube (lo leen los lectores de pantalla). */
export const ALT_REQUIRED =
	'Escribí qué se ve en la imagen (texto alternativo): lo leen quienes usan lector de pantalla.';

/** Un problema para mostrarle a la persona, con su código HTTP. */
export class ImageError extends Error {
	/** @param {number} status @param {string} message */
	constructor(status, message) {
		super(message);
		this.name = 'ImageError';
		this.status = status;
	}
}

/**
 * @typedef {{ id: number, key: string, url: string, title: string, alt: string, width: number | null,
 *   height: number | null, mime: string, size: number }} PublicImage
 *   Lo que ve el editor de una imagen (sin quién la subió).
 */

/**
 * @param {StoredObject} o
 * @returns {PublicImage}
 */
export function publicImage(o) {
	const d = /** @type {Record<string, any>} */ (o.data);
	return {
		id: o.id,
		key: String(d.key ?? ''),
		url: mediaPath(String(d.key ?? '')),
		title: o.title,
		alt: typeof d.alt === 'string' ? d.alt : '',
		width: Number.isSafeInteger(d.width) ? d.width : null,
		height: Number.isSafeInteger(d.height) ? d.height : null,
		mime: String(d.mime ?? ''),
		size: Number(d.size ?? 0)
	};
}

/** `img/<hash>.<ext>` → `<hash>` (el slug del objeto). @param {string} key */
export const slugOfKey = (key) => (MEDIA_KEY.test(key) ? key.slice(4, 68) : null);

/**
 * El nombre para buscar una imagen: el del archivo, sin la extensión ni caracteres raros.
 * @param {unknown} name
 */
export function imageTitle(name) {
	const clean = String(name ?? '')
		.replace(/\.[a-z0-9]{2,5}$/i, '')
		// Sin caracteres de control (tabulaciones, saltos de línea…).
		.replace(/\p{Cc}/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200);
	return clean || 'Imagen';
}

/**
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<StoredObject | null>}
 */
async function findBySlug(db, slug) {
	const row = await db
		.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE type = ?1 AND slug = ?2`)
		.bind(IMAGE_TYPE, slug)
		.first();
	return row ? rowToObject(row) : null;
}

/**
 * Guarda una imagen: el archivo en R2 (si no estaba) y su objeto en la base. El mismo archivo
 * subido otra vez es la misma imagen (si estaba borrada, vuelve; si no tenía texto alternativo y
 * ahora lo trae, se le suma).
 *
 * @param {D1Database} db
 * @param {R2Bucket | undefined | null} bucket
 * @param {{ bytes: Uint8Array, name?: string, alt?: string, title?: string, width?: number,
 *   height?: number, sourcePath?: string }} file
 * @param {{ actor: string, now?: number }} ctx
 * @returns {Promise<{ image: PublicImage, created: boolean }>}
 */
export async function storeImage(db, bucket, file, { actor, now = Date.now() }) {
	if (!bucket) throw new ImageError(503, 'Todavía no hay dónde guardar imágenes en este sitio.');
	const bytes = file.bytes;
	if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
		throw new ImageError(400, 'No llegó ningún archivo. Volvé a elegir la imagen.');
	}
	if (bytes.length > MAX_UPLOAD_BYTES) {
		throw new ImageError(
			413,
			`La imagen pesa ${(bytes.length / 1024 / 1024).toFixed(1)} MB. El máximo es ${
				MAX_UPLOAD_BYTES / 1024 / 1024
			} MB.`
		);
	}
	const sniffed = sniffImage(bytes);
	if (!sniffed)
		throw new ImageError(415, 'El archivo no es una imagen JPG, PNG, WEBP, GIF o AVIF.');
	const hash = await sha256Hex(bytes);
	const key = mediaKey(hash, sniffed.ext);
	const alt = String(file.alt ?? '').trim();

	if (!(await bucket.head(key))) {
		await bucket.put(key, bytes, {
			httpMetadata: { contentType: sniffed.mime, cacheControl: IMMUTABLE_CACHE }
		});
	}

	const existing = await findBySlug(db, hash);
	if (existing) {
		const d = /** @type {Record<string, any>} */ (existing.data);
		const addAlt = alt && !d.alt;
		if (existing.deleted_at === null && !addAlt)
			return { image: publicImage(existing), created: false };
		const saved = await saveObject(
			db,
			{
				id: existing.id,
				type: IMAGE_TYPE,
				version: existing.version,
				data: addAlt ? { ...d, alt } : d,
				deleted: false
			},
			{ actor, now }
		);
		return { image: publicImage(saved), created: false };
	}

	const width = sniffed.width ?? positive(file.width);
	const height = sniffed.height ?? positive(file.height);
	const saved = await saveObject(
		db,
		{
			type: IMAGE_TYPE,
			slug: hash,
			title: file.title ? imageTitle(file.title) : imageTitle(file.name),
			data: {
				key,
				mime: sniffed.mime,
				size: bytes.length,
				...(width ? { width } : {}),
				...(height ? { height } : {}),
				...(alt ? { alt } : {}),
				...(file.name ? { original_name: String(file.name).slice(0, 200) } : {}),
				...(file.sourcePath ? { source_path: file.sourcePath } : {})
			}
		},
		{ actor, now }
	);
	return { image: publicImage(saved), created: true };
}

/** @param {unknown} n */
function positive(n) {
	const v = Number(n);
	return Number.isSafeInteger(v) && v > 0 && v <= 20_000 ? v : undefined;
}

/**
 * Buscar en la biblioteca por nombre o texto alternativo (cada palabra como prefijo). Sin texto,
 * las más nuevas. `createdBy`: solo las que subió esa cuenta (Mi rincón: una cuenta del público
 * no recorre la biblioteca entera).
 *
 * @param {D1Database} db
 * @param {{ q?: string, viewer: Viewer, createdBy?: string, limit?: number }} opts
 * @returns {Promise<PublicImage[]>}
 */
export async function searchImages(db, { q = '', viewer, createdBy, limit = 24 }) {
	const terms = String(q)
		.split(/\s+/)
		.map((w) => w.replace(/["*^():{}[\]]/g, '').trim())
		.filter(Boolean)
		.slice(0, 8)
		.map((w) => `"${w}"*`);
	const visible = visibleWhere(viewer, 'o');
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c}`)
		.join(', ');
	const n = Math.min(Math.max(1, limit), 60);
	const by = createdBy ?? null;
	const stmt = terms.length
		? db
				.prepare(
					`SELECT ${cols} FROM objects_fts f JOIN objects o ON o.id = f.rowid
					WHERE objects_fts MATCH ? AND o.type = ? AND ${visible.sql}
					AND (? IS NULL OR o.created_by = ?)
					ORDER BY f.rank, o.id DESC LIMIT ?`
				)
				.bind(terms.join(' '), IMAGE_TYPE, ...visible.params, by, by, n)
		: db
				.prepare(
					`SELECT ${cols} FROM objects o
					WHERE o.type = ? AND ${visible.sql} AND (? IS NULL OR o.created_by = ?)
					ORDER BY o.created_at DESC, o.id DESC LIMIT ?`
				)
				.bind(IMAGE_TYPE, ...visible.params, by, by, n);
	const { results } = await stmt.all();
	return results.map((r) => publicImage(forViewer(rowToObject(r), viewer)));
}

/** Cómo se nombra cada tipo de objeto que usa una imagen («Usada en: material «…»»). */
const USE_LABEL = Object.freeze({
	evento: 'evento',
	material: 'material',
	etiqueta: 'etiqueta',
	perfil: 'perfil'
});

/**
 * Dónde se usa cada imagen (los objetos con un edge hacia ella), para que el buscador del selector
 * diga de dónde es cada una: «material «Guía de prueba»». Hasta 3 por imagen; los dos extremos
 * pasan por la visibilidad.
 *
 * @param {D1Database} db
 * @param {number[]} imageIds
 * @param {Viewer} viewer
 * @returns {Promise<Map<number, string[]>>}
 */
export async function imageUses(db, imageIds, viewer) {
	/** @type {Map<number, string[]>} */
	const out = new Map();
	const list = [...new Set(imageIds.filter((i) => Number.isSafeInteger(i) && i > 0))];
	if (!list.length) return out;
	const vs = visibleWhere(viewer, 's');
	const { results } = await db
		.prepare(
			`SELECT DISTINCT e.to_id AS image, s.type AS type, s.title AS title FROM edges e
			JOIN objects s ON s.id = e.from_id
			WHERE e.to_id IN (SELECT value FROM json_each(?)) AND ${vs.sql}
			ORDER BY s.id DESC`
		)
		.bind(JSON.stringify(list), ...vs.params)
		.all();
	for (const r of /** @type {{ image: number, type: string, title: string }[]} */ (results)) {
		const label = /** @type {Record<string, string>} */ (USE_LABEL)[r.type];
		if (!label) continue;
		const uses = out.get(r.image) ?? [];
		if (uses.length < 3) uses.push(`${label} «${r.title}»`);
		out.set(r.image, uses);
	}
	return out;
}

/**
 * Las imágenes que usan estos objetos (cualquier edge hacia una imagen), sin repetir, las más
 * nuevas primero. Los dos extremos pasan por la visibilidad.
 *
 * @param {D1Database} db
 * @param {number[]} ids
 * @param {Viewer} viewer
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<PublicImage[]>}
 */
export async function imagesUsedBy(db, ids, viewer, { limit = 48 } = {}) {
	const list = [...new Set(ids.filter((i) => Number.isSafeInteger(i) && i > 0))];
	if (!list.length) return [];
	const vi = visibleWhere(viewer, 'i');
	const vs = visibleWhere(viewer, 's');
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `i.${c}`)
		.join(', ');
	const { results } = await db
		.prepare(
			`SELECT DISTINCT ${cols} FROM edges e
			JOIN objects i ON i.id = e.to_id AND i.type = ?
			JOIN objects s ON s.id = e.from_id
			WHERE e.from_id IN (SELECT value FROM json_each(?)) AND ${vi.sql} AND ${vs.sql}
			ORDER BY i.created_at DESC, i.id DESC LIMIT ?`
		)
		.bind(IMAGE_TYPE, JSON.stringify(list), ...vi.params, ...vs.params, limit)
		.all();
	return results.map((r) => publicImage(forViewer(rowToObject(r), viewer)));
}

/**
 * «De este evento»: las imágenes del objeto y, si es un evento, las de sus series (la etiqueta de
 * la serie y las otras ediciones). `seriesKeys`: los nombres de las etiquetas que son series
 * (lo sabe el árbol de etiquetas; ver seriesTagIds).
 *
 * @param {D1Database} db
 * @param {number} objectId
 * @param {Viewer} viewer
 * @param {{ seriesKeys?: readonly string[] }} [opts]
 * @returns {Promise<PublicImage[]>}
 */
export async function contextImages(db, objectId, viewer, { seriesKeys = [] } = {}) {
	const row = await db
		.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1`)
		.bind(objectId)
		.first();
	if (!row) return [];
	const object = rowToObject(row);
	if (!Object.hasOwn(IMAGE_USES, object.type) || !canSee(object, viewer)) return [];
	const ids = [object.id];
	const tags = Array.isArray(object.data.tags) ? object.data.tags.map(String) : [];
	const series = tags.filter((t) => seriesKeys.includes(t));
	if (object.type === 'evento' && series.length) {
		const { results } = await db
			.prepare(
				`SELECT id FROM objects WHERE type = 'etiqueta' AND deleted_at IS NULL
				AND json_extract(data, '$.key') IN (SELECT value FROM json_each(?1))
				UNION
				SELECT ev.id FROM objects ev, json_each(ev.data, '$.tags') t
				WHERE ev.type = 'evento' AND ev.deleted_at IS NULL AND json_valid(ev.data)
				AND t.value IN (SELECT value FROM json_each(?1))
				LIMIT 300`
			)
			.bind(JSON.stringify(series))
			.all();
		for (const r of results) ids.push(Number(r.id));
	}
	return imagesUsedBy(db, ids, viewer);
}

/**
 * La imagen de un uso (`kind`) de un objeto, si quien mira la puede ver.
 *
 * @param {D1Database} db
 * @param {number} objectId
 * @param {string} kind
 * @param {Viewer} viewer
 * @returns {Promise<PublicImage | null>}
 */
export async function imageOf(db, objectId, kind, viewer) {
	const vi = visibleWhere(viewer, 'i');
	const row = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS.split(', ')
				.map((c) => `i.${c}`)
				.join(', ')} FROM edges e JOIN objects i ON i.id = e.to_id AND i.type = ?
			WHERE e.from_id = ? AND e.kind = ? AND ${vi.sql} ORDER BY e.position LIMIT 1`
		)
		.bind(IMAGE_TYPE, objectId, kind, ...vi.params)
		.first();
	return row ? publicImage(forViewer(rowToObject(row), viewer)) : null;
}

/**
 * Para las listas: la clave de la imagen de cada objeto de un tipo (por id), solo imágenes que
 * ve cualquiera. Una consulta.
 *
 * @param {D1Database} db
 * @param {string} fromType
 * @param {string} kind
 * @returns {Promise<Map<number, string>>}
 */
export async function imageKeysByObject(db, fromType, kind) {
	const vi = visibleWhere(ANON, 'i');
	const { results } = await db
		.prepare(
			`SELECT e.from_id AS id, json_extract(i.data, '$.key') AS key FROM edges e
			JOIN objects f ON f.id = e.from_id AND f.type = ?
			JOIN objects i ON i.id = e.to_id AND i.type = ?
			WHERE e.kind = ? AND ${vi.sql}
			ORDER BY e.position DESC`
		)
		.bind(fromType, IMAGE_TYPE, kind, ...vi.params)
		.all();
	/** @type {Map<number, string>} */
	const out = new Map();
	for (const r of results) if (typeof r.key === 'string') out.set(Number(r.id), r.key);
	return out;
}

/**
 * La imagen de la biblioteca de cada serie (edge `imagen` de su etiqueta), por nombre de la
 * etiqueta. Solo etiquetas vivas e imágenes que ve cualquiera. Una consulta.
 *
 * @param {D1Database} db
 * @returns {Promise<Map<string, string>>} nombre de la etiqueta → clave
 */
export async function seriesImageKeys(db) {
	const vi = visibleWhere(ANON, 'i');
	const { results } = await db
		.prepare(
			`SELECT json_extract(f.data, '$.key') AS tag, json_extract(i.data, '$.key') AS key
			FROM edges e
			JOIN objects f ON f.id = e.from_id AND f.type = 'etiqueta' AND f.deleted_at IS NULL
			JOIN objects i ON i.id = e.to_id AND i.type = ?
			WHERE e.kind = 'imagen' AND ${vi.sql}`
		)
		.bind(IMAGE_TYPE, ...vi.params)
		.all();
	/** @type {Map<string, string>} */
	const out = new Map();
	for (const r of results) {
		if (typeof r.tag === 'string' && typeof r.key === 'string') out.set(r.tag, r.key);
	}
	return out;
}

/**
 * Para el panel de series: la imagen de la biblioteca de cada serie, por nombre de la etiqueta.
 *
 * @param {D1Database} db
 * @param {Viewer} viewer
 * @returns {Promise<Map<string, PublicImage>>}
 */
export async function seriesImages(db, viewer) {
	const vi = visibleWhere(viewer, 'i');
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `i.${c}`)
		.join(', ');
	const { results } = await db
		.prepare(
			`SELECT json_extract(f.data, '$.key') AS tag, ${cols} FROM edges e
			JOIN objects f ON f.id = e.from_id AND f.type = 'etiqueta' AND f.deleted_at IS NULL
			JOIN objects i ON i.id = e.to_id AND i.type = ?
			WHERE e.kind = 'imagen' AND ${vi.sql}`
		)
		.bind(IMAGE_TYPE, ...vi.params)
		.all();
	/** @type {Map<string, PublicImage>} */
	const out = new Map();
	for (const { tag, ...row } of results) {
		if (typeof tag === 'string') out.set(tag, publicImage(forViewer(rowToObject(row), viewer)));
	}
	return out;
}

/**
 * Para servir `/media/<clave>`: el objeto de esa clave si cualquiera lo puede ver (no borrado).
 *
 * @param {D1Database} db
 * @param {string} key
 * @returns {Promise<PublicImage | null>}
 */
export async function servableImage(db, key) {
	const slug = slugOfKey(key);
	if (!slug) return null;
	const o = await findBySlug(db, slug);
	if (!o || o.data.key !== key || !canSee(o, ANON)) return null;
	return publicImage(o);
}

/**
 * Cambia la imagen de un uso de un objeto (o la saca, con `imageId` null): un guardado del objeto
 * con solo ese edge (los datos quedan como están). Para quien guarda el objeto por otro camino
 * (las series se guardan como etiquetas); los eventos y el material mandan el edge en el mismo
 * guardado del texto.
 *
 * @param {D1Database} db
 * @param {number} objectId
 * @param {string} kind
 * @param {number | null} imageId
 * @param {{ actor: string, now?: number }} ctx
 */
export async function linkImage(db, objectId, kind, imageId, { actor, now = Date.now() }) {
	const row = await db
		.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1`)
		.bind(objectId)
		.first();
	if (!row) throw new ObjectError('not_found', 'Ese objeto ya no existe.', { status: 404 });
	const o = rowToObject(row);
	const current = await db
		.prepare('SELECT to_id FROM edges WHERE from_id = ?1 AND kind = ?2 ORDER BY position')
		.bind(objectId, kind)
		.all();
	const before = current.results.map((r) => Number(r.to_id));
	const after = imageId ? [imageId] : [];
	if (before.length === after.length && before.every((v, i) => v === after[i])) return o;
	return saveObject(
		db,
		{ id: o.id, type: o.type, version: o.version, edges: { [kind]: after } },
		{ actor, now }
	);
}

/**
 * Borrar una imagen de la biblioteca: borrado suave (se deshace subiéndola de nuevo). El archivo
 * queda en R2; los edges quedan (para deshacer), pero nadie la ve: ni las páginas ni `/media/…`.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {{ actor: string, now?: number }} ctx
 * @returns {Promise<boolean>} false si no existe (o ya estaba borrada)
 */
export async function deleteImage(db, id, { actor, now = Date.now() }) {
	const row = await db
		.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1 AND type = ?2`)
		.bind(id, IMAGE_TYPE)
		.first();
	if (!row) return false;
	const o = rowToObject(row);
	if (o.deleted_at !== null) return false;
	await saveObject(
		db,
		{ id: o.id, type: IMAGE_TYPE, version: o.version, deleted: true },
		{ actor, now }
	);
	return true;
}

/**
 * ¿Puede una cuenta del público usar esta imagen en un objeto? Solo si la subió ella o si el
 * objeto ya la usa (así no se enlaza cualquier imagen de la biblioteca adivinando su id).
 *
 * @param {D1Database} db
 * @param {number} imageId
 * @param {{ actor: string, objectId: number }} who
 */
export async function memberMayUse(db, imageId, { actor, objectId }) {
	const row = await db
		.prepare(
			`SELECT 1 AS ok FROM objects i WHERE i.id = ?1 AND i.type = ?2 AND i.deleted_at IS NULL
			AND (i.created_by = ?3 OR EXISTS (SELECT 1 FROM edges e WHERE e.from_id = ?4 AND e.to_id = i.id))`
		)
		.bind(imageId, IMAGE_TYPE, actor, objectId)
		.first();
	return Boolean(row);
}

/**
 * Una imagen viva por id (para validar lo que manda un formulario antes de crear el edge).
 *
 * @param {D1Database} db
 * @param {unknown} id
 * @param {Viewer} viewer
 * @returns {Promise<PublicImage | null>}
 */
export async function findImage(db, id, viewer) {
	const n = Number(id);
	if (!Number.isSafeInteger(n) || n <= 0) return null;
	const row = await db
		.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1 AND type = ?2`)
		.bind(n, IMAGE_TYPE)
		.first();
	if (!row) return null;
	const o = rowToObject(row);
	return canSee(o, viewer) ? publicImage(forViewer(o, viewer)) : null;
}

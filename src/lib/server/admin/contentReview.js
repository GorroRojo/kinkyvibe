/**
 * «Para revisar»: los arreglos de contenido que se resuelven ahí mismo, desde el Inicio del panel
 * (docs/panel.md, «Arreglos de contenido»). gorrite (Mesa, tu-lista-contenido-panel): «esto
 * debería ser algo para admins, no para desarrollo».
 *
 * - **Fotos sin descripción**: las imágenes del texto de un perfil de amigues sin `alt`. Une admin
 *   escribe qué se ve y se guarda en el texto del perfil ({@link saveProfileImageAlt}).
 * - **Portadas pesadas**: las portadas (evento o material) cuya imagen pesa más de
 *   {@link HEAVY_COVER_BYTES}. «Achicar» la pasa por el mismo achique de la subida (en el
 *   navegador), la sube como imagen nueva y cambia la portada ({@link swapCover}); la original
 *   queda en la biblioteca.
 * - **Videos sin transcripción**: el material con un video en el texto y sin «Transcripción».
 *   Lleva a su editor (alguien que conoce el audio la escribe ahí).
 *
 * Nada de esto inventa descripciones ni escribe solo: cada cambio lo hace une admin, pasa por
 * saveObject() con su versión en el historial (`object_revisions`) y queda en Actividad.
 *
 * Las consultas van en la primera tanda de «Para revisar» ({@link contentReviewQuery}); las
 * portadas viejas del repo (`featured`, sin edge `portada`) salen de la lista de publicaciones que
 * el isolate recuerda ({@link legacyCoverRefs}). Las filas las arma {@link contentReviewRows}: una
 * por cosa, cada una cuenta 1 en el botón (decisión 0030).
 */
import { rowsOf } from '$lib/server/db/batch.js';
import { getObject, saveObject } from '$lib/server/objects/index.js';
import { VersionConflictError } from '$lib/server/objects/errors.js';
import { panelRevisionStatement } from '$lib/server/contenido/author.js';
import { mediaImportNames } from '$lib/server/amigues/render.js';
import { editEventHref } from '$lib/admin/links.js';
import { contentAdminHref } from '$lib/admin/nav.js';
import { imagesWithoutAlt, setImageAlt } from '$lib/utils/imageAlt.js';
import { HEAVY_COVER_BYTES } from '$lib/utils/imageResize.js';
import { legacyAssetURL, legacyMediaURL, legacyNumberedURL } from '$lib/utils/legacyMedia.js';

export { HEAVY_COVER_BYTES };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./inicio.js').ReviewItem} ReviewItem */
/** @typedef {import('./inicio.js').ReviewRow} ReviewRow */

/** Cuántas cosas muestra desplegada cada fila (el resto, «y N más»). */
export const CONTENT_REVIEW_SHOWN = 30;

/** Admin que mira (las lecturas del panel ven también lo oculto). */
const ADMIN_VIEWER = /** @type {const} */ ({ role: 'admin', id: 'panel' });

/**
 * @typedef {{ id: number, slug: string, title: string, body: string, legacySlug: string | null }} ProfileText
 * @typedef {{ id: number, key: string, size: number, title: string, alt: string, mime: string }} HeavyImage
 * @typedef {{ id: number, type: 'evento' | 'material', slug: string, title: string, imageId?: number, key?: string }} CoverRef
 *   `slug`: la dirección del panel (la vieja de un post importado, si tiene); `imageId` (edge
 *   `portada`) o `key` (la imagen vieja del repo, `featured`)
 * @typedef {{ id: number, slug: string, title: string }} VideoPost
 * @typedef {{ profiles: ProfileText[], heavy: HeavyImage[], covers: CoverRef[], videos: VideoPost[] }} ContentFacts
 */

/**
 * `img/<hash>.<ext>` de una dirección de la biblioteca (`/media/img/…`, también con el dominio
 * del sitio público adelante), o `null`.
 * @param {unknown} url
 */
export function mediaKeyOf(url) {
	const m = /\/media\/(img\/[0-9a-f]{64}\.[a-z0-9]+)(?:$|[?#])/.exec(String(url ?? ''));
	return m ? m[1] : null;
}

/** @param {unknown} v */
const str = (v) => (v == null ? '' : String(v));

/**
 * Las consultas de los arreglos de contenido, en una sola consulta de la tanda (cuatro
 * sentencias). `null` si falla (las filas no aparecen).
 *
 * @returns {import('$lib/server/db/batch.js').BatchQuery<ContentFacts | null>}
 */
export function contentReviewQuery() {
	return {
		what: 'inicio: arreglos de contenido',
		fallback: null,
		statements: (db) => [
			// Perfiles con alguna imagen en el texto (el resto lo decide imagesWithoutAlt).
			db.prepare(
				`SELECT o.id, o.slug, o.title, json_extract(o.data, '$.body') AS body, ps.legacy_slug
				FROM objects o LEFT JOIN profile_sources ps ON ps.profile_id = o.id
				WHERE o.type = 'perfil' AND o.deleted_at IS NULL
				AND (instr(lower(json_extract(o.data, '$.body')), '<img') > 0
					OR instr(json_extract(o.data, '$.body'), '![') > 0)
				ORDER BY o.title COLLATE NOCASE`
			),
			// Las imágenes pesadas de la biblioteca (un GIF puede ser animado: no se achica).
			db
				.prepare(
					`SELECT id, title, json_extract(data, '$.key') AS key, json_extract(data, '$.size') AS size,
						json_extract(data, '$.alt') AS alt, json_extract(data, '$.mime') AS mime
					FROM objects WHERE type = 'imagen' AND deleted_at IS NULL
					AND CAST(json_extract(data, '$.size') AS INTEGER) > ?1
					AND json_extract(data, '$.mime') != 'image/gif'`
				)
				.bind(HEAVY_COVER_BYTES),
			// Las portadas (edge `portada`) que son una de esas imágenes.
			db
				.prepare(
					`SELECT o.id, o.type, o.slug, o.title, s.legacy_slug, e.to_id AS image_id
					FROM edges e JOIN objects o ON o.id = e.from_id JOIN objects i ON i.id = e.to_id
					LEFT JOIN content_sources s ON s.object_id = o.id
						AND s.category = CASE o.type WHEN 'evento' THEN 'calendario' ELSE o.type END
					WHERE e.kind = 'portada' AND o.type IN ('evento', 'material') AND o.deleted_at IS NULL
					AND i.type = 'imagen' AND i.deleted_at IS NULL
					AND CAST(json_extract(i.data, '$.size') AS INTEGER) > ?1
					ORDER BY o.title COLLATE NOCASE`
				)
				.bind(HEAVY_COVER_BYTES),
			// El material con un video en el texto y sin transcripción.
			db.prepare(
				`SELECT o.id, o.slug, o.title, s.legacy_slug FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = 'material'
				WHERE o.type = 'material' AND o.deleted_at IS NULL
				AND (instr(lower(json_extract(o.data, '$.body')), '<video') > 0
					OR json_extract(o.data, '$.body') GLOB '*/media/file/*.mp4*'
					OR json_extract(o.data, '$.body') GLOB '*/media/file/*.webm*')
				AND trim(coalesce(json_extract(o.data, '$.transcript'), '')) = ''
				ORDER BY o.title COLLATE NOCASE`
			)
		],
		read: (results) => ({
			profiles: rowsOf(results, 0).map((r) => ({
				id: Number(r.id),
				slug: str(r.legacy_slug) || str(r.slug),
				title: str(r.title),
				body: str(r.body),
				legacySlug: r.legacy_slug ? str(r.legacy_slug) : null
			})),
			heavy: rowsOf(results, 1).map((r) => ({
				id: Number(r.id),
				key: str(r.key),
				size: Number(r.size ?? 0),
				title: str(r.title),
				alt: str(r.alt),
				mime: str(r.mime)
			})),
			covers: rowsOf(results, 2).map((r) => ({
				id: Number(r.id),
				type: /** @type {'evento' | 'material'} */ (r.type === 'evento' ? 'evento' : 'material'),
				slug: str(r.legacy_slug) || str(r.slug),
				title: str(r.title),
				imageId: Number(r.image_id)
			})),
			videos: rowsOf(results, 3).map((r) => ({
				id: Number(r.id),
				slug: str(r.legacy_slug) || str(r.slug),
				title: str(r.title)
			}))
		})
	};
}

/**
 * Las portadas viejas del repo (`featured` de un evento o un material, sin edge `portada`) con la
 * clave de su copia en la biblioteca ($lib/utils/legacyMedia.js). Sale de la lista de
 * publicaciones que el isolate recuerda mientras la base no cambie (la misma de Etiquetas y de la
 * lista de Eventos). Nunca falla: si algo sale mal, `[]`.
 *
 * @returns {Promise<CoverRef[]>}
 */
export async function legacyCoverRefs() {
	try {
		const { activeContentDB, allDbPostObjects } = await import('../contenido/repo.js');
		const db = activeContentDB();
		if (!db) return [];
		/** @type {CoverRef[]} */
		const out = [];
		for (const [category, type] of /** @type {const} */ ([
			['calendario', 'evento'],
			['material', 'material']
		])) {
			for (const [slug, e] of await allDbPostObjects(db, category)) {
				if (e.deleted) continue;
				const key = mediaKeyOf(legacyCoverURL(category, slug, e.object.data?.featured));
				if (key) out.push({ id: e.object.id, type, slug, title: e.object.title, key });
			}
		}
		return out;
	} catch (error) {
		console.error('[admin] «Para revisar»: no se pudieron leer las portadas viejas', error);
		return [];
	}
}

/**
 * La dirección de una portada vieja (`featured`): un número de la carpeta del post, un archivo de
 * `src/lib/assets` o ya una dirección de la biblioteca.
 * @param {string} category
 * @param {string} slug
 * @param {unknown} featured
 */
export function legacyCoverURL(category, slug, featured) {
	const f = str(featured).trim();
	if (!f) return undefined;
	if (/^\d+$/.test(f)) return legacyNumberedURL(category, slug, f);
	if (f.startsWith('/media/') || f.includes('/media/img/')) return f;
	return legacyAssetURL(f);
}

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** «412 KB». @param {number} bytes */
export const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/** Dónde se edita un perfil. @param {string} slug */
const profileHref = (slug) => `/admin/comunidad/perfiles/${encodeURIComponent(slug)}`;

/** Dónde se edita un material. @param {string} slug */
const materialHref = (slug) => `${contentAdminHref('material')}/${encodeURIComponent(slug)}`;

/**
 * La dirección para ver una imagen del texto de un perfil: la que dice el texto, o la que importa
 * el bloque de mdsvex con ese nombre (`src={foto1}`). `''` si no se sabe.
 *
 * @param {ProfileText} p
 * @param {string} src
 */
function profileImageURL(p, src) {
	const m = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(src);
	if (m) {
		const names = mediaImportNames(p.body, (file) =>
			p.legacySlug ? legacyMediaURL('amigues', p.legacySlug, file) : undefined
		);
		return names.get(m[1]) ?? '';
	}
	return /^(\/media\/|https:\/\/kinkyvibe\.ar\/media\/)/.test(src) ? src : '';
}

/**
 * «Y N más», como último ítem de una fila desplegada.
 * @param {string} id
 * @param {number} hidden
 * @param {string} what
 * @returns {ReviewItem[]}
 */
function moreItem(id, hidden, what) {
	return hidden > 0
		? [
				{
					id,
					tone: 'info',
					icon: 'image',
					title: 'más',
					text: '',
					action: '',
					name: `y ${hidden} ${what} más`
				}
			]
		: [];
}

/**
 * «Fotos sin descripción»: una fila que se despliega con cada foto (su miniatura, el perfil y un
 * campo para escribir qué se ve). `null` si no hay ninguna.
 *
 * @param {ProfileText[]} profiles
 * @param {{ shown?: number }} [opts]
 * @returns {ReviewRow | null}
 */
export function missingAltRow(profiles, { shown = CONTENT_REVIEW_SHOWN } = {}) {
	/** @type {ReviewItem[]} */
	const items = [];
	let where = 0;
	for (const p of profiles) {
		const missing = imagesWithoutAlt(p.body);
		if (!missing.length) continue;
		where++;
		for (const img of missing) {
			items.push({
				id: `alt-${p.id}-${img.index}`,
				tone: 'info',
				icon: 'alt',
				title: p.title,
				name: `${p.title} · foto ${img.index + 1}`,
				text: '',
				action: 'Ver el perfil',
				href: profileHref(p.slug),
				altFix: {
					profileId: p.id,
					index: img.index,
					src: img.src,
					thumb: profileImageURL(p, img.src)
				}
			});
		}
	}
	if (!items.length) return null;
	return {
		kind: 'group',
		id: 'group-content-alt',
		tone: 'info',
		icon: 'alt',
		title: plural(items.length, 'foto sin descripción', 'fotos sin descripción'),
		text: `En ${plural(where, 'perfil', 'perfiles')}. Escribí qué se ve en cada una: lo leen quienes usan lector de pantalla`,
		action: 'Ver',
		items: [
			...items.slice(0, shown),
			...moreItem('alt-more', items.length - shown, items.length - shown === 1 ? 'foto' : 'fotos')
		]
	};
}

/**
 * «Portadas pesadas»: una fila que se despliega con cada portada que pesa más de
 * {@link HEAVY_COVER_BYTES} y su botón «Achicar». Las de un edge `portada` y las viejas del repo
 * (`featured`, sin edge: el edge manda). `null` si no hay ninguna.
 *
 * @param {HeavyImage[]} heavy
 * @param {CoverRef[]} covers lo de {@link contentReviewQuery} (edges) y {@link legacyCoverRefs}
 * @param {{ shown?: number }} [opts]
 * @returns {ReviewRow | null}
 */
export function heavyCoversRow(heavy, covers, { shown = CONTENT_REVIEW_SHOWN } = {}) {
	const byId = new Map(heavy.map((h) => [h.id, h]));
	const byKey = new Map(heavy.map((h) => [h.key, h]));
	const withEdge = new Set(covers.filter((c) => c.imageId).map((c) => c.id));
	/** @type {ReviewItem[]} */
	const items = [];
	const seen = new Set();
	for (const c of covers) {
		if (seen.has(c.id) || (!c.imageId && withEdge.has(c.id))) continue;
		const image = c.imageId ? byId.get(c.imageId) : c.key ? byKey.get(c.key) : undefined;
		if (!image) continue;
		seen.add(c.id);
		items.push({
			id: `cover-${c.id}`,
			tone: 'info',
			icon: 'cover',
			title: c.title,
			name: `${c.title} · ${kb(image.size)}`,
			text: '',
			action: c.type === 'evento' ? 'Editar el evento' : 'Editar el material',
			href: c.type === 'evento' ? editEventHref(c.slug) : materialHref(c.slug),
			shrink: {
				ownerId: c.id,
				imageId: image.id,
				url: `/media/${image.key}`,
				title: image.title,
				alt: image.alt,
				size: image.size
			}
		});
	}
	if (!items.length) return null;
	return {
		kind: 'group',
		id: 'group-content-covers',
		tone: 'info',
		icon: 'cover',
		title: plural(items.length, 'portada pesada', 'portadas pesadas'),
		text: `Pesan más de ${kb(HEAVY_COVER_BYTES)} y tardan en cargar. «Achicar» hace una copia más liviana; la original queda en la biblioteca`,
		action: 'Ver',
		items: [
			...items.slice(0, shown),
			...moreItem(
				'cover-more',
				items.length - shown,
				items.length - shown === 1 ? 'portada' : 'portadas'
			)
		]
	};
}

/**
 * «Videos sin transcripción»: una fila que se despliega con cada material que muestra un video y no
 * tiene «Transcripción»; cada uno lleva a su editor. `null` si no hay ninguno.
 *
 * @param {VideoPost[]} videos
 * @returns {ReviewRow | null}
 */
export function videosRow(videos) {
	if (!videos.length) return null;
	return {
		kind: 'group',
		id: 'group-content-videos',
		tone: 'info',
		icon: 'video',
		title: plural(videos.length, 'video sin transcripción', 'videos sin transcripción'),
		text: 'Sin transcripción ni subtítulos, quien no escucha el audio se lo pierde. La escribe alguien que conoce el audio, en el editor del material',
		action: 'Ver',
		items: videos.map((v) => ({
			id: `video-${v.id}`,
			tone: 'info',
			icon: 'video',
			title: v.title,
			name: v.title,
			text: '',
			action: 'Escribir la transcripción',
			href: `${materialHref(v.slug)}#sec-video`
		}))
	};
}

/**
 * Las filas de los arreglos de contenido, en orden. Sin datos (la consulta falló), ninguna.
 *
 * @param {ContentFacts | null | undefined} facts
 * @param {CoverRef[]} [legacyCovers]
 * @returns {ReviewRow[]}
 */
export function contentReviewRows(facts, legacyCovers = []) {
	if (!facts) return [];
	return /** @type {ReviewRow[]} */ (
		[
			missingAltRow(facts.profiles),
			heavyCoversRow(facts.heavy, [...facts.covers, ...legacyCovers]),
			videosRow(facts.videos)
		].filter(Boolean)
	);
}

/**
 * @typedef {{ ok: true, title: string, id: number } | { ok: false, status: number, message: string }} FixResult
 */

/**
 * Escribe la descripción (`alt`) de una foto del texto de un perfil, desde «Fotos sin
 * descripción». Solo esa foto cambia; se guarda con saveObject() y su versión queda en el
 * historial. Si la foto ya no está, cambió o ya tiene descripción (alguien editó mientras tanto),
 * no guarda nada.
 *
 * @param {D1Database} db
 * @param {{ profileId: number, index: number, src: string, alt: string }} input
 * @param {{ actor: string, now?: number }} ctx
 * @returns {Promise<FixResult>}
 */
export async function saveProfileImageAlt(db, { profileId, index, src, alt }, { actor, now }) {
	const changed = {
		ok: /** @type {const} */ (false),
		status: 409,
		message: 'Esa foto cambió o ya tiene descripción. Recargá la página para ver cómo quedó.'
	};
	const profile = await getObject(db, { id: profileId }, ADMIN_VIEWER);
	if (!profile || profile.type !== 'perfil') {
		return { ok: false, status: 404, message: 'Ese perfil ya no existe.' };
	}
	const body = typeof profile.data.body === 'string' ? profile.data.body : '';
	if (!imagesWithoutAlt(body).some((i) => i.index === index && i.src === src)) return changed;
	const next = setImageAlt(body, index, alt, { src });
	if (next === null) return changed;
	try {
		await saveObject(
			db,
			{
				id: profile.id,
				type: 'perfil',
				version: profile.version,
				data: { ...profile.data, body: next }
			},
			{ actor, now, also: (self) => [panelRevisionStatement(db, self, 'panel')] }
		);
	} catch (e) {
		if (e instanceof VersionConflictError) return changed;
		throw e;
	}
	return { ok: true, title: profile.title, id: profile.id };
}

/**
 * Cambia la portada de un evento o un material por su copia achicada, desde «Portadas pesadas».
 * La imagen nueva ya está en la biblioteca (la subió el navegador con el achique de siempre); la
 * original queda en la biblioteca. Solo si la portada sigue siendo la que se achicó (si no, alguien
 * la cambió mientras tanto y no se toca) y si la nueva pesa menos. Como al elegir una imagen en el
 * selector, se saca la imagen vieja del repo (`featured`).
 *
 * @param {D1Database} db
 * @param {{ ownerId: number, oldImageId: number, newImageId: number }} input
 * @param {{ actor: string, now?: number }} ctx
 * @returns {Promise<FixResult & { before?: number, after?: number }>}
 */
export async function swapCover(db, { ownerId, oldImageId, newImageId }, { actor, now }) {
	const changed = {
		ok: /** @type {const} */ (false),
		status: 409,
		message: 'La portada cambió mientras tanto. Recargá la página para ver cómo quedó.'
	};
	const [owner, images, edge] = await Promise.all([
		getObject(db, { id: ownerId }, ADMIN_VIEWER),
		db
			.prepare(
				`SELECT id, json_extract(data, '$.key') AS key, json_extract(data, '$.size') AS size
				FROM objects WHERE id IN (?1, ?2) AND type = 'imagen' AND deleted_at IS NULL`
			)
			.bind(oldImageId, newImageId)
			.all(),
		db
			.prepare(`SELECT to_id FROM edges WHERE from_id = ?1 AND kind = 'portada' LIMIT 1`)
			.bind(ownerId)
			.first()
	]);
	if (!owner || (owner.type !== 'evento' && owner.type !== 'material')) {
		return { ok: false, status: 404, message: 'Esa publicación ya no existe.' };
	}
	const byId = new Map(images.results.map((r) => [Number(r.id), r]));
	const before = byId.get(oldImageId);
	const after = byId.get(newImageId);
	if (!before || !after || oldImageId === newImageId) {
		return { ok: false, status: 400, message: 'No encontramos la imagen nueva. Probá de nuevo.' };
	}
	if (Number(after.size) >= Number(before.size)) {
		return { ok: false, status: 400, message: 'La copia no pesa menos que la original.' };
	}
	if (edge) {
		if (Number(edge.to_id) !== oldImageId) return changed;
	} else {
		// Una portada vieja del repo: tiene que ser todavía esa imagen.
		const category = owner.type === 'evento' ? 'calendario' : 'material';
		const refs = (await legacyCoverRefs()).filter((r) => r.id === ownerId && r.type === owner.type);
		const key =
			refs[0]?.key ?? mediaKeyOf(legacyCoverURL(category, owner.slug, owner.data.featured));
		if (key !== String(before.key)) return changed;
	}
	const data = { ...owner.data };
	const hadFeatured = 'featured' in data;
	delete data.featured;
	try {
		await saveObject(
			db,
			{
				id: owner.id,
				type: owner.type,
				version: owner.version,
				...(hadFeatured ? { data } : {}),
				edges: { portada: [newImageId] }
			},
			{ actor, now, also: (self) => [panelRevisionStatement(db, self, 'panel')] }
		);
	} catch (e) {
		if (e instanceof VersionConflictError) return changed;
		throw e;
	}
	return {
		ok: true,
		title: owner.title,
		id: owner.id,
		before: Number(before.size),
		after: Number(after.size)
	};
}

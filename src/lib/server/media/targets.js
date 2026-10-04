/**
 * A qué objeto se refiere el editor cuando pide las imágenes «De este evento» o guarda una imagen
 * elegida: `evento:<dirección>`, `material:<dirección>` (la dirección de la página, vieja o del
 * objeto), `etiqueta:<nombre>` (una serie) o `perfil:<dirección>`.
 */
import { resolveContentSlug } from '$lib/server/contenido/posts.js';
import { IMAGE_USES } from './library.js';

const CATEGORY_OF = /** @type {const} */ ({ evento: 'calendario', material: 'material' });

/**
 * `"evento:mi-fiesta"` → `{ type: 'evento', slug: 'mi-fiesta' }`, o null.
 * @param {unknown} value
 */
export function parseTarget(value) {
	const m = /^([a-z]+):(.{1,200})$/s.exec(String(value ?? ''));
	if (!m || !Object.hasOwn(IMAGE_USES, m[1])) return null;
	return { type: /** @type {keyof typeof IMAGE_USES} */ (m[1]), slug: m[2] };
}

/**
 * El id del objeto (vivo o no: la visibilidad la mira quien lo usa), o null.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ type: string, slug: string }} target
 * @returns {Promise<number | null>}
 */
export async function targetObjectId(db, target) {
	if (target.type === 'evento' || target.type === 'material') {
		const ref = await resolveContentSlug(db, CATEGORY_OF[target.type], target.slug);
		return ref?.id ?? null;
	}
	const row =
		target.type === 'etiqueta'
			? await db
					.prepare(
						`SELECT id FROM objects WHERE type = 'etiqueta' AND deleted_at IS NULL
						AND json_extract(data, '$.key') = ?1 LIMIT 1`
					)
					.bind(target.slug)
					.first()
			: await db
					.prepare('SELECT id FROM objects WHERE type = ?1 AND slug = ?2')
					.bind(target.type, target.slug)
					.first();
	return row ? Number(row.id) : null;
}

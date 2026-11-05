/**
 * El carrusel de la portada del lado del servidor (docs/estilo.md, «Carrusel de la portada»):
 *
 * - **El modo** de Ajustes › Carrusel de la portada («Rotar» o un estilo fijo): en
 *   `ticket_settings` (la tabla clave → valor de los ajustes del panel, migración 0002), fila
 *   {@link CARRUSEL_SETTING}. Sin tabla nueva ni migración. Sin fila, «Rotar». La portada lo lee
 *   una vez cada {@link CARRUSEL_CACHE_MS} por isolate (como los interruptores).
 * - **Las diapositivas**: los eventos de `carruselPosts`, cada uno con su estilo
 *   (`estilosDelCarrusel`) y los colores guardados de su flyer (`colors` del objeto `imagen`;
 *   $lib/utils/flyerColors.js). Una consulta para los colores de las 5 imágenes, nada más: los
 *   colores se calcularon al subir la imagen, no acá.
 *
 * Sin imports de SvelteKit (vitest).
 */
import { getDB, logDBError } from './db/index.js';
import { IMAGE_TYPE } from './media/library.js';
import { carruselPosts } from '../utils/carrusel.js';
import { carruselModo, estilosDelCarrusel } from '../utils/carruselEstilos.js';
import { parseColors } from '../utils/flyerColors.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../utils/carruselEstilos.js').CarruselModo} CarruselModo */
/** @typedef {import('../utils/carruselEstilos.js').CarruselEstilo} CarruselEstilo */

/** La fila de `ticket_settings` con el modo del carrusel. */
export const CARRUSEL_SETTING = 'carrusel_estilo';

/** Cuánto recuerda la portada el modo leído (ms). */
export const CARRUSEL_CACHE_MS = 30_000;

/**
 * El modo guardado, con quién y cuándo lo cambió. Sin base, sin fila o si algo falla: «Rotar».
 * @param {D1Database | null} db
 * @returns {Promise<{ modo: CarruselModo, updatedAt: number | null, updatedBy: string | null }>}
 */
export async function readCarruselModo(db) {
	const none = { modo: carruselModo(null), updatedAt: null, updatedBy: null };
	if (!db) return none;
	try {
		const row = await db
			.prepare('SELECT value, updated_at, updated_by FROM ticket_settings WHERE key = ?1')
			.bind(CARRUSEL_SETTING)
			.first();
		if (!row) return none;
		return {
			modo: carruselModo(row.value),
			updatedAt: Number(row.updated_at) || null,
			updatedBy: row.updated_by ? String(row.updated_by) : null
		};
	} catch (error) {
		logDBError('modo del carrusel', error);
		return none;
	}
}

/**
 * Guarda el modo («rotar» o un estilo).
 * @param {D1Database} db
 * @param {CarruselModo} modo
 * @param {{ by: string, now?: number }} ctx
 */
export async function saveCarruselModo(db, modo, { by, now = Date.now() }) {
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
				updated_by = excluded.updated_by`
		)
		.bind(CARRUSEL_SETTING, carruselModo(modo), now, by)
		.run();
	cached = null;
}

/** @type {{ db: D1Database, expires: number, modo: CarruselModo } | null} */
let cached = null;

/** Para las pruebas: olvidar lo leído. */
export function resetCarruselCache() {
	cached = null;
}

/**
 * El modo, recordado {@link CARRUSEL_CACHE_MS} por isolate (para la portada).
 * @param {D1Database | null} db
 * @param {number} [now]
 * @returns {Promise<CarruselModo>}
 */
export async function carruselModoCached(db, now = Date.now()) {
	if (!db) return carruselModo(null);
	if (cached && cached.db === db && cached.expires > now) return cached.modo;
	const { modo } = await readCarruselModo(db);
	cached = { db, expires: now + CARRUSEL_CACHE_MS, modo };
	return modo;
}

/** `/media/img/<hash>.<ext>` → `<hash>` (el slug de la imagen), o `null`. */
const LIBRARY_IMAGE = /^\/media\/img\/([0-9a-f]{64})\.(?:webp|jpg|png|gif|avif)$/;

/**
 * Los colores guardados de las imágenes de la biblioteca, por dirección (`featured`). Una
 * consulta; las que no son de la biblioteca o no tienen colores no están.
 * @param {D1Database | null} db
 * @param {readonly unknown[]} featured
 * @returns {Promise<Map<string, string[]>>}
 */
export async function colorsByFeatured(db, featured) {
	/** @type {Map<string, string>} hash → dirección */
	const bySlug = new Map();
	for (const f of featured) {
		const m = typeof f === 'string' ? LIBRARY_IMAGE.exec(f) : null;
		if (m) bySlug.set(m[1], /** @type {string} */ (f));
	}
	/** @type {Map<string, string[]>} */
	const out = new Map();
	if (!db || !bySlug.size) return out;
	const slugs = [...bySlug.keys()];
	try {
		const { results } = await db
			.prepare(
				`SELECT slug, json_extract(data, '$.colors') AS colors FROM objects
				WHERE type = ?1 AND deleted_at IS NULL AND slug IN (${slugs.map((_, i) => `?${i + 2}`).join(', ')})`
			)
			.bind(IMAGE_TYPE, ...slugs)
			.all();
		for (const r of results) {
			const colors = parseColors(r.colors);
			const path = bySlug.get(String(r.slug));
			if (colors && path) out.set(path, colors);
		}
	} catch (error) {
		logDBError('colores del carrusel', error);
	}
	return out;
}

/**
 * @template {{ path: string, meta: Record<string, any> }} P
 * @typedef {P & { estilo: CarruselEstilo, colors: string[] | null }} CarruselSlide
 */

/**
 * Las diapositivas del carrusel: los eventos que entran (`carruselPosts`), cada uno con su estilo
 * y los colores de su flyer (o `null`: la paleta de la marca).
 *
 * @template {{ path: string, meta: Record<string, any> }} P
 * @param {App.Platform | undefined} platform
 * @param {readonly P[]} posts
 * @param {{ modo?: CarruselModo | null, now?: number }} [opts] `modo`: para probar uno sin
 *   guardarlo (solo en desarrollo, `?carrousel=`)
 * @returns {Promise<CarruselSlide<P>[]>}
 */
export async function carruselSlides(platform, posts, { modo = null, now = Date.now() } = {}) {
	const chosen = carruselPosts(posts, { now });
	if (!chosen.length) return [];
	const db = getDB(platform);
	const [saved, colors] = await Promise.all([
		modo ? Promise.resolve(modo) : carruselModoCached(db, now),
		colorsByFeatured(
			db,
			chosen.map((p) => p.meta.featured)
		)
	]);
	const estilos = estilosDelCarrusel(chosen, saved);
	return chosen.map((p, i) => ({
		...p,
		estilo: estilos[i],
		colors: colors.get(p.meta.featured) ?? null
	}));
}

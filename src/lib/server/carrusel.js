/**
 * El carrusel de la portada del lado del servidor (docs/estilo.md, «Carrusel de la portada»):
 *
 * - **Los ajustes** de Ajustes › Carrusel de la portada: el modo («Rotar» o un estilo fijo), de
 *   cuántos días para atrás es «nuevo» y cuántas diapositivas como mucho. En `ticket_settings` (la
 *   tabla clave → valor de los ajustes del panel, migración 0002), una fila cada uno
 *   ({@link CARRUSEL_SETTING}, {@link CARRUSEL_DIAS_SETTING}, {@link CARRUSEL_MAXIMO_SETTING}).
 *   Sin tabla nueva ni migración. Sin filas: «Rotar», 14 días y 8. La portada los lee (una
 *   consulta) una vez cada {@link CARRUSEL_CACHE_MS} por isolate (como los interruptores).
 * - **Las diapositivas**: lo que elige `carruselPosts` (eventos y lo nuevo de material, perfiles y
 *   la Kinkipedia), cada una con su estilo (`estilosDelCarrusel`) y los colores guardados de su
 *   imagen (`colors` del objeto `imagen`; $lib/utils/flyerColors.js; con ellos el componente elige
 *   la paleta de la marca: $lib/utils/carruselPaletas.js). Una consulta para los colores de esas
 *   imágenes, nada más: los colores se calcularon al subir la imagen, no acá.
 *
 * Sin imports de SvelteKit (vitest).
 */
import { getDB, logDBError } from './db/index.js';
import { IMAGE_TYPE } from './media/library.js';
import {
	CARRUSEL_DIAS,
	CARRUSEL_DIAS_RANGO,
	CARRUSEL_MAXIMO,
	CARRUSEL_MAXIMO_RANGO,
	carruselPosts,
	enRango
} from '../utils/carrusel.js';
import { carruselModo, estilosDelCarrusel } from '../utils/carruselEstilos.js';
import { parseColors } from '../utils/flyerColors.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../utils/carruselEstilos.js').CarruselModo} CarruselModo */
/** @typedef {import('../utils/carruselEstilos.js').CarruselEstilo} CarruselEstilo */
/**
 * @typedef {{ modo: CarruselModo, dias: number, maximo: number, updatedAt: number | null,
 *   updatedBy: string | null }} CarruselAjustes `updatedAt`/`updatedBy`: el último cambio de los tres
 */

/** Las filas de `ticket_settings` del carrusel. */
export const CARRUSEL_SETTING = 'carrusel_estilo';
export const CARRUSEL_DIAS_SETTING = 'carrusel_dias';
export const CARRUSEL_MAXIMO_SETTING = 'carrusel_maximo';
const KEYS = [CARRUSEL_SETTING, CARRUSEL_DIAS_SETTING, CARRUSEL_MAXIMO_SETTING];

/** Cuánto recuerda la portada los ajustes leídos (ms). */
export const CARRUSEL_CACHE_MS = 30_000;

/** @returns {CarruselAjustes} */
const porDefecto = () => ({
	modo: carruselModo(null),
	dias: CARRUSEL_DIAS,
	maximo: CARRUSEL_MAXIMO,
	updatedAt: null,
	updatedBy: null
});

/**
 * Los ajustes guardados (una consulta), con quién y cuándo cambió el último. Sin base, sin filas o
 * si algo falla: los de por defecto.
 * @param {D1Database | null} db
 * @returns {Promise<CarruselAjustes>}
 */
export async function readCarruselAjustes(db) {
	const out = porDefecto();
	if (!db) return out;
	try {
		const { results } = await db
			.prepare(
				'SELECT key, value, updated_at, updated_by FROM ticket_settings WHERE key IN (?1, ?2, ?3)'
			)
			.bind(...KEYS)
			.all();
		for (const row of results) {
			if (row.key === CARRUSEL_SETTING) out.modo = carruselModo(row.value);
			if (row.key === CARRUSEL_DIAS_SETTING)
				out.dias = enRango(row.value, CARRUSEL_DIAS_RANGO, CARRUSEL_DIAS);
			if (row.key === CARRUSEL_MAXIMO_SETTING)
				out.maximo = enRango(row.value, CARRUSEL_MAXIMO_RANGO, CARRUSEL_MAXIMO);
			const at = Number(row.updated_at) || 0;
			if (at > (out.updatedAt ?? 0)) {
				out.updatedAt = at;
				out.updatedBy = row.updated_by ? String(row.updated_by) : null;
			}
		}
		return out;
	} catch (error) {
		logDBError('ajustes del carrusel', error);
		return porDefecto();
	}
}

/**
 * @param {D1Database} db
 * @param {[string, string][]} pairs
 * @param {{ by: string, now: number }} ctx
 */
async function saveRows(db, pairs, { by, now }) {
	await db.batch(
		pairs.map(([key, value]) =>
			db
				.prepare(
					`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
					ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
						updated_by = excluded.updated_by`
				)
				.bind(key, value, now, by)
		)
	);
	cached = null;
}

/**
 * Guarda el modo («rotar» o un estilo).
 * @param {D1Database} db
 * @param {CarruselModo} modo
 * @param {{ by: string, now?: number }} ctx
 */
export async function saveCarruselModo(db, modo, { by, now = Date.now() }) {
	await saveRows(db, [[CARRUSEL_SETTING, carruselModo(modo)]], { by, now });
}

/**
 * Guarda de cuántos días para atrás es «nuevo» y cuántas diapositivas como mucho (dentro de sus
 * rangos).
 * @param {D1Database} db
 * @param {{ dias: number, maximo: number }} values
 * @param {{ by: string, now?: number }} ctx
 */
export async function saveCarruselCantidad(db, { dias, maximo }, { by, now = Date.now() }) {
	await saveRows(
		db,
		[
			[CARRUSEL_DIAS_SETTING, String(enRango(dias, CARRUSEL_DIAS_RANGO, CARRUSEL_DIAS))],
			[CARRUSEL_MAXIMO_SETTING, String(enRango(maximo, CARRUSEL_MAXIMO_RANGO, CARRUSEL_MAXIMO))]
		],
		{ by, now }
	);
}

/** @type {{ db: D1Database, expires: number, ajustes: CarruselAjustes } | null} */
let cached = null;

/** Para las pruebas: olvidar lo leído. */
export function resetCarruselCache() {
	cached = null;
}

/**
 * Los ajustes, recordados {@link CARRUSEL_CACHE_MS} por isolate (para la portada).
 * @param {D1Database | null} db
 * @param {number} [now]
 * @returns {Promise<CarruselAjustes>}
 */
export async function carruselAjustesCached(db, now = Date.now()) {
	if (!db) return porDefecto();
	if (cached && cached.db === db && cached.expires > now) return cached.ajustes;
	const ajustes = await readCarruselAjustes(db);
	cached = { db, expires: now + CARRUSEL_CACHE_MS, ajustes };
	return ajustes;
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

/** El diseño de lo que no es un evento: como su vista previa al compartir. */
export const FICHA = 'ficha';

/**
 * @template {{ path: string, meta: Record<string, any> }} P
 * @typedef {P & { estilo: CarruselEstilo | 'ficha', colors: string[] | null }} CarruselSlide
 */

/**
 * Las diapositivas del carrusel: lo que entra (`carruselPosts`), cada una con su estilo
 * y los colores de su flyer (o `null`: las paletas de la marca rotan).
 *
 * @template {{ path: string, meta: Record<string, any> }} P
 * @param {App.Platform | undefined} platform
 * @param {readonly P[]} posts
 * @param {{ modo?: CarruselModo | null, ajustes?: CarruselAjustes | null, now?: number }} [opts]
 *   `modo`: para probar uno sin guardarlo (solo en desarrollo, `?carrousel=`); `ajustes`: los ya
 *   leídos (el panel los lee sin caché); sin ellos, los de la caché
 * @returns {Promise<CarruselSlide<P>[]>}
 */
export async function carruselSlides(
	platform,
	posts,
	{ modo = null, ajustes = null, now = Date.now() } = {}
) {
	const db = getDB(platform);
	const a = ajustes ?? (await carruselAjustesCached(db, now));
	const chosen = carruselPosts(posts, { now, dias: a.dias, limit: a.maximo });
	if (!chosen.length) return [];
	// Los cinco estilos son para los eventos (sus flyers y su fecha); lo nuevo va siempre como su
	// vista previa al compartir: `ficha` (src/lib/server/carruselFicha.js), sin los colores de su
	// imagen.
	const events = chosen.filter((p) => p.meta?.category === 'calendario');
	const colors = await colorsByFeatured(
		db,
		events.map((p) => p.meta.featured)
	);
	const estilos = estilosDelCarrusel(events, modo ?? a.modo);
	return chosen.map((p) => ({
		...p,
		estilo: p.meta?.category === 'calendario' ? estilos[events.indexOf(p)] : FICHA,
		colors: (p.meta?.category === 'calendario' && colors.get(p.meta.featured)) || null
	}));
}

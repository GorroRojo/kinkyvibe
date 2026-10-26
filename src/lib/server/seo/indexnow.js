/**
 * IndexNow (docs/seo.md): cada 15 minutos (el cron de recordatorios) avisa a Bing y a los demás
 * motores que lo usan qué páginas públicas cambiaron, en vez de esperar a que las vuelvan a rastrear.
 *
 * - **Apagado sin la clave**: sin el secret `INDEXNOW_KEY` (o con una clave inválida) no hace nada.
 *   Tampoco fuera de producción (solo con el origen https://kinkyvibe.ar: los Previews no avisan).
 * - **Privacidad**: de la base salen solo candidatos (objetos que cambiaron hace poco). Se mandan
 *   únicamente los que además están en la lista pública del sitemap: publicaciones listadas y
 *   públicas (`sitePosts`, que ya aplica la visibilidad, las partes de taller ocultas y los perfiles
 *   no listados), sin las que redirigen a otro sitio, las páginas de la Kinkipedia y las de las
 *   series con ediciones públicas (`sitemapWikiPosts`, el grupo «wiki» del sitemap). Algo que se
 *   ocultó, se borró o es solo para miembres no está en esa lista, así que nunca se avisa.
 * - **Series**: si cambia una edición pública, también se avisa la página de su serie
 *   (`/wiki/<serie>`, {@link eventSeriesPaths}), solo si está en esa misma lista.
 * - La clave es pública por diseño de IndexNow (se sirve en {@link INDEXNOW_KEY_PATH}); va como
 *   secret para que no esté en el repo.
 */
import { SITE_URL } from '$lib/utils/site.js';
import { tagSlug } from '$lib/utils/tagSlug.js';
import { tagPagePath } from '$lib/utils/series.js';

/** Adonde se avisa (lo reparte a todos los motores que usan IndexNow). */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
/** Dónde se sirve la clave (src/routes/indexnow-key.txt/+server.js). */
export const INDEXNOW_KEY_PATH = '/indexnow-key.txt';
/**
 * Cuánto para atrás mira cada corrida. El cron corre cada 15 minutos; con 30, una corrida que falle
 * no pierde nada (repetir una URL no hace daño).
 */
export const INDEXNOW_WINDOW_MS = 30 * 60 * 1000;
/** Tope de URLs por aviso (IndexNow acepta hasta 10.000). */
export const INDEXNOW_MAX_URLS = 1000;

/** Los tipos de objeto con página pública y el prefijo de su dirección. */
const PREFIXES = /** @type {const} */ ({
	evento: ['/calendario/'],
	material: ['/material/'],
	perfil: ['/amigues/'],
	etiqueta: ['/wiki/']
});

/**
 * Una clave válida para IndexNow: de 8 a 128 letras, números o guiones.
 * @param {unknown} key
 * @returns {key is string}
 */
export const isValidIndexNowKey = (key) =>
	typeof key === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(key);

/**
 * Las direcciones que el sitemap publica (las mismas reglas que src/routes/(content)/sitemap.xml).
 * @param {ProcessedPost[]} posts los de `sitePosts`
 * @param {ProcessedPost[]} wikiPosts los de `siteWikiPosts`
 * @returns {Set<string>}
 */
export function publicPaths(posts, wikiPosts) {
	return new Set([
		...posts.filter((p) => !p.meta.redirect).map((p) => p.path),
		...wikiPosts.map((p) => p.path)
	]);
}

/**
 * Las direcciones posibles de un objeto (por su slug y su slug viejo). Son solo candidatas: las que
 * no estén en {@link publicPaths} se descartan.
 * @param {{ type: unknown, slug: unknown, legacy_slug?: unknown }} row
 * @returns {string[]}
 */
export function candidatePaths(row) {
	const prefixes = PREFIXES[/** @type {keyof typeof PREFIXES} */ (String(row.type))];
	if (!prefixes) return [];
	const slugs = [row.slug, row.legacy_slug].filter((s) => typeof s === 'string' && s !== '');
	return prefixes.flatMap((prefix) =>
		/** @type {string[]} */ (slugs).flatMap((s) =>
			prefix === '/wiki/'
				? [...new Set([prefix + s, prefix + tagSlug(s), tagPagePath(s)])]
				: [prefix + s]
		)
	);
}

/**
 * Las páginas de serie de cada evento público: dirección del evento → `/wiki/<serie>` de cada
 * serie que lleva. Sale de la lista pública (`posts`), así que un evento oculto no tiene ninguna.
 * @param {readonly { path?: string, meta?: Record<string, any> }[]} posts los de `sitePosts`
 * @param {readonly string[]} seriesIds ids de las etiquetas de serie (`seriesTagIds`)
 * @returns {Map<string, string[]>}
 */
export function eventSeriesPaths(posts, seriesIds) {
	const ids = new Set(seriesIds);
	/** @type {Map<string, string[]>} */
	const out = new Map();
	if (!ids.size) return out;
	for (const p of posts) {
		if (p.meta?.category !== 'calendario' || !p.path) continue;
		const tags = Array.isArray(p.meta.tags) ? p.meta.tags : [];
		const paths = tags.filter((tag) => ids.has(tag)).map(tagPagePath);
		if (paths.length) out.set(p.path, paths);
	}
	return out;
}

/**
 * Las URLs absolutas a avisar: candidatas (y las páginas de serie de los eventos, `series`) que
 * además están en la lista pública, sin repetir.
 * @param {Array<{ type: unknown, slug: unknown, legacy_slug?: unknown }>} rows
 * @param {Set<string>} visible {@link publicPaths}
 * @param {Map<string, string[]>} [series] {@link eventSeriesPaths}
 * @returns {string[]}
 */
export function indexNowUrls(rows, visible, series = new Map()) {
	const urls = new Set();
	for (const row of rows) {
		for (const path of candidatePaths(row)) {
			for (const p of [path, ...(series.get(path) ?? [])]) {
				if (visible.has(p)) urls.add(SITE_URL + p);
			}
		}
	}
	return [...urls].slice(0, INDEXNOW_MAX_URLS);
}

/**
 * Los objetos con página que cambiaron desde `since` (todavía sin filtrar por la lista pública).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {number} since ms
 */
export async function recentlyChanged(db, since) {
	const types = Object.keys(PREFIXES);
	const { results } = await db
		.prepare(
			`SELECT o.type, o.slug, coalesce(s.legacy_slug, ps.legacy_slug) AS legacy_slug
			FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id
			LEFT JOIN profile_sources ps ON ps.profile_id = o.id
			WHERE o.updated_at > ? AND o.deleted_at IS NULL AND o.visibility = 'public'
				AND o.type IN (${types.map(() => '?').join(', ')})`
		)
		.bind(since, ...types)
		.all();
	return /** @type {Array<{ type: string, slug: string, legacy_slug: string | null }>} */ (
		results ?? []
	);
}

/**
 * Una corrida: avisa lo que cambió en la ventana. Nunca tira (lo que falle queda en el resultado).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   key: string | undefined,
 *   origin: string,
 *   fetch: typeof fetch,
 *   lists: () => Promise<{ posts: ProcessedPost[], wikiPosts: ProcessedPost[], seriesIds?: string[] }>,
 *   now?: number
 * }} opts `lists`: las listas públicas, pedidas solo si algo cambió (`wikiPosts`: el grupo «wiki»
 *   del sitemap, con las páginas de las series; `seriesIds`: las etiquetas de serie)
 * @returns {Promise<{ skipped: string } | { sent: number, status?: number, error?: string }>}
 */
export async function runIndexNow({ db, key, origin, fetch, lists, now = Date.now() }) {
	if (!isValidIndexNowKey(key)) return { skipped: 'sin INDEXNOW_KEY' };
	if (origin !== SITE_URL) return { skipped: 'no es producción' };
	try {
		const rows = await recentlyChanged(db, now - INDEXNOW_WINDOW_MS);
		if (!rows.length) return { sent: 0 };
		const { posts, wikiPosts, seriesIds = [] } = await lists();
		const urlList = indexNowUrls(
			rows,
			publicPaths(posts, wikiPosts),
			eventSeriesPaths(posts, seriesIds)
		);
		if (!urlList.length) return { sent: 0 };
		const res = await fetch(INDEXNOW_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify({
				host: new URL(SITE_URL).host,
				key,
				keyLocation: SITE_URL + INDEXNOW_KEY_PATH,
				urlList
			})
		});
		// 200 y 202 son «recibido»; lo demás queda en el log del cron.
		return res.ok ? { sent: urlList.length, status: res.status } : { sent: 0, status: res.status };
	} catch (error) {
		return { sent: 0, error: error instanceof Error ? error.message : String(error) };
	}
}

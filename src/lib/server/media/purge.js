/**
 * Purga automática de la caché del borde de Cloudflare para los archivos de `/media` que dejan de
 * servirse (docs/imagenes.md, «Borrar»).
 *
 * El worker del adapter guarda cada respuesta 200 de `/media` en `caches.default` (por URL), así
 * que una imagen sacada de la biblioteca o la foto de un perfil oculto se seguiría sirviendo donde
 * ya estaba guardada. Cada respuesta de `/media` lleva `Cache-Tag` ({@link mediaCacheTag}: la misma
 * etiqueta para el original y sus copias chicas) y, cuando algo deja de servirse, se le pide a la
 * API de Cloudflare que purgue esa etiqueta en todos los centros de datos. Además se purga la URL
 * del original: es lo que, según la documentación de Cloudflare Images, saca también sus variantes
 * `/cdn-cgi/image/…`.
 *
 * Necesita dos valores del entorno, que se cargan en el panel de Cloudflare (nunca en el repo):
 * - `CLOUDFLARE_PURGE_TOKEN` (secreto): un token de API con solo el permiso Zone › Cache Purge de
 *   la zona del sitio;
 * - `CLOUDFLARE_ZONE_ID` (variable): el id de esa zona.
 * Sin alguno de los dos no hace nada (lo dice una vez en los registros) y la purga sigue siendo a
 * mano, como antes. Nunca frena ni hace fallar lo que hizo la persona: corre en `waitUntil` y un
 * error solo queda en los registros.
 */
import { SITE_URL, siteOriginFrom } from '../../utils/site.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La API de Cloudflare (sin la barra final). */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/** Cuántas etiquetas o URLs van en un pedido (la API acepta hasta 100; vamos con margen). */
export const PURGE_CHUNK = 30;

/** Una clave de `/media`: `img/<hash>.<ext>`, `img/<hash>-360.webp` o `file/<hash>.<ext>`. */
const MEDIA_KEY_PARTS = /^(img|file)\/([0-9a-f]{64})(?:-(?:360|720))?\.[a-z0-9]+$/;

/**
 * La etiqueta de caché de un archivo de `/media`: `img-<hash>` para una imagen y sus copias
 * chicas, `file-<hash>` para un documento o video; `null` si la clave no es de la biblioteca.
 * @param {string} key
 * @returns {string | null}
 */
export function mediaCacheTag(key) {
	const m = MEDIA_KEY_PARTS.exec(String(key));
	return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * @typedef {{ CLOUDFLARE_PURGE_TOKEN?: string, CLOUDFLARE_ZONE_ID?: string, SITE_URL?: string }}
 *   PurgeEnv
 */

/** @param {PurgeEnv | undefined} env */
function purgeConfig(env) {
	const token = String(env?.CLOUDFLARE_PURGE_TOKEN ?? '').trim();
	const zone = String(env?.CLOUDFLARE_ZONE_ID ?? '').trim();
	return token && zone ? { token, zone } : null;
}

/**
 * ¿Está configurada la purga automática? Para no consultar la base (qué foto tenía un perfil) si
 * de todos modos no se va a purgar nada.
 * @param {PurgeEnv | undefined} env
 */
export function mediaPurgeEnabled(env) {
	if (purgeConfig(env)) return true;
	warnMissing();
	return false;
}

let warnedMissing = false;

/** Sin configuración: lo dice una sola vez por instancia del Worker. */
function warnMissing() {
	if (warnedMissing) return;
	warnedMissing = true;
	console.warn(
		'[media-purge] Sin CLOUDFLARE_PURGE_TOKEN o CLOUDFLARE_ZONE_ID: la caché del borde no se ' +
			'purga sola (docs/imagenes.md, «Borrar»).'
	);
}

/** @param {Record<string, unknown>} fields */
function logLine(fields) {
	console.error(JSON.stringify({ area: 'media-purge', ...fields }));
}

/**
 * Purga de la caché del borde de Cloudflare los archivos de `/media` con estas claves (y sus
 * copias chicas): un pedido por etiquetas y otro por las URLs de los originales.
 *
 * Sin configuración, no hace nada (y lo dice una vez). Nunca tira: un error queda en los
 * registros. Devuelve qué pidió, para probarla.
 *
 * @param {PurgeEnv | undefined} env
 * @param {Iterable<string>} keys claves de `/media` (`img/<hash>.<ext>`, `file/<hash>.<ext>`)
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<{ tags: string[], files: string[] } | null>} `null` si no hizo nada
 */
export async function purgeMediaCache(env, keys, { fetch: fetchFn = globalThis.fetch } = {}) {
	const config = purgeConfig(env);
	if (!config) {
		warnMissing();
		return null;
	}
	const origin = siteOriginFrom(env?.SITE_URL, SITE_URL);
	const tags = new Set();
	const files = new Set();
	for (const key of keys) {
		const tag = mediaCacheTag(key);
		if (!tag) continue;
		tags.add(tag);
		files.add(`${origin}/media/${key}`);
	}
	if (!tags.size) return null;
	const sent = { tags: [...tags], files: [...files] };
	const url = `${CLOUDFLARE_API}/zones/${encodeURIComponent(config.zone)}/purge_cache`;
	for (const [field, values] of /** @type {const} */ ([
		['tags', sent.tags],
		['files', sent.files]
	])) {
		for (let i = 0; i < values.length; i += PURGE_CHUNK) {
			const chunk = values.slice(i, i + PURGE_CHUNK);
			try {
				const res = await fetchFn(url, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${config.token}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ [field]: chunk })
				});
				/** @type {any} */
				const body = await res.json().catch(() => null);
				if (!res.ok || !body?.success) {
					logLine({
						status: res.status,
						field,
						count: chunk.length,
						errors: (body?.errors ?? []).map((/** @type {any} */ e) =>
							`${e?.code ?? ''} ${e?.message ?? ''}`.trim()
						)
					});
				}
			} catch (e) {
				logLine({
					field,
					count: chunk.length,
					message: String(/** @type {any} */ (e)?.message ?? e)
				});
			}
		}
	}
	return sent;
}

/**
 * Purga en segundo plano (`waitUntil`): lo que hizo la persona no la espera ni se entera si falla.
 * Sin `waitUntil` (vite dev, pruebas) la deja corriendo sola; nunca tira.
 *
 * @param {App.Platform | undefined} platform
 * @param {Iterable<string>} keys
 */
export function schedulePurge(platform, keys) {
	const list = [...keys];
	if (!list.length) return;
	const task = purgeMediaCache(platform?.env, list).catch(() => null);
	try {
		platform?.ctx?.waitUntil(task);
	} catch {
		// Sin contexto: la promesa sigue igual.
	}
}

/**
 * Las claves de las fotos (edge `avatar`) de estos perfiles, borrados o no.
 * @param {D1Database} db
 * @param {number[]} profileIds
 * @returns {Promise<string[]>}
 */
export async function avatarKeys(db, profileIds) {
	const ids = profileIds.filter((id) => Number.isSafeInteger(id) && id > 0);
	if (!ids.length) return [];
	const { results } = await db
		.prepare(
			`SELECT DISTINCT json_extract(i.data, '$.key') AS key FROM edges e
			JOIN objects i ON i.id = e.to_id AND i.type = 'imagen'
			WHERE e.kind = 'avatar' AND e.from_id IN (${ids.map(() => '?').join(', ')})`
		)
		.bind(...ids)
		.all();
	return results.map((r) => String(r.key ?? '')).filter(Boolean);
}

/**
 * Las claves de las fotos de todos los perfiles que gestiona una cuenta (para cuando se borra).
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<string[]>}
 */
export async function accountAvatarKeys(db, accountId) {
	const { results } = await db
		.prepare('SELECT profile_id FROM profile_managers WHERE account_id = ?1')
		.bind(accountId)
		.all();
	return avatarKeys(
		db,
		results.map((r) => Number(r.profile_id))
	);
}

/**
 * Programa la purga de las fotos de estos perfiles, si la purga está configurada. Nunca tira.
 * @param {App.Platform | undefined} platform
 * @param {D1Database} db
 * @param {number[]} profileIds
 */
export async function purgeProfileAvatars(platform, db, profileIds) {
	if (!mediaPurgeEnabled(platform?.env)) return;
	try {
		schedulePurge(platform, await avatarKeys(db, profileIds));
	} catch (e) {
		logLine({ step: 'avatars', message: String(/** @type {any} */ (e)?.message ?? e) });
	}
}

/**
 * @typedef {{ keys: string[], visibility: string }} AvatarSnapshot
 */

/**
 * Antes de guardar un perfil: su foto y su visibilidad, para {@link purgeAfterProfileSave}.
 * `null` si la purga no está configurada (así no se consulta nada). Nunca tira.
 * @param {App.Platform | undefined} platform
 * @param {D1Database} db
 * @param {{ id: number, visibility: string }} profile
 * @returns {Promise<AvatarSnapshot | null>}
 */
export async function avatarSnapshot(platform, db, profile) {
	if (!mediaPurgeEnabled(platform?.env)) return null;
	try {
		return { keys: await avatarKeys(db, [profile.id]), visibility: profile.visibility };
	} catch (e) {
		logLine({ step: 'snapshot', message: String(/** @type {any} */ (e)?.message ?? e) });
		return null;
	}
}

/**
 * Después de guardar un perfil: si dejó de ser público (oculto o solo con cuenta) o le cambiaron
 * la foto, la foto que tenía deja de servirse a cualquiera: se purga de la caché del borde.
 * @param {App.Platform | undefined} platform
 * @param {AvatarSnapshot | null} before
 * @param {{ visibility: string }} saved
 * @param {boolean} avatarChanged
 */
export function purgeAfterProfileSave(platform, before, saved, avatarChanged) {
	if (!before?.keys.length) return;
	const hidden = before.visibility === 'public' && saved.visibility !== 'public';
	if (hidden || avatarChanged) schedulePurge(platform, before.keys);
}

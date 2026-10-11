/**
 * Copias de eventos reales para el modo demo (docs/demo.md, «Copias de producción»).
 *
 * «Recargar datos de prueba» suma, a los eventos inventados de siempre, copias de los eventos que
 * cualquiera ve en el sitio público. **Decidido por gorrite**: la fuente es SOLO el sitio público
 * (`GET https://kinkyvibe.ar/api/posts`, la lista que usa el propio sitio), nunca la base de
 * producción. Así se copia solo lo que ve cualquier visita:
 * - eventos publicados y listados (la API no trae borradores, ocultos ni no listados);
 * - la privacidad del lugar ya aplicada (la API devuelve el «Dónde» que se ve en la página);
 * - nada de compradores, cuentas, entradas vendidas ni respuestas.
 *
 * De cada evento se copia una lista cerrada de campos (`COPIED_FIELDS`): título, resumen,
 * etiquetas, quiénes organizan (nombres o perfiles públicos), estado, fechas, «Dónde» y la imagen.
 * Nunca la configuración de entradas, el link de acción (suele ser el formulario de entradas de
 * verdad) ni las personas con rol: una copia no vende, no manda mails y no crea cuentas.
 *
 * Las copias se marcan en todos lados: dirección `demo-copia-…`, título con «(copia de
 * producción)», `extra.copia_de_produccion` con el link al original y un aviso al principio del
 * texto. La imagen queda apuntando a la del sitio público (`https://kinkyvibe.ar/media/img/…`): el
 * preview no tiene esos archivos en su R2 ni sus objetos `imagen`, y una URL absoluta se ve tal
 * cual en el calendario y en la página del evento.
 *
 * Si el sitio no responde (sin red, error, JSON raro) o no hay eventos que sirvan, no hay copias:
 * quedan solo los inventados. Nunca hace fallar la recarga.
 *
 * Solo imports relativos o de paquetes (corre en el Worker y en las pruebas sin Vite).
 */
import { stringify } from 'yaml';
import { isMediaPath, isPublicMediaUrl } from '../../utils/media.js';

/** El sitio público del que se copian los eventos (solo GET). */
export const PUBLIC_SITE = 'https://kinkyvibe.ar';
/** La lista pública de publicaciones (la misma que usa el sitio para el buscador y el calendario). */
export const PUBLIC_POSTS_PATH = '/api/posts';
/** Cuántas copias como mucho por recarga. */
export const REAL_EVENTS_MAX = 12;
/** Cuánto se espera al sitio público antes de seguir sin copias. */
export const FETCH_TIMEOUT_MS = 8000;
/** Prefijo de la dirección y del lugar (`demo_slot`) de cada copia. */
export const COPY_SLUG_PREFIX = 'demo-copia-';
export const COPY_SLOT_PREFIX = 'copia-';
/** Lo que se suma al título de cada copia. */
export const COPY_TITLE_SUFFIX = ' (copia de producción)';
/** Clave de `extra` con el link al evento original (la marca de una copia). */
export const COPY_MARK_KEY = 'copia_de_produccion';
/** Marca en el frontmatter de cada copia (como `EVENT_MARKER` en los inventados). */
export const COPY_MARKER =
	'# copia de un evento público de kinkyvibe.ar (datos de prueba del modo demo)';

/** Los únicos campos de la metadata pública que se copian. */
export const COPIED_FIELDS = Object.freeze([
	'summary',
	'tags',
	'authors',
	'status',
	'start',
	'end',
	'location',
	'location_name',
	'published_date'
]);

const STATUSES = new Set(['anunciado', 'abierto', 'agotadas', 'cancelado']);
const SLUG_MAX = 100;

/**
 * @typedef {{ meta?: Record<string, unknown>, path?: string }} PublicPost
 * @typedef {{ slot: string, slug: string, markdown: string, venueId: null, original: string }} CopyInput
 * @typedef {{ source: string, copied: number, fallback: string | null, inputs: CopyInput[] }} CopyResult
 */

/** @param {unknown} v */
const text = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * La dirección pública del evento (`postID`, o el final de `path`), o null si no sirve.
 * @param {PublicPost} post
 */
function originalSlug(post) {
	const id = text(post.meta?.postID) || text(post.path).split('/').filter(Boolean).pop() || '';
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : null;
}

/** @param {unknown} v */
function instant(v) {
	const ms = Date.parse(text(v));
	return Number.isFinite(ms) ? ms : null;
}

/**
 * Los eventos públicos que sirven para copiar, en orden: primero los que vienen (el más cercano
 * primero; uno que está pasando cuenta como que viene) y, si no alcanzan, los últimos que pasaron.
 * Fuera: lo que no es del calendario, sin título o fecha válida, con «ir directo al link» (la
 * página solo redirige) y cualquier `demo-*`.
 *
 * @param {unknown} posts lo que devolvió `/api/posts`
 * @param {{ now: number, max?: number }} opts
 * @returns {PublicPost[]}
 */
export function pickRealEvents(posts, { now, max = REAL_EVENTS_MAX }) {
	if (!Array.isArray(posts)) return [];
	/** @type {{ post: PublicPost, start: number, end: number }[]} */
	const usable = [];
	const seen = new Set();
	for (const post of posts) {
		const meta = post?.meta;
		if (!meta || typeof meta !== 'object') continue;
		if (meta.category !== 'calendario' || meta.redirect === true) continue;
		const slug = originalSlug(post);
		if (!slug || slug.startsWith('demo-') || seen.has(slug) || !text(meta.title)) continue;
		const start = instant(meta.start);
		if (start === null) continue;
		const end = instant(meta.end) ?? start;
		seen.add(slug);
		usable.push({ post, start, end: Math.max(end, start) });
	}
	const upcoming = usable.filter((e) => e.end >= now).sort((a, b) => a.start - b.start);
	const past = usable.filter((e) => e.end < now).sort((a, b) => b.start - a.start);
	return [...upcoming, ...past].slice(0, Math.max(0, max)).map((e) => e.post);
}

/**
 * La imagen del evento como URL absoluta del sitio público, o null. Solo imágenes de su biblioteca
 * (la API las da como `/media/img/<hash>.webp`), que el sitio muestra tal cual con
 * `isPublicMediaUrl` (src/lib/utils/media.js). Las imágenes viejas del repo (archivos del bundle)
 * no se copian: la copia queda sin imagen, como un evento sin portada.
 *
 * @param {unknown} featured
 */
export function publicImageUrl(featured) {
	const value = text(featured);
	if (isPublicMediaUrl(value)) return value;
	return isMediaPath(value) ? `${PUBLIC_SITE}${value}` : null;
}

/**
 * Un evento público como entrada del seed (`DemoEventInput` de ./seedEvents.js): la metadata
 * copiada campo por campo, con sus marcas.
 *
 * @param {PublicPost} post
 * @param {{ origin?: string }} [opts]
 * @returns {CopyInput | null}
 */
export function realEventInput(post, { origin = PUBLIC_SITE } = {}) {
	const meta = post?.meta;
	const slug = originalSlug(post);
	if (!meta || !slug) return null;
	const title = text(meta.title);
	if (!title || instant(meta.start) === null) return null;
	const original = `${origin}/calendario/${slug}`;
	const copySlug = (COPY_SLUG_PREFIX + slug).slice(0, SLUG_MAX).replace(/-+$/, '');

	/** @type {Record<string, unknown>} */
	const fm = {
		title: `${title.slice(0, 200 - COPY_TITLE_SUFFIX.length)}${COPY_TITLE_SUFFIX}`,
		layout: 'calendario',
		category: 'calendario'
	};
	for (const key of COPIED_FIELDS) {
		const value = meta[key];
		if (key === 'tags' || key === 'authors') {
			const list = Array.isArray(value) ? value.map(text).filter(Boolean) : [];
			if (list.length) fm[key] = list.slice(0, 30);
		} else if (key === 'status') {
			if (STATUSES.has(text(value))) fm.status = text(value);
		} else if (text(value)) {
			fm[key] = text(value).slice(0, key === 'summary' ? 1000 : 500);
		}
	}
	const image = publicImageUrl(meta.featured);
	if (image) fm.featured = image;
	fm[COPY_MARK_KEY] = original;

	const body =
		`> **📋 Copia de producción (datos de prueba del modo demo).** Este evento existe en ` +
		`kinkyvibe.ar y se copió con lo que muestra el sitio público, sin entradas ni inscripción. ` +
		`El original: [${original}](${original}).\n\n${text(meta.summary)}\n`;
	const markdown = `---\n${COPY_MARKER}\n${stringify(fm, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`;
	return { slot: COPY_SLOT_PREFIX + slug, slug: copySlug, markdown, venueId: null, original };
}

/**
 * Trae los eventos públicos y los arma como copias. Nunca tira: si algo falla, devuelve cero
 * copias y el motivo en `fallback` (y la recarga sigue con los inventados).
 *
 * @param {typeof fetch | null | undefined} fetchImpl sin fetch (pruebas, informe de impacto
 *   visual), no hay copias
 * @param {{ now: number, origin?: string, max?: number, timeoutMs?: number }} opts
 * @returns {Promise<CopyResult>}
 */
export async function loadRealEventCopies(
	fetchImpl,
	{ now, origin = PUBLIC_SITE, max = REAL_EVENTS_MAX, timeoutMs = FETCH_TIMEOUT_MS }
) {
	const source = origin + PUBLIC_POSTS_PATH;
	/** @param {string} fallback */
	const none = (fallback) => ({ source, copied: 0, fallback, inputs: [] });
	if (typeof fetchImpl !== 'function') return none('sin red: solo eventos inventados');
	let posts;
	try {
		const res = await fetchImpl(source, {
			method: 'GET',
			headers: { accept: 'application/json' },
			redirect: 'error',
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!res.ok) return none(`el sitio público respondió ${res.status}`);
		posts = await res.json();
	} catch (e) {
		return none(`no se pudo leer el sitio público: ${/** @type {Error} */ (e)?.message ?? e}`);
	}
	if (!Array.isArray(posts)) return none('el sitio público no devolvió una lista');
	const inputs = /** @type {CopyInput[]} */ (
		pickRealEvents(posts, { now, max })
			.map((p) => realEventInput(p, { origin }))
			.filter(Boolean)
	);
	if (!inputs.length) return none('el sitio público no tiene eventos que sirvan');
	return { source, copied: inputs.length, fallback: null, inputs };
}

/**
 * Escritura de las analíticas anónimas en Workers Analytics Engine (binding `ANALYTICS`, ver
 * wrangler.toml y docs/analiticas.md). Sin el binding (dev, tests, Previews) todo es un no-op.
 *
 * Cada punto tiene siempre la misma forma (las columnas del dataset):
 *
 * | columna | qué                                                               |
 * | ------- | ----------------------------------------------------------------- |
 * | index1  | el tipo (`view` o `funnel`)                                       |
 * | blob1   | el tipo (`view` o `funnel`), para filtrar                         |
 * | blob2   | ruta normalizada (solo visitas)                                   |
 * | blob3   | dominio de origen, '' = directo o interno (solo visitas)          |
 * | blob4   | país de Cloudflare, dos letras (solo visitas)                     |
 * | blob5   | `phone` / `tablet` / `desktop` (solo visitas)                     |
 * | blob6   | slug del evento, si es de un evento                               |
 * | blob7   | paso del embudo (`evento`, `abrio`, `datos`, `pagar`, `orden`, …) |
 * | blob8   | medio de pago (solo `orden` y `aprobada`)                         |
 * | double1 | 1                                                                 |
 *
 * Nunca: IP, User-Agent, cookies, cuenta, mail, id de orden ni nada que identifique a alguien.
 *
 * Solo imports relativos: worker/index.js lo importa sin pasar por Vite.
 */
import {
	countryCode,
	deviceClass,
	eventOfPath,
	isBot,
	isEventSlug,
	isTrackedPath,
	normalizePath,
	referrerHost
} from './classify.js';

/** Nombre del dataset de producción (el mismo de wrangler.toml; lo verifica un test). */
export const DATASET = 'kinkyvibe_visitas';
/** Nombre del binding en el Worker. */
export const BINDING = 'ANALYTICS';

/** Pasos del embudo de compra, en orden, con su nombre para el panel. */
export const FUNNEL_STEPS = Object.freeze([
	Object.freeze({ id: 'evento', label: 'Vieron el evento' }),
	Object.freeze({ id: 'abrio', label: 'Abrieron la compra' }),
	Object.freeze({ id: 'datos', label: 'Llegaron a «Tus datos»' }),
	Object.freeze({ id: 'pagar', label: 'Llegaron a «Pagar»' }),
	Object.freeze({ id: 'orden', label: 'Crearon la orden' }),
	Object.freeze({ id: 'aprobada', label: 'Pagaron' })
]);

/** Medios de pago que se anotan (cualquier otro queda como ''). */
const METHODS = new Set(['mercadopago', 'transferencia', 'gratis']);

/**
 * @typedef {{ indexes: string[], blobs: string[], doubles: number[] }} DataPoint
 * @typedef {{ writeDataPoint: (point: DataPoint) => void }} AnalyticsDataset
 */

/**
 * El binding, o `null` si no está (o si leerlo tira, como en las rutas prerenderizadas).
 *
 * @param {unknown} env
 * @returns {AnalyticsDataset | null}
 */
export function analyticsDataset(env) {
	try {
		const ds = /** @type {any} */ (env)?.[BINDING];
		return ds && typeof ds.writeDataPoint === 'function' ? ds : null;
	} catch {
		return null;
	}
}

/**
 * Escribe un punto. Nunca tira: las analíticas jamás rompen una página ni una compra.
 *
 * @param {unknown} env
 * @param {DataPoint | null} point
 * @returns {boolean} si se escribió
 */
export function writePoint(env, point) {
	if (!point) return false;
	const ds = analyticsDataset(env);
	if (!ds) return false;
	try {
		ds.writeDataPoint(point);
		return true;
	} catch (error) {
		console.error('[analiticas] no se pudo escribir el punto', error);
		return false;
	}
}

/**
 * @param {{ kind: 'view' | 'funnel', path?: string, ref?: string, country?: string,
 *   device?: string, slug?: string, step?: string, method?: string }} p
 * @returns {DataPoint}
 */
export function makePoint(p) {
	return {
		indexes: [p.kind],
		blobs: [
			p.kind,
			p.path ?? '',
			p.ref ?? '',
			p.country ?? '',
			p.device ?? '',
			p.slug ?? '',
			p.step ?? '',
			p.method ?? ''
		],
		doubles: [1]
	};
}

/**
 * El punto de una visita, o `null` si el pedido no cuenta. Cuenta:
 * - una página HTML pública que respondió 200 a un GET (no HEAD, no POST);
 * - una navegación de SvelteKit (`<página>/__data.json`, también 200), como visita de su página.
 *   No cuenta si la página de origen (Referer) es la misma: eso es una recarga de datos
 *   (`invalidate`, después de un formulario), no una visita nueva.
 * No cuenta bots, prefetch del navegador, el panel, la API ni las rutas con tokens.
 *
 * @param {Request} request
 * @param {Response} response
 * @returns {DataPoint | null}
 */
export function pageViewPoint(request, response) {
	if (request.method !== 'GET' || response.status !== 200) return null;
	const h = request.headers;
	if (isBot(h.get('user-agent'))) return null;
	const purpose = `${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''}`.toLowerCase();
	if (purpose.includes('prefetch') || purpose.includes('prerender')) return null;
	const url = new URL(request.url);
	const isData = url.pathname.endsWith('/__data.json');
	const path = normalizePath(url.pathname);
	if (!isTrackedPath(path)) return null;
	const referer = h.get('referer');
	let ref = '';
	if (isData) {
		// Navegación dentro del sitio: el Referer es la página de antes (mismo origen).
		if (!referer) return null;
		let from;
		try {
			from = new URL(referer);
		} catch {
			return null;
		}
		if (from.host !== url.host || normalizePath(from.pathname) === path) return null;
	} else {
		const type = response.headers.get('content-type') ?? '';
		if (!type.toLowerCase().startsWith('text/html')) return null;
		ref = referrerHost(referer, url.host);
	}
	const { slug, step } = eventOfPath(path);
	const cf = /** @type {any} */ (request).cf;
	return makePoint({
		kind: 'view',
		path,
		ref,
		country: countryCode(cf?.country),
		device: deviceClass(h.get('user-agent')),
		slug,
		step
	});
}

/**
 * Anota la visita (si cuenta). Para el `fetch` de worker/index.js: nunca tira.
 *
 * @param {Request} request
 * @param {Response} response
 * @param {unknown} env
 */
export function trackPageView(request, response, env) {
	if (!analyticsDataset(env)) return false;
	try {
		return writePoint(env, pageViewPoint(request, response));
	} catch (error) {
		console.error('[analiticas] visita', error);
		return false;
	}
}

/**
 * Un paso del embudo de compra de un evento (sin nada de la persona ni de la orden).
 *
 * @param {unknown} env el `platform.env` (o el env del Worker)
 * @param {{ slug: string, step: string, method?: string | null }} input
 */
export function trackFunnel(env, { slug: raw, step, method }) {
	// En minúsculas, como las rutas de las visitas (normalizePath).
	const slug = typeof raw === 'string' ? raw.toLowerCase() : '';
	if (!isEventSlug(slug) || !FUNNEL_STEPS.some((s) => s.id === step)) return false;
	const m = method && METHODS.has(method) ? method : '';
	return writePoint(env, makePoint({ kind: 'funnel', slug, step, method: m }));
}

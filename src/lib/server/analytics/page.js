/**
 * Las visitas de UNA página, para la tarjeta «Visitas» de las fichas del panel (evento, material,
 * perfil, Kinkipedia) y para Estadísticas › Visitas con `?pagina=` (docs/analiticas.md, «Visitas
 * de una página»).
 *
 * Una sola consulta a Analytics Engine por página (con la caché de 5 minutos de sql.js), solo por
 * las direcciones de esa página: la canónica y las otras con las que responde (la dirección vieja
 * de un .md importado, la forma con el nombre de la etiqueta). De esa consulta sale todo: las
 * visitas de los últimos 7 y 30 días, por día, de dónde llegan y, en un evento con entradas, los
 * pasos de la compra. Solo sumas: nada de personas.
 */
import { DATASET, FUNNEL_STEPS } from './track.js';
import { eventOfPath, isEventSlug, isTrackedPath, normalizePath } from './classify.js';
import { analyticsConfig, runSql, sqlDateTime } from './sql.js';
import { AR_OFFSET_HOURS, MAX_DAYS, argentineDay, dayStart, queryErrorMessage } from './report.js';

/** Dónde vive cada tipo de objeto en el sitio. */
export const PAGE_PREFIX = Object.freeze({
	evento: '/calendario/',
	material: '/material/',
	perfil: '/amigues/',
	wiki: '/wiki/'
});

/** Cuántas direcciones se consultan por página, como mucho. */
export const MAX_PATHS = 6;
/** Cuántos orígenes se muestran (el resto va junto en «Otros»). */
export const TOP_SOURCES = 4;
/** Días de la consulta: todo lo que guarda Analytics Engine (para el embudo). */
export const PAGE_DAYS = MAX_DAYS;

/**
 * Solo letras, números y lo que deja `encodeURIComponent` sin comilla: la dirección va dentro de
 * una cadena del SQL, así que una con `'` (u otra cosa rara) no se consulta.
 */
const SAFE_PATH = /^\/[a-z0-9_.~%/-]*$/;

/**
 * La dirección como la anota el contador de visitas (normalizePath sobre el pathname, que el
 * navegador manda con `%xx`), o `null` si no se puede consultar (no se cuenta, o tiene algo raro).
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function safePagePath(raw) {
	if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
	const path = normalizePath(raw);
	if (!SAFE_PATH.test(path) || !isTrackedPath(path)) return null;
	return path;
}

/**
 * Las direcciones públicas de un objeto: la de cada slug con el que responde (sin repetir, en el
 * orden dado; la primera es la canónica).
 *
 * @param {keyof typeof PAGE_PREFIX} kind
 * @param {Iterable<string | null | undefined>} slugs
 * @returns {string[]}
 */
export function pagePaths(kind, slugs) {
	const prefix = PAGE_PREFIX[kind];
	if (!prefix) throw new Error(`tipo de página inválido: ${kind}`);
	/** @type {string[]} */
	const out = [];
	for (const slug of slugs) {
		if (typeof slug !== 'string' || !slug.trim()) continue;
		const path = safePagePath(prefix + encodeURIComponent(slug.trim()));
		if (path && !out.includes(path)) out.push(path);
		if (out.length >= MAX_PATHS) break;
	}
	return out;
}

/**
 * El slug de evento de cada dirección `/calendario/<slug>` (para los pasos de la compra, que se
 * anotan por slug).
 *
 * @param {readonly string[]} paths
 */
export function eventSlugsOf(paths) {
	return [
		...new Set(
			paths
				.map((p) => eventOfPath(p))
				.filter((e) => e.step === 'evento' && isEventSlug(e.slug))
				.map((e) => e.slug)
		)
	];
}

/**
 * El link a Estadísticas › Visitas filtrado a una página.
 * @param {string} path
 */
export function pageStatsHref(path) {
	return `/admin/estadisticas/visitas?pagina=${encodeURIComponent(path)}`;
}

/**
 * La consulta: visitas a esas direcciones y, si se pasan slugs de evento, todo lo de ese evento
 * (su página de compra y los pasos que manda el navegador o el checkout), por tipo, dirección,
 * origen, paso y día de Argentina.
 *
 * @param {{ paths: readonly string[], eventSlugs?: readonly string[], from: Date }} o
 */
export function pageVisitsSql({ paths, eventSlugs = [], from }) {
	const safe = paths.filter((p) => safePagePath(p) === p);
	const slugs = eventSlugs.filter((s) => isEventSlug(s));
	const match = [...safe.map((p) => `blob2 = '${p}'`), ...slugs.map((s) => `blob6 = '${s}'`)];
	if (!match.length) throw new Error('sin direcciones para consultar');
	return `SELECT blob1 AS kind, blob2 AS path, blob3 AS source, blob7 AS step, toStartOfInterval(timestamp - INTERVAL '${AR_OFFSET_HOURS}' HOUR, INTERVAL '1' DAY) AS day, SUM(_sample_interval) AS n
FROM ${DATASET}
WHERE timestamp >= toDateTime('${sqlDateTime(from)}') AND (${match.join(' OR ')})
GROUP BY kind, path, source, step, day
ORDER BY day DESC LIMIT 10000`;
}

/**
 * @typedef {{ evento: number, abrio: number, datos: number, pagar: number, orden: number,
 *   aprobada: number }} PageFunnel
 * @typedef {{
 *   status: 'ok' | 'unconfigured' | 'error' | 'nopath',
 *   message: string,
 *   path: string,
 *   paths: string[],
 *   statsHref: string,
 *   week: number,
 *   month: number,
 *   daily: { day: string, label: string, views: number }[],
 *   sources: { key: string, label: string, n: number, share: number }[],
 *   funnel: PageFunnel | null,
 *   funnelDays: number
 * }} PageVisits
 */

/** @param {unknown} v */
const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.round(n) : 0;
};
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Arma la tarjeta con las filas de {@link pageVisitsSql}.
 *
 * @param {Record<string, unknown>[]} rows
 * @param {{ paths: readonly string[], now: Date, funnel: boolean }} o
 * @returns {Pick<PageVisits, 'week' | 'month' | 'daily' | 'sources' | 'funnel'>}
 */
export function buildPageVisits(rows, { paths, now, funnel }) {
	const own = new Set(paths);
	const first30 = argentineDay(dayStart(now, -29));
	const first7 = argentineDay(dayStart(now, -6));
	/** @type {Map<string, number>} */
	const byDay = new Map();
	/** @type {Map<string, number>} */
	const bySource = new Map();
	/** @type {Record<string, number>} */
	const steps = Object.fromEntries(FUNNEL_STEPS.map((s) => [s.id, 0]));
	for (const r of rows) {
		const n = num(r.n);
		if (n <= 0) continue;
		const kind = str(r.kind);
		const day = str(r.day).slice(0, 10);
		const step = str(r.step);
		if (kind === 'view') {
			if (step === 'abrio') steps.abrio += n;
			if (!own.has(str(r.path))) continue;
			if (step === 'evento') steps.evento += n;
			if (day < first30) continue;
			byDay.set(day, (byDay.get(day) ?? 0) + n);
			const source = str(r.source);
			bySource.set(source, (bySource.get(source) ?? 0) + n);
		} else if (kind === 'funnel' && step in steps && step !== 'evento' && step !== 'abrio') {
			steps[step] += n;
		}
	}
	const daily = [];
	for (let i = 29; i >= 0; i--) {
		const day = argentineDay(dayStart(now, -i));
		daily.push({
			day,
			label: `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`,
			views: byDay.get(day) ?? 0
		});
	}
	const month = daily.reduce((s, d) => s + d.views, 0);
	const week = daily.filter((d) => d.day >= first7).reduce((s, d) => s + d.views, 0);
	const ranked = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
	const top = ranked.slice(0, TOP_SOURCES);
	const rest = ranked.slice(TOP_SOURCES).reduce((s, [, n]) => s + n, 0);
	const sources = [
		...top.map(([key, n]) => ({ key, label: key || 'Directo o desde el mismo sitio', n })),
		...(rest ? [{ key: '*', label: 'Otros', n: rest }] : [])
	].map((s) => ({ ...s, share: month ? s.n / month : 0 }));
	return {
		week,
		month,
		daily,
		sources,
		funnel: funnel
			? /** @type {PageFunnel} */ (
					Object.fromEntries(FUNNEL_STEPS.map((s) => [s.id, steps[s.id] ?? 0]))
				)
			: null
	};
}

/**
 * Las visitas de una página para el panel. **Nunca tira**: sin configuración, sin direcciones o si
 * Cloudflare falla, devuelve el estado con un mensaje corto.
 *
 * @param {{
 *   env: Record<string, unknown>,
 *   paths: readonly string[],
 *   tickets?: boolean,
 *   now?: Date,
 *   fetch?: typeof fetch
 * }} input `paths`: de {@link pagePaths} (la primera es la canónica); `tickets`: un evento que
 *   vende entradas (suma los pasos de la compra).
 * @returns {Promise<PageVisits>}
 */
export async function loadPageVisits({ env, paths, tickets = false, now = new Date(), fetch }) {
	const safe = paths.filter((p) => safePagePath(p) === p).slice(0, MAX_PATHS);
	const path = safe[0] ?? '';
	/** @type {PageVisits} */
	const out = {
		status: 'ok',
		message: '',
		path,
		paths: safe,
		statsHref: path ? pageStatsHref(path) : '',
		week: 0,
		month: 0,
		daily: [],
		sources: [],
		funnel: null,
		funnelDays: PAGE_DAYS
	};
	if (!path) return { ...out, status: 'nopath', message: 'Esta página no cuenta visitas.' };
	const config = analyticsConfig(env);
	if (!config.ok) {
		return {
			...out,
			status: 'unconfigured',
			message: 'Las visitas todavía no se pueden leer desde el panel (falta configurarlas).'
		};
	}
	try {
		const eventSlugs = tickets ? eventSlugsOf(safe) : [];
		const rows = await runSql(
			config,
			pageVisitsSql({ paths: safe, eventSlugs, from: dayStart(now, -(PAGE_DAYS - 1)) }),
			{ fetch, now: now.getTime() }
		);
		return { ...out, ...buildPageVisits(rows, { paths: safe, now, funnel: tickets }) };
	} catch (error) {
		console.error('[analiticas] visitas de una página', error);
		return { ...out, status: 'error', message: queryErrorMessage(error) };
	}
}

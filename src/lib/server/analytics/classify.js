/**
 * Analíticas anónimas (docs/analiticas.md): funciones puras que deciden si un pedido cuenta como
 * visita y lo reducen a datos que no identifican a nadie. Nunca guardan la IP, el User-Agent
 * entero, cookies ni la cuenta: del User-Agent sale solo «bot o no» y «celu / tablet / compu»;
 * del Referer, solo el dominio; del pedido, la ruta sin query string.
 *
 * Solo imports relativos (o ninguno): worker/index.js lo importa sin pasar por Vite.
 */

/**
 * Bots y programas conocidos (lista conservadora: ante la duda, NO se cuenta). Un User-Agent
 * vacío también cuenta como bot.
 */
const BOT_RE =
	/bot\b|bot\/|crawl|spider|slurp|scrap|facebookexternalhit|facebookcatalog|meta-externalagent|embedly|preview|whatsapp|telegrambot|discordbot|skypeuripreview|slackbot|slack-imgproxy|twitterbot|linkedinbot|pinterestbot|vkshare|redditbot|curl|wget|python|httpx|aiohttp|go-http-client|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|feedfetcher|feedly|rss|yandex|baidu|duckduck|semrush|ahrefs|mj12|petalbot|bytespider|gptbot|chatgpt|oai-searchbot|claude|anthropic|perplexity|ccbot|applebot|google-inspectiontool|googleother|adsbot|mediapartners|bingpreview|cloudflare|validator|check_http/i;

/**
 * `true` si el User-Agent es de un bot, crawler, previsualizador de links o programa.
 *
 * @param {string | null | undefined} ua
 */
export function isBot(ua) {
	if (!ua || !ua.trim()) return true;
	return BOT_RE.test(ua);
}

/** @typedef {'phone' | 'tablet' | 'desktop'} DeviceClass */

/**
 * Tipo de dispositivo a partir del User-Agent. El iPad con iPadOS se presenta como una Mac, así
 * que cuenta como compu (no hay forma de saberlo sin JavaScript).
 *
 * @param {string | null | undefined} ua
 * @returns {DeviceClass}
 */
export function deviceClass(ua) {
	const s = ua ?? '';
	if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/i.test(s)) return 'tablet';
	if (/mobi|iphone|ipod|android|windows phone|blackberry|opera mini/i.test(s)) return 'phone';
	return 'desktop';
}

/** Largo máximo de una ruta guardada (las más largas se cortan). */
export const MAX_PATH = 120;

/**
 * Ruta normalizada: sin query string ni `#`, sin `/__data.json`, sin barra final, sin barras
 * repetidas, en minúsculas y cortada a {@link MAX_PATH}.
 *
 * @param {string} pathname
 */
export function normalizePath(pathname) {
	let p = String(pathname ?? '').split(/[?#]/)[0];
	p = p.replace(/\/__data\.json$/, '');
	p = p.replace(/\/{2,}/g, '/');
	if (!p.startsWith('/')) p = `/${p}`;
	if (p.length > 1) p = p.replace(/\/+$/, '');
	return (p || '/').toLowerCase().slice(0, MAX_PATH);
}

/**
 * Secciones que nunca se cuentan: el panel, la API, los login, el rincón de cada cuenta y las
 * rutas que llevan un token o un id privado en la URL (entradas, avisos, propinas).
 */
const EXCLUDED = [
	'/admin',
	'/edit',
	'/api',
	'/entradas',
	'/login',
	'/logout',
	'/callback',
	'/auch',
	'/ingresar',
	'/mi-rincon',
	'/errores',
	'/ics',
	'/_app',
	'/.well-known',
	'/avisos/confirmar',
	'/avisos/baja',
	'/avisos/sigo'
];
/** Secciones que se cuentan solo en su página principal (las de adentro llevan ids). */
const ONLY_ROOT = ['/propinas'];

/**
 * `true` si la ruta (ya normalizada) es una página pública que se puede contar.
 *
 * @param {string} path
 */
export function isTrackedPath(path) {
	const under = (/** @type {string} */ p) => path === p || path.startsWith(`${p}/`);
	if (EXCLUDED.some(under)) return false;
	if (ONLY_ROOT.some((p) => path.startsWith(`${p}/`))) return false;
	return true;
}

const EVENT_RE = /^\/calendario\/([a-z0-9][a-z0-9_-]{0,199})(\/[^/]+)?$/;

/**
 * El evento de una ruta normalizada (`/calendario/<slug>` y sus páginas), con el paso del
 * embudo que significa verla: `evento` (la página del evento) o `abrio` (la de compra).
 *
 * @param {string} path
 * @returns {{ slug: string, step: '' | 'evento' | 'abrio' }}
 */
export function eventOfPath(path) {
	const m = EVENT_RE.exec(path);
	if (!m) return { slug: '', step: '' };
	const sub = m[2] ?? '';
	return { slug: m[1], step: sub === '' ? 'evento' : sub === '/entradas' ? 'abrio' : '' };
}

/** `true` si es un slug de evento con forma válida (mismo formato que las rutas). */
export function isEventSlug(/** @type {unknown} */ slug) {
	return typeof slug === 'string' && /^[a-z0-9][a-z0-9_-]{0,199}$/.test(slug);
}

/**
 * Dominio de donde vino la visita (solo el host, sin `www.`), o '' si es directa, interna (el
 * mismo sitio) o no se entiende. Nunca guarda la ruta ni la query del Referer.
 *
 * @param {string | null | undefined} referer
 * @param {string} selfHost el host del pedido
 */
export function referrerHost(referer, selfHost) {
	if (!referer) return '';
	let url;
	try {
		url = new URL(referer);
	} catch {
		return '';
	}
	if (!['http:', 'https:', 'android-app:'].includes(url.protocol)) return '';
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const self = String(selfHost ?? '')
		.toLowerCase()
		.replace(/:\d+$/, '')
		.replace(/^www\./, '');
	if (!host || host === self) return '';
	if (!/^[a-z0-9.-]+$/.test(host)) return '';
	return host.slice(0, 100);
}

/**
 * Código de país de Cloudflare (`request.cf.country`, dos letras) o '' si no hay.
 *
 * @param {unknown} country
 */
export function countryCode(country) {
	return typeof country === 'string' && /^[A-Z0-9]{2}$/.test(country) ? country : '';
}

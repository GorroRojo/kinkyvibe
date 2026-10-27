/**
 * Un nombre corto y legible del navegador y el dispositivo a partir del user agent («Firefox en
 * Android», «Safari en iPhone»), para «Dónde tenés la sesión abierta» en Mi rincón
 * (docs/cuentas.md). De la sesión se guarda solo esto, nunca el user agent entero: alcanza para
 * reconocer el dispositivo y no sirve para identificar a nadie.
 */

/** El largo máximo que se guarda (el CHECK de `account_sessions.device`, migración 0066). */
export const DEVICE_LABEL_MAX = 60;

/** En orden: los que se hacen pasar por otro van antes (Edge y Opera dicen «Chrome»). */
const BROWSERS = /** @type {const} */ ([
	[/\bEdg(?:e|A|iOS)?\//, 'Edge'],
	[/\bOPR\/|\bOpera\b/, 'Opera'],
	[/\bSamsungBrowser\//, 'Samsung Internet'],
	[/\bFirefox\/|\bFxiOS\//, 'Firefox'],
	[/\bCriOS\/|\bChrome\//, 'Chrome'],
	[/\bVersion\/[\d.]+.*\bSafari\//, 'Safari']
]);

/** En orden: iPhone y iPad antes que Mac, Android antes que Linux. */
const SYSTEMS = /** @type {const} */ ([
	[/\biPhone\b/, 'iPhone'],
	[/\biPad\b/, 'iPad'],
	[/\bAndroid\b/, 'Android'],
	[/\bWindows\b/, 'Windows'],
	[/\bCrOS\b/, 'ChromeOS'],
	[/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
	[/\bLinux\b/, 'Linux']
]);

/**
 * @param {readonly (readonly [RegExp, string])[]} list
 * @param {string} ua
 */
const first = (list, ua) => list.find(([re]) => re.test(ua))?.[1] ?? null;

/**
 * «Firefox en Android», «Chrome en Windows», solo «Firefox» o solo «Android» si falta una parte,
 * o `null` si no se reconoce nada (o no hay user agent).
 *
 * @param {string | null | undefined} userAgent
 * @returns {string | null}
 */
export function deviceLabel(userAgent) {
	if (typeof userAgent !== 'string' || !userAgent) return null;
	const ua = userAgent.slice(0, 512);
	const browser = first(BROWSERS, ua);
	const system = first(SYSTEMS, ua);
	const label = browser && system ? `${browser} en ${system}` : (browser ?? system);
	return label ? label.slice(0, DEVICE_LABEL_MAX) : null;
}

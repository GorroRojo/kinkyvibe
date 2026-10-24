/**
 * Qué precarga SvelteKit en cada página (la opción `preload` de `resolve`, en hooks.server.js).
 * Lo de siempre (el JS y el CSS de la página) y, además, las dos Lato latin (400 y 700) del
 * `@font-face` de `src/lib/styles/style.scss`: casi todo el texto las usa, y sin precarga el
 * navegador recién las pide cuando ya llegó y leyó el CSS (más tiempo con la letra de reemplazo y
 * un salto al cambiar; `font-display` sigue en `swap`). Las latin-ext casi nunca hacen falta.
 *
 * Por qué así y no un `<link rel="preload">` en el `<svelte:head>` del layout: SvelteKit pone las
 * letras que deja pasar acá en la cabecera `Link` y en el `<head>` antes que los ~80
 * `modulepreload` del JS, con la misma URL con hash que el CSS. Desde `<svelte:head>` el preload
 * quedaba después de todo el JS, con su misma prioridad, y en Chrome las letras llegaban más tarde
 * que sin precarga (docs/estilo.md).
 */

/** Las dos Lato que se precargan (el nombre que les pone Vite: `<nombre>.<hash>.woff2`). */
export const PRELOADED_FONT = /\/lato-latin-(400|700)-normal\.[\w-]+\.woff2$/;

/**
 * @param {{ type: 'font' | 'css' | 'js' | 'asset', path: string }} file
 * @returns {boolean}
 */
export function preloadFile({ type, path }) {
	if (type === 'js' || type === 'css') return true;
	return type === 'font' && PRELOADED_FONT.test(path);
}

/** @typedef {Parameters<import('@sveltejs/kit').Handle>[0]['resolve']} Resolve */

/**
 * `resolve` con la precarga de arriba; respeta lo demás que se le pase.
 *
 * @param {Resolve} resolve
 * @returns {Resolve}
 */
export function withPreload(resolve) {
	return (event, opts) => resolve(event, { preload: preloadFile, ...opts });
}

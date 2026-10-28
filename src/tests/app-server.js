/**
 * `$app/server` en las pruebas (vitest; ver scripts/vite/app-server-tests.js): lo único que usa la
 * app de ese módulo, `getRequestEvent`, es la misma función de SvelteKit (de
 * `@sveltejs/kit/internal/server`, de donde la reexporta el `$app/server` de verdad), con el mismo
 * almacén del pedido. Fuera de un pedido tira igual que siempre.
 *
 * El `$app/server` de verdad carga además, para `read` y las funciones remotas, el manifiesto
 * generado y la raíz de la app (`.svelte-kit/generated/root.svelte`, con el runtime de Svelte del
 * navegador): segundos por archivo de pruebas, en todas las pruebas que tocan la base. Si la app
 * empieza a usar otra cosa de `$app/server`, sumala acá: si falta, NO falla al importar (llega
 * `undefined`), falla recién al usarla («… is not a function»).
 */
// @ts-ignore -- es interno de SvelteKit y no tiene tipos propios (los que valen son los de `$app/server`).
export { getRequestEvent } from '@sveltejs/kit/internal/server';

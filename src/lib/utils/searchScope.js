/**
 * Qué cubre el buscador del sitio, con las palabras de gorrite (3/11): las secciones de verdad del
 * sitio. UNA sola fuente para los textos que lo dicen; está aparte de searchSyntax.js para que el
 * buscador lo importe sin bajar el registro entero (que baja recién al abrir «¿Cómo buscar?").
 *
 * Dónde se usa (docs/buscar.md, «Dónde vive cada texto de la guía»):
 * - el placeholder y la línea de la paleta vacía de $lib/components/SearchPalette.svelte;
 * - «buscalo en todo el sitio» de la Kinkipedia sin resultados ($routes/(content)/wiki/+page.svelte,
 *   sin la Kinkipedia, que es donde se está);
 * - el bot tiene su propia copia, porque sus textos se editan desde el panel («Textos del bot»):
 *   `inicio.ayuda` y `comandos.buscar` en $lib/utils/botTexts.js (searchGuide.test.js chequea que
 *   sus valores por defecto digan lo mismo). Si cambiás esto, cambiá esos también.
 */

/** Lo que se encuentra en el buscador del sitio y en el del bot. */
export const SEARCH_SCOPE = 'materiales, perfiles, eventos y la Kinkipedia';

/** Lo mismo, desde la Kinkipedia (ya se buscó ahí). */
export const SEARCH_SCOPE_BEYOND_WIKI = 'materiales, perfiles y eventos';

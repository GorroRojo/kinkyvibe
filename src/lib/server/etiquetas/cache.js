/**
 * Cache-Control de lo que antes se prerenderizaba en el build y ahora se arma en cada pedido
 * porque usa las etiquetas (/api/posts, /api/search-index.json): las etiquetas (y los eventos)
 * salen de la base, que no se puede leer en el build. Los .ics públicos usan `icsResponse`
 * ($lib/utils/icsFeed.js, `max-age=900`).
 * Unos minutos en el navegador y en la CDN: un cambio de etiquetas se ve enseguida en las páginas
 * y, a lo sumo en 5 minutos, también en estos archivos.
 */
export const TAGGED_CACHE = Object.freeze({
	'cache-control': 'public, max-age=300, s-maxage=300'
});

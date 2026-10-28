/**
 * Header `Server-Timing` en todas las respuestas del Worker (worker/index.js), para medir desde
 * afuera (curl, las herramientas del navegador) sin leer los registros:
 *
 * - `app;dur=<ms>`: lo que tardó el Worker en armar la respuesta. En Workers el reloj solo avanza
 *   con la entrada y salida (la base, la caché, fetch), así que es casi todo espera de la base: el
 *   tiempo de CPU puro (armar el HTML) no aparece acá.
 * - `iso;desc="n=<pedido> age=<s>"`: el número de pedido de este isolate (1 = recién arrancado, sin
 *   nada en memoria) y hace cuántos segundos atendió el primero. Sirve para separar las vueltas
 *   lentas de un isolate nuevo de las de uno que ya tiene las listas en memoria.
 *
 * - `d1;dur=<ms>;desc="<n> consultas en <k> idas"` (si el Worker la pasa): la parte de la base
 *   (src/lib/server/d1Timing.js).
 *
 * Solo tiempos y contadores: nada de la persona ni del contenido.
 */

/** Pedidos atendidos por este isolate. */
let served = 0;
/** Cuándo atendió el primero (0 = todavía ninguno). */
let firstAt = 0;

/** Para los tests. */
export function resetServerTiming() {
	served = 0;
	firstAt = 0;
}

/**
 * Empieza a medir un pedido. Devuelve la función que pone el header en la respuesta.
 * @param {() => number} [clock]
 * @returns {(response: Response, extra?: string) => Response}
 */
export function startServerTiming(clock = Date.now) {
	const start = clock();
	if (!firstAt) firstAt = start;
	served += 1;
	const n = served;
	const age = Math.max(0, Math.round((start - firstAt) / 1000));
	return (response, extra = '') => {
		const app = `app;dur=${Math.max(0, clock() - start)}`;
		const value = `${app}, ${extra ? `${extra}, ` : ''}iso;desc="n=${n} age=${age}s"`;
		try {
			response.headers.append('server-timing', value);
			return response;
		} catch {
			// Headers que no se pueden cambiar (una respuesta de fetch o de la caché): una copia.
			try {
				const copy = new Response(response.body, response);
				copy.headers.append('server-timing', value);
				return copy;
			} catch {
				return response;
			}
		}
	};
}

/**
 * Los cinco estilos del carrusel de la portada y cuál le toca a cada diapositiva (docs/estilo.md,
 * «Carrusel de la portada»).
 *
 * - **En Ajustes › Carrusel de la portada** se elige, para todo el carrusel, «Rotar» (por
 *   defecto: cada diapositiva con un estilo distinto, en orden A, B, C, D, E y de vuelta) o un
 *   estilo fijo. Se guarda en `ticket_settings` (`carrusel_estilo`; src/lib/server/carrusel.js).
 * - **En cada evento** (Editar → Datos, «Estilo en el carrusel») se puede elegir uno que manda
 *   sobre lo de Ajustes; sin elegir, el de Ajustes. Va en los datos del evento
 *   (`carrusel_estilo`, en `extra`, como los colores viejos del carrusel).
 *
 * Puro (sin Svelte ni base): lo usan la portada, el panel y vitest.
 */

/** @typedef {'a' | 'b' | 'c' | 'd' | 'e'} CarruselEstilo */
/** @typedef {CarruselEstilo | 'rotar'} CarruselModo */

/** Los estilos, en el orden en que rotan. */
export const CARRUSEL_ESTILOS = Object.freeze([
	{
		id: /** @type {CarruselEstilo} */ ('a'),
		nombre: 'Pila de flyers',
		texto: 'El flyer impreso y torcido, sobre otros papeles de colores.'
	},
	{
		id: /** @type {CarruselEstilo} */ ('b'),
		nombre: 'Franja cruzada',
		texto: 'Título grande, la fecha en una estrella y una franja que cruza la pantalla.'
	},
	{
		id: /** @type {CarruselEstilo} */ ('c'),
		nombre: 'Mesa de stickers',
		texto:
			'Fondo claro con dibujitos; el flyer como sticker y los demás como stickers chiquitos abajo.'
	},
	{
		id: /** @type {CarruselEstilo} */ ('d'),
		nombre: 'Diagonal',
		texto: 'Dos colores cortados en diagonal: el flyer en una mitad y el texto en la otra.'
	},
	{
		id: /** @type {CarruselEstilo} */ ('e'),
		nombre: 'Mesa de zines',
		texto: 'Copias del flyer tiradas de fondo y el título en tiras.'
	}
]);

/** El modo «Rotar»: cada diapositiva con el estilo siguiente. */
export const ROTAR = 'rotar';

/** Sin nada guardado: rotar. */
export const CARRUSEL_MODO_POR_DEFECTO = ROTAR;

/** La clave del estilo elegido en cada evento (en `extra`). */
export const EVENTO_ESTILO_KEY = 'carrusel_estilo';

const IDS = CARRUSEL_ESTILOS.map((e) => e.id);

/**
 * ¿Es uno de los cinco estilos?
 * @param {unknown} v
 * @returns {v is CarruselEstilo}
 */
export const isCarruselEstilo = (v) =>
	typeof v === 'string' && IDS.includes(/** @type {any} */ (v));

/**
 * El modo de todo el carrusel a partir de lo guardado: «rotar» o un estilo. Cualquier otra cosa
 * (nada guardado, un valor viejo), rotar.
 * @param {unknown} v
 * @returns {CarruselModo}
 */
export function carruselModo(v) {
	const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
	return isCarruselEstilo(s) ? s : ROTAR;
}

/**
 * El estilo elegido en un evento, o `null` (usa el de Ajustes).
 * @param {Record<string, any> | null | undefined} meta
 * @returns {CarruselEstilo | null}
 */
export function estiloDelEvento(meta) {
	const v = meta?.[EVENTO_ESTILO_KEY];
	const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
	return isCarruselEstilo(s) ? s : null;
}

/**
 * El estilo de la diapositiva `i`: el del evento si eligió uno; si no, el fijo de Ajustes; si
 * Ajustes dice «Rotar», el que le toca por su lugar (A, B, C, D, E, A…).
 * @param {CarruselModo} modo
 * @param {CarruselEstilo | null} delEvento
 * @param {number} i
 * @returns {CarruselEstilo}
 */
export function estiloDeDiapositiva(modo, delEvento, i) {
	if (delEvento) return delEvento;
	if (isCarruselEstilo(modo)) return modo;
	return IDS[((i % IDS.length) + IDS.length) % IDS.length];
}

/**
 * Los estilos de todas las diapositivas, en orden.
 * @param {readonly { meta: Record<string, any> }[]} posts
 * @param {unknown} modo lo guardado en Ajustes (se normaliza con {@link carruselModo})
 * @returns {CarruselEstilo[]}
 */
export function estilosDelCarrusel(posts, modo) {
	const m = carruselModo(modo);
	return posts.map((p, i) => estiloDeDiapositiva(m, estiloDelEvento(p.meta), i));
}

/**
 * El nombre de un estilo («Pila de flyers»), o el de «Rotar».
 * @param {string} id
 */
export function nombreDelEstilo(id) {
	if (id === ROTAR) return 'Rotar';
	return CARRUSEL_ESTILOS.find((e) => e.id === id)?.nombre ?? id;
}

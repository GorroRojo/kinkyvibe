/**
 * Qué eventos van en el carrusel de la portada (interruptor `carrusel_portada`; docs/estilo.md,
 * «Carrusel de la portada»). La regla, con lo que ya tienen los eventos (sin campos nuevos):
 *
 * - del calendario y que todavía no empezaron (como la fila «Talleres y eventos»);
 * - de Kinky Vibe (la etiqueta `KinkyVibe`, la misma que marca las tarjetas): lo propio va arriba;
 * - con imagen (el carrusel es la imagen grande; un evento sin imagen sigue en las filas);
 * - sin cancelar;
 * - por fecha, el más próximo primero, y como mucho {@link CARRUSEL_MAX}.
 *
 * Pura (sin Svelte): la usa la portada.
 */
import { parseSiteDate } from './dates.js';

/** Cuántos eventos entran en el carrusel, como mucho. */
export const CARRUSEL_MAX = 5;

/** @typedef {{ path: string, meta: Record<string, any> }} CarruselPost */

/** @param {Record<string, any>} meta */
const hasImage = (meta) => Boolean(meta?.featured) && meta.featured !== 'undefined';

/**
 * Los eventos del carrusel, en orden.
 *
 * @template {CarruselPost} P
 * @param {readonly P[]} posts los posts de la portada (se quedan los que cumplen la regla)
 * @param {{ now?: number, limit?: number }} [opts]
 * @returns {P[]}
 */
export function carruselPosts(posts, { now = Date.now(), limit = CARRUSEL_MAX } = {}) {
	return posts
		.filter(
			(p) =>
				p.meta?.category == 'calendario' &&
				Array.isArray(p.meta.tags) &&
				p.meta.tags.includes('KinkyVibe') &&
				hasImage(p.meta) &&
				p.meta.status !== 'cancelado' &&
				parseSiteDate(p.meta.start).getTime() > now
		)
		.sort((a, b) => parseSiteDate(a.meta.start).getTime() - parseSiteDate(b.meta.start).getTime())
		.slice(0, limit);
}

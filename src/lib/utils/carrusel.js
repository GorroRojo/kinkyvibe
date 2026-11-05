/**
 * Qué va en el carrusel de la portada (interruptor `carrusel_portada`; docs/estilo.md, «Carrusel de
 * la portada»). gorrite (5/11): «todo lo nuevo por ahora, de cualquier categoría de las 4».
 *
 * - **Eventos**: del calendario, de Kinky Vibe (la etiqueta `KinkyVibe`, la misma que marca las
 *   tarjetas), que todavía no empezaron y sin cancelar; con o sin imagen. Van primero, por fecha (el
 *   más próximo primero).
 * - **Lo nuevo**: material, perfiles de amigues y páginas de la Kinkipedia publicados en los
 *   últimos {@link CARRUSEL_DIAS} días (lo de Ajustes). La fecha de cada uno: `published_date` del
 *   material y de los perfiles; de la Kinkipedia, cuando se creó su etiqueta (`createdAt`: la
 *   página no tiene fecha de publicación propia). Solo lo que tiene página pública: las listas ya
 *   traen solo lo listado y visible; se saca el material que redirige directo a su link. Va
 *   después de los eventos, lo más nuevo primero, intercalando los tipos (uno de cada uno por
 *   vuelta) así uno no llena todo.
 * - Como mucho {@link CARRUSEL_MAXIMO} en total (lo de Ajustes).
 *
 * Pura (sin Svelte ni base): la usan la portada, el panel y vitest.
 */
import { parseSiteDate } from './dates.js';

/** Cuántas diapositivas, como mucho, sin nada en Ajustes. */
export const CARRUSEL_MAXIMO = 8;
/** De cuántos días para atrás es «nuevo», sin nada en Ajustes. */
export const CARRUSEL_DIAS = 14;
/** Lo que se puede elegir en Ajustes. */
export const CARRUSEL_MAXIMO_RANGO = Object.freeze({ min: 1, max: 12 });
export const CARRUSEL_DIAS_RANGO = Object.freeze({ min: 1, max: 60 });

const DAY = 86_400_000;

/** @typedef {{ path: string, meta: Record<string, any>, createdAt?: number }} CarruselPost */

/** Los tipos que no son eventos, con el nombre que les da el sitio (el menú, las tarjetas). */
export const CARRUSEL_TIPOS = Object.freeze({
	calendario: 'Evento',
	material: 'Material',
	amigues: 'Amigues',
	wiki: 'Kinkipedia'
});

/**
 * Un número de Ajustes dentro de su rango, o `fallback` si no es un entero (o no vino).
 * @param {unknown} v
 * @param {{ min: number, max: number }} rango
 * @param {number} fallback
 */
export function enRango(v, rango, fallback) {
	const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
	if (!Number.isInteger(n) || v === '' || v === null || v === undefined) return fallback;
	return Math.min(rango.max, Math.max(rango.min, n));
}

/** @param {CarruselPost} p */
const isEvent = (p) =>
	p.meta?.category == 'calendario' &&
	Array.isArray(p.meta.tags) &&
	p.meta.tags.includes('KinkyVibe') &&
	p.meta.status !== 'cancelado';

/**
 * Cuándo se publicó algo que no es un evento (ms), o `NaN`.
 * @param {CarruselPost} p
 */
export function publicadoEl(p) {
	if (p.meta?.category === 'wiki') return Number(p.createdAt ?? NaN);
	return p.meta?.published_date ? parseSiteDate(p.meta.published_date).getTime() : NaN;
}

/**
 * Lo que va en el carrusel, en orden.
 *
 * @template {CarruselPost} P
 * @param {readonly P[]} posts los posts de la portada (eventos, material y perfiles listados) y,
 *   si se quiere, las páginas de la Kinkipedia
 * @param {{ now?: number, limit?: number, dias?: number }} [opts]
 * @returns {P[]}
 */
export function carruselPosts(
	posts,
	{ now = Date.now(), limit = CARRUSEL_MAXIMO, dias = CARRUSEL_DIAS } = {}
) {
	const events = posts
		.filter((p) => isEvent(p) && parseSiteDate(p.meta.start).getTime() > now)
		.sort((a, b) => parseSiteDate(a.meta.start).getTime() - parseSiteDate(b.meta.start).getTime());
	const desde = now - dias * DAY;
	/** @type {Map<string, { p: P, t: number }[]>} */
	const porTipo = new Map();
	for (const p of posts) {
		const cat = p.meta?.category;
		if (cat !== 'material' && cat !== 'amigues' && cat !== 'wiki') continue;
		if (p.meta.redirect) continue;
		const t = publicadoEl(p);
		if (!(t >= desde && t <= now)) continue;
		if (!porTipo.has(cat)) porTipo.set(cat, []);
		/** @type {{ p: P, t: number }[]} */ (porTipo.get(cat)).push({ p, t });
	}
	// Cada tipo, lo más nuevo primero; los tipos, por su más nuevo; y de a uno por vuelta.
	const filas = [...porTipo.values()]
		.map((xs) => xs.sort((a, b) => b.t - a.t || (a.p.path < b.p.path ? -1 : 1)))
		.sort((a, b) => b[0].t - a[0].t);
	/** @type {P[]} */
	const rest = [];
	for (let i = 0; filas.some((f) => i < f.length); i++) {
		for (const f of filas) if (i < f.length) rest.push(f[i].p);
	}
	return [...events, ...rest].slice(0, Math.max(0, limit));
}

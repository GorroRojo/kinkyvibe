// Comparación de capturas y resumen del informe de impacto visual (docs/ui-impacto.md). Todo
// lo de acá es puro (sin archivos ni navegador), para poder probarlo: compare.test.js.
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * Estado de un par de capturas:
 * - `cambio`: las dos existen y difieren en más de `minPixels` píxeles (o de tamaño);
 * - `igual`: las dos existen y no difieren (o difieren en `minPixels` o menos);
 * - `nueva`: solo está en el cambio (la página no existía o falló en la base);
 * - `quitada`: solo está en la base;
 * - `error`: no se pudo sacar en ninguno de los dos lados.
 * @typedef {'cambio' | 'igual' | 'nueva' | 'quitada' | 'error'} Status
 */

/** Color de los píxeles distintos en la imagen de diferencias (magenta, se ve sobre todo). */
const DIFF_COLOR = /** @type {[number, number, number]} */ ([255, 0, 170]);

/**
 * Copia `img` (RGBA, `w`×`h`) en un lienzo de `W`×`H`; lo que sobra queda transparente.
 * @param {Uint8Array} data
 * @param {number} w
 * @param {number} h
 * @param {number} W
 * @param {number} H
 */
export function padRgba(data, w, h, W, H) {
	if (w === W && h === H) return data;
	const out = new Uint8Array(W * H * 4);
	for (let y = 0; y < h; y++) out.set(data.subarray(y * w * 4, (y + 1) * w * 4), y * W * 4);
	return out;
}

/**
 * Compara dos imágenes RGBA. Si tienen distinto tamaño, se comparan sobre el lienzo más grande
 * (lo que le falta a una cuenta como distinto).
 *
 * @param {{ data: Uint8Array, width: number, height: number }} a base
 * @param {{ data: Uint8Array, width: number, height: number }} b cambio
 * @param {{ threshold?: number }} [opts] sensibilidad por píxel de pixelmatch (0 a 1; 0.1 por
 *   defecto: ignora el suavizado de bordes y diferencias de color imperceptibles)
 * @returns {{ width: number, height: number, diffPixels: number, ratio: number, sizeChanged: boolean, diff: Uint8Array }}
 */
export function diffRgba(a, b, { threshold = 0.1 } = {}) {
	const width = Math.max(a.width, b.width);
	const height = Math.max(a.height, b.height);
	const A = padRgba(a.data, a.width, a.height, width, height);
	const B = padRgba(b.data, b.width, b.height, width, height);
	const diff = new Uint8Array(width * height * 4);
	const diffPixels = pixelmatch(A, B, diff, width, height, {
		threshold,
		alpha: 0.2,
		diffColor: DIFF_COLOR,
		diffColorAlt: DIFF_COLOR
	});
	const total = width * height;
	return {
		width,
		height,
		diffPixels,
		ratio: total ? diffPixels / total : 0,
		sizeChanged: a.width !== b.width || a.height !== b.height,
		diff
	};
}

/**
 * Lo mismo con PNG: devuelve también la imagen de diferencias como PNG.
 * @param {Buffer} pngA
 * @param {Buffer} pngB
 * @param {{ threshold?: number }} [opts]
 */
export function diffPng(pngA, pngB, opts) {
	const a = PNG.sync.read(pngA);
	const b = PNG.sync.read(pngB);
	const r = diffRgba(
		{ data: a.data, width: a.width, height: a.height },
		{ data: b.data, width: b.width, height: b.height },
		opts
	);
	const out = new PNG({ width: r.width, height: r.height });
	out.data = Buffer.from(r.diff.buffer, r.diff.byteOffset, r.diff.byteLength);
	return { ...r, diff: undefined, png: PNG.sync.write(out) };
}

/**
 * @param {{ hasBase: boolean, hasNew: boolean, diffPixels?: number | null, sizeChanged?: boolean, minPixels?: number }} p
 * @returns {Status}
 */
export function statusOf({
	hasBase,
	hasNew,
	diffPixels = null,
	sizeChanged = false,
	minPixels = 0
}) {
	if (!hasBase && !hasNew) return 'error';
	if (!hasBase) return 'nueva';
	if (!hasNew) return 'quitada';
	if (sizeChanged) return 'cambio';
	return (diffPixels ?? 0) > minPixels ? 'cambio' : 'igual';
}

/**
 * Una captura (una página en un tamaño de pantalla).
 * @typedef {{
 *   pageId: string,
 *   title: string,
 *   group?: string,
 *   path?: string | null,
 *   viewport: string,
 *   status: Status,
 *   diffPixels?: number | null,
 *   ratio?: number | null,
 *   sizes?: { base?: [number, number] | null, nuevo?: [number, number] | null },
 *   base?: string | null,
 *   nuevo?: string | null,
 *   diff?: string | null,
 *   errors?: { base?: string | null, nuevo?: string | null }
 * }} Shot
 */

/**
 * Una página con sus capturas, para el informe.
 * @typedef {{
 *   pageId: string,
 *   title: string,
 *   group?: string,
 *   path?: string | null,
 *   status: Status,
 *   maxRatio: number,
 *   shots: Shot[]
 * }} PageResult
 */

/** Orden de los estados en el informe: primero lo que hay que mirar. */
const STATUS_ORDER = /** @type {Record<Status, number>} */ ({
	cambio: 0,
	nueva: 1,
	quitada: 2,
	error: 3,
	igual: 4
});

/**
 * El estado de una página según los de sus capturas (el más «para mirar»).
 * @param {Status[]} statuses
 * @returns {Status}
 */
export function pageStatus(statuses) {
	if (!statuses.length) return 'error';
	return statuses.reduce((best, s) => (STATUS_ORDER[s] < STATUS_ORDER[best] ? s : best));
}

/**
 * Agrupa las capturas por página y las ordena (`changed` cuenta las capturas que cambiaron,
 * aparecieron o desaparecieron; las que fallaron en los dos lados van aparte, en `counts.error`): primero las que cambiaron (de más a menos
 * cambio), después las nuevas, quitadas y con error, y al final las iguales. Dentro de cada
 * grupo, el orden de la lista de páginas.
 *
 * @param {Shot[]} shots
 * @returns {{
 *   total: number,
 *   changed: number,
 *   counts: Record<Status, number>,
 *   pages: PageResult[],
 *   changedPages: PageResult[]
 * }}
 */
export function summarize(shots) {
	/** @type {Map<string, PageResult & { index: number }>} */
	const byPage = new Map();
	for (const s of shots) {
		let p = byPage.get(s.pageId);
		if (!p) {
			p = {
				pageId: s.pageId,
				title: s.title,
				group: s.group,
				path: s.path ?? null,
				status: 'igual',
				maxRatio: 0,
				shots: [],
				index: byPage.size
			};
			byPage.set(s.pageId, p);
		}
		p.shots.push(s);
		if (!p.path && s.path) p.path = s.path;
	}
	const pages = [...byPage.values()].map((p) => {
		p.status = pageStatus(p.shots.map((s) => s.status));
		p.maxRatio = Math.max(0, ...p.shots.map((s) => (s.status === 'cambio' ? (s.ratio ?? 0) : 0)));
		return p;
	});
	pages.sort(
		(a, b) =>
			STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
			(a.status === 'cambio' ? b.maxRatio - a.maxRatio : 0) ||
			a.index - b.index
	);
	const counts = /** @type {Record<Status, number>} */ ({
		cambio: 0,
		igual: 0,
		nueva: 0,
		quitada: 0,
		error: 0
	});
	for (const s of shots) counts[s.status]++;
	const out = pages.map(({ index, ...p }) => p);
	return {
		total: shots.length,
		changed: counts.cambio + counts.nueva + counts.quitada,
		counts,
		pages: out,
		changedPages: out.filter((p) => p.status !== 'igual')
	};
}

/**
 * Porcentaje legible («0,42 %», «< 0,01 %»).
 * @param {number | null | undefined} ratio
 */
export function formatRatio(ratio) {
	if (ratio == null) return '';
	const pct = ratio * 100;
	if (pct > 0 && pct < 0.01) return '< 0,01 %';
	return `${pct.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;
}

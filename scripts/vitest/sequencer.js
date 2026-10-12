// Reparto de las pruebas de vitest en partes (`--shard=N/M`, los jobs `tests (N/3)` de la CI) por
// lo que tarda cada archivo, en vez del reparto de vitest, que pone la misma cantidad de archivos
// en cada parte sin mirar cuánto tardan (y una parte terminaba mucho después que las otras).
//
// Los tiempos salen de scripts/vitest/durations.json (`npm run test:durations` los actualiza). Un
// archivo que no está ahí (una prueba nueva) cuenta como la mediana. Si los tiempos quedan viejos,
// el reparto es menos parejo, pero cada archivo sigue corriendo en exactamente una parte: todas las
// partes calculan el mismo reparto con la misma lista.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DURATIONS_FILE = fileURLToPath(new URL('./durations.json', import.meta.url));

/** @returns {Record<string, number>} segundos por archivo (ruta relativa a la raíz, con `/`) */
export function readDurations(file = DURATIONS_FILE) {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return {};
	}
}

/** @param {number[]} values */
function median(values) {
	if (!values.length) return 1;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reparte los archivos en `count` partes parejas en tiempo: del más lento al más rápido, cada uno
 * va a la parte que menos suma hasta ahí (empate: la de número más bajo). Determinista.
 *
 * @param {string[]} files rutas relativas a la raíz, con `/`
 * @param {Record<string, number>} durations
 * @param {number} count
 * @returns {string[][]} `count` listas
 */
export function splitByDuration(files, durations, count) {
	const fallback = median(Object.values(durations));
	const time = (/** @type {string} */ f) => durations[f] ?? fallback;
	const ordered = [...files].sort((a, b) => time(b) - time(a) || (a < b ? -1 : a > b ? 1 : 0));
	/** @type {string[][]} */
	const parts = Array.from({ length: count }, () => []);
	const totals = new Array(count).fill(0);
	for (const file of ordered) {
		let best = 0;
		for (let i = 1; i < count; i++) if (totals[i] < totals[best]) best = i;
		parts[best].push(file);
		totals[best] += time(file);
	}
	return parts;
}

/** @param {string} root @param {string} moduleId */
export function relativeKey(root, moduleId) {
	return path.relative(root, moduleId).split(path.sep).join('/');
}

/** @typedef {import('vitest/node').TestSpecification} Spec */
/** @typedef {import('vitest/node').TestSequencer} TestSequencer */

/**
 * No extiende BaseSequencer de vitest para que vite.config.js no cargue `vitest/node` en `vite dev`
 * ni en `vite build`: `sort` repite el orden de vitest 5 (BaseSequencer.sort).
 *
 * @implements {TestSequencer}
 */
export default class DurationSequencer {
	/** @param {import('vitest/node').Vitest} ctx */
	constructor(ctx) {
		this.ctx = ctx;
	}

	/** @param {Spec[]} files */
	async shard(files) {
		const { root, shard } = this.ctx.config;
		if (!shard) return files;
		const keys = files.map((spec) => relativeKey(root, spec.moduleId));
		const mine = new Set(splitByDuration(keys, readDurations(), shard.count)[shard.index - 1]);
		return files.filter((_, i) => mine.has(keys[i]));
	}

	/**
	 * Como vitest: primero lo que falló y después lo que más tardó la última vez, según su caché
	 * (node_modules/.vite/vitest). Sin datos en la caché (la primera corrida, una prueba nueva),
	 * vitest ordena por tamaño del archivo; acá, por durations.json: los lentos arrancan primero
	 * y no quedan solos al final.
	 *
	 * @param {Spec[]} files
	 */
	async sort(files) {
		const { cache, config } = this.ctx;
		const durations = readDurations();
		const key = (/** @type {Spec} */ s) =>
			`${s.project.name}:${path.relative(config.root, s.moduleId)}`;
		const time = (/** @type {Spec} */ s) => durations[relativeKey(config.root, s.moduleId)] ?? 0;
		return [...files].sort((a, b) => {
			const group = a.project.config.sequence.groupOrder - b.project.config.sequence.groupOrder;
			if (group !== 0) return group;
			if (a.project.name !== b.project.name) return a.project.name < b.project.name ? -1 : 1;
			if (a.project.config.isolate !== b.project.config.isolate)
				return a.project.config.isolate ? -1 : 1;
			const aState = cache.getFileTestResults(key(a));
			const bState = cache.getFileTestResults(key(b));
			if (!aState || !bState) return time(b) - time(a);
			if (aState.failed !== bState.failed) return aState.failed ? -1 : 1;
			return bState.duration - aState.duration;
		});
	}
}

// Reporter de vitest que guarda cuánto tardó cada archivo de pruebas, para repartirlos parejo
// entre las partes de la CI (scripts/vitest/sequencer.js lee scripts/vitest/durations.json).
//
// El tiempo de un archivo es el total que vitest le mide (preparar, importar, setupFiles y las
// pruebas), en segundos con un decimal. Cada parte de la CI lo corre y sube sus tiempos como
// artifact `vitest-durations-N`; scripts/vitest/merge-durations.js los junta en durations.json.
// Los tiempos de la CI son los que sirven: en otra máquina (y más con otras cosas corriendo) las
// proporciones cambian.
//
//   VITEST_DURATIONS_OUT=<archivo>   dónde escribir (si no, en scripts/vitest/durations.json)
//   npm run test:durations           todas las pruebas en tu compu (menos preciso que la CI)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relativeKey } from './sequencer.js';

export const DURATIONS_FILE = fileURLToPath(new URL('./durations.json', import.meta.url));

/**
 * Suma `measured` a lo que ya hay en `file` (lo medido gana), saca los archivos que ya no existen
 * y escribe el resultado ordenado.
 *
 * @param {string} file
 * @param {Record<string, number>} measured
 * @param {string} root
 * @returns {number} cuántos archivos quedaron
 */
export function writeDurations(file, measured, root) {
	/** @type {Record<string, number>} */
	let previous = {};
	try {
		previous = JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		// primera vez
	}
	const merged = { ...previous, ...measured };
	/** @type {Record<string, number>} */
	const out = {};
	for (const name of Object.keys(merged).sort()) {
		if (existsSync(path.join(root, name))) out[name] = merged[name];
	}
	writeFileSync(file, JSON.stringify(out, null, '\t') + '\n');
	return Object.keys(out).length;
}

export default class DurationsReporter {
	/** @type {Record<string, number>} */
	measured = {};
	root = process.cwd();
	file = process.env.VITEST_DURATIONS_OUT || DURATIONS_FILE;

	/** @param {import('vitest/node').Vitest} vitest */
	onInit(vitest) {
		this.root = vitest.config.root;
	}

	/** @param {import('vitest/node').TestModule} testModule */
	onTestModuleEnd(testModule) {
		const d = testModule.diagnostic();
		const total =
			d.environmentSetupDuration +
			d.prepareDuration +
			d.collectDuration +
			d.setupDuration +
			d.duration;
		this.measured[relativeKey(this.root, testModule.moduleId)] = Math.round(total / 100) / 10;
	}

	onTestRunEnd() {
		const total = writeDurations(this.file, this.measured, this.root);
		console.log(
			`${path.basename(this.file)}: ${Object.keys(this.measured).length} archivos medidos, ${total} en total.`
		);
	}
}

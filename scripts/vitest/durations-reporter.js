// Reporter de vitest que guarda cuánto tardó cada archivo de pruebas en
// scripts/vitest/durations.json, para repartirlos parejo en la CI (scripts/vitest/sequencer.js).
//
//   npm run test:durations             # todas las pruebas; reescribe el archivo entero
//   npm run test:durations -- <ruta>   # solo esas; actualiza sus tiempos y deja los demás
//
// El tiempo de un archivo es el total que vitest le mide (preparar, importar, setupFiles y las
// pruebas), en segundos con un decimal. Los archivos que ya no existen se sacan.
// Con VITEST_DURATIONS_OUT=<archivo> escribe ahí en vez de en durations.json (por ejemplo, para
// juntar los tiempos de cada parte de la CI).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relativeKey } from './sequencer.js';

const DURATIONS_FILE =
	process.env.VITEST_DURATIONS_OUT || fileURLToPath(new URL('./durations.json', import.meta.url));

export default class DurationsReporter {
	/** @type {Record<string, number>} */
	measured = {};
	failed = false;
	root = process.cwd();

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
		/** @type {Record<string, number>} */
		let previous = {};
		try {
			previous = JSON.parse(readFileSync(DURATIONS_FILE, 'utf8'));
		} catch {
			// primera vez
		}
		const merged = { ...previous, ...this.measured };
		/** @type {Record<string, number>} */
		const out = {};
		for (const file of Object.keys(merged).sort()) {
			if (existsSync(path.join(this.root, file))) out[file] = merged[file];
		}
		writeFileSync(DURATIONS_FILE, JSON.stringify(out, null, '\t') + '\n');
		console.log(
			`${path.basename(DURATIONS_FILE)}: ${Object.keys(this.measured).length} archivos medidos, ${Object.keys(out).length} en total.`
		);
	}
}

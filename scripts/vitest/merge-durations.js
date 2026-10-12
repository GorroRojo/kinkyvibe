// Junta los tiempos de las partes de la CI (artifacts `vitest-durations-1`, `-2` y `-3` de una
// corrida reciente de `main`) en scripts/vitest/durations.json:
//
//   gh run download <id de la corrida> -p 'vitest-durations-*' -D /tmp/tiempos
//   node scripts/vitest/merge-durations.js /tmp/tiempos/*/vitest-durations.json
//
// Lo medido reemplaza lo que había; los archivos que ya no existen se sacan.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { DURATIONS_FILE, writeDurations } from './durations-reporter.js';

const files = process.argv.slice(2);
if (!files.length) {
	console.error('Uso: node scripts/vitest/merge-durations.js <tiempos.json>...');
	process.exit(1);
}
/** @type {Record<string, number>} */
const measured = {};
for (const file of files) Object.assign(measured, JSON.parse(readFileSync(file, 'utf8')));
const total = writeDurations(DURATIONS_FILE, measured, process.cwd());
console.log(`durations.json: ${Object.keys(measured).length} archivos medidos, ${total} en total.`);

#!/usr/bin/env node
// Limpia procesos de pruebas huérfanos: workers de vitest y `workerd` (miniflare) que quedaron
// vivos después de una corrida cortada (timeout, falta de memoria) cuyo proceso padre ya murió.
// En las sesiones largas con varios agentes se juntan decenas y cada uno ocupa ~300 MB.
//
//   node scripts/limpiar-procesos.js            # mata los huérfanos de más de 60 minutos
//   node scripts/limpiar-procesos.js --min=30   # otro umbral
//   node scripts/limpiar-procesos.js --dry      # solo lista
//
// Solo toca procesos cuyo padre ya no existe (padre = 1) y sus hijos. Nunca toca algo con un padre
// vivo: una corrida en curso de otra sesión queda intacta. Por PID, nunca `pkill -f`.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Lo que cuenta como proceso de pruebas. */
const TEST_PROCESS = [/vitest\/dist\/workers\//, /\/workerd serve /];

/**
 * @typedef {{ pid: number, ppid: number, age: number, args: string }} Proc
 */

/**
 * Las líneas de `ps -eo pid=,ppid=,etimes=,args=`.
 * @param {string} output
 * @returns {Proc[]}
 */
export function parsePs(output) {
	/** @type {Proc[]} */
	const procs = [];
	for (const line of output.split('\n')) {
		const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
		if (m) procs.push({ pid: +m[1], ppid: +m[2], age: +m[3], args: m[4] });
	}
	return procs;
}

/**
 * Los PIDs a matar: procesos de pruebas huérfanos (padre 1) con más de `minAgeSec` segundos, más
 * todos sus descendientes (el `workerd` que levantó un worker de vitest huérfano).
 * @param {Proc[]} procs
 * @param {{ minAgeSec: number }} options
 * @returns {number[]}
 */
export function orphanPids(procs, { minAgeSec }) {
	const roots = procs.filter(
		(p) => p.ppid === 1 && p.age > minAgeSec && TEST_PROCESS.some((re) => re.test(p.args))
	);
	const out = new Set(roots.map((p) => p.pid));
	let grew = true;
	while (grew) {
		grew = false;
		for (const p of procs) {
			if (!out.has(p.pid) && out.has(p.ppid)) {
				out.add(p.pid);
				grew = true;
			}
		}
	}
	return [...out];
}

function main() {
	const args = process.argv.slice(2);
	const dry = args.includes('--dry');
	const min = Number(args.find((a) => a.startsWith('--min='))?.slice(6) ?? 60);
	if (!Number.isFinite(min) || min < 10) {
		console.error('--min tiene que ser un número de minutos, 10 o más.');
		process.exit(2);
	}
	const procs = parsePs(
		execFileSync('ps', ['-eo', 'pid=,ppid=,etimes=,args='], { encoding: 'utf8' })
	);
	const pids = orphanPids(procs, { minAgeSec: min * 60 });
	if (!pids.length) {
		console.log('No hay procesos de pruebas huérfanos.');
		return;
	}
	for (const pid of pids) {
		const p = procs.find((x) => x.pid === pid);
		const label = `${pid} (${Math.round((p?.age ?? 0) / 60)} min) ${p?.args.slice(0, 80) ?? ''}`;
		if (dry) {
			console.log(`[dry] ${label}`);
			continue;
		}
		try {
			process.kill(pid);
			console.log(`terminado ${label}`);
		} catch (error) {
			console.log(`no se pudo terminar ${pid}: ${/** @type {Error} */ (error).message}`);
		}
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

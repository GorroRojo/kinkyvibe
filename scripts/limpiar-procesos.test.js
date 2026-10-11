import { describe, expect, it } from 'vitest';
import { orphanPids, parsePs } from './limpiar-procesos.js';

const WORKER =
	'/opt/node22/bin/node --require /repo/node_modules/vitest/suppress-warnings.cjs /repo/node_modules/vitest/dist/workers/forks.js';
const WORKERD =
	'/repo/node_modules/@cloudflare/workerd-linux-64/bin/workerd serve --binary --experimental';

const ps = [
	// Huérfano viejo con su workerd hijo: se van los dos.
	`  100     1  25000 ${WORKER}`,
	`  101   100  24990 ${WORKERD}`,
	// workerd huérfano viejo solo.
	`  200     1   9000 ${WORKERD}`,
	// Huérfano reciente: queda.
	`  300     1    600 ${WORKER}`,
	// Worker viejo con padre vivo (una corrida en curso): queda, y su hijo también.
	`  400   399  9000 ${WORKER}`,
	`  401   400  9000 ${WORKERD}`,
	// Proceso cualquiera huérfano y viejo: no es de pruebas, queda.
	`  500     1  99999 /usr/sbin/sshd -D`
].join('\n');

describe('limpiar-procesos', () => {
	it('lee la salida de ps', () => {
		const procs = parsePs(ps);
		expect(procs).toHaveLength(7);
		expect(procs[0]).toEqual({ pid: 100, ppid: 1, age: 25000, args: WORKER });
	});

	it('solo los huérfanos de pruebas viejos y sus hijos', () => {
		expect(orphanPids(parsePs(ps), { minAgeSec: 3600 }).sort((a, b) => a - b)).toEqual([
			100, 101, 200
		]);
	});

	it('con un umbral más bajo entra el huérfano reciente, nunca los que tienen padre vivo', () => {
		const pids = orphanPids(parsePs(ps), { minAgeSec: 60 });
		expect(pids).toContain(300);
		expect(pids).not.toContain(400);
		expect(pids).not.toContain(401);
		expect(pids).not.toContain(500);
	});
});

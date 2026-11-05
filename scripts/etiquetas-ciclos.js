// Busca ciclos de madres e hijas en las etiquetas (una etiqueta que termina siendo madre de sí
// misma, directo o por el camino). Solo lee: no escribe ni migra nada.
//
// Por defecto lee la base D1 LOCAL (la de `npm run dev`, .wrangler/state; scripts/local-d1.js,
// nunca se conecta a Cloudflare). No tiene opción para leer otra base: para mirar producción,
// gorrite corre la consulta de solo lectura con wrangler y le pasa el resultado:
//
//   node scripts/etiquetas-ciclos.js                      # la base local
//   node scripts/etiquetas-ciclos.js --sql                # la consulta, para correrla con wrangler
//   npx wrangler d1 execute kinkyvibe --remote --json --command "$(node scripts/etiquetas-ciclos.js --sql)" > /tmp/madres.json
//   node scripts/etiquetas-ciclos.js --desde=/tmp/madres.json
//
// Sale con 1 si encontró algún ciclo (y los lista), 0 si no hay.
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** Las relaciones «hija → madre» entre etiquetas que no están borradas (un SELECT, nada más). */
export const EDGES_SQL =
	"SELECT json_extract(a.data, '$.key') AS hija, json_extract(b.data, '$.key') AS madre " +
	'FROM edges e JOIN objects a ON a.id = e.from_id JOIN objects b ON b.id = e.to_id ' +
	"WHERE e.kind = 'hijo_de' AND a.type = 'etiqueta' AND b.type = 'etiqueta' " +
	'AND a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY e.from_id, e.position';

/**
 * Los ciclos del grafo «madre → hijas»: uno por cada grupo de etiquetas atrapadas en vueltas
 * (componente fuertemente conexa con más de una, o una que es madre de sí misma), como el camino
 * que vuelve al principio (`[a, b, a]`: a es madre de b, b es madre de a).
 *
 * @param {readonly { hija: string, madre: string }[]} edges
 * @returns {{ etiquetas: string[], camino: string[] }[]}
 */
export function findTagCycles(edges) {
	/** @type {Map<string, string[]>} */
	const kids = new Map();
	for (const { hija, madre } of edges) {
		if (typeof hija !== 'string' || typeof madre !== 'string') continue;
		if (!kids.has(hija)) kids.set(hija, []);
		kids.set(madre, [...(kids.get(madre) ?? []), hija]);
	}
	// Tarjan, sin recursión (un árbol hondo no llena la pila).
	/** @type {Map<string, number>} */
	const index = new Map();
	/** @type {Map<string, number>} */
	const low = new Map();
	/** @type {string[]} */
	const stack = [];
	const onStack = new Set();
	/** @type {string[][]} */
	const groups = [];
	let next = 0;
	for (const start of kids.keys()) {
		if (index.has(start)) continue;
		/** @type {{ v: string, i: number }[]} */
		const work = [{ v: start, i: 0 }];
		while (work.length) {
			const frame = work[work.length - 1];
			const { v } = frame;
			if (frame.i === 0 && !index.has(v)) {
				index.set(v, next);
				low.set(v, next++);
				stack.push(v);
				onStack.add(v);
			}
			const list = kids.get(v) ?? [];
			if (frame.i < list.length) {
				const w = list[frame.i++];
				if (!index.has(w)) work.push({ v: w, i: 0 });
				else if (onStack.has(w))
					low.set(
						v,
						Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (index.get(w)))
					);
				continue;
			}
			work.pop();
			const parent = work[work.length - 1];
			if (parent)
				low.set(
					parent.v,
					Math.min(/** @type {number} */ (low.get(parent.v)), /** @type {number} */ (low.get(v)))
				);
			if (low.get(v) === index.get(v)) {
				/** @type {string[]} */
				const group = [];
				let w;
				do {
					w = /** @type {string} */ (stack.pop());
					onStack.delete(w);
					group.push(w);
				} while (w !== v);
				if (group.length > 1 || list.includes(v)) groups.push(group.reverse());
			}
		}
	}
	return groups.map((group) => ({ etiquetas: group, camino: cycleIn(group, kids) }));
}

/**
 * Un camino que da la vuelta dentro de un grupo (siempre hay: todas se alcanzan entre sí).
 * @param {string[]} group
 * @param {Map<string, string[]>} kids
 */
function cycleIn(group, kids) {
	const inGroup = new Set(group);
	const start = group[0];
	/** @type {Map<string, string>} */
	const from = new Map();
	const queue = [start];
	while (queue.length) {
		const v = /** @type {string} */ (queue.shift());
		for (const w of kids.get(v) ?? []) {
			if (!inGroup.has(w)) continue;
			if (w === start) {
				const path = [start];
				for (let u = v; u !== start; u = /** @type {string} */ (from.get(u))) path.splice(1, 0, u);
				return [...path, start];
			}
			if (!from.has(w)) {
				from.set(w, v);
				queue.push(w);
			}
		}
	}
	return [start, start];
}

/** Las relaciones de la base local, con la misma consulta. */
async function localEdges() {
	const { openLocalD1 } = await import('./local-d1.js');
	const { db, dispose } = await openLocalD1({ migrate: false });
	try {
		const { results } = await db.prepare(EDGES_SQL).all();
		return /** @type {{ hija: string, madre: string }[]} */ (results);
	} finally {
		await dispose();
	}
}

/**
 * Las filas de la salida de `wrangler d1 execute --json` (una lista de resultados, uno por
 * consulta) o una lista de filas sueltas.
 * @param {unknown} json
 */
function rowsOf(json) {
	const list = Array.isArray(json) ? json : [json];
	return /** @type {{ hija: string, madre: string }[]} */ (
		list.flatMap((r) => (r && typeof r === 'object' && 'results' in r ? r.results : [r]))
	);
}

async function main() {
	const argv = process.argv.slice(2);
	if (argv.includes('--sql')) {
		process.stdout.write(EDGES_SQL + '\n');
		return 0;
	}
	const desde = argv.find((a) => a.startsWith('--desde='))?.slice('--desde='.length);
	const edges = desde ? rowsOf(JSON.parse(await readFile(desde, 'utf8'))) : await localEdges();
	const cycles = findTagCycles(edges);
	const origen = desde ? `el archivo ${desde}` : 'la base local';
	if (!cycles.length) {
		console.log(`Sin ciclos: ${edges.length} relaciones de madre e hija en ${origen}.`);
		return 0;
	}
	console.log(`${cycles.length} ciclo(s) de madres e hijas en ${origen}:`);
	for (const c of cycles) {
		console.log(
			`- ${c.camino.join(' › ')}  (madre › hija; en el ciclo: ${c.etiquetas.join(', ')})`
		);
	}
	console.log(
		'Para cortarlo: en /admin/etiquetas, sacá una de esas madres de la hija que corresponda.'
	);
	return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main().then(
		(code) => process.exit(code),
		(error) => {
			console.error(error instanceof Error ? error.message : error);
			process.exit(2);
		}
	);
}

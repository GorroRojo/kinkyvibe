/**
 * La parte `d1` del header `Server-Timing` (src/lib/server/serverTiming.js): cuántas sentencias le
 * mandó cada pedido a D1, en cuántas idas, y cuánto tiempo hubo al menos una en camino. Separa la
 * espera de la base del resto del Worker (`app;dur`).
 *
 * Lo usa worker/index.js: envuelve el binding `DB` una vez por binding (el mismo objeto para todo el
 * isolate, como el binding mismo: `setContentDB` lo guarda para todos los pedidos) y corre cada
 * pedido dentro de un `AsyncLocalStorage` con su contador. Cada sentencia suma al contador del pedido
 * en el que se ejecuta, aunque el envoltorio sea compartido. Va en el Worker y no en `getDB`: el
 * Worker y SvelteKit son dos paquetes distintos (no comparten módulos), y así `getDB` sigue
 * devolviendo el binding tal cual en las pruebas y en `vite dev`.
 *
 * Costo casi nulo: no toca las filas ni lee el SQL; por sentencia, un Proxy y dos lecturas del reloj.
 * Solo tiempos y contadores: nada de la persona ni del contenido.
 */

/**
 * @typedef {{
 *   statements: number,
 *   trips: number,
 *   busy: number,
 *   inFlight: number,
 *   since: number,
 *   clock: () => number
 * }} D1Stats
 */

/** El reloj del pedido. En Workers, como `Date.now`, solo avanza con la entrada y salida. */
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/**
 * Un contador nuevo para un pedido.
 * @param {() => number} [clock]
 * @returns {D1Stats}
 */
export function createD1Stats(clock = now) {
	return { statements: 0, trips: 0, busy: 0, inFlight: 0, since: 0, clock };
}

/**
 * Corre `run()` (una ida a la base con `count` sentencias) contándola en `stats`.
 * @template T
 * @param {D1Stats | undefined} stats
 * @param {number} count
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
async function counted(stats, count, run) {
	if (!stats) return run();
	stats.statements += count;
	stats.trips += 1;
	if (stats.inFlight++ === 0) stats.since = stats.clock();
	try {
		return await run();
	} finally {
		if (--stats.inFlight === 0) stats.busy += stats.clock() - stats.since;
	}
}

/** Lo que ejecuta una sentencia (una ida cada una). */
const RUNS = new Set(['first', 'all', 'run', 'raw']);
/** La sentencia original detrás de un envoltorio (para `batch`). */
const RAW = Symbol('d1Timing.raw');

/**
 * Devuelve la función que envuelve un binding D1 para contar sus sentencias en el contador del
 * pedido en curso (`currentStats()`, `undefined` fuera de un pedido: entonces no cuenta nada). Un
 * envoltorio por binding: llamarla dos veces con el mismo binding da el mismo objeto.
 *
 * @param {() => D1Stats | undefined} currentStats
 * @returns {<T>(db: T) => T}
 */
export function d1Timer(currentStats) {
	/** @type {WeakMap<object, any>} */
	const wrappers = new WeakMap();

	/** @param {any} statement */
	const wrapStatement = (statement) =>
		new Proxy(statement, {
			get(target, prop) {
				if (prop === RAW) return target;
				if (prop === 'bind') {
					return (/** @type {unknown[]} */ ...args) => wrapStatement(target.bind(...args));
				}
				const value = target[prop];
				if (typeof value !== 'function') return value;
				if (RUNS.has(/** @type {string} */ (prop))) {
					return (/** @type {unknown[]} */ ...args) =>
						counted(currentStats(), 1, () => value.apply(target, args));
				}
				return value.bind(target);
			}
		});

	return (db) => {
		if (!db || typeof db !== 'object') return db;
		const known = wrappers.get(db);
		if (known) return known;
		const wrapper = new Proxy(/** @type {any} */ (db), {
			get(target, prop) {
				const value = target[prop];
				if (typeof value !== 'function') return value;
				if (prop === 'prepare') {
					return (/** @type {string} */ sql) => wrapStatement(value.call(target, sql));
				}
				if (prop === 'batch') {
					return (/** @type {any[]} */ statements) =>
						counted(currentStats(), statements.length, () =>
							value.call(
								target,
								statements.map((s) => s?.[RAW] ?? s)
							)
						);
				}
				if (prop === 'exec') {
					return (/** @type {unknown[]} */ ...args) =>
						counted(currentStats(), 1, () => value.apply(target, args));
				}
				return value.bind(target);
			}
		});
		wrappers.set(db, wrapper);
		return wrapper;
	};
}

/**
 * La parte del header: `d1;dur=<ms con alguna sentencia en camino>;desc="<n> consultas en <k>
 * idas"`. Una tanda (`batch`) es una ida con varias consultas.
 * @param {D1Stats} stats
 */
export function d1ServerTiming(stats) {
	const open = stats.inFlight > 0 ? stats.clock() - stats.since : 0;
	const ms = Math.max(0, Math.round((stats.busy + open) * 10) / 10);
	const { statements: n, trips: k } = stats;
	return `d1;dur=${ms};desc="${n} ${n === 1 ? 'consulta' : 'consultas'} en ${k} ${k === 1 ? 'ida' : 'idas'}"`;
}

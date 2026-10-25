/**
 * Una lectura chica de la base (las «marcas» de «¿cambió algo?» de las cachés) compartida dentro
 * del pedido en curso, en vez de una consulta por cada llamada:
 *
 * - **Pedidos de lectura** (`GET` y `HEAD`): una sola vez por pedido. La página, su layout y lo
 *   que piden juntos (la lista, los pronombres, el índice de la búsqueda) ven la misma respuesta.
 *   Un pedido de lectura no guarda contenido, así que la marca no cambia por algo de ese mismo
 *   pedido.
 * - **Los demás** (`POST` de los formularios y de la API): solo se comparte la consulta que está
 *   en camino (dos lecturas a la par reciben la misma respuesta). Un pedido que acaba de guardar
 *   nunca recibe la respuesta de una consulta que salió antes que su guardado.
 * - **Fuera de un pedido** (scripts, crons, pruebas): sin compartir, una consulta por llamada.
 *
 * Por base (`db`) y por clave: nunca se mezclan dos bases ni dos marcas distintas.
 */
import { getRequestEvent } from '$app/server';

/** Métodos que no guardan nada: la marca leída vale para todo el pedido. */
const READ_ONLY = new Set(['GET', 'HEAD']);

/**
 * Lo leído en cada pedido: pedido (su `Request`) → base → clave → la consulta (en camino o ya
 * resuelta).
 * @type {WeakMap<object, WeakMap<object, Map<string, Promise<unknown>>>>}
 */
const memo = new WeakMap();

/**
 * El pedido en curso (su `Request`), o `null` fuera de un pedido (scripts, tests, crons).
 *
 * La clave es `event.request` y no el `event`: SvelteKit le da a cada `load` (el layout, la página)
 * una copia propia del evento (`{ ...event, tracing }`), así que con el `event` como clave el
 * layout y la página no compartían nada y un isolate nuevo leía todo dos veces. El `Request` es el
 * mismo objeto en todas las copias.
 */
function currentRequest() {
	try {
		return getRequestEvent()?.request ?? null;
	} catch {
		return null;
	}
}

/**
 * El pedido de lectura en curso (`GET`/`HEAD`, su `Request`), o `null` en otro pedido o fuera de
 * uno: las tandas automáticas (./autoBatch.js) solo juntan lecturas de estos pedidos.
 */
export function currentReadRequest() {
	const request = currentRequest();
	return request && READ_ONLY.has(String(request.method ?? '').toUpperCase()) ? request : null;
}

/**
 * `read()` una vez por pedido de lectura (ver arriba), o compartida mientras está en camino en
 * los demás pedidos. Si falla, se olvida: la próxima llamada vuelve a consultar.
 *
 * @template T
 * @param {object} db la base (separa lo leído de cada una)
 * @param {string} key qué se lee (separa las marcas distintas de una misma base)
 * @param {() => Promise<T>} read
 * @returns {Promise<T>}
 */
export function oncePerRequest(db, key, read) {
	const request = currentRequest();
	if (!request) return read();
	const byDb = memo.get(request) ?? new WeakMap();
	memo.set(request, byDb);
	/** @type {Map<string, Promise<unknown>>} */
	const byKey = byDb.get(db) ?? new Map();
	byDb.set(db, byKey);
	const running = byKey.get(key);
	if (running) return /** @type {Promise<T>} */ (running);
	const mine = read();
	byKey.set(key, mine);
	const keep = READ_ONLY.has(String(request.method ?? '').toUpperCase());
	const forget = () => {
		if (byKey.get(key) === mine) byKey.delete(key);
	};
	// En un pedido de lectura queda lo resuelto (salvo un error); en los demás, solo mientras está
	// en camino.
	mine.then(keep ? undefined : forget, forget);
	return mine;
}

/*
 * Cachés del isolate (módulos que recuerdan algo entre pedidos): en Cloudflare Workers, una
 * promesa que depende de I/O que empezó OTRO pedido no es segura. Si ese pedido termina o se corta
 * antes, la consulta puede no terminar nunca y todos los que la esperaban se cuelgan hasta que
 * Cloudflare los mata (gorrite, 12/10: GET /admin y GET / colgados minutos con ~40 ms de CPU). Por
 * eso, entre pedidos se comparte solo un valor YA resuelto; lo que está en camino se comparte solo
 * dentro del pedido (`oncePerRequest`), y el pedido que necesita un valor nuevo espera su propia
 * consulta.
 */

/**
 * `read()` compartida solo dentro del pedido (como {@link oncePerRequest}); cuando termina bien,
 * `keep(valor)` lo guarda en la caché del módulo (un valor, nunca la promesa). Un error no se
 * guarda.
 *
 * @template T
 * @param {object} scope separa las lecturas en camino (la base, o un objeto propio de la caché)
 * @param {string} key qué se lee
 * @param {() => Promise<T>} read
 * @param {(value: T) => void} keep
 * @returns {Promise<T>}
 */
export function readAndKeep(scope, key, read, keep) {
	const running = oncePerRequest(scope, key, read);
	running.then(keep, () => {});
	return running;
}

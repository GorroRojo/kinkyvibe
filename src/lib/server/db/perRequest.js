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
 * Lo leído en cada pedido: pedido → base → clave → la consulta (en camino o ya resuelta).
 * @type {WeakMap<object, WeakMap<object, Map<string, Promise<unknown>>>>}
 */
const memo = new WeakMap();

/** El pedido en curso, o `null` fuera de un pedido (scripts, tests, crons). */
function currentRequest() {
	try {
		return getRequestEvent();
	} catch {
		return null;
	}
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
	const event = currentRequest();
	if (!event) return read();
	const byDb = memo.get(event) ?? new WeakMap();
	memo.set(event, byDb);
	/** @type {Map<string, Promise<unknown>>} */
	const byKey = byDb.get(db) ?? new Map();
	byDb.set(db, byKey);
	const running = byKey.get(key);
	if (running) return /** @type {Promise<T>} */ (running);
	const mine = read();
	byKey.set(key, mine);
	const keep = READ_ONLY.has(String(event.request?.method ?? '').toUpperCase());
	const forget = () => {
		if (byKey.get(key) === mine) byKey.delete(key);
	};
	// En un pedido de lectura queda lo resuelto (salvo un error); en los demás, solo mientras está
	// en camino.
	mine.then(keep ? undefined : forget, forget);
	return mine;
}

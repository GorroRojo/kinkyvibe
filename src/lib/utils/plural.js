/**
 * Cantidades con su palabra en singular o plural («1 entrada», «2 entradas»). Para los mensajes
 * del panel y del sitio: nunca «1 entradas».
 */

/**
 * @param {number} n
 * @param {string} one la palabra para 1 («entrada»)
 * @param {string} [many] la palabra para el resto (por defecto, `one` + «s»)
 */
export function plural(n, one, many = `${one}s`) {
	return `${n} ${n === 1 ? one : many}`;
}

/** «1 entrada», «3 entradas». @param {number} n */
export const entradas = (n) => plural(n, 'entrada');

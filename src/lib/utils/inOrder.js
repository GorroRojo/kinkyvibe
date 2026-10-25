/**
 * Espera, en orden, promesas que ya salieron a la par: devuelve sus valores como `Promise.all`,
 * pero si fallan varias, el error que sale es el de la primera en la lista (no el de la que falló
 * antes), como si se hubieran esperado en fila. Las demás no quedan como rechazos sin atender.
 *
 * Para pasar a la par lecturas que antes iban una detrás de otra sin cambiar qué error se ve.
 *
 * @template {readonly unknown[] | []} T (el `| []` hace que una lista literal se lea como tupla)
 * @param {T} promises
 * @returns {Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }>}
 */
export async function inOrder(promises) {
	for (const p of promises) Promise.resolve(p).catch(() => {});
	const out = [];
	for (const p of promises) out.push(await p);
	return /** @type {any} */ (out);
}

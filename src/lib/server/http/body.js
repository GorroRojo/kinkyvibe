/**
 * Leer el cuerpo de un pedido con un tope de tamaño que no depende de `content-length`: un cuerpo
 * sin ese header (chunked) se lee de a pedazos y se corta apenas pasa el tope, sin guardarlo
 * entero. Con `content-length` mayor que el tope, ni se empieza a leer.
 */

/**
 * Los bytes del cuerpo, o `null` si pasa de `max`.
 *
 * @param {Request} request
 * @param {number} max
 * @returns {Promise<Uint8Array | null>}
 */
export async function readBytesCapped(request, max) {
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > max) return null;
	if (!request.body) return new Uint8Array(0);
	const reader = request.body.getReader();
	/** @type {Uint8Array[]} */
	const chunks = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const all = new Uint8Array(size);
	let at = 0;
	for (const c of chunks) {
		all.set(c, at);
		at += c.byteLength;
	}
	return all;
}

/**
 * El cuerpo como texto, o `null` si pasa de `max` bytes.
 *
 * @param {Request} request
 * @param {number} max
 */
export async function readTextCapped(request, max) {
	const bytes = await readBytesCapped(request, max);
	return bytes ? new TextDecoder().decode(bytes) : null;
}

/**
 * El cuerpo como JSON: `{ ok: true, value }`, o `{ ok: false, reason }` si pasa de `max` bytes
 * (`too-large`) o no es JSON (`invalid`; también un cuerpo vacío).
 *
 * @param {Request} request
 * @param {number} max
 * @returns {Promise<{ ok: true, value: unknown } | { ok: false, reason: 'too-large' | 'invalid' }>}
 */
export async function readJsonCapped(request, max) {
	const text = await readTextCapped(request, max);
	if (text === null) return { ok: false, reason: 'too-large' };
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false, reason: 'invalid' };
	}
}

/**
 * Un bucket de R2 de mentira, en memoria, para las pruebas de la copia de la biblioteca
 * (./media.test.js, ../scheduled.test.js). Lista en orden de clave como R2 (`prefix`,
 * `startAfter`, `cursor`, `limit`, `include`), con páginas chicas para probar la paginación, y
 * cuenta cada operación. Solo para pruebas.
 */

/**
 * @typedef {{ bytes: Uint8Array, etag: string, httpMetadata: Record<string, string>,
 *   customMetadata: Record<string, string> }} FakeEntry
 */

/** Un etag de mentira que depende solo de los bytes (como el MD5 de R2 para una subida entera). */
function fakeEtag(/** @type {Uint8Array} */ bytes) {
	let h = 2166136261;
	for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
	return `${h.toString(16)}-${bytes.length}`;
}

/** @param {unknown} body */
function toBytes(body) {
	if (body instanceof Uint8Array) return body;
	if (body instanceof ArrayBuffer) return new Uint8Array(body);
	return new TextEncoder().encode(String(body));
}

/**
 * @param {{ pageSize?: number }} [options] cuántos objetos devuelve cada `list` como mucho
 */
export function fakeBucket({ pageSize = 1000 } = {}) {
	/** @type {Map<string, FakeEntry>} */
	const store = new Map();
	const ops = { list: 0, get: 0, put: 0, head: 0, delete: 0 };
	/** @type {Set<string>} claves que no se pueden pisar (como con un Bucket lock) */
	const locked = new Set();
	/** @type {Set<string>} claves cuyo `get` falla */
	const broken = new Set();

	/** @param {string} key @param {FakeEntry} e @param {boolean} [withCustom] */
	const meta = (key, e, withCustom = true) => ({
		key,
		size: e.bytes.length,
		etag: e.etag,
		httpMetadata: { ...e.httpMetadata },
		customMetadata: withCustom ? { ...e.customMetadata } : undefined
	});

	const bucket = {
		ops,
		locked,
		broken,
		store,
		/**
		 * Guarda un objeto tal cual (para armar los casos), con un etag a elección (uno «por partes»).
		 * @param {string} key @param {unknown} body
		 * @param {{ etag?: string, contentType?: string, custom?: Record<string, string> }} [o]
		 */
		seed(key, body, o = {}) {
			const bytes = toBytes(body);
			store.set(key, {
				bytes,
				etag: o.etag ?? fakeEtag(bytes),
				httpMetadata: o.contentType ? { contentType: o.contentType } : {},
				customMetadata: o.custom ?? {}
			});
		},
		keys() {
			return [...store.keys()].sort();
		},
		/** @param {any} options */
		async list(options = {}) {
			ops.list++;
			const prefix = options.prefix ?? '';
			const limit = Math.min(options.limit ?? 1000, pageSize);
			let keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
			if (options.cursor) keys = keys.filter((k) => k > options.cursor);
			else if (options.startAfter) keys = keys.filter((k) => k > options.startAfter);
			const page = keys.slice(0, limit);
			const truncated = keys.length > limit;
			const withCustom = (options.include ?? []).includes('customMetadata');
			return {
				objects: page.map((k) => meta(k, /** @type {FakeEntry} */ (store.get(k)), withCustom)),
				truncated,
				// En este bucket de mentira el cursor es la última clave de la página.
				cursor: truncated ? page[page.length - 1] : undefined,
				delimitedPrefixes: []
			};
		},
		/** @param {string} key */
		async get(key) {
			ops.get++;
			if (broken.has(key)) throw new Error('R2 no responde');
			const e = store.get(key);
			if (!e) return null;
			return {
				...meta(key, e),
				arrayBuffer: async () => e.bytes.slice().buffer,
				text: async () => new TextDecoder().decode(e.bytes)
			};
		},
		/** @param {string} key */
		async head(key) {
			ops.head++;
			const e = store.get(key);
			return e ? meta(key, e) : null;
		},
		/** @param {string} key @param {unknown} body @param {any} [options] */
		async put(key, body, options = {}) {
			ops.put++;
			if (locked.has(key)) throw new Error('objeto bloqueado');
			const bytes = toBytes(body);
			store.set(key, {
				bytes,
				etag: fakeEtag(bytes),
				httpMetadata: { ...options.httpMetadata },
				customMetadata: { ...options.customMetadata }
			});
			return meta(key, /** @type {FakeEntry} */ (store.get(key)));
		},
		/** @param {string | string[]} keys */
		async delete(keys) {
			ops.delete++;
			for (const k of [keys].flat()) store.delete(k);
		}
	};
	return bucket;
}

/** @param {ReturnType<typeof fakeBucket>} bucket */
export const asR2 = (bucket) =>
	/** @type {import('@cloudflare/workers-types').R2Bucket} */ (/** @type {unknown} */ (bucket));

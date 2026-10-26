/**
 * Copia nocturna de la biblioteca (bucket `kinkyvibe-media`, binding MEDIA) a un segundo bucket
 * (`kinkyvibe-media-copia`, binding MEDIA_COPIA). docs/imagenes.md, «Copia de la biblioteca».
 *
 * - **Solo suma**: copia lo que falta en la copia, o lo que cambió (otro tamaño u otro etag).
 *   **Nunca borra nada de la copia**: si algo se borra del bucket de origen (por error, un script,
 *   un token), la copia lo sigue teniendo. Por eso, sacar del todo la foto de una persona que lo
 *   pide es borrarla también de la copia, a mano (docs/imagenes.md).
 * - Solo `img/` y `file/` (los originales, sus copias chicas y los documentos). `og/` no: son las
 *   imágenes de vista previa, que se vuelven a dibujar solas.
 * - **Trabajo acotado por noche**: como mucho `maxObjects` objetos y `maxBytes` bytes copiados y
 *   `maxListPages` páginas de listado. Si no llega, guarda por dónde iba (en la copia, en
 *   `STATE_KEY`) y sigue la noche siguiente; cuando termina una vuelta entera, la próxima empieza
 *   de nuevo desde el principio (así ve lo nuevo).
 * - Los dos buckets se listan en el mismo orden (R2 lista por clave) y se recorren a la par, de a
 *   páginas: la memoria no crece con el tamaño de la biblioteca.
 *
 * Solo imports relativos (lo importa worker/index.js por scheduled.js).
 */

/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */
/** @typedef {import('@cloudflare/workers-types').R2Object} R2Object */

/** Lo que se copia, en el orden en que R2 lista (`file/` < `img/`). */
export const MEDIA_COPY_PREFIXES = ['file/', 'img/'];

/** Por dónde iba la copia (en el bucket de la copia, fuera de `img/` y `file/`). */
export const STATE_KEY = '_estado/copia-medios.json';

/**
 * El etag del original, guardado en la copia: un objeto que se subió por partes tiene un etag
 * distinto al de una copia con los mismos bytes, así que se compara con este.
 */
export const SOURCE_ETAG_META = 'kv-etag-origen';

/**
 * Topes por noche. Cada objeto copiado son 2 pedidos a R2 (get y put), más unas pocas páginas de
 * listado: con 200 objetos, ~410 pedidos, que entran holgados en los 1000 a servicios de
 * Cloudflare por invocación del plan gratis aun sumando el backup de la base, que corre antes.
 */
export const DEFAULT_LIMITS = Object.freeze({
	maxObjects: 200,
	maxBytes: 200 * 1024 * 1024,
	maxListPages: 40
});

/**
 * @typedef {{
 *   copied: number,
 *   copiedBytes: number,
 *   checked: number,
 *   failed: string[],
 *   listPages: number,
 *   done: boolean,
 *   resumeAfter: string
 * }} MediaCopyResult
 * `done`: la vuelta terminó (la próxima empieza de cero); si no, `resumeAfter` es la última clave
 * revisada y la próxima noche sigue desde ahí.
 */

/**
 * ¿La copia está al día con el original?
 *
 * @param {R2Object} source
 * @param {R2Object | undefined} copy
 */
export function isCopyCurrent(source, copy) {
	if (!copy || copy.size !== source.size) return false;
	return copy.etag === source.etag || copy.customMetadata?.[SOURCE_ETAG_META] === source.etag;
}

/**
 * Lee por dónde iba la vuelta anterior ('' = desde el principio).
 *
 * @param {R2Bucket} target
 */
async function readState(target) {
	try {
		const object = await target.get(STATE_KEY);
		if (!object) return '';
		const state = JSON.parse(await object.text());
		return typeof state?.resumeAfter === 'string' ? state.resumeAfter : '';
	} catch {
		return '';
	}
}

/**
 * Recorre una lista de R2 en orden, de a páginas, contando cada pedido.
 */
class Lister {
	/**
	 * @param {R2Bucket} bucket
	 * @param {string} prefix
	 * @param {string | undefined} startAfter
	 * @param {{ pages: number, maxPages: number }} budget compartido entre las dos listas
	 * @param {boolean} [withMetadata]
	 */
	constructor(bucket, prefix, startAfter, budget, withMetadata = false) {
		this.bucket = bucket;
		this.prefix = prefix;
		this.startAfter = startAfter;
		this.budget = budget;
		this.withMetadata = withMetadata;
		/** @type {R2Object[]} */
		this.items = [];
		this.index = 0;
		/** @type {string | undefined} */
		this.cursor = undefined;
		this.started = false;
		this.finished = false;
	}

	/** @returns {Promise<'ok' | 'end' | 'budget'>} */
	async fill() {
		while (this.index >= this.items.length) {
			if (this.finished) return 'end';
			if (this.budget.pages >= this.budget.maxPages) return 'budget';
			this.budget.pages++;
			/** @type {import('@cloudflare/workers-types').R2ListOptions} */
			const options = { prefix: this.prefix, limit: 1000 };
			if (this.started) options.cursor = this.cursor;
			else if (this.startAfter) options.startAfter = this.startAfter;
			// Para comparar con el etag guardado del original.
			if (this.withMetadata) options.include = ['customMetadata'];
			const page = await this.bucket.list(options);
			this.started = true;
			this.items = page.objects;
			this.index = 0;
			this.cursor = page.truncated ? page.cursor : undefined;
			this.finished = !page.truncated;
		}
		return 'ok';
	}

	/** El objeto actual (después de un `fill()` que dio 'ok'). */
	peek() {
		return this.items[this.index];
	}

	next() {
		this.index++;
	}
}

/**
 * Copia un objeto con sus metadatos (tipo, caché) y el etag del original.
 *
 * @param {R2Bucket} source
 * @param {R2Bucket} target
 * @param {R2Object} object
 * @returns {Promise<number>} bytes copiados
 */
async function copyObject(source, target, object) {
	const body = await source.get(object.key);
	if (!body) throw new Error('ya no está en el original');
	// Entero en memoria: los archivos de la biblioteca miden 25 MB como mucho.
	const bytes = await body.arrayBuffer();
	await target.put(object.key, bytes, {
		httpMetadata: body.httpMetadata,
		customMetadata: { ...body.customMetadata, [SOURCE_ETAG_META]: body.etag }
	});
	return bytes.byteLength;
}

/**
 * Una pasada nocturna de la copia. Nunca tira por un objeto que no se pudo copiar (queda en
 * `failed` y se reintenta en la próxima vuelta); sí tira si no puede listar.
 *
 * @param {{ source: R2Bucket, target: R2Bucket, limits?: Partial<typeof DEFAULT_LIMITS>,
 *   log?: (line: string) => void }} input
 * @returns {Promise<MediaCopyResult>}
 */
export async function copyMedia({ source, target, limits = {}, log = console.error }) {
	const { maxObjects, maxBytes, maxListPages } = { ...DEFAULT_LIMITS, ...limits };
	const resumeFrom = await readState(target);
	const budget = { pages: 0, maxPages: maxListPages };
	/** @type {MediaCopyResult} */
	const result = {
		copied: 0,
		copiedBytes: 0,
		checked: 0,
		failed: [],
		listPages: 0,
		done: false,
		resumeAfter: resumeFrom
	};
	let stopped = false;

	for (const prefix of MEDIA_COPY_PREFIXES) {
		// Prefijos que la vuelta anterior ya terminó: se saltean.
		if (resumeFrom && resumeFrom >= prefix && !resumeFrom.startsWith(prefix)) continue;
		const startAfter = resumeFrom.startsWith(prefix) ? resumeFrom : undefined;
		const src = new Lister(source, prefix, startAfter, budget);
		const dst = new Lister(target, prefix, startAfter, budget, true);

		while (!stopped) {
			const state = await src.fill();
			if (state === 'end') break;
			if (state === 'budget') {
				stopped = true;
				break;
			}
			const object = src.peek();
			// Avanza la copia hasta la misma clave (las dos listas van en orden).
			/** @type {R2Object | undefined} */
			let copy;
			for (;;) {
				const d = await dst.fill();
				if (d === 'budget') {
					stopped = true;
					break;
				}
				if (d === 'end') break;
				const current = dst.peek();
				if (current.key < object.key) {
					dst.next();
					continue;
				}
				if (current.key === object.key) copy = current;
				break;
			}
			if (stopped) break;

			if (!isCopyCurrent(object, copy)) {
				const overObjects = result.copied >= maxObjects;
				// Un objeto más grande que el tope igual se copia si es el primero de la noche.
				const overBytes = result.copied > 0 && result.copiedBytes + object.size > maxBytes;
				if (overObjects || overBytes) {
					stopped = true;
					break;
				}
				try {
					result.copiedBytes += await copyObject(source, target, object);
					result.copied++;
				} catch (error) {
					result.failed.push(object.key);
					log(`[medios] no se pudo copiar ${object.key}: ${errorMessage(error)}`);
				}
			}
			result.checked++;
			result.resumeAfter = object.key;
			src.next();
		}
		if (stopped) break;
	}

	result.listPages = budget.pages;
	result.done = !stopped;
	if (result.done) result.resumeAfter = '';
	if (result.resumeAfter !== resumeFrom) {
		await target.put(
			STATE_KEY,
			JSON.stringify({ resumeAfter: result.resumeAfter, at: new Date().toISOString() }),
			{ httpMetadata: { contentType: 'application/json' } }
		);
	}
	return result;
}

/** @param {unknown} error */
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

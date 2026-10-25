/**
 * La pasada única que hace las copias chicas de las imágenes que ya estaban en la biblioteca antes
 * de que la subida las hiciera (scripts/copias-chicas.js; docs/imagenes.md, «Copias chicas para las
 * tarjetas»).
 *
 * **Solo suma**: lee las claves del bucket, calcula las copias que faltan (`missingCopies`, que
 * nunca devuelve una clave que ya está) y escribe solo esas. Antes de cada escritura vuelve a
 * mirar que la copia no esté (por si otra subida la hizo mientras tanto). Nunca borra ni pisa nada:
 * ni los originales ni otra copia. Idempotente: la segunda vez no hay nada que hacer.
 *
 * Con `dryRun` no escribe nada: solo dice qué escribiría.
 *
 * Solo imports relativos: corre en Node sin Vite (y en vitest, contra el R2 de miniflare).
 */
import { missingCopies } from '../../utils/mediaCopies.js';
import { IMMUTABLE_CACHE } from './library.js';

/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/**
 * Todas las claves de imágenes del bucket (`img/…`), de a páginas.
 * @param {R2Bucket} bucket
 * @returns {Promise<string[]>}
 */
export async function imageKeys(bucket) {
	/** @type {string[]} */
	const keys = [];
	/** @type {string | undefined} */
	let cursor;
	do {
		const page = await bucket.list({ prefix: 'img/', cursor, limit: 1000 });
		for (const o of page.objects) keys.push(o.key);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return keys;
}

/**
 * @typedef {{ original: string, key: string, side: number, bytes?: number, error?: string,
 *   skipped?: boolean }} CopyResult
 */

/**
 * Hace las copias que faltan.
 *
 * @param {R2Bucket} bucket
 * @param {{ dryRun: boolean, resize?: (bytes: Uint8Array, side: number) => Promise<Uint8Array>,
 *   log?: (line: string) => void }} opts `resize`: la copia WEBP del original (sharp, en el script)
 * @returns {Promise<{ originals: number, planned: CopyResult[], written: CopyResult[],
 *   errors: CopyResult[] }>}
 */
export async function backfillCopies(bucket, { dryRun, resize, log = () => {} }) {
	const keys = await imageKeys(bucket);
	const planned = missingCopies(keys);
	const originals = new Set(planned.map((p) => p.original)).size;
	/** @type {CopyResult[]} */
	const written = [];
	/** @type {CopyResult[]} */
	const errors = [];
	if (dryRun) return { originals, planned, written, errors };
	if (!resize) throw new Error('Falta con qué achicar las imágenes.');
	let lastKey = '';
	let lastBytes = new Uint8Array();
	for (const p of planned) {
		try {
			// Otra subida (o otra corrida) pudo hacerla mientras tanto: nunca se pisa.
			if (await bucket.head(p.key)) {
				log(`ya estaba: ${p.key}`);
				continue;
			}
			// Las dos copias de un original salen seguidas: se baja una sola vez.
			if (lastKey !== p.original) {
				const original = await bucket.get(p.original);
				if (!original) throw new Error('el original ya no está en el bucket');
				lastBytes = new Uint8Array(await original.arrayBuffer());
				lastKey = p.original;
			}
			const bytes = await resize(lastBytes, p.side);
			await bucket.put(p.key, bytes, {
				httpMetadata: { contentType: 'image/webp', cacheControl: IMMUTABLE_CACHE }
			});
			written.push({ ...p, bytes: bytes.length });
			log(`escrita: ${p.key} (${bytes.length} bytes)`);
		} catch (e) {
			errors.push({ ...p, error: e instanceof Error ? e.message : String(e) });
		}
	}
	return { originals, planned, written, errors };
}

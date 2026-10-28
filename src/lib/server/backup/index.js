/**
 * Backups de la base D1 en R2 (binding BACKUPS, bucket `kinkyvibe-backups`).
 *
 * - Nocturno (cron de worker/index.js, ~06:00 UTC): `d1/AAAA-MM-DD.sql.gz` y después se borran
 *   los viejos según ./retention.js.
 * - Manual (`POST /api/cron/backup`): `d1/manual/<fecha y hora>Z.sql.gz`, nunca se borra solo.
 *
 * El archivo es SQL comprimido con gzip (ver ./dump.js). Restaurar: scripts/d1-restore.js y
 * docs/workers-migracion.md. Solo usa imports relativos (lo importa worker/index.js).
 */
import { streamDatabase } from './dump.js';
import {
	BACKUP_PREFIX,
	manualBackupKey,
	nightlyBackupKey,
	previousNightlyKey,
	selectExpiredBackups
} from './retention.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/**
 * Comprime un texto con gzip (CompressionStream: Workers y Node 18+).
 *
 * @param {string} text
 * @returns {Promise<Uint8Array>}
 */
export async function gzipText(text) {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Descomprime lo que devuelve gzipText.
 *
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {Promise<string>}
 */
export async function gunzipText(bytes) {
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Response(stream).text();
}

/** Si el backup nuevo tiene menos de esta fracción de las filas del anterior, no se poda. */
export const PRUNE_MIN_ROWS_RATIO = 0.9;

/**
 * SHA-256 en hexadecimal (no MD5: Node no lo tiene en `crypto.subtle` y los tests corren ahí).
 *
 * @param {Uint8Array} bytes
 */
async function sha256Hex(bytes) {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cuántos bytes da descomprimir un gzip, sin juntar el texto entero.
 *
 * @param {ReadableStream} stream
 */
async function gunzippedLength(stream) {
	const reader = stream.pipeThrough(new DecompressionStream('gzip')).getReader();
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return total;
		total += value.byteLength;
	}
}

/**
 * Vuelca la base comprimiéndola a medida que sale: en memoria queda solo lo comprimido (unas diez
 * veces menos), nunca el SQL entero.
 *
 * @param {D1Database} db
 * @param {Date} now
 */
async function dumpCompressed(db, now) {
	const gzip = new CompressionStream('gzip');
	const writer = gzip.writable.getWriter();
	const compressed = new Response(gzip.readable).arrayBuffer();
	const encoder = new TextEncoder();
	try {
		const { stats, sqlBytes } = await streamDatabase(
			db,
			(text) => writer.write(encoder.encode(text)),
			{ now }
		);
		await writer.close();
		return { stats, sqlBytes, body: new Uint8Array(await compressed) };
	} catch (error) {
		// Que la lectura de lo comprimido no quede como una promesa rechazada sin atender.
		compressed.catch(() => {});
		await writer.abort(error).catch(() => {});
		throw error;
	}
}

/**
 * Vuelca la base, la comprime y la sube a R2.
 *
 * @param {{ db: D1Database, bucket: R2Bucket, now?: Date, manual?: boolean }} input
 */
export async function backupDatabase({ db, bucket, now = new Date(), manual = false }) {
	const { stats, sqlBytes, body } = await dumpCompressed(db, now);
	const key = manual ? manualBackupKey(now) : nightlyBackupKey(now);
	const sha256 = await sha256Hex(body);
	await bucket.put(key, body, {
		// R2 rechaza la subida si lo que llegó no da este SHA-256.
		sha256,
		// Sin contentEncoding: el archivo se baja tal cual (.gz), no descomprimido por el cliente.
		httpMetadata: { contentType: 'application/gzip' },
		customMetadata: {
			createdAt: now.toISOString(),
			tables: String(stats.tables),
			rows: String(stats.rows),
			sqlBytes: String(sqlBytes),
			// La sentencia más larga (D1 acepta hasta 100.000 bytes al restaurar).
			maxStatementBytes: String(stats.maxStatementBytes),
			sha256
		}
	});
	// Verificar que quedó guardado entero antes de dar el backup por bueno (y antes de borrar
	// backups viejos).
	const head = await bucket.head(key);
	if (!head || head.size !== body.byteLength) {
		throw new Error(`El backup ${key} no quedó bien guardado en R2`);
	}
	// Y releerlo: que lo guardado dé el mismo SHA-256 y que se pueda descomprimir entero.
	const stored = await bucket.get(key);
	if (!stored) throw new Error(`El backup ${key} no se pudo releer de R2`);
	const storedBytes = new Uint8Array(await stored.arrayBuffer());
	if ((await sha256Hex(storedBytes)) !== sha256) {
		throw new Error(`El backup ${key} releído de R2 no coincide con lo que se subió`);
	}
	const unzipped = await gunzippedLength(new Blob([storedBytes]).stream());
	if (unzipped !== sqlBytes) {
		throw new Error(`El backup ${key} no descomprime entero (${unzipped} de ${sqlBytes} bytes)`);
	}
	return { key, bytes: body.byteLength, sqlBytes, sha256, ...stats };
}

/**
 * Todas las claves de R2 bajo `d1/`.
 *
 * @param {R2Bucket} bucket
 */
async function listBackupKeys(bucket) {
	/** @type {string[]} */
	const keys = [];
	/** @type {string | undefined} */
	let cursor;
	do {
		const page = await bucket.list({ prefix: BACKUP_PREFIX, cursor });
		keys.push(...page.objects.map((o) => o.key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return keys;
}

/**
 * Borra los backups nocturnos que ya no se guardan (ver ./retention.js).
 *
 * @param {{ bucket: R2Bucket, now?: Date, keys?: string[] }} input `keys`: las claves de `d1/`
 *   si ya se listaron
 * @returns {Promise<string[]>} claves borradas
 */
export async function pruneBackups({ bucket, now = new Date(), keys }) {
	const expired = selectExpiredBackups(keys ?? (await listBackupKeys(bucket)), now);
	for (let i = 0; i < expired.length; i += 1000) {
		await bucket.delete(expired.slice(i, i + 1000));
	}
	return expired;
}

/**
 * Por qué no podar esta noche, o `null`: el nocturno anterior tenía bastantes más filas o más
 * tablas. Sin anterior, o sin sus metadatos, no se compara.
 *
 * @param {R2Bucket} bucket
 * @param {string[]} keys
 * @param {{ key: string, rows: number, tables: number }} backup
 */
async function pruneSkipReason(bucket, keys, backup) {
	const previousKey = previousNightlyKey(keys, backup.key);
	if (!previousKey) return null;
	const meta = (await bucket.head(previousKey))?.customMetadata;
	const rows = Number(meta?.rows);
	const tables = Number(meta?.tables);
	if (Number.isFinite(tables) && meta?.tables && backup.tables < tables) {
		return `tiene ${backup.tables} tablas y el anterior (${previousKey}) tenía ${tables}`;
	}
	if (Number.isFinite(rows) && meta?.rows && backup.rows < rows * PRUNE_MIN_ROWS_RATIO) {
		return `tiene ${backup.rows} filas y el anterior (${previousKey}) tenía ${rows}`;
	}
	return null;
}

/**
 * El trabajo del cron nocturno: backup y, solo si salió bien, limpieza.
 *
 * **La limpieza nunca hace fallar la corrida**: el backup de esa noche ya quedó guardado y
 * verificado, así que si borrar los viejos falla (un Bucket lock sobre `d1/` que todavía no los
 * deja borrar, un error de R2) se escribe en el log, se devuelve `pruneError` y la corrida sigue
 * (el chequeo de integridad, el resumen y la limpieza de sesiones de scheduled.js). Los viejos se
 * vuelven a intentar borrar la noche siguiente.
 *
 * @param {{ db: D1Database, bucket: R2Bucket, now?: Date }} input
 * Tampoco se poda si el backup nuevo tiene muchas menos filas (menos del 90 %) o menos tablas que
 * el nocturno anterior (`pruneSkipped`): si algo borró datos, los backups de antes no se tocan.
 *
 * @returns {Promise<Awaited<ReturnType<typeof backupDatabase>> & { deleted: string[],
 *   pruneError?: string, pruneSkipped?: string }>}
 */
export async function nightlyBackup({ db, bucket, now = new Date() }) {
	const backup = await backupDatabase({ db, bucket, now });
	try {
		const keys = await listBackupKeys(bucket);
		const skip = await pruneSkipReason(bucket, keys, backup);
		if (skip) {
			console.error(
				`[backup] no se podan los backups viejos: ${skip}. El backup ${backup.key} se guardó igual; revisá la base antes de que se borre nada.`
			);
			return { ...backup, deleted: [], pruneSkipped: skip };
		}
		const deleted = await pruneBackups({ bucket, now, keys });
		return { ...backup, deleted };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[backup] la poda de los backups viejos falló; el backup ${backup.key} ya se hizo`,
			error
		);
		return { ...backup, deleted: [], pruneError: message };
	}
}

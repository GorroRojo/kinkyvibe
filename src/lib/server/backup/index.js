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
import { dumpDatabase } from './dump.js';
import {
	BACKUP_PREFIX,
	manualBackupKey,
	nightlyBackupKey,
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

/**
 * Vuelca la base, la comprime y la sube a R2.
 *
 * @param {{ db: D1Database, bucket: R2Bucket, now?: Date, manual?: boolean }} input
 */
export async function backupDatabase({ db, bucket, now = new Date(), manual = false }) {
	const { sql, stats } = await dumpDatabase(db, { now });
	const body = await gzipText(sql);
	const key = manual ? manualBackupKey(now) : nightlyBackupKey(now);
	await bucket.put(key, body, {
		// Sin contentEncoding: el archivo se baja tal cual (.gz), no descomprimido por el cliente.
		httpMetadata: { contentType: 'application/gzip' },
		customMetadata: {
			createdAt: now.toISOString(),
			tables: String(stats.tables),
			rows: String(stats.rows),
			sqlBytes: String(sql.length)
		}
	});
	// Verificar que quedó guardado entero antes de dar el backup por bueno (y antes de borrar
	// backups viejos).
	const head = await bucket.head(key);
	if (!head || head.size !== body.byteLength) {
		throw new Error(`El backup ${key} no quedó bien guardado en R2`);
	}
	return { key, bytes: body.byteLength, ...stats };
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
 * @param {{ bucket: R2Bucket, now?: Date }} input
 * @returns {Promise<string[]>} claves borradas
 */
export async function pruneBackups({ bucket, now = new Date() }) {
	const expired = selectExpiredBackups(await listBackupKeys(bucket), now);
	for (let i = 0; i < expired.length; i += 1000) {
		await bucket.delete(expired.slice(i, i + 1000));
	}
	return expired;
}

/**
 * El trabajo del cron nocturno: backup y, solo si salió bien, limpieza.
 *
 * @param {{ db: D1Database, bucket: R2Bucket, now?: Date }} input
 */
export async function nightlyBackup({ db, bucket, now = new Date() }) {
	const backup = await backupDatabase({ db, bucket, now });
	const deleted = await pruneBackups({ bucket, now });
	return { ...backup, deleted };
}

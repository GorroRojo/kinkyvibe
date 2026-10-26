/**
 * Tareas programadas del Worker (el `scheduled()` de worker/index.js). Los horarios están en
 * `[triggers] crons` de wrangler.toml, que tienen que coincidir con estas constantes (hay un
 * test que lo verifica). Los crons corren solo en producción: los Previews no los ejecutan.
 *
 * Solo usa imports relativos: worker/index.js lo importa sin pasar por Vite.
 */
import { nightlyBackup } from './backup/index.js';
import { copyMedia } from './backup/media.js';
import { deleteStaleSessions } from './cuentas/sessionAge.js';
import { SITE_URL, siteOriginFrom } from '../utils/site.js';
import { runAnalyticsRollup } from './analytics/report.js';
import {
	checkObjectsIntegrity,
	hasObjectsSchema,
	recordIntegrityRun
} from './objects/integrity.js';

/** Recordatorios de entradas: cada 15 minutos (UTC). */
export const REMINDERS_CRON = '*/15 * * * *';
/** Backup de la base a R2: todas las noches a las 06:00 UTC (03:00 en Argentina). */
export const BACKUP_CRON = '0 6 * * *';

/** Origen por defecto para el pedido interno de los recordatorios (src/lib/utils/site.js). */
export const DEFAULT_ORIGIN = SITE_URL;

/**
 * @typedef {{
 *   DB?: import('@cloudflare/workers-types').D1Database,
 *   BACKUPS?: import('@cloudflare/workers-types').R2Bucket,
 *   MEDIA?: import('@cloudflare/workers-types').R2Bucket,
 *   MEDIA_COPIA?: import('@cloudflare/workers-types').R2Bucket,
 *   CRON_SECRET?: string,
 *   SITE_URL?: string,
 *   CF_ACCOUNT_ID?: string,
 *   CF_ANALYTICS_TOKEN?: string
 * }} ScheduledEnv
 */

/**
 * @typedef {(
 *   request: Request,
 *   env: any,
 *   ctx: import('@cloudflare/workers-types').ExecutionContext
 * ) => Promise<Response>} AppFetch
 */

/**
 * Recordatorios: el mismo pedido que antes hacía el Worker aparte `kinkyvibe-cron`, pero sin
 * salir a internet: se le pasa directo al fetch de SvelteKit. Así sigue corriendo exactamente
 * `POST /api/cron/recordatorios` (con su control de CRON_SECRET), sin duplicar su lógica.
 *
 * @param {ScheduledEnv} env
 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
 * @param {AppFetch} appFetch
 */
export async function runReminders(env, ctx, appFetch) {
	const origin = siteOriginFrom(env.SITE_URL);
	const url = `${origin}/api/cron/recordatorios`;
	const response = await appFetch(
		new Request(url, {
			method: 'POST',
			headers: { 'x-cron-secret': env.CRON_SECRET ?? '', accept: 'application/json' }
		}),
		env,
		ctx
	);
	const body = (await response.text()).slice(0, 300);
	if (!response.ok) {
		// Tirar el error hace que la corrida figure como fallida en Cloudflare (Cron Events).
		throw new Error(`recordatorios: ${response.status} ${body}`);
	}
	console.log(`recordatorios: ${body}`);
	return body;
}

/**
 * Backup nocturno de D1 a R2 y limpieza de los viejos.
 *
 * @param {ScheduledEnv} env
 * @param {Date} now
 */
export async function runBackup(env, now) {
	if (!env.DB) throw new Error('backup: falta el binding DB');
	if (!env.BACKUPS) throw new Error('backup: falta el binding BACKUPS (bucket de R2)');
	const result = await nightlyBackup({ db: env.DB, bucket: env.BACKUPS, now });
	console.log(
		`backup: ${result.key} (${result.bytes} bytes, ${result.tables} tablas, ${result.rows} filas); borrados: ${result.deleted.length ? result.deleted.join(', ') : 'ninguno'}`
	);
	return result;
}

/** Cuántos problemas de integridad se escriben en el log, como mucho. */
const MAX_LOGGED_PROBLEMS = 50;

/**
 * Chequeo nocturno de integridad de los objetos (src/lib/server/objects/integrity.js), después
 * del backup. **Nunca hace fallar la corrida**: guarda el resultado en `integrity_runs` (el
 * Inicio del panel lo muestra en "Para revisar") y escribe en el log los códigos e ids (sin
 * datos). Si el chequeo mismo falla, lo escribe en el log y sigue. No arregla nada solo.
 *
 * @param {ScheduledEnv} env
 * @param {Date} [now]
 * @returns {Promise<{ count: number } | null>} null si no corrió
 */
export async function runObjectsIntegrity(env, now = new Date()) {
	try {
		if (!env.DB) {
			console.error('integridad de objetos: falta el binding DB; no se revisó');
			return null;
		}
		if (!(await hasObjectsSchema(env.DB))) {
			console.log(
				'integridad de objetos: la base todavía no tiene la migración 0012; nada que revisar'
			);
			return null;
		}
		const problems = await checkObjectsIntegrity(env.DB);
		await recordIntegrityRun(env.DB, problems, now.getTime());
		if (!problems.length) console.log('integridad de objetos: sin problemas');
		for (const p of problems.slice(0, MAX_LOGGED_PROBLEMS)) {
			console.error(`integridad de objetos: [${p.code}] ${p.message}`);
		}
		if (problems.length) {
			console.error(
				`integridad de objetos: ${problems.length} problema(s), guardados para "Para revisar"`
			);
		}
		return { count: problems.length };
	} catch (error) {
		console.error('integridad de objetos: el chequeo falló (el backup ya se hizo)', error);
		return null;
	}
}

/**
 * Copia nocturna de la biblioteca (MEDIA) al bucket de la copia (MEDIA_COPIA): solo suma, nunca
 * borra de la copia, con topes por noche (src/lib/server/backup/media.js; docs/imagenes.md).
 * **Nunca hace fallar la corrida**. Solo en producción: los Previews no corren crons ni tienen
 * MEDIA_COPIA; sin el binding no hace nada.
 *
 * @param {ScheduledEnv} env
 * @param {Partial<import('./backup/media.js').MediaCopyLimits>} [limits]
 * @returns {Promise<import('./backup/media.js').MediaCopyResult | null>} null si no corrió
 */
export async function runMediaCopy(env, limits) {
	try {
		if (!env.MEDIA_COPIA) {
			console.log('copia de medios: sin el binding MEDIA_COPIA; no se copió');
			return null;
		}
		if (!env.MEDIA) {
			console.error('copia de medios: falta el binding MEDIA; no se copió');
			return null;
		}
		const result = await copyMedia({ source: env.MEDIA, target: env.MEDIA_COPIA, limits });
		const mb = (result.copiedBytes / 1024 / 1024).toFixed(1);
		const rest = result.done
			? 'vuelta completa'
			: `sigue mañana después de ${result.resumeAfter || 'el principio'}`;
		const line = `copia de medios: ${result.copied} copiado(s) (${mb} MB), ${result.checked} revisado(s), ${result.failed.length} con error, ${result.listPages} página(s) listadas; ${rest}`;
		if (result.failed.length) console.error(line);
		else console.log(line);
		return result;
	} catch (error) {
		console.error('copia de medios: falló (el backup ya se hizo)', error);
		return null;
	}
}

/**
 * Limpieza nocturna de las sesiones de las cuentas que ya no tienen cookie en ningún navegador
 * (src/lib/server/cuentas/sessionAge.js): no cierra la sesión de nadie. **Nunca hace fallar la
 * corrida**: si falla, lo escribe en el log y sigue. En el log va solo cuántas borró.
 *
 * @param {ScheduledEnv} env
 * @param {Date} [now]
 * @returns {Promise<number | null>} cuántas borró, o null si no corrió
 */
export async function runSessionCleanup(env, now = new Date()) {
	try {
		if (!env.DB) {
			console.error('sesiones viejas: falta el binding DB; no se limpió');
			return null;
		}
		const deleted = await deleteStaleSessions(env.DB, now.getTime());
		console.log(`sesiones viejas: ${deleted} borrada(s)`);
		return deleted;
	} catch (error) {
		console.error('sesiones viejas: la limpieza falló (el backup ya se hizo)', error);
		return null;
	}
}

/**
 * El handler `scheduled()`: elige la tarea según el cron que disparó.
 *
 * @param {{ cron: string, scheduledTime: number }} controller
 * @param {ScheduledEnv} env
 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
 * @param {AppFetch} appFetch el fetch del Worker de SvelteKit
 */
export async function handleScheduled(controller, env, ctx, appFetch) {
	switch (controller.cron) {
		case REMINDERS_CRON:
			return runReminders(env, ctx, appFetch);
		case BACKUP_CRON: {
			// Primero el backup (si falla, la corrida falla). El chequeo, el resumen mensual de las
			// visitas y la limpieza de sesiones sin cookie después, y nunca la hacen fallar: lo que
			// encuentra el chequeo queda en "Para revisar"; el resumen, en `analytics_monthly` (meses
			// de Argentina, docs/analiticas.md). Al final, la copia de la biblioteca al segundo bucket.
			const backup = await runBackup(env, new Date(controller.scheduledTime));
			await runObjectsIntegrity(env, new Date(controller.scheduledTime));
			await runAnalyticsRollup(env, { now: new Date(controller.scheduledTime) });
			await runSessionCleanup(env, new Date(controller.scheduledTime));
			await runMediaCopy(env);
			return backup;
		}
		default:
			throw new Error(`cron desconocido: ${controller.cron}`);
	}
}

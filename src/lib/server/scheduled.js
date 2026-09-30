/**
 * Tareas programadas del Worker (el `scheduled()` de worker/index.js). Los horarios están en
 * `[triggers] crons` de wrangler.toml, que tienen que coincidir con estas constantes (hay un
 * test que lo verifica). Los crons corren solo en producción: los Previews no los ejecutan.
 *
 * Solo usa imports relativos: worker/index.js lo importa sin pasar por Vite.
 */
import { nightlyBackup } from './backup/index.js';
import { checkObjectsIntegrity, hasObjectsSchema } from './objects/integrity.js';

/** Recordatorios de entradas: cada 15 minutos (UTC). */
export const REMINDERS_CRON = '*/15 * * * *';
/** Backup de la base a R2: todas las noches a las 06:00 UTC (03:00 en Argentina). */
export const BACKUP_CRON = '0 6 * * *';

/** Origen por defecto para el pedido interno de los recordatorios. */
export const DEFAULT_ORIGIN = 'https://kinkyvibe.ar';

/**
 * @typedef {{
 *   DB?: import('@cloudflare/workers-types').D1Database,
 *   BACKUPS?: import('@cloudflare/workers-types').R2Bucket,
 *   CRON_SECRET?: string,
 *   SITE_URL?: string
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
 * Recordatorios: el mismo pedido que antes hacía el Worker aparte de workers/cron/, pero sin
 * salir a internet: se le pasa directo al fetch de SvelteKit. Así sigue corriendo exactamente
 * `POST /api/cron/recordatorios` (con su control de CRON_SECRET), sin duplicar su lógica.
 *
 * @param {ScheduledEnv} env
 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
 * @param {AppFetch} appFetch
 */
export async function runReminders(env, ctx, appFetch) {
	const origin = (env.SITE_URL?.trim() || DEFAULT_ORIGIN).replace(/\/+$/, '');
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
 * del backup. Si encuentra problemas los escribe en el log (ids y códigos, sin datos) y falla,
 * para que la corrida quede marcada como error en Cloudflare. No arregla nada solo.
 *
 * @param {ScheduledEnv} env
 */
export async function runObjectsIntegrity(env) {
	if (!env.DB) throw new Error('integridad: falta el binding DB');
	if (!(await hasObjectsSchema(env.DB))) {
		console.log(
			'integridad de objetos: la base todavía no tiene la migración 0012; nada que revisar'
		);
		return [];
	}
	const problems = await checkObjectsIntegrity(env.DB);
	if (!problems.length) {
		console.log('integridad de objetos: sin problemas');
		return problems;
	}
	for (const p of problems.slice(0, MAX_LOGGED_PROBLEMS)) {
		console.error(`integridad de objetos: [${p.code}] ${p.message}`);
	}
	throw new Error(
		`integridad de objetos: ${problems.length} problema(s); el backup sí se hizo. Ver docs/objetos.md («Chequeo nocturno»).`
	);
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
			// Primero el backup: si el chequeo encuentra problemas, el backup ya quedó guardado.
			const backup = await runBackup(env, new Date(controller.scheduledTime));
			await runObjectsIntegrity(env);
			return backup;
		}
		default:
			throw new Error(`cron desconocido: ${controller.cron}`);
	}
}

/**
 * Los crons del Worker y su «latido» (docs/workers-migracion.md, «Avisos de fallas por Telegram»).
 *
 * - Las expresiones de los crons viven acá (src/lib/server/scheduled.js las reexporta y
 *   `wrangler.toml` tiene que tener exactamente estas; lo verifica un test). Así la vigilancia las
 *   puede leer sin importar todo scheduled.js.
 * - Cada corrida anota en `cron_heartbeats` (migración 0074) cuándo arrancó y, si terminó bien,
 *   cuándo terminó ({@link recordCronStart}, {@link recordCronOk}). Nunca hace fallar la corrida:
 *   sin la tabla (migración sin aplicar) o con la base caída, solo queda en el log.
 * - {@link staleCrons}: los crons que no terminaron bien en su plazo ({@link WATCHED_CRONS}). La
 *   corren el cron de cada 15 minutos y el de cada hora, así cada uno vigila al otro (y los dos, a
 *   los de todos los días). Si se mueren **todos** los crons, nada adentro del Worker se entera:
 *   eso (y el sitio entero caído) lo cubre `vigilante-produccion` desde GitHub.
 *
 * Solo imports relativos (ninguno, en realidad): worker/index.js lo usa sin pasar por Vite.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Recordatorios, mails en tanda, conciliación con Mercado Pago y avisos: cada 15 minutos (UTC). */
export const REMINDERS_CRON = '*/15 * * * *';
/** Backup de la base a R2: todas las noches a las 06:00 UTC (03:00 en Argentina). */
export const BACKUP_CRON = '0 6 * * *';
/**
 * Cotización del dólar MEP para PayPal: todos los días a las 21:15 UTC (18:15 en Argentina),
 * después del cierre del mercado (src/lib/server/paypal/rates.js).
 */
export const RATES_CRON = '15 21 * * *';
/**
 * Vigilancia: cada hora, a los 41 minutos (fuera de los minutos de los otros crons). Mira que los
 * otros crons anden y borra los conteos de errores viejos (`/api/cron/vigilancia`).
 */
export const WATCH_CRON = '41 * * * *';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Cada cron vigilado: su nombre en el aviso y cuánto puede pasar sin que termine bien.
 *
 * - el de cada 15 minutos: 1 hora (se saltearon unas 4 corridas seguidas);
 * - la vigilancia (cada hora): 3 horas;
 * - los de todos los días: 26 horas (un día y un margen de 2 horas).
 *
 * @type {readonly { cron: string, label: string, maxSilenceMs: number }[]}
 */
export const WATCHED_CRONS = Object.freeze([
	{
		cron: REMINDERS_CRON,
		label: 'Cada 15 minutos: recordatorios, mails y conciliación',
		maxSilenceMs: HOUR
	},
	{ cron: WATCH_CRON, label: 'Cada hora: vigilancia', maxSilenceMs: 3 * HOUR },
	{ cron: BACKUP_CRON, label: 'Todas las noches: backup de la base', maxSilenceMs: 26 * HOUR },
	{ cron: RATES_CRON, label: 'Todos los días: cotización del dólar', maxSilenceMs: 26 * HOUR }
]);

/**
 * Corre una escritura del latido sin tirar nunca.
 *
 * @param {string} what
 * @param {() => Promise<unknown>} write
 */
async function quietly(what, write) {
	try {
		await write();
	} catch (error) {
		console.warn(
			`[vigilancia] no se pudo anotar ${what}:`,
			/** @type {Error} */ (error)?.message ?? error
		);
	}
}

/**
 * Anota que arrancó una corrida de `cron`. Nunca tira.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} cron
 * @param {number} now
 */
export async function recordCronStart(db, cron, now) {
	if (!db) return;
	await quietly('el arranque del cron', () =>
		db
			.prepare(
				`INSERT INTO cron_heartbeats (cron, first_seen_at, last_started_at) VALUES (?1, ?2, ?2)
				ON CONFLICT (cron) DO UPDATE SET last_started_at = excluded.last_started_at`
			)
			.bind(cron, now)
			.run()
	);
}

/**
 * Anota que una corrida de `cron` terminó bien. Nunca tira.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} cron
 * @param {number} now
 */
export async function recordCronOk(db, cron, now) {
	if (!db) return;
	await quietly('el final del cron', () =>
		db
			.prepare(
				`INSERT INTO cron_heartbeats (cron, first_seen_at, last_ok_at) VALUES (?1, ?2, ?2)
				ON CONFLICT (cron) DO UPDATE SET last_ok_at = excluded.last_ok_at`
			)
			.bind(cron, now)
			.run()
	);
}

/**
 * Un cron que no terminó bien en su plazo. `lastOkAt`: la última vez que terminó bien (`null`:
 * nunca desde que se empezó a mirar); `silentMs`: cuánto pasó desde esa vez (o desde que se
 * empezó a mirar).
 *
 * @typedef {{ cron: string, label: string, lastOkAt: number | null, silentMs: number }} StaleCron
 */

/**
 * Los crons de {@link WATCHED_CRONS} que no terminaron bien en su plazo. La primera vez que ve un
 * cron sin fila, la crea (`first_seen_at` = ahora): desde ahí corre su plazo, así uno que nunca
 * anduvo también avisa. Tira si la base falla (lo agarra quien llama).
 *
 * @param {D1Database} db
 * @param {number} now
 * @param {readonly { cron: string, label: string, maxSilenceMs: number }[]} [watched]
 * @returns {Promise<StaleCron[]>}
 */
export async function staleCrons(db, now, watched = WATCHED_CRONS) {
	if (watched.length === 0) return [];
	await db.batch(
		watched.map((w) =>
			db
				.prepare('INSERT OR IGNORE INTO cron_heartbeats (cron, first_seen_at) VALUES (?1, ?2)')
				.bind(w.cron, now)
		)
	);
	const { results } = await db
		.prepare('SELECT cron, first_seen_at, last_ok_at FROM cron_heartbeats')
		.all();
	const byCron = new Map(results.map((r) => [String(r.cron), r]));
	/** @type {StaleCron[]} */
	const out = [];
	for (const w of watched) {
		const row = byCron.get(w.cron);
		if (!row) continue;
		const lastOkAt = row.last_ok_at == null ? null : Number(row.last_ok_at);
		const since = lastOkAt ?? Number(row.first_seen_at);
		const silentMs = now - since;
		if (silentMs > w.maxSilenceMs) out.push({ cron: w.cron, label: w.label, lastOkAt, silentMs });
	}
	return out;
}

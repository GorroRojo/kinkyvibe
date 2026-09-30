/**
 * Qué backups nocturnos de R2 se borran. Se guardan:
 * - todos los de los últimos DAILY_DAYS días;
 * - el primero de cada mes de los últimos MONTHLY_MONTHS meses (el mes actual incluido);
 * - el primero de cada año, para siempre (pesan poco: «no quiero perder nunca nada»).
 *
 * Solo se consideran las claves nocturnas exactas (`d1/AAAA-MM-DD.sql.gz`): cualquier otra cosa
 * del bucket (backups manuales, archivos subidos a mano) nunca se borra sola.
 */

export const BACKUP_PREFIX = 'd1/';
export const DAILY_DAYS = 30;
export const MONTHLY_MONTHS = 12;

const NIGHTLY_KEY = /^d1\/(\d{4})-(\d{2})-(\d{2})\.sql\.gz$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clave del backup nocturno de un día (UTC).
 *
 * @param {Date} date
 */
export function nightlyBackupKey(date) {
	return `${BACKUP_PREFIX}${date.toISOString().slice(0, 10)}.sql.gz`;
}

/**
 * Clave de un backup manual (nunca pisa al nocturno ni se borra solo).
 *
 * @param {Date} date
 */
export function manualBackupKey(date) {
	const stamp = date.toISOString().slice(0, 19).replaceAll(':', '-');
	return `${BACKUP_PREFIX}manual/${stamp}Z.sql.gz`;
}

/**
 * @param {string} key
 * @returns {{ key: string, y: number, m: number, d: number, day: number } | null}
 */
function parseNightly(key) {
	const match = NIGHTLY_KEY.exec(key);
	if (!match) return null;
	const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const day = Date.UTC(y, m - 1, d);
	// Rechaza fechas imposibles (2026-02-31) en vez de adivinar.
	if (new Date(day).toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) {
		return null;
	}
	return { key, y, m, d, day: day / DAY_MS };
}

/**
 * Claves que ya no hace falta guardar.
 *
 * @param {string[]} keys todas las claves del prefijo `d1/`
 * @param {Date} now
 * @param {{ dailyDays?: number, monthlyMonths?: number }} [options]
 * @returns {string[]}
 */
export function selectExpiredBackups(
	keys,
	now,
	{ dailyDays = DAILY_DAYS, monthlyMonths = MONTHLY_MONTHS } = {}
) {
	const today = Math.floor(now.getTime() / DAY_MS);
	const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
	const backups = keys
		.flatMap((key) => {
			const parsed = parseNightly(key);
			return parsed ? [parsed] : [];
		})
		.sort((a, b) => a.day - b.day);

	/** @type {Set<string>} */
	const keep = new Set();
	/** @type {Set<string>} */
	const seenMonths = new Set();
	/** @type {Set<number>} */
	const seenYears = new Set();
	for (const b of backups) {
		// Diarios (y cualquier fecha futura, por las dudas).
		if (today - b.day < dailyDays) keep.add(b.key);
		// El primero de cada mes (los backups están ordenados por fecha).
		const month = `${b.y}-${b.m}`;
		if (!seenMonths.has(month)) {
			seenMonths.add(month);
			if (thisMonth - (b.y * 12 + (b.m - 1)) < monthlyMonths) keep.add(b.key);
		}
		// El primero de cada año.
		if (!seenYears.has(b.y)) {
			seenYears.add(b.y);
			keep.add(b.key);
		}
	}
	return backups.filter((b) => !keep.has(b.key)).map((b) => b.key);
}

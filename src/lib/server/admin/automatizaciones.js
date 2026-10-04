/**
 * Ajustes → Automatizaciones: «dónde viven las automatizaciones». Junta, solo para leer, todo lo
 * que corre solo: los crons del Worker (wrangler.toml `[triggers]` y src/lib/server/scheduled.js),
 * los mails que salen solos en cada vuelta del cron, el bot de Telegram y, más adelante, las
 * reglas «si pasa X, hacé Y».
 *
 * Nada de esto cambia nada: cada lectura va en su propio try/catch (una tabla que falta, porque la
 * migración todavía no se aplicó, deja ese dato vacío y la página sigue). Del bot solo se dice si
 * el secreto y el token están cargados (sí/no): nunca su valor. De los envíos, solo cuándo y
 * cuántos: nunca a quién.
 */
import { BACKUP_CRON, REMINDERS_CRON } from '../scheduled.js';
import { describeReminder, parseReminders } from '../tickets/reminders.js';
import { BACKUP_PREFIX } from '../backup/retention.js';
import { MIN_WEBHOOK_SECRET_LENGTH } from '../telegram/webhook.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/** Argentina: UTC−3 todo el año (sin horario de verano desde 2009), como en reminders.js. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/**
 * Los crons que este archivo sabe leer: «cada N minutos» (`*\/N * * * *`) y «todos los días a una
 * hora» (`M H * * *`, en UTC). Cualquier otra forma devuelve `null` (se muestra tal cual, sin
 * próxima corrida).
 *
 * @param {string} expr
 * @returns {{ kind: 'every', minutes: number } | { kind: 'daily', hour: number, minute: number } | null}
 */
export function parseCron(expr) {
	const parts = String(expr ?? '')
		.trim()
		.split(/\s+/);
	if (parts.length !== 5 || parts.slice(2).some((p) => p !== '*')) return null;
	const [m, h] = parts;
	const every = m.match(/^\*\/(\d{1,2})$/);
	if (every && h === '*') {
		const minutes = Number(every[1]);
		return minutes >= 1 && minutes <= 59 && 60 % minutes === 0 ? { kind: 'every', minutes } : null;
	}
	if (/^\d{1,2}$/.test(m) && /^\d{1,2}$/.test(h)) {
		const minute = Number(m);
		const hour = Number(h);
		return minute < 60 && hour < 24 ? { kind: 'daily', hour, minute } : null;
	}
	return null;
}

/**
 * Próxima corrida de un cron (ms, UTC) estrictamente después de `now`, o `null` si la forma no se
 * conoce (ver {@link parseCron}).
 *
 * @param {string} expr
 * @param {number} now
 * @returns {number | null}
 */
export function nextCronRun(expr, now) {
	const c = parseCron(expr);
	if (!c) return null;
	if (c.kind === 'every') {
		const step = c.minutes * MINUTE;
		return Math.floor(now / step) * step + step;
	}
	const dayStart = Math.floor(now / DAY) * DAY;
	const today = dayStart + c.hour * 60 * MINUTE + c.minute * MINUTE;
	return today > now ? today : today + DAY;
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * El cron en palabras: «cada 15 minutos», «todos los días a las 03:00 (hora de Argentina)».
 *
 * @param {string} expr
 */
export function describeCron(expr) {
	const c = parseCron(expr);
	if (!c) return expr;
	if (c.kind === 'every') return c.minutes === 1 ? 'cada minuto' : `cada ${c.minutes} minutos`;
	const local = (c.hour * 60 + c.minute) * MINUTE - AR_OFFSET_MS;
	const minutes = (((local / MINUTE) % (24 * 60)) + 24 * 60) % (24 * 60);
	return `todos los días a las ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)} (hora de Argentina)`;
}

/**
 * Corre una consulta de una fila; si falla (tabla que todavía no existe, sin base), `null`.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function firstOrNull(db, sql, params = []) {
	if (!db) return null;
	try {
		return (
			(await db
				.prepare(sql)
				.bind(...params)
				.first()) ?? null
		);
	} catch {
		return null;
	}
}

/** @param {unknown} v */
const msOrNull = (v) =>
	v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
/** @param {unknown} v */
const countOf = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Último envío y fallidos de una tabla de envíos en tandas (`reminder_sends`,
 * `stream_link_sends`: migración 0011).
 *
 * @param {D1Database | null | undefined} db
 * @param {'reminder_sends' | 'stream_link_sends'} table
 */
async function batchSendStats(db, table) {
	const row = await firstOrNull(
		db,
		`SELECT MAX(CASE WHEN status = 'sent' THEN sent_at END) AS last_sent,
			SUM(CASE WHEN status IN ('sending', 'retry') THEN 1 ELSE 0 END) AS pending,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
		FROM ${table}`
	);
	return {
		lastRun: msOrNull(row?.last_sent),
		pending: countOf(row?.pending),
		failed: countOf(row?.failed)
	};
}

/**
 * El último backup nocturno en R2 (`d1/AAAA-MM-DD.sql.gz`), si el bucket está (solo en
 * producción). `null` si no hay bucket o no se pudo leer.
 *
 * @param {R2Bucket | null | undefined} bucket
 * @returns {Promise<{ at: number, key: string } | null>}
 */
export async function lastNightlyBackup(bucket) {
	if (!bucket) return null;
	try {
		/** @type {{ at: number, key: string } | null} */
		let best = null;
		/** @type {string | undefined} */
		let cursor;
		// Los nocturnos están directo en d1/ (los manuales, en d1/manual/).
		for (let page = 0; page < 10; page++) {
			const res = await bucket.list({ prefix: BACKUP_PREFIX, cursor, delimiter: '/' });
			for (const o of res.objects) {
				const at = o.uploaded instanceof Date ? o.uploaded.getTime() : Number(o.uploaded);
				if (Number.isFinite(at) && (!best || at > best.at)) best = { at, key: o.key };
			}
			if (!res.truncated) break;
			cursor = /** @type {any} */ (res).cursor;
		}
		return best;
	} catch {
		return null;
	}
}

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   what: string,
 *   when: string,
 *   lastRun: number | null,
 *   lastRunLabel?: string,
 *   nextRun: number | null,
 *   state: 'on' | 'off' | 'warn',
 *   stateLabel: string,
 *   details: string[],
 *   configHref: string,
 *   configLabel: string
 * }} Automation
 */

/**
 * @typedef {{
 *   db?: D1Database | null,
 *   backups?: R2Bucket | null,
 *   env?: Record<string, string | undefined>,
 *   flags?: Record<string, boolean>,
 *   salesSettings?: { reminders?: string } | null,
 *   now?: number
 * }} AutomationInput
 */

/**
 * Todo lo que corre solo, para Ajustes → Automatizaciones.
 *
 * @param {AutomationInput} input
 * @returns {Promise<{ crons: Automation[], mails: Automation[], telegram: Automation, rules: { soon: true, text: string } }>}
 */
export async function loadAutomations({
	db = null,
	backups = null,
	env = {},
	flags = {},
	salesSettings = null,
	now = Date.now()
} = {}) {
	const on = (/** @type {string} */ k) => flags[k] === true;
	const reminders = parseReminders(salesSettings?.reminders);
	const activeReminders = reminders.filter((r) => r.enabled);

	const [reminderStats, streamStats, seriesRow, sigoRows, integrity, backup, tgChats] =
		await Promise.all([
			batchSendStats(db, 'reminder_sends'),
			batchSendStats(db, 'stream_link_sends'),
			firstOrNull(
				db,
				'SELECT MAX(sent_at) AS last_sent, COUNT(*) AS total FROM series_notifications'
			),
			firstOrNull(
				db,
				`SELECT
					MAX(CASE WHEN kind = 'nuevo' AND channel = 'mail' THEN sent_at END) AS nuevo_mail,
					MAX(CASE WHEN kind = 'recordatorio' AND channel = 'mail' THEN sent_at END) AS rec_mail,
					MAX(CASE WHEN channel = 'telegram' THEN sent_at END) AS tg
				FROM follow_notifications`
			),
			firstOrNull(db, 'SELECT ran_at, problem_count FROM integrity_runs ORDER BY id DESC LIMIT 1'),
			lastNightlyBackup(backups),
			firstOrNull(db, 'SELECT COUNT(*) AS n FROM telegram_chats')
		]);

	const remindersNext = nextCronRun(REMINDERS_CRON, now);
	const backupNext = nextCronRun(BACKUP_CRON, now);
	const lastMailActivity = Math.max(
		reminderStats.lastRun ?? 0,
		streamStats.lastRun ?? 0,
		msOrNull(seriesRow?.last_sent) ?? 0,
		msOrNull(sigoRows?.nuevo_mail) ?? 0,
		msOrNull(sigoRows?.rec_mail) ?? 0,
		msOrNull(sigoRows?.tg) ?? 0
	);
	const integrityAt = msOrNull(integrity?.ran_at);
	const backupAt = backup?.at ?? null;

	/** @type {Automation[]} */
	const crons = [
		{
			id: 'cron-recordatorios',
			title: 'Vuelta de mails',
			what:
				'Manda una tanda de lo que toca: recordatorios de entradas, links de transmisión, avisos ' +
				'de series y de «Lo que sigo» (mail y Telegram). Cada vuelta sigue donde quedó la anterior.',
			when: describeCron(REMINDERS_CRON),
			lastRun: lastMailActivity || null,
			lastRunLabel: 'Último envío que salió',
			nextRun: remindersNext,
			state: 'on',
			stateLabel: 'Corre solo en producción',
			details: [`Cron: ${REMINDERS_CRON} (UTC)`, 'Los previews no ejecutan crons.'],
			configHref: '/admin/ajustes/mails',
			configLabel: 'Mails y envíos'
		},
		{
			id: 'cron-backup',
			title: 'Backup nocturno',
			what:
				'Copia la base entera a R2 (un archivo por noche) y borra los viejos. Después corre el ' +
				'chequeo de integridad de los datos, que no arregla nada: lo que encuentra queda en ' +
				'«Para revisar».',
			when: describeCron(BACKUP_CRON),
			lastRun: backupAt ?? integrityAt,
			lastRunLabel: backupAt ? 'Último backup' : 'Último chequeo (corre después del backup)',
			nextRun: backupNext,
			state: integrity && countOf(integrity.problem_count) > 0 ? 'warn' : 'on',
			stateLabel:
				integrity && countOf(integrity.problem_count) > 0
					? `El último chequeo encontró ${countOf(integrity.problem_count)} problema(s)`
					: 'Corre solo en producción',
			details: [
				`Cron: ${BACKUP_CRON} (UTC)`,
				backup ? `Archivo: ${backup.key}` : 'El bucket de backups solo existe en producción.'
			],
			configHref: '/admin#para-revisar',
			configLabel: 'Para revisar'
		}
	];

	const remindersOn = activeReminders.length > 0;
	/** @type {Automation[]} */
	const mails = [
		{
			id: 'mail-recordatorios',
			title: 'Recordatorios de entradas',
			what: 'A quienes compraron entradas, antes de cada evento. Un evento los puede apagar.',
			when: remindersOn ? activeReminders.map(describeReminder).join(' · ') : 'Ninguno activado',
			lastRun: reminderStats.lastRun,
			nextRun: remindersOn ? remindersNext : null,
			state: reminderStats.failed ? 'warn' : remindersOn ? 'on' : 'off',
			stateLabel: reminderStats.failed
				? `${reminderStats.failed} sin poder mandar`
				: remindersOn
					? 'Activados'
					: 'Apagados',
			details: [
				...reminders.filter((r) => !r.enabled).map((r) => `Desactivado: ${describeReminder(r)}`),
				...(reminderStats.pending ? [`${reminderStats.pending} en la tanda que sigue`] : [])
			],
			configHref: '/admin/ajustes/mails',
			configLabel: 'Ajustes → Mails'
		},
		{
			id: 'mail-transmision',
			title: 'Links de transmisión',
			what:
				'Cuando tocás «Enviar el link a todes» en un evento online, el link sale en tandas en ' +
				'cada vuelta, sin repetir.',
			when: 'Cuando lo pedís, en las vueltas siguientes',
			lastRun: streamStats.lastRun,
			nextRun: streamStats.pending ? remindersNext : null,
			state: streamStats.failed ? 'warn' : 'on',
			stateLabel: streamStats.failed
				? `${streamStats.failed} sin poder mandar`
				: streamStats.pending
					? `${streamStats.pending} en camino`
					: 'Nada pendiente',
			details: [],
			configHref: '/admin/eventos',
			configLabel: 'La ficha de cada evento'
		},
		{
			id: 'mail-series',
			title: 'Avisos de series',
			what:
				'A quienes pidieron «Avisame si se repite»: un mail cuando se anuncia una edición nueva ' +
				'de la serie.',
			when: 'En cada vuelta, cuando aparece una edición nueva',
			lastRun: msOrNull(seriesRow?.last_sent),
			// Las series ya no tienen interruptor: siempre prendidas.
			nextRun: remindersNext,
			state: 'on',
			stateLabel: 'Prendido',
			details: seriesRow ? [`${countOf(seriesRow.total)} avisos mandados en total`] : [],
			configHref: '/admin/eventos/series',
			configLabel: 'Eventos → Series'
		},
		{
			id: 'mail-sigo-nuevo',
			title: '«Lo que sigo»: algo nuevo',
			what: 'A cada cuenta, cuando se anuncia un evento de algo que sigue.',
			when: 'En cada vuelta, cuando aparece un evento nuevo',
			lastRun: msOrNull(sigoRows?.nuevo_mail),
			nextRun: on('lo_que_sigo') && on('cuentas') ? remindersNext : null,
			state: on('lo_que_sigo') && on('cuentas') ? 'on' : 'off',
			stateLabel:
				on('lo_que_sigo') && on('cuentas')
					? 'Prendido'
					: 'Apagado (interruptores «Lo que sigo» y «Cuentas del público»)',
			details: [],
			configHref: '/admin/ajustes/interruptores',
			configLabel: 'Interruptores'
		},
		{
			id: 'mail-sigo-recordatorio',
			title: '«Lo que sigo»: recordatorio',
			what: 'A cada cuenta, antes de los eventos de lo que sigue (si eligió recordatorio).',
			when: 'En cada vuelta, antes de cada evento',
			lastRun: msOrNull(sigoRows?.rec_mail),
			nextRun: on('lo_que_sigo') && on('cuentas') ? remindersNext : null,
			state: on('lo_que_sigo') && on('cuentas') ? 'on' : 'off',
			stateLabel:
				on('lo_que_sigo') && on('cuentas')
					? 'Prendido'
					: 'Apagado (interruptores «Lo que sigo» y «Cuentas del público»)',
			details: [],
			configHref: '/admin/ajustes/interruptores',
			configLabel: 'Interruptores'
		}
	];

	const secretOk = String(env.TELEGRAM_WEBHOOK_SECRET ?? '').length >= MIN_WEBHOOK_SECRET_LENGTH;
	const tokenOk = Boolean(String(env.TELEGRAM_BOT_TOKEN ?? '').trim());
	const botOn = on('telegram_bot');
	const chats = tgChats ? countOf(tgChats.n) : null;
	/** @type {Automation} */
	const telegram = {
		id: 'telegram',
		title: 'Bot de Telegram',
		what:
			'Contesta /proximos y los botones en el momento (webhook). Con «Lo que sigo», también ' +
			'manda los avisos por Telegram en cada vuelta de mails.',
		when: 'Al instante (webhook) y en cada vuelta de mails',
		lastRun: msOrNull(sigoRows?.tg),
		lastRunLabel: 'Último aviso por Telegram',
		nextRun: null,
		state: botOn && secretOk ? 'on' : botOn ? 'warn' : 'off',
		stateLabel: botOn
			? secretOk
				? 'Prendido'
				: 'Prendido, pero falta el secreto del webhook'
			: 'Apagado (interruptor «Bot de Telegram»)',
		details: [
			`Secreto del webhook: ${secretOk ? 'cargado' : 'no cargado'}`,
			`Token para mandar avisos: ${tokenOk ? 'cargado' : 'no cargado'}`,
			...(chats !== null ? [`${chats} ${chats === 1 ? 'chat vinculado' : 'chats vinculados'}`] : [])
		],
		configHref: '/admin/ajustes/interruptores',
		configLabel: 'Interruptores'
	};

	return {
		crons,
		mails,
		telegram,
		rules: {
			soon: true,
			text:
				'Reglas propias del tipo «si pasa X, hacé Y» (por ejemplo: «si se agotan las entradas, ' +
				'avisame por mail»). Cuando lleguen, se arman y se ven acá.'
		}
	};
}

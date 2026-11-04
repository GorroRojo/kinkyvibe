/**
 * La línea de estado de cada tarjeta de la portada de Ajustes (`/admin/ajustes`, decisión 0042):
 * «10 % de cada entrada», «2 en prueba», «Todo al día»… Una sección sin un dato barato y claro no
 * lleva línea (mejor nada que adivinar): el Fondo, si no hay uno fijado a mano ni llegó todavía
 * ninguno de fondo.kinkyvibe.ar (la portada no lo va a buscar; en `vite dev` cuenta
 * `FONDO_PERCENT_OVERRIDE`, como al vender), o una parte que no se pudo leer.
 *
 * Idas a la base: una tanda ($lib/server/db/batch.js) con los ajustes guardados
 * (`ticket_settings`: cobros, Fondo, textos del bot y de las vistas previas), los interruptores, lo
 * último del registro y cuántas propinas entraron; y después, con los interruptores y los
 * recordatorios de esa tanda, lo de Automatizaciones (`loadAutomations`, sin mirar los backups de
 * R2: el estado no depende de eso). Cada parte tiene su respaldo: si una falla, esa tarjeta queda
 * sin línea y las demás siguen.
 *
 * Nunca muestra datos: de Cobros solo si hay datos para transferir (sí/no), del bot solo si los
 * secretos están cargados (lo resume Automatizaciones), del registro solo cuándo.
 */
import { dev } from '$app/environment';
import { fmtRelative } from '$lib/admin/format.js';
import { ADMINS } from '$lib/server/auth';
import { rowsOf, runQueries } from '$lib/server/db/batch.js';
import { loadAutomations } from '$lib/server/admin/automatizaciones.js';
import { FLAGS, envOverride } from '$lib/server/flags.js';
import { emergencyPauses } from '$lib/server/emergencia.js';
import { parsePercent } from '$lib/server/tickets/fondo.js';
import { transferReadyFromSettings } from '$lib/server/tickets/index.js';
import { readSalesSettings, salesSettingsStatement } from '$lib/server/tickets/settings.js';
import { BOT_TEXTS_SETTING } from '$lib/server/telegram/texts.js';
import { cleanBotTextOverrides } from '$lib/utils/botTexts.js';
import { previewTextOverrides } from '$lib/utils/previewTexts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Una línea de estado: el texto y, si hay algo para mirar, `tone: 'warn'`.
 * @typedef {{ text: string, tone?: 'warn' }} AjusteStatus
 */

/**
 * Filas de `ticket_settings` que no son ajustes de venta: el último porcentaje automático del Fondo
 * (`LAST_KEY` en tickets/fondo.js) y los textos de las vistas previas (`PREVIEW_TEXTS_SETTING` en
 * linkPreview.js, que no se importa acá porque arrastra la lista de publicaciones).
 */
const FONDO_LAST_KEY = 'fondo_percent_last';
/** Desde cuándo el último porcentaje del Fondo muestra de cuándo es. */
const FONDO_STALE_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TEXTS_KEY = 'link_preview_texts';

/**
 * Lo que la portada lee de la base, ya armado.
 * @typedef {{
 *   settings: Record<string, unknown>[] | null,
 *   flags: Record<string, boolean> | null,
 *   lastActivity: number | null,
 *   tips: number | null
 * }} AjustesData
 */

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * El JSON de una fila de `ticket_settings`, o `null`.
 * @param {Record<string, unknown>[]} rows
 * @param {string} key
 */
function jsonRow(rows, key) {
	const row = rows.find((r) => r.key === key);
	if (!row) return null;
	try {
		return JSON.parse(String(row.value));
	} catch {
		return null;
	}
}

/**
 * Los interruptores como quedan de verdad: la variable de entorno manda (como `isFlagOn`); si no
 * dice nada, la base (sin fila = apagado).
 * @param {Map<string, boolean>} saved
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, boolean>}
 */
export function effectiveFlags(saved, env) {
	return Object.fromEntries(
		Object.entries(FLAGS).map(([key, flag]) => [
			key,
			envOverride(env[flag.envVar]) ?? saved.get(key) ?? false
		])
	);
}

/**
 * Las líneas de estado, a partir de lo leído (sin base: puro, para probarlo).
 *
 * @param {AjustesData & {
 *   mpReady: boolean,
 *   automations: Awaited<ReturnType<typeof loadAutomations>> | null,
 *   fondoDevPercent?: number | null,
 *   pauses?: { tickets: string | null, mails: string | null },
 *   now: number
 * }} input `fondoDevPercent`: en `vite dev`, el de `FONDO_PERCENT_OVERRIDE` (como
 *   `resolveFondoPercent`: va después del fijado a mano y antes de lo automático). `pauses`: las
 *   pausas de emergencia (`emergencyPauses`); prendidas, la tarjeta de Interruptores lo dice
 *   antes que nada.
 * @returns {Record<string, AjusteStatus>} por id de sección de `$lib/admin/nav.js`
 */
export function buildAjustesStatus({
	settings,
	flags,
	lastActivity,
	tips,
	mpReady,
	automations,
	fondoDevPercent = null,
	pauses = { tickets: null, mails: null },
	now
}) {
	/** @type {Record<string, AjusteStatus>} */
	const out = {};

	if (settings) {
		const sales = readSalesSettings(settings);
		// Cobros: qué medios se pueden ofrecer (Mercado Pago, con su token; transferencia, con datos).
		const transfer = transferReadyFromSettings(sales);
		out['ajustes-cobros'] =
			mpReady && transfer
				? { text: 'Mercado Pago y transferencia' }
				: mpReady
					? { text: 'Mercado Pago (faltan los datos para transferir)', tone: 'warn' }
					: transfer
						? { text: 'Transferencia (falta Mercado Pago)', tone: 'warn' }
						: { text: 'Ningún medio de cobro listo', tone: 'warn' };

		// Fondo: el fijado a mano o el último que llegó de fondo.kinkyvibe.ar (sin ir a buscarlo).
		const manual = parsePercent(sales.fondo_percent_override);
		const lastRow = jsonRow(settings, FONDO_LAST_KEY);
		const last = parsePercent(lastRow?.percent);
		// Con fondo.kinkyvibe.ar caído se sigue cobrando el último que llegó: si es de hace más de un
		// día, que se vea de cuándo es (auditoría de confiabilidad, O36). Sin visitas la fecha también
		// envejece aunque la API ande, por eso no va en amarillo.
		const lastAt = Number(lastRow?.at);
		const lastAge =
			Number.isFinite(lastAt) && now - lastAt > FONDO_STALE_MS
				? ` (último dato ${fmtRelative(lastAt, now)})`
				: '';
		if (manual !== null) out['ajustes-fondo'] = { text: `${manual} % (fijado a mano)` };
		else if (fondoDevPercent !== null)
			out['ajustes-fondo'] = { text: `${fondoDevPercent} % de cada entrada` };
		else if (last !== null) out['ajustes-fondo'] = { text: `${last} % de cada entrada${lastAge}` };

		const bot = Object.keys(cleanBotTextOverrides(jsonRow(settings, BOT_TEXTS_SETTING))).length;
		out['ajustes-textos-bot'] = {
			text: bot ? plural(bot, 'texto cambiado', 'textos cambiados') : 'Los originales'
		};
		const previews = Object.keys(previewTextOverrides(jsonRow(settings, PREVIEW_TEXTS_KEY))).length;
		out['ajustes-vistas-previas'] = {
			text: previews ? plural(previews, 'texto cambiado', 'textos cambiados') : 'Los originales'
		};
	}

	if (tips !== null) {
		out.propinas = { text: tips ? plural(tips, 'recibida', 'recibidas') : 'Todavía ninguna' };
	}

	out['ajustes-admins'] = { text: plural(ADMINS.length, 'admin', 'admins') };

	if (flags) {
		const off = Object.values(flags).filter((on) => !on).length;
		out['ajustes-interruptores'] = off
			? { text: `${off} en prueba`, tone: 'warn' }
			: { text: 'Todos prendidos' };
	}
	// Las pausas de emergencia (TICKETS_PAUSED, MAILS_PAUSED) mandan sobre lo demás: se tienen que
	// ver aunque no haya base.
	const paused = [pauses.tickets ? 'la venta' : '', pauses.mails ? 'los mails en tanda' : '']
		.filter(Boolean)
		.join(' y ');
	if (paused) {
		out['ajustes-interruptores'] = {
			text: `En pausa: ${paused}`,
			tone: 'warn'
		};
	}

	if (automations) {
		const all = [...automations.crons, ...automations.mails, automations.telegram];
		const warn = all.filter((a) => a.state === 'warn').length;
		out['ajustes-automatizaciones'] = warn
			? { text: `${warn} con problemas`, tone: 'warn' }
			: { text: 'Todo al día' };
	}

	if (lastActivity !== null) {
		out.actividad = {
			text: lastActivity
				? `Último cambio: ${fmtRelative(lastActivity, now)}`
				: 'Sin cambios todavía'
		};
	}
	return out;
}

/**
 * Lee lo que necesita la portada y arma las líneas de estado. Nunca tira.
 *
 * @param {{
 *   db: D1Database | null | undefined,
 *   env?: Record<string, string | undefined>,
 *   mpReady?: boolean,
 *   now?: number
 * }} input `env`: las variables (interruptores forzados y secretos del bot, solo sí/no)
 * @returns {Promise<Record<string, AjusteStatus>>}
 */
export async function loadAjustesStatus({ db, env = {}, mpReady = false, now = Date.now() }) {
	const data = await runQueries(db, {
		settings: {
			what: 'portada de Ajustes: ajustes',
			fallback: /** @type {Record<string, unknown>[] | null} */ (null),
			statements: (d) => [salesSettingsStatement(d)],
			read: (r) => rowsOf(r)
		},
		flags: {
			what: 'portada de Ajustes: interruptores',
			fallback: /** @type {Map<string, boolean> | null} */ (null),
			statements: (d) => [d.prepare('SELECT key, enabled FROM feature_flags')],
			read: (r) => new Map(rowsOf(r).map((row) => [String(row.key), Number(row.enabled) === 1]))
		},
		lastActivity: {
			what: 'portada de Ajustes: actividad',
			fallback: /** @type {number | null} */ (null),
			statements: (d) => [d.prepare('SELECT at FROM admin_audit ORDER BY id DESC LIMIT 1')],
			// 0: el registro está vacío; `null` (el respaldo): no se pudo leer.
			read: (r) => Number(rowsOf(r)[0]?.at) || 0
		},
		tips: {
			what: 'portada de Ajustes: propinas',
			fallback: /** @type {number | null} */ (null),
			statements: (d) => [d.prepare("SELECT COUNT(*) AS n FROM tips WHERE status = 'approved'")],
			read: (r) => Number(rowsOf(r)[0]?.n ?? 0)
		}
	});
	// Sin base no hay nada que decir de los interruptores (todos se verían apagados).
	const flags = db && data.flags ? effectiveFlags(data.flags, env) : null;
	/** @type {Awaited<ReturnType<typeof loadAutomations>> | null} */
	let automations = null;
	if (db) {
		try {
			automations = await loadAutomations({
				db,
				env: {
					TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
					TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN
				},
				flags: flags ?? {},
				salesSettings: data.settings ? readSalesSettings(data.settings) : null,
				now
			});
		} catch (error) {
			console.error('[admin] portada de Ajustes: automatizaciones', error);
		}
	}
	const fondoDevPercent = dev ? parsePercent(env.FONDO_PERCENT_OVERRIDE) : null;
	return buildAjustesStatus({
		...data,
		flags,
		mpReady,
		automations,
		fondoDevPercent,
		pauses: emergencyPauses(env),
		now
	});
}

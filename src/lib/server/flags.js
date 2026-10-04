/**
 * Interruptores de funciones nuevas (decisión 0001: todo lo nuevo sale apagado y se prende desde
 * el panel, en /admin/ajustes/interruptores). Se guardan en D1 (`feature_flags`,
 * migrations/0013_cuentas.sql); sin fila = apagado.
 *
 * Cada interruptor tiene además una variable de entorno que manda sobre la base: `1` lo fuerza
 * prendido (tests E2E, `vite dev`), `0` lo fuerza apagado (para cortarlo de golpe desde el panel
 * de Cloudflare si algo sale mal). Vacía o ausente = lo que diga la base.
 *
 * Para no consultar la base en cada página, el valor se recuerda unos segundos por isolate.
 */
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Los interruptores que existen. `key` es la clave en `feature_flags`. */
export const FLAGS = Object.freeze({
	lo_que_sigo: {
		label: 'Lo que sigo',
		description:
			'Con cuenta, seguir etiquetas (y series), perfiles y lugares: «Seguir» en sus páginas y ' +
			'Mi rincón → Lo que sigo, con «en mi calendario», «mail cuando se anuncia algo nuevo» y ' +
			'«recordatorio el día antes» por cada cosa. ' +
			'Apagado, no se ve nada de esto y /mi-rincon/sigo da 404.',
		envVar: 'LO_QUE_SIGO_ENABLED'
	},
	telegram_bot: {
		label: 'Bot de Telegram',
		description:
			'El bot de la comunidad contesta /proximos y /evento con los próximos eventos públicos ' +
			'(docs/telegram.md, decisión 0029). Antes de prenderlo: cargar TELEGRAM_WEBHOOK_SECRET y ' +
			'apuntar el webhook del bot a /api/telegram. Con «Lo que sigo» prendido, ' +
			'además conecta chats con cuentas (Mi rincón → Lo que sigo) y manda esos ' +
			'avisos por Telegram (necesita el secret TELEGRAM_BOT_TOKEN y la migración 0033). ' +
			'Apagado, el bot no contesta nada.',
		envVar: 'TELEGRAM_BOT_ENABLED'
	}
});

/** @typedef {keyof typeof FLAGS} FlagKey */

/** Cuánto se recuerda el valor leído de la base (ms). */
export const FLAG_CACHE_MS = 30_000;

/** @type {Map<string, { value: boolean, expires: number }>} */
const cache = new Map();

/** La lectura de todos los interruptores en curso (la comparten los pedidos que llegan juntos). */
/** @type {{ db: D1Database, read: Promise<Map<string, boolean>> } | null} */
let reading = null;
/** Sube con cada `clearFlagCache`: una lectura que empezó antes no se guarda. */
let generation = 0;

/** Olvida los valores recordados (al guardar desde el panel, y en los tests). */
export function clearFlagCache() {
	cache.clear();
	reading = null;
	generation++;
}

/**
 * Lo que fuerza la variable de entorno: `true`, `false` o `null` (no fuerza nada).
 *
 * @param {string | undefined} raw
 */
export function envOverride(raw) {
	const v = (raw ?? '').trim();
	if (v === '1') return true;
	if (v === '0') return false;
	return null;
}

/**
 * Lee un interruptor de la base (sin caché). Sin base o sin la tabla: apagado.
 *
 * @param {D1Database | null | undefined} db
 * @param {FlagKey} key
 */
export async function readFlag(db, key) {
	if (!db) return false;
	try {
		const row = await db
			.prepare('SELECT enabled FROM feature_flags WHERE key = ?1')
			.bind(key)
			.first();
		return Number(row?.enabled) === 1;
	} catch (error) {
		logDBError(`feature flag ${key}`, error);
		return false;
	}
}

/**
 * Todos los interruptores de la base en una consulta (sin caché). Sin base, sin la tabla o si la
 * lectura falla: todos apagados, como `readFlag`.
 *
 * @param {D1Database} db
 * @returns {Promise<Map<string, boolean>>}
 */
async function readAllFlags(db) {
	/** @type {Map<string, boolean>} */
	const out = new Map();
	try {
		const { results } = await db.prepare('SELECT key, enabled FROM feature_flags').all();
		for (const r of results) out.set(String(r.key), Number(r.enabled) === 1);
	} catch (error) {
		logDBError('feature flags', error);
	}
	return out;
}

/**
 * ¿Está prendido? La variable de entorno manda; si no dice nada, la base (con caché).
 *
 * Cuando hay que ir a la base, se leen y se recuerdan todos los interruptores juntos (una consulta
 * en lugar de una por interruptor): una página consulta varios.
 *
 * @param {D1Database | null | undefined} db
 * @param {FlagKey} key
 * @param {{ now?: number, envValue?: string }} [opts] `envValue` para tests
 */
export async function isFlagOn(db, key, { now = Date.now(), envValue } = {}) {
	const forced = envOverride(envValue ?? env[FLAGS[key].envVar]);
	if (forced !== null) return forced;
	const hit = cache.get(key);
	if (hit && hit.expires > now) return hit.value;
	if (!db) {
		cache.set(key, { value: false, expires: now + FLAG_CACHE_MS });
		return false;
	}
	const gen = generation;
	if (reading?.db !== db) {
		const read = readAllFlags(db);
		reading = { db, read };
		read.finally(() => {
			if (reading?.read === read) reading = null;
		});
	}
	const all = await reading.read;
	const value = all.get(key) ?? false;
	if (gen === generation) {
		for (const k of Object.keys(FLAGS)) {
			const fresh = cache.get(k);
			if (!fresh || fresh.expires <= now)
				cache.set(k, { value: all.get(k) ?? false, expires: now + FLAG_CACHE_MS });
		}
	}
	return value;
}

/**
 * Atajo para las rutas: ¿está prendido «Lo que sigo»? (docs/lo-que-sigo.md). Las cuentas del
 * público ya no tienen interruptor: están siempre.
 *
 * @param {App.Platform | undefined} platform
 */
export function loQueSigoEnabled(platform) {
	return isFlagOn(getDB(platform), 'lo_que_sigo');
}

/**
 * Todos los interruptores con su estado, para el panel.
 *
 * @param {D1Database} db
 */
export async function listFlags(db) {
	/** @type {Map<string, { enabled: number, updated_at: number, updated_by: string }>} */
	const rows = new Map();
	try {
		const { results } = await db
			.prepare('SELECT key, enabled, updated_at, updated_by FROM feature_flags')
			.all();
		for (const r of results) rows.set(String(r.key), /** @type {any} */ (r));
	} catch (error) {
		logDBError('list feature flags', error);
	}
	return Object.entries(FLAGS).map(([key, flag]) => {
		const row = rows.get(key);
		const forced = envOverride(env[flag.envVar]);
		return {
			key,
			label: flag.label,
			description: flag.description,
			envVar: flag.envVar,
			enabled: Number(row?.enabled) === 1,
			forced,
			updatedAt: row ? Number(row.updated_at) : null,
			updatedBy: row ? String(row.updated_by) : null
		};
	});
}

/**
 * Prende o apaga un interruptor.
 *
 * @param {D1Database} db
 * @param {FlagKey} key
 * @param {boolean} enabled
 * @param {{ by: string, now?: number }} opts
 */
export async function setFlag(db, key, enabled, { by, now = Date.now() }) {
	if (!Object.hasOwn(FLAGS, key)) throw new RangeError(`Interruptor desconocido: ${key}`);
	await db
		.prepare(
			`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled,
				updated_at = excluded.updated_at, updated_by = excluded.updated_by`
		)
		.bind(key, enabled ? 1 : 0, now, by)
		.run();
	clearFlagCache();
}

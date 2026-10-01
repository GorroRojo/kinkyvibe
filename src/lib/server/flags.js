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
	cuentas: {
		label: 'Cuentas del público',
		description:
			'"Ingresar" y "Mi rincón": cuentas con código por mail o contraseña, y las compras de ' +
			'cada mail verificado. Apagado, las páginas dan 404 y el encabezado no muestra el link.',
		envVar: 'CUENTAS_ENABLED'
	},
	propinas: {
		label: 'Propinas',
		description:
			'Al pie de las publicaciones de KinkyVibe, un bloque para dejar una propina con Mercado ' +
			'Pago (la misma cuenta que las entradas) en lugar de la nota del cafecito. Apagado, se ' +
			've la nota del cafecito como siempre y /propinas da 404.',
		envVar: 'PROPINAS_ENABLED'
	},
	perfiles_publicos: {
		label: 'Perfiles públicos (amigues y lugares)',
		description:
			'/amigues lee los perfiles de la base (personas, grupos y lugares), con "Es mi perfil", ' +
			'mapas de los lugares y la privacidad de sus direcciones en los eventos. Apagado, ' +
			'/amigues y los eventos muestran lo de los archivos .md, como siempre. Antes de ' +
			'prenderlo: importar las fichas (Contenido → Amigues → Importar) y revisar la ' +
			'clasificación.',
		envVar: 'PERFILES_PUBLICOS_ENABLED'
	},
	personas_eventos: {
		label: 'Personas en eventos y preguntas de inscripción',
		description:
			'Roles (Organiza, Facilita, Enseña…) que unen eventos y material con perfiles, y preguntas ' +
			'extra al comprar o inscribirse (Ajustes → Personas y preguntas, y la pestaña Preguntas ' +
			'de cada evento). Apagado, ni las páginas ni la compra cambian.',
		envVar: 'PERSONAS_EVENTOS_ENABLED'
	}
});

/** @typedef {keyof typeof FLAGS} FlagKey */

/** Cuánto se recuerda el valor leído de la base (ms). */
export const FLAG_CACHE_MS = 30_000;

/** @type {Map<string, { value: boolean, expires: number }>} */
const cache = new Map();

/** Olvida los valores recordados (al guardar desde el panel, y en los tests). */
export function clearFlagCache() {
	cache.clear();
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
 * ¿Está prendido? La variable de entorno manda; si no dice nada, la base (con caché).
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
	const value = await readFlag(db, key);
	cache.set(key, { value, expires: now + FLAG_CACHE_MS });
	return value;
}

/**
 * Atajo para las rutas: ¿están prendidas las cuentas del público?
 *
 * @param {App.Platform | undefined} platform
 */
export function cuentasEnabled(platform) {
	return isFlagOn(getDB(platform), 'cuentas');
}

/**
 * Atajo para las rutas: ¿están prendidas las propinas (docs/propinas.md)?
 *
 * @param {App.Platform | undefined} platform
 */
export function propinasEnabled(platform) {
	return isFlagOn(getDB(platform), 'propinas');
}

/**
 * Atajo para las rutas: ¿/amigues y los lugares leen los perfiles de la base? (docs/amigues.md)
 *
 * @param {App.Platform | undefined} platform
 */
export function perfilesPublicosEnabled(platform) {
	return isFlagOn(getDB(platform), 'perfiles_publicos');
}

/**
 * Atajo para las rutas: ¿están prendidos los roles y las preguntas de inscripción?
 * (docs/personas-eventos.md)
 *
 * @param {App.Platform | undefined} platform
 */
export function personasEventosEnabled(platform) {
	return isFlagOn(getDB(platform), 'personas_eventos');
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

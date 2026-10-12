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
			'Con cuenta, la gente puede seguir etiquetas (y series), perfiles y lugares: «Seguir» en sus ' +
			'páginas y Mi rincón → Lo que sigo, con «en mi calendario», «mail cuando se anuncia algo ' +
			'nuevo» y «recordatorio el día antes» por cada cosa. Apagado, no se ve nada de esto.',
		// Para técnicos (plegado en la página).
		tech: 'Apagado, /mi-rincon/sigo da 404.',
		envVar: 'LO_QUE_SIGO_ENABLED'
	},
	telegram_bot: {
		label: 'Bot de Telegram',
		description:
			'El bot de la comunidad contesta en Telegram con los próximos eventos públicos. Con ' +
			'«Lo que sigo» prendido, además le manda a cada persona sus avisos por Telegram (si conecta ' +
			'su cuenta en Mi rincón → Lo que sigo). Apagado, el bot no contesta nada. Antes de ' +
			'prenderlo, pedile a quien maneja el sitio que lo deje configurado.',
		tech:
			'Comandos /proximos y /evento (docs/telegram.md, decisión 0029). Antes de prenderlo: ' +
			'cargar TELEGRAM_WEBHOOK_SECRET y apuntar el webhook del bot a /api/telegram. Los avisos ' +
			'necesitan el secret TELEGRAM_BOT_TOKEN y la migración 0033.',
		envVar: 'TELEGRAM_BOT_ENABLED'
	},
	telegram_puerta: {
		label: 'Puerta por Telegram',
		description:
			'Les admins pueden marcar ingresos desde Telegram, con el escáner de QR del celular: cada ' +
			'admin vincula su Telegram en Ajustes → Admins y abre la puerta desde el bot. Solo anda ' +
			'para admins con el Telegram vinculado. Necesita el bot prendido. Apagado, no se pueden ' +
			'marcar ingresos desde Telegram (ni vincular, salvo con «Telegram para admins» prendido).',
		tech:
			'Mini App /telegram/puerta (docs/telegram.md, decisión 0037). Valida el initData con ' +
			'TELEGRAM_BOT_TOKEN en cada pedido. Necesita la migración 0050, TELEGRAM_BOT_TOKEN y ' +
			'TELEGRAM_BOT_USERNAME. Apagado, /telegram/puerta da 404.',
		envVar: 'TELEGRAM_PUERTA_ENABLED'
	},
	telegram_admin: {
		label: 'Telegram para admins: estado y avisos',
		description:
			'Les admins con el Telegram vinculado ven «📊 Estado» en el bot: cuántas entradas se ' +
			'vendieron de cada evento, reservas por vencer y lo que hay para revisar, solo con ' +
			'cantidades (nunca datos de compradores). Cada admin elige en «🔔 Mis avisos» qué avisos ' +
			'quiere recibir (vienen apagados). Necesita el bot prendido. Apagado, nada de esto se ve ' +
			'y el bot contesta como si no existiera.',
		tech:
			'docs/telegram.md («Estado y avisos para admins»), decisión 0041. Vincular el Telegram ' +
			'(Ajustes → Admins) anda con este o con «Puerta por Telegram». Necesita la migración ' +
			'0054 para «Mis avisos».',
		envVar: 'TELEGRAM_ADMIN_ENABLED'
	},
	telegram_enriquecido: {
		label: 'Telegram: mensajes enriquecidos y compartir',
		description:
			'Cuando el bot manda algo del sitio (una entrada de la Kinkipedia, un material, un evento), ' +
			'el contenido se lee adentro del chat, con «Ver en el sitio» abajo. En la Mini App del ' +
			'calendario, cada evento tiene «Mandar a un chat», y el evento mandado trae un botón que ' +
			'abre el calendario justo en ese evento. Solo lo público, lo mismo que el sitio sin cuenta. ' +
			'Necesita el bot prendido. Apagado, el bot manda las tarjetas de siempre.',
		tech:
			'docs/telegram.md («Mensajes enriquecidos y compartir»). Los mensajes enriquecidos (Bot API ' +
			'10.1–10.3) salen solo con TELEGRAM_BOT_TOKEN; si Telegram los rechaza, sale la tarjeta de ' +
			'siempre. Compartir usa savePreparedInlineMessage + shareMessage (Bot API 8.0). «Abrir en el ' +
			'calendario» necesita TELEGRAM_BOT_USERNAME y la Main Mini App registrada en @BotFather.',
		envVar: 'TELEGRAM_ENRIQUECIDO_ENABLED'
	},
	telegram_estadisticas: {
		label: 'Telegram: estadísticas de uso',
		description:
			'Cuenta cómo se usa el bot, para Estadísticas → Bot de Telegram: quién lo usa y cuánto (un ' +
			'número por persona y por día) y, aparte y sumado por semana, qué pantallas, búsquedas y ' +
			'cosas se usan. Nunca se guarda qué buscó o miró cada persona. Necesita el bot prendido. ' +
			'Apagado, no se cuenta nada.',
		tech:
			'docs/telegram.md («Estadísticas de uso»), decisión 0045. Necesita la migración 0057 ' +
			'(tablas telegram_uso_personas y telegram_uso_totales). Los resultados inline elegidos ' +
			'necesitan /setinlinefeedback en @BotFather y volver a registrar el webhook.',
		envVar: 'TELEGRAM_ESTADISTICAS_ENABLED'
	},
	propinas_fondo: {
		label: 'Donaciones únicas al Fondo',
		description:
			'El botón «Una vez» de fondo.kinkyvibe.ar trae a la gente a dejar una propina para el Fondo ' +
			'Kinky Vibe acá, sin cuenta ni datos, y al terminar les devuelve al Fondo. Apagado, esa ' +
			'página solo explica que las propinas se dejan desde cada publicación.',
		tech:
			'/propinas?de=fondo (y su POST, source = fondo). El total para el Fondo ' +
			'(GET /api/fondo/propinas-total) no depende de este interruptor. Antes de prenderlo: ' +
			'migración 0052. docs/propinas.md.',
		envVar: 'PROPINAS_FONDO_ENABLED'
	},
	lista_espera: {
		label: 'Lista de espera',
		description:
			'Cuando un evento (o un tipo de entrada) se agota, la gente se puede anotar en una lista de ' +
			'espera. Si se libera un lugar, le avisamos por mail a la próxima persona y se lo guardamos ' +
			'un rato. Se activa por evento, en su editor. Apagado, nada de esto se ve y la venta anda ' +
			'como siempre. Todavía está en construcción.',
		tech:
			'docs/tickets.md, «Lista de espera». Antes de prenderlo: migración 0053. Tablas ' +
			'waitlist_entries y waitlist_sends; clave `lista_espera` del evento.',
		envVar: 'LISTA_ESPERA_ENABLED'
	},
	combo_codigos: {
		label: 'Códigos combo entre eventos',
		description:
			'En la pestaña Códigos de un evento se puede armar un combo con otro evento: quien compra ' +
			'una entrada del primero (online, en la puerta o cargada a mano) recibe en el mail de sus entradas un código de descuento ' +
			'para el segundo, de un solo uso y solo para su mail. Si la compra se reembolsa, el código ' +
			'deja de valer. Apagado, no se arman combos ni se generan códigos nuevos (los que ya se ' +
			'mandaron siguen valiendo).',
		tech:
			'docs/tickets.md, «Códigos combo». Antes de prenderlo: migración 0056 (tabla ' +
			'ticket_combos y columnas buyer_email y source_order_id de discount_codes). ' +
			'src/lib/server/tickets/combos.js.',
		envVar: 'COMBO_CODIGOS_ENABLED'
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
 * Atajo para las rutas: ¿están prendidas las donaciones únicas al Fondo (`/propinas?de=fondo`)?
 * (docs/propinas.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function propinasFondoEnabled(platform) {
	return isFlagOn(getDB(platform), 'propinas_fondo');
}

/**
 * Atajo para las rutas: ¿está prendida la lista de espera de las entradas? (docs/tickets.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function listaEsperaEnabled(platform) {
	return isFlagOn(getDB(platform), 'lista_espera');
}

/**
 * Atajo para las rutas: ¿están prendidos los códigos combo entre eventos? (docs/tickets.md).
 *
 * @param {App.Platform | undefined} platform
 */
export function comboCodigosEnabled(platform) {
	return isFlagOn(getDB(platform), 'combo_codigos');
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
			tech: flag.tech ?? '',
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

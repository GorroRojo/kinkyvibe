/**
 * Estadísticas de uso del bot (pedido de gorrite, 12/10; decisión 0045, docs/telegram.md
 * «Estadísticas de uso»), detrás del interruptor `telegram_estadisticas` (apagado).
 *
 * La regla: **nunca se puede saber qué miró o buscó una persona**. Por eso se escribe en dos
 * tablas que no comparten ninguna clave ni ninguna hora fina (migración 0057):
 *
 * - `telegram_uso_personas` ({@link personStatement}): quién usa el bot y cuánto. Un número por
 *   persona y por día (hora de Argentina), con el nombre que manda Telegram. Nada de qué hizo.
 * - `telegram_uso_totales` ({@link totalStatements}): para qué se usa, sumado por semana ISO.
 *   Ni id de nadie, ni día, ni hora.
 *
 * Lo que se cuenta de cada update lo junta un {@link UsoRecorder} (el webhook arma uno por update;
 * el router le suma lo que solo se sabe al contestar: lo buscado, la cosa abierta, seguir,
 * vincular). Las cosas, **solo si son públicas**: las del índice público de la búsqueda (el mismo
 * del bot, inlineSource.js) que el sitio lista ({@link objectKey}).
 *
 * Todo se escribe en una sola tanda por update (`db.batch`), en `waitUntil`: nunca traba ni cambia
 * la respuesta del bot, y si falla, se pierde ese conteo y nada más.
 */

import { validateInitData } from './initData.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

/** Cuántos días se guardan las filas de cada persona. */
export const USO_KEEP_DAYS = 180;

/**
 * Una búsqueda o una cosa se muestra en el panel solo si en esa semana se contó al menos esto; las
 * demás van sumadas en «otras (menos de 5 veces)».
 */
export const USO_MIN_COUNT = 5;

/**
 * El detalle de una semana (pantallas, comandos, búsquedas, cosas) se muestra solo si esa semana
 * usaron el bot al menos estas personas: con menos, lo contado sería de una o dos personas que el
 * panel nombra arriba. Los totales por tipo se muestran siempre.
 */
export const USO_MIN_PEOPLE = 5;

/** Largo máximo de una búsqueda guardada (ya normalizada). */
export const SEARCH_KEY_MAX = 60;

/** La clave de una búsqueda vacía. */
export const EMPTY_SEARCH = '(vacía)';

/** Largo máximo de una clave (la columna acepta hasta 200). */
const KEY_MAX = 200;

/**
 * Los tipos que se cuentan, con su nombre en el panel. `detalle`: su clave es lo buscado o una
 * cosa, y se muestra solo desde {@link USO_MIN_COUNT}.
 *
 * @type {Readonly<Record<string, { label: string, detalle?: true }>>}
 */
export const USO_TIPOS = Object.freeze({
	pantalla: { label: 'Pantallas' },
	comando: { label: 'Comandos' },
	busqueda: { label: 'Búsquedas en el bot', detalle: true },
	inline: { label: 'Búsquedas inline', detalle: true },
	objeto: { label: 'Cosas abiertas en el bot', detalle: true },
	inline_elegido: { label: 'Resultados inline mandados', detalle: true },
	miniapp: { label: 'Mini App' },
	seguir: { label: 'Seguir' },
	vincular: { label: 'Vincular' },
	desvincular: { label: 'Desvincular' }
});

/** @typedef {keyof typeof USO_TIPOS} UsoTipo */

/** Argentina: UTC−3 todo el año, sin horario de verano (como analytics/report.js). */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El día en hora de Argentina: 'AAAA-MM-DD'.
 *
 * @param {number} ms
 */
export function arDay(ms) {
	return new Date(ms - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * La semana ISO (lunes a domingo) de un día: 'AAAA-Wss'.
 *
 * @param {string} day 'AAAA-MM-DD'
 */
export function isoWeek(day) {
	const d = new Date(`${day}T00:00:00Z`);
	// El jueves de esa semana decide el año (ISO 8601).
	d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
	const year = d.getUTCFullYear();
	const firstThursday = new Date(Date.UTC(year, 0, 4));
	firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
	const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
	return `${year}-W${pad(week)}`;
}

/** @param {string} week */
export const isWeek = (week) => typeof week === 'string' && /^\d{4}-W\d{2}$/.test(week);

/**
 * El lunes y el domingo de una semana ISO ('AAAA-MM-DD').
 *
 * @param {string} week 'AAAA-Wss'
 */
export function weekRange(week) {
	const [y, w] = week.split('-W').map(Number);
	const jan4 = new Date(Date.UTC(y, 0, 4));
	const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS);
	const from = new Date(monday.getTime() + (w - 1) * 7 * DAY_MS);
	const to = new Date(from.getTime() + 6 * DAY_MS);
	return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Las últimas `n` semanas, de la actual para atrás.
 *
 * @param {number} now
 * @param {number} n
 */
export function recentWeeks(now, n) {
	/** @type {string[]} */
	const out = [];
	for (let i = 0; i < n; i++) out.push(isoWeek(arDay(now - i * 7 * DAY_MS)));
	return out;
}

/**
 * Lo buscado como se guarda: minúsculas, sin espacios de más, hasta {@link SEARCH_KEY_MAX}
 * caracteres. Vacío: {@link EMPTY_SEARCH}.
 *
 * @param {unknown} text
 */
export function normalizeSearch(text) {
	const s = (typeof text === 'string' ? text : '').toLowerCase().replace(/\s+/g, ' ').trim();
	const cut = [...s].slice(0, SEARCH_KEY_MAX).join('').trim();
	return cut || EMPTY_SEARCH;
}

/** El nombre de cada tipo de cosa en la clave. */
const KIND = Object.freeze({
	calendario: 'evento',
	material: 'material',
	wiki: 'wiki',
	serie: 'serie',
	amigues: 'amigues'
});

/**
 * La clave de una cosa del índice público ('evento:<dirección>', 'material:<dirección>'…), o
 * `null` si no se puede contar: **solo lo que está en el índice público de la búsqueda** (nada
 * oculto, «solo con cuenta», sin aprobar, no listado ni borrado; inlineSource.js) y que el sitio
 * lista (el índice tiene además los lugares no listados a los que lleva un evento: esos no).
 *
 * @param {SearchDoc | null | undefined} doc
 * @param {import('./inline.js').InlineSource | null | undefined} source
 */
export function objectKey(doc, source) {
	if (!doc || !source || !source.docs.includes(doc)) return null;
	if (source.extras.get(doc.h)?.unlisted) return null;
	const kind = KIND[doc.c];
	const slug = String(doc.h ?? '')
		.split('/')
		.filter(Boolean)
		.pop();
	if (!kind || !slug) return null;
	let name = slug;
	try {
		name = decodeURIComponent(slug);
	} catch {
		// Tal cual.
	}
	return `${kind}:${name}`.slice(0, KEY_MAX);
}

/**
 * La clave de un evento próximo y público (las tarjetas del bot salen de `listUpcoming`, que ya
 * deja afuera lo oculto, no listado y empezado: events.js).
 *
 * @param {{ slug?: unknown } | null | undefined} event
 */
export function eventKey(event) {
	const slug = typeof event?.slug === 'string' ? event.slug : '';
	return slug ? `evento:${slug}`.slice(0, KEY_MAX) : null;
}

/**
 * Quién mandó el update, para `telegram_uso_personas`: el id, el nombre y el @usuario (lo que
 * Telegram ya manda en cada update). `null` sin usuario o si es un bot.
 *
 * @typedef {{ id: string, nombre: string, usuario: string }} UsoPerson
 * @param {any} from
 * @returns {UsoPerson | null}
 */
export function personFrom(from) {
	const id = from?.id;
	if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || from?.is_bot) return null;
	const clip = (/** @type {unknown} */ v, /** @type {number} */ max) =>
		typeof v === 'string' ? [...v.trim()].slice(0, max).join('') : '';
	return { id: String(id), nombre: clip(from.first_name, 64), usuario: clip(from.username, 32) };
}

/**
 * Lo que se cuenta de un update. `add` nunca tira.
 *
 * @typedef {{ add: (tipo: UsoTipo, clave: string) => void }} UsoRecorder
 */

/**
 * Un recorder vacío: junta los conteos de un update (si algo se cuenta dos veces, suma).
 *
 * @returns {UsoRecorder & { counts: () => { tipo: UsoTipo, clave: string, n: number }[] }}
 */
export function createUsoRecorder() {
	/** @type {Map<string, { tipo: UsoTipo, clave: string, n: number }>} */
	const map = new Map();
	return {
		add(tipo, clave) {
			if (!Object.hasOwn(USO_TIPOS, tipo)) return;
			const key = String(clave ?? '').slice(0, KEY_MAX);
			const id = `${tipo}\u0000${key}`;
			const hit = map.get(id);
			if (hit) hit.n++;
			else map.set(id, { tipo, clave: key, n: 1 });
		},
		counts: () => [...map.values()]
	};
}

/**
 * Suma un conteo si hay recorder (con el interruptor apagado no hay). Nunca tira: contar no puede
 * cambiar la respuesta del bot.
 *
 * @param {UsoRecorder | null | undefined} usage
 * @param {UsoTipo} tipo
 * @param {string | null | undefined} clave `null`: no se cuenta (una cosa que no es pública)
 */
export function trackUso(usage, tipo, clave) {
	if (!usage || clave === null || clave === undefined) return;
	try {
		usage.add(tipo, clave);
	} catch {
		// Nada: un conteo perdido.
	}
}

/**
 * La fila de la persona: el día y su nombre, y nada más (ni qué hizo, ni a qué hora).
 *
 * @param {D1Database} db
 * @param {UsoPerson} person
 * @param {number} now
 */
export function personStatement(db, person, now) {
	return db
		.prepare(
			`INSERT INTO telegram_uso_personas (telegram_id, dia, interacciones, nombre, usuario)
			VALUES (?1, ?2, 1, ?3, ?4)
			ON CONFLICT (telegram_id, dia) DO UPDATE SET interacciones = interacciones + 1,
				nombre = excluded.nombre, usuario = excluded.usuario`
		)
		.bind(person.id, arDay(now), person.nombre, person.usuario);
}

/**
 * Los contadores de la semana: tipo, clave y cuántos. Ni id de nadie, ni día, ni hora.
 *
 * @param {D1Database} db
 * @param {{ tipo: string, clave: string, n: number }[]} counts
 * @param {number} now
 */
export function totalStatements(db, counts, now) {
	const week = isoWeek(arDay(now));
	return counts.map((c) =>
		db
			.prepare(
				`INSERT INTO telegram_uso_totales (semana, tipo, clave, n) VALUES (?1, ?2, ?3, ?4)
				ON CONFLICT (semana, tipo, clave) DO UPDATE SET n = n + excluded.n`
			)
			.bind(week, c.tipo, c.clave, c.n)
	);
}

/**
 * Escribe lo de un update en una sola tanda. Tira si la base falla: quien llama lo atrapa
 * ({@link usoWriter}).
 *
 * @param {D1Database} db
 * @param {{ person: UsoPerson | null, counts: { tipo: string, clave: string, n: number }[] }} batch
 * @param {number} now
 */
export async function writeUso(db, { person, counts }, now) {
	/** @type {D1PreparedStatement[]} */
	const statements = [
		...(person ? [personStatement(db, person, now)] : []),
		...totalStatements(db, counts, now)
	];
	if (statements.length) await db.batch(statements);
}

/**
 * Lo que el webhook usa para guardar (o `null` con el interruptor apagado): nunca tira, y un error
 * se loguea sin detalles (podría traer partes del pedido).
 *
 * @param {D1Database} db
 * @param {() => number} [clock]
 * @returns {(batch: Parameters<typeof writeUso>[1]) => Promise<void>}
 */
export function usoWriter(db, clock = Date.now) {
	return async (batch) => {
		try {
			await writeUso(db, batch, clock());
		} catch (error) {
			console.error(
				'[telegram] no se pudieron guardar las estadísticas:',
				/** @type {Error} */ (error)?.name
			);
		}
	};
}

/**
 * Borra las filas de personas de más de {@link USO_KEEP_DAYS} días (el cron de cada 15 minutos).
 * Los totales por semana quedan: no tienen a nadie.
 *
 * @param {D1Database} db
 * @param {number} now
 */
export async function pruneUso(db, now) {
	const res = await db
		.prepare('DELETE FROM telegram_uso_personas WHERE dia < ?1')
		.bind(arDay(now - USO_KEEP_DAYS * DAY_MS))
		.run();
	return res.meta.changes ?? 0;
}

/**
 * Se abrió la Mini App del calendario (`POST /telegram/app/uso`): con el `initData` válido (firmado
 * por Telegram con el token del bot, initData.js), una interacción de esa persona y una apertura,
 * sin quién, en los totales de la semana. Con cualquier otra cosa, nada. Nunca tira.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined, now?: number }} args
 * @returns {Promise<boolean>} si se contó
 */
export async function recordMiniAppOpen({ db, initData, token, now = Date.now() }) {
	try {
		const r = await validateInitData(initData, token, { now });
		if (!r.ok) return false;
		const person = personFrom(r.user);
		if (!person) return false;
		await writeUso(db, { person, counts: [{ tipo: 'miniapp', clave: 'calendario', n: 1 }] }, now);
		return true;
	} catch (error) {
		console.error('[telegram] no se pudo contar la Mini App:', /** @type {Error} */ (error)?.name);
		return false;
	}
}

/**
 * Links de puerta (docs/tickets.md, «Link de puerta»; auditoría de comunidad K28): une admin crea,
 * para **un** evento, un link que abre **solo** el modo puerta de ese evento (escanear, escribir el
 * código, buscar, vender en la puerta, la lista sin conexión), sin cuenta y sin el resto del panel.
 *
 * Seguridad:
 * - El token es al azar (32 bytes, base64url). En la base se guarda solo su SHA-256
 *   (`door_links.token_hash`); el token se muestra una sola vez, al crearlo.
 * - El link va con el token en el **fragmento** (`/puerta#<token>`): el navegador no lo manda al
 *   servidor, así que no queda en ningún registro de pedidos ni en el Referer. La página lo lee
 *   y lo manda en el cuerpo de un POST (`?/entrar`), que deja una cookie httpOnly
 *   (`DOOR_LINK_COOKIE`, solo para `/puerta`, SameSite=Strict) que vence con el link.
 * - En **cada** pedido de la puerta (`requireDoorLink`) se vuelve a mirar la base: el link existe,
 *   es de **ese** evento, no venció y no se revocó. Revocar corta al toque.
 * - Esta cookie no es una sesión de admin: no toca `locals.user`, así que el resto del panel
 *   (`requireAdmin`) la ignora y sigue pidiendo GitHub.
 * - Topes: entrar con un link (por IP, anónima) y los pedidos de cada link.
 * - Nunca se loguea el token: los errores y el registro de actividad llevan el `id` del link.
 */
import { error } from '@sveltejs/kit';
import { sha256Hex } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { toBase64url } from '$lib/utils/base64.js';
import { parseLocalDate } from '$lib/server/tickets/discounts.js';
import { toTime } from '$lib/server/tickets/config.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{
 *   id: string,
 *   event_slug: string,
 *   label: string,
 *   created_by: string,
 *   created_at: number,
 *   expires_at: number,
 *   revoked_at: number | null,
 *   revoked_by: string | null,
 *   last_used_at: number | null
 * }} DoorLink
 */

/**
 * Quién hace una acción del modo puerta: une admin (con su login de GitHub) o un link de puerta.
 *
 * - `by`: lo que queda en `checked_in_by` / `confirmed_by` (y se ve en la pantalla).
 * - `audit`: lo que recibe `logAdminAction` como `locals` (de ahí sale quién fue).
 * - `link`: el link, si es un link de puerta.
 *
 * @typedef {{
 *   kind: 'admin' | 'link',
 *   by: string,
 *   audit: { user?: { id?: number, login?: string } | null },
 *   link: DoorLink | null
 * }} DoorActor
 */

/** Cookie del link de puerta (el token; solo para `/puerta`). */
export const DOOR_LINK_COOKIE = 'kv_puerta';
/** Dónde vive la puerta con link. */
export const DOOR_LINK_PATH = '/puerta';

/** Largo del token en base64url (32 bytes). */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Ids públicos de los links (12 bytes en base64url). */
const ID_RE = /^[A-Za-z0-9_-]{16}$/;

/** Horas después del fin del día del evento hasta las que anda el link por defecto. */
export const DOOR_LINK_GRACE_HOURS = 6;
/** Lo más lejos que puede vencer un link, desde que se crea. */
export const DOOR_LINK_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** Lo más cerca: menos que esto no tiene sentido (y suele ser un error de fecha). */
export const DOOR_LINK_MIN_MS = 10 * 60 * 1000;
/** Largo máximo de la etiqueta. */
export const DOOR_LINK_LABEL_MAX = 40;
/** Links vivos por evento como mucho. */
export const DOOR_LINK_MAX_ACTIVE = 20;

/** Intentos de entrar con un link, por IP (anónima). */
export const DOOR_LINK_ENTER_LIMIT = Object.freeze({ limit: 20, windowSeconds: 10 * 60 });
/**
 * Pedidos de la puerta por link y por hora: escaneos, búsquedas (una por tecla) y la lista. Holgado
 * para una noche con mucha gente; frena a quien lo use para bajar datos en masa.
 */
export const DOOR_LINK_REQUEST_LIMIT = Object.freeze({ limit: 3000, windowSeconds: 60 * 60 });

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Token nuevo, al azar (256 bits). */
export function newDoorToken() {
	return toBase64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Id público nuevo (no secreto). */
function newDoorLinkId() {
	return toBase64url(crypto.getRandomValues(new Uint8Array(12)));
}

/**
 * ¿Tiene forma de token? (Antes de tocar la base: un token cambiado o cortado no llega a la
 * consulta.)
 *
 * @param {unknown} token
 * @returns {token is string}
 */
export function isDoorTokenShape(token) {
	return typeof token === 'string' && TOKEN_RE.test(token);
}

/**
 * SHA-256 del token (con un prefijo propio, así no coincide con el hash de otra cosa).
 *
 * @param {string} token
 */
export function hashDoorToken(token) {
	return sha256Hex(`door-link:${token}`);
}

/**
 * El link que se comparte: el token va en el fragmento (no viaja al servidor).
 *
 * @param {string} origin
 * @param {string} token
 */
export function doorLinkUrl(origin, token) {
	return `${origin}${DOOR_LINK_PATH}#${token}`;
}

/**
 * Vencimiento por defecto: el fin del día (en Argentina) en que termina el evento, más
 * `DOOR_LINK_GRACE_HOURS`. Sin fecha de inicio, 12 horas desde ahora.
 *
 * @param {{ start?: unknown, end?: unknown }} config
 * @param {number} [now]
 */
export function defaultDoorLinkExpiry(config, now = Date.now()) {
	const start = toTime(config.start);
	if (start === null) return now + 12 * HOUR_MS;
	const end = toTime(config.end);
	const last = end !== null && end > start ? end : start;
	const local = new Date(last - AR_OFFSET_MS);
	const endOfDay =
		Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 999) +
		AR_OFFSET_MS;
	return endOfDay + DOOR_LINK_GRACE_HOURS * HOUR_MS;
}

/**
 * La etiqueta, limpia: sin caracteres de control, espacios de más ni más de
 * `DOOR_LINK_LABEL_MAX`.
 *
 * @param {unknown} raw
 */
export function cleanDoorLabel(raw) {
	return (
		String(raw ?? '')
			// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, DOOR_LINK_LABEL_MAX)
	);
}

/**
 * Lee el formulario de «Crear link de puerta»: etiqueta y vencimiento (`expires`, un
 * `datetime-local` en hora de Argentina; vacío = el de por defecto).
 *
 * @param {{ label?: unknown, expires?: unknown }} input
 * @param {{ start?: unknown, end?: unknown }} config
 * @param {number} [now]
 * @returns {{ ok: true, label: string, expiresAt: number } | { ok: false, message: string }}
 */
export function parseDoorLinkForm(input, config, now = Date.now()) {
	const label = cleanDoorLabel(input.label);
	const raw = String(input.expires ?? '').trim();
	const expiresAt = raw ? parseLocalDate(raw) : defaultDoorLinkExpiry(config, now);
	if (!Number.isFinite(expiresAt))
		return { ok: false, message: 'La fecha de vencimiento no es válida.' };
	if (expiresAt < now + DOOR_LINK_MIN_MS) {
		return {
			ok: false,
			message: raw
				? 'Elegí un vencimiento de acá a por lo menos 10 minutos.'
				: 'El evento ya terminó: elegí hasta cuándo anda el link.'
		};
	}
	if (expiresAt > now + DOOR_LINK_MAX_MS) {
		return { ok: false, message: 'Un link de puerta puede durar como mucho 7 días.' };
	}
	return { ok: true, label, expiresAt };
}

/**
 * Crea un link de puerta. Devuelve el token (para mostrarlo **una sola vez**) y el link guardado.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, label: string, createdBy: string, expiresAt: number, now?: number }} input
 * @returns {Promise<{ ok: true, token: string, link: DoorLink } | { ok: false, reason: 'too-many' }>}
 */
export async function createDoorLink(
	db,
	{ eventSlug, label, createdBy, expiresAt, now = Date.now() }
) {
	const active = await db
		.prepare(
			'SELECT COUNT(*) AS n FROM door_links WHERE event_slug = ?1 AND revoked_at IS NULL AND expires_at > ?2'
		)
		.bind(eventSlug, now)
		.first();
	if (Number(active?.n ?? 0) >= DOOR_LINK_MAX_ACTIVE) return { ok: false, reason: 'too-many' };
	const token = newDoorToken();
	/** @type {DoorLink} */
	const link = {
		id: newDoorLinkId(),
		event_slug: eventSlug,
		label,
		created_by: createdBy,
		created_at: now,
		expires_at: expiresAt,
		revoked_at: null,
		revoked_by: null,
		last_used_at: null
	};
	await db
		.prepare(
			`INSERT INTO door_links (id, event_slug, token_hash, label, created_by, created_at, expires_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
		)
		.bind(link.id, eventSlug, await hashDoorToken(token), label, createdBy, now, expiresAt)
		.run();
	return { ok: true, token, link };
}

const LINK_COLUMNS =
	'id, event_slug, label, created_by, created_at, expires_at, revoked_at, revoked_by, last_used_at';

/**
 * Los links vivos de un evento (sin vencer ni revocar), del más nuevo al más viejo. Nunca el hash.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 * @returns {Promise<DoorLink[]>}
 */
export async function listDoorLinks(db, eventSlug, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT ${LINK_COLUMNS} FROM door_links
			WHERE event_slug = ?1 AND revoked_at IS NULL AND expires_at > ?2
			ORDER BY created_at DESC LIMIT ${DOOR_LINK_MAX_ACTIVE}`
		)
		.bind(eventSlug, now)
		.all();
	return /** @type {DoorLink[]} */ (results);
}

/**
 * Revoca un link de **este** evento (un id de otro evento no hace nada). `null` si no había uno
 * vivo con ese id.
 *
 * @param {D1Database} db
 * @param {{ id: unknown, eventSlug: string, by: string, now?: number }} input
 * @returns {Promise<DoorLink | null>}
 */
export async function revokeDoorLink(db, { id, eventSlug, by, now = Date.now() }) {
	if (typeof id !== 'string' || !ID_RE.test(id)) return null;
	const row = await db
		.prepare(
			`UPDATE door_links SET revoked_at = ?3, revoked_by = ?4
			WHERE id = ?1 AND event_slug = ?2 AND revoked_at IS NULL
			RETURNING ${LINK_COLUMNS}`
		)
		.bind(id, eventSlug, now, by)
		.first();
	return /** @type {DoorLink | null} */ (row ?? null);
}

/**
 * El link de un token, si sigue vivo.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 * @returns {Promise<{ ok: true, link: DoorLink }
 *   | { ok: false, reason: 'malformed' | 'unknown' | 'revoked' | 'expired' }>}
 */
export async function findDoorLink(db, token, now = Date.now()) {
	if (!isDoorTokenShape(token)) return { ok: false, reason: 'malformed' };
	const row = /** @type {DoorLink | null} */ (
		await db
			.prepare(`SELECT ${LINK_COLUMNS} FROM door_links WHERE token_hash = ?1`)
			.bind(await hashDoorToken(token))
			.first()
	);
	if (!row) return { ok: false, reason: 'unknown' };
	if (row.revoked_at !== null && row.revoked_at !== undefined)
		return { ok: false, reason: 'revoked' };
	if (!(Number(row.expires_at) > now)) return { ok: false, reason: 'expired' };
	return { ok: true, link: row };
}

/**
 * Anota que alguien entró con el link (para la lista del panel).
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {number} [now]
 */
export async function touchDoorLink(db, id, now = Date.now()) {
	await db.prepare('UPDATE door_links SET last_used_at = ?2 WHERE id = ?1').bind(id, now).run();
}

/**
 * Lo que queda en `checked_in_by` / `confirmed_by` con un link: «puerta: <etiqueta>» (o el id si
 * no tiene etiqueta).
 *
 * @param {Pick<DoorLink, 'id' | 'label'>} link
 */
export function doorLinkBy(link) {
	return `puerta: ${link.label || link.id}`;
}

/**
 * El actor de un link: en el registro de actividad figura como `puerta:<id>`.
 *
 * @param {DoorLink} link
 * @returns {DoorActor}
 */
export function linkActor(link) {
	return {
		kind: 'link',
		by: doorLinkBy(link),
		audit: { user: { login: `puerta:${link.id}` } },
		link
	};
}

/**
 * Opciones de la cookie del link: solo `/puerta`, httpOnly, Strict y que vence con el link.
 *
 * @param {URL} url
 * @param {number} expiresAt
 * @param {number} [now]
 */
export function doorCookieOptions(url, expiresAt, now = Date.now()) {
	return {
		path: DOOR_LINK_PATH,
		httpOnly: true,
		secure: !(url.hostname === 'localhost' && url.protocol === 'http:'),
		sameSite: /** @type {const} */ ('strict'),
		maxAge: Math.max(1, Math.floor((expiresAt - now) / 1000))
	};
}

/**
 * Guardia de cada pedido de la puerta con link (`/puerta/<slug>/…`): la cookie tiene que ser de un
 * link vivo **de este evento**, dentro del tope de pedidos. Si no, 403 (o 429). Devuelve el actor.
 *
 * @param {{ cookies: import('@sveltejs/kit').Cookies, params: { slug?: string }, platform?: App.Platform, url: URL }} event
 * @param {D1Database | null | undefined} db
 * @param {{ now?: number }} [opts]
 * @returns {Promise<DoorActor>}
 */
export async function requireDoorLink(event, db, { now = Date.now() } = {}) {
	if (!db) error(503, 'No hay base de datos disponible.');
	const token = event.cookies.get(DOOR_LINK_COOKIE);
	const found = await findDoorLink(db, token, now);
	if (!found.ok) {
		// Una cookie que ya no sirve (vencida, revocada, cambiada) se borra.
		if (token !== undefined) event.cookies.delete(DOOR_LINK_COOKIE, { path: DOOR_LINK_PATH });
		error(
			403,
			found.reason === 'expired'
				? 'Este link de puerta ya venció.'
				: 'Este link de puerta no sirve (venció o lo revocaron). Pedile uno nuevo a une organizadore.'
		);
	}
	if (found.link.event_slug !== event.params.slug) {
		error(403, 'Este link de puerta es para otro evento.');
	}
	const rate = await hitRateLimit(db, `puerta:link:${found.link.id}`, DOOR_LINK_REQUEST_LIMIT, now);
	if (!rate.allowed) error(429, 'Demasiados pedidos con este link: esperá un rato.');
	return linkActor(found.link);
}

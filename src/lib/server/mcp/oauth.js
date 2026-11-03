/**
 * Conector de Claude (docs/conector-claude.md): el servidor de autorización OAuth 2.1 propio del
 * sitio para `/mcp`, sin tablas nuevas.
 *
 * - **Sin guardar tokens**: el código, el token de acceso y el de renovación son JSON firmados con
 *   HMAC-SHA256 (`kv1.<datos>.<firma>`). La clave es una fila de `ticket_settings`
 *   (`mcp_oauth_clave`, 32 bytes al azar que se crean solos, como los links firmados de
 *   signedLinks.js); nunca está en el repo.
 * - **Un solo uso** para el código y cada token de renovación: su `jti` se anota en `rate_limits`
 *   con tope 1 en una ventana móvil de 24 h (hitRateLimit). Por eso el token de renovación dura
 *   menos de 23 h: dentro de su vida, un segundo uso siempre se ve. Si se reusa uno ya usado, se
 *   cierran todas las conexiones de ese admin (alguien lo copió).
 * - **Se puede cortar**: por admin, «Cerrar mis conexiones» guarda en `ticket_settings`
 *   (`mcp_desde:<id de GitHub>`) desde cuándo valen sus tokens; para todes, «Cerrar las de todes»
 *   borra la clave (se crea otra y ningún token viejo vale). Además, cada pedido vuelve a mirar
 *   que el id siga en `ADMINS` y que el interruptor esté prendido.
 * - **Solo admins**: el id de GitHub de la sesión del panel; le admin de prueba, solo en un preview
 *   (ver {@link adminById}).
 * - **Clientes**: no se registran de verdad. `/mcp/registro` (registro dinámico, RFC 7591) y el
 *   ID de cliente fijo devuelven siempre {@link CLIENT_ID}; lo que se controla es adónde vuelve el
 *   código: solo a la vuelta de claude.ai (o claude.com) o a un puerto local (Claude Code).
 */
import { ADMINS } from '$lib/server/auth';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { DEMO_LOGIN, DEMO_USER_ID } from '$lib/server/demo/identity.js';
import { storedSecret } from '$lib/server/signedLinks.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { timingSafeEqual } from '$lib/server/hash.js';
import { fromBase64url, toBase64url } from '$lib/utils/base64.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** El ID de cliente que usa Claude (registro dinámico o escrito a mano en «Configuración avanzada»). */
export const CLIENT_ID = 'kinkyvibe-claude';

/** El único permiso que existe: leer. */
export const SCOPE = 'lectura';

/** La ruta del servidor MCP. */
export const MCP_PATH = '/mcp';

/** Cuánto vale cada cosa (ms). */
export const CODE_TTL_MS = 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
/** Menos de 23 h: el anotador de un solo uso mira las últimas 23 a 24 h (ver arriba). */
export const REFRESH_TTL_MS = 20 * 60 * 60 * 1000;
/** Después de esto, hay que volver a autorizar desde el sitio aunque se renueve todos los días. */
export const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

/** Fila de `ticket_settings` con la clave de las firmas. */
export const KEY_SETTING = 'mcp_oauth_clave';

/** Fila de `ticket_settings` con desde cuándo valen los tokens de un admin. @param {number} id */
export const sinceSetting = (id) => `mcp_desde:${id}`;

/** Las vueltas de claude.ai (la de claude.com, por si la mudan: lo avisan en su documentación). */
const HOSTED_REDIRECTS = Object.freeze([
	'https://claude.ai/api/mcp/auth_callback',
	'https://claude.com/api/mcp/auth_callback'
]);

/** Vuelta a un programa en la misma compu (Claude Code), en cualquier puerto (RFC 8252, 7.3). */
const LOOPBACK_REDIRECT = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/callback$/;

/**
 * ¿Puede volver el código a esta dirección?
 * @param {unknown} uri
 */
export function isAllowedRedirect(uri) {
	if (typeof uri !== 'string' || uri.length > 200) return false;
	return HOSTED_REDIRECTS.includes(uri) || LOOPBACK_REDIRECT.test(uri);
}

/** ¿Es una vuelta a la misma compu? (la pantalla de permiso lo avisa) @param {string} uri */
export const isLoopbackRedirect = (uri) => LOOPBACK_REDIRECT.test(uri);

/** La dirección del servidor MCP (el `resource` de OAuth). @param {string} origin */
export const resourceOf = (origin) => `${origin}${MCP_PATH}`;

/** @param {string} origin */
export const resourceMetadataUrl = (origin) =>
	`${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;

/**
 * Metadatos del recurso protegido (RFC 9728).
 * @param {string} origin
 */
export function protectedResourceMetadata(origin) {
	return {
		resource: resourceOf(origin),
		authorization_servers: [origin],
		scopes_supported: [SCOPE],
		bearer_methods_supported: ['header'],
		resource_name: 'KinkyVibe (solo lectura, admins)'
	};
}

/**
 * Metadatos del servidor de autorización (RFC 8414). Sin documentos de cliente (CIMD): habría que
 * ir a buscar URLs de terceros; Claude usa entonces el registro dinámico.
 * @param {string} origin
 */
export function authServerMetadata(origin) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/mcp/autorizar`,
		token_endpoint: `${origin}/mcp/token`,
		registration_endpoint: `${origin}/mcp/registro`,
		scopes_supported: [SCOPE],
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none'],
		code_challenge_methods_supported: ['S256'],
		authorization_response_iss_parameter_supported: true
	};
}

/**
 * El encabezado `WWW-Authenticate` de un 401 (lo que hace que Claude abra el permiso).
 * @param {string} origin
 * @param {string} [error] p. ej. `invalid_token`
 */
export function wwwAuthenticate(origin, error) {
	return (
		'Bearer ' +
		(error ? `error="${error}", ` : '') +
		`resource_metadata="${resourceMetadataUrl(origin)}", scope="${SCOPE}"`
	);
}

/**
 * Le admin de `ADMINS` con ese id de GitHub, o `undefined`. En un preview (y solo ahí) también le
 * admin de prueba (docs/demo.md): el login con GitHub anda solo en kinkyvibe.ar, y la base de los
 * previews es de datos inventados.
 * @param {unknown} id
 * @returns {{ id: number, login: string } | undefined}
 */
export function adminById(id) {
	if (typeof id !== 'number' || !Number.isSafeInteger(id)) return undefined;
	if (id === DEMO_USER_ID) return isPreviewDeploy() ? { id, login: DEMO_LOGIN } : undefined;
	return ADMINS.find((a) => a.id === id);
}

/**
 * @typedef {{
 *   v: 1,
 *   t: 'code' | 'access' | 'refresh',
 *   sub: number,
 *   aud: string,
 *   iat: number,
 *   exp: number,
 *   auth: number,
 *   jti: string,
 *   scope: string,
 *   cid: string,
 *   ru?: string,
 *   cc?: string
 * }} TokenPayload
 *
 * `auth`: cuándo autorizó le admin en el sitio (el tope de {@link SESSION_MAX_MS}). `ru` y `cc`
 * (dirección de vuelta y desafío PKCE), solo en el código.
 */

/** @param {D1Database} db */
async function hmacKey(db) {
	return crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(await storedSecret(db, KEY_SETTING)),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
}

/** @param {CryptoKey} key @param {string} text */
async function sign(key, text) {
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
	return toBase64url(new Uint8Array(sig));
}

/** 16 bytes al azar, para el `jti`. */
export const randomId = () => toBase64url(crypto.getRandomValues(new Uint8Array(16)));

/**
 * Firma un token.
 * @param {D1Database} db
 * @param {Omit<TokenPayload, 'v' | 'jti'>} payload
 */
export async function signToken(db, payload) {
	const body = toBase64url(
		new TextEncoder().encode(JSON.stringify({ v: 1, jti: randomId(), ...payload }))
	);
	return `kv1.${body}.${await sign(await hmacKey(db), `kv1.${body}`)}`;
}

/**
 * Lee un token si la firma es buena, es del tipo pedido y no venció; si no, `null`.
 * @param {D1Database} db
 * @param {unknown} token
 * @param {TokenPayload['t']} type
 * @param {number} [now]
 * @returns {Promise<TokenPayload | null>}
 */
export async function readToken(db, token, type, now = Date.now()) {
	if (typeof token !== 'string' || token.length > 2000) return null;
	const m = /^kv1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
	if (!m) return null;
	const expected = await sign(await hmacKey(db), `kv1.${m[1]}`);
	if (!timingSafeEqual(expected, m[2])) return null;
	/** @type {TokenPayload} */
	let p;
	const bytes = fromBase64url(m[1]);
	if (!bytes) return null;
	try {
		p = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
	if (!p || p.v !== 1 || p.t !== type || typeof p.exp !== 'number' || p.exp <= now) return null;
	if (!adminById(p.sub) || typeof p.jti !== 'string' || p.scope !== SCOPE) return null;
	return p;
}

/**
 * ¿El verificador PKCE corresponde al desafío? (S256: base64url(SHA-256(verificador))).
 * @param {unknown} verifier
 * @param {unknown} challenge
 */
export async function pkceMatches(verifier, challenge) {
	if (typeof verifier !== 'string' || typeof challenge !== 'string') return false;
	// RFC 7636, 4.1: 43 a 128 caracteres de este alfabeto.
	if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return timingSafeEqual(toBase64url(new Uint8Array(digest)), challenge);
}

/** ¿Es un desafío PKCE S256 bien formado? @param {unknown} c */
export const isChallenge = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);

/**
 * Anota el uso de un código o token de renovación; `false` si ya se había usado.
 * @param {D1Database} db
 * @param {string} jti
 * @param {number} [now]
 */
export async function useOnce(db, jti, now = Date.now()) {
	const r = await hitRateLimit(
		db,
		`mcp-uso:${jti}`,
		{ limit: 1, windowSeconds: 24 * 60 * 60 },
		now
	);
	return r.allowed;
}

/**
 * Desde cuándo valen los tokens de un admin (ms; 0 si nunca cerró sus conexiones).
 * @param {D1Database} db
 * @param {number} id
 */
export async function validSince(db, id) {
	const row = await db
		.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
		.bind(sinceSetting(id))
		.first();
	const n = Number(/** @type {{ value?: string } | null} */ (row)?.value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Cierra las conexiones de un admin: ningún token emitido antes de `now` vale más.
 * @param {D1Database} db
 * @param {{ id: number, login: string }} admin
 * @param {number} [now]
 */
export async function closeConnections(db, admin, now = Date.now()) {
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
				updated_by = excluded.updated_by`
		)
		.bind(sinceSetting(admin.id), String(now), now, admin.login)
		.run();
}

/**
 * Cierra las conexiones de todes: borra la clave de las firmas (la próxima firma crea otra).
 * @param {D1Database} db
 */
export async function rotateKey(db) {
	await db.prepare('DELETE FROM ticket_settings WHERE key = ?1').bind(KEY_SETTING).run();
}

/**
 * ¿Sigue valiendo un token de este admin? (sigue en ADMINS y no cerró sus conexiones después).
 * @param {D1Database} db
 * @param {TokenPayload} p
 * @param {number} [now]
 */
export async function stillValid(db, p, now = Date.now()) {
	if (!adminById(p.sub)) return false;
	if (now - p.auth > SESSION_MAX_MS) return false;
	return p.iat >= (await validSince(db, p.sub));
}

/**
 * Le admin del token de acceso de un pedido a `/mcp`, o `null`.
 * @param {D1Database} db
 * @param {Request} request
 * @param {string} origin
 * @param {number} [now]
 * @returns {Promise<{ id: number, login: string } | null>}
 */
export async function bearerAdmin(db, request, origin, now = Date.now()) {
	const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization') ?? '');
	if (!m) return null;
	const p = await readToken(db, m[1], 'access', now);
	if (!p || p.aud !== resourceOf(origin)) return null;
	if (!(await stillValid(db, p, now))) return null;
	const admin = /** @type {{ id: number, login: string }} */ (adminById(p.sub));
	return { id: admin.id, login: admin.login };
}

/**
 * Un token de acceso y uno de renovación nuevos (la respuesta de `/mcp/token`).
 * @param {D1Database} db
 * @param {{ sub: number, aud: string, auth: number, cid: string }} who
 * @param {number} [now]
 */
export async function issueTokens(db, who, now = Date.now()) {
	const base = { ...who, iat: now, scope: SCOPE };
	const [access, refresh] = await Promise.all([
		signToken(db, { ...base, t: 'access', exp: now + ACCESS_TTL_MS }),
		signToken(db, { ...base, t: 'refresh', exp: now + REFRESH_TTL_MS })
	]);
	return {
		access_token: access,
		token_type: 'Bearer',
		expires_in: Math.floor(ACCESS_TTL_MS / 1000),
		refresh_token: refresh,
		scope: SCOPE
	};
}

/**
 * @typedef {{
 *   redirectUri: string,
 *   challenge: string,
 *   state: string | null,
 *   resource: string
 * }} AuthorizeRequest
 */

/**
 * Lee y controla un pedido de autorización (los parámetros de `/mcp/autorizar`, o los mismos en
 * campos ocultos del formulario).
 *
 * - `{ ok: true, req }`: se puede mostrar el permiso.
 * - `{ ok: false, message }` sin `redirect`: el cliente o la vuelta no son de Claude; se muestra el
 *   error en el sitio y no se vuelve a ningún lado (RFC 6749, 4.1.2.1).
 * - `{ ok: false, message, redirect }`: lo demás está mal; se vuelve a Claude con el error.
 *
 * @param {{ get: (name: string) => unknown }} params `URLSearchParams` o `FormData`
 * @param {string} origin
 * @returns {{ ok: true, req: AuthorizeRequest } | { ok: false, message: string, redirect?: string }}
 */
export function parseAuthorizeRequest(params, origin) {
	/** @param {string} k */
	const get = (k) => {
		const v = params.get(k);
		return typeof v === 'string' && v !== '' ? v : null;
	};
	if (get('client_id') !== CLIENT_ID)
		return { ok: false, message: 'Este pedido no viene del conector de Claude del sitio.' };
	const redirectUri = get('redirect_uri');
	if (!redirectUri || !isAllowedRedirect(redirectUri))
		return { ok: false, message: 'La dirección de vuelta no es la de Claude.' };
	const state = get('state');
	if (state !== null && state.length > 500)
		return { ok: false, message: 'El pedido es demasiado largo.' };
	/** @param {string} error @param {string} message */
	const back = (error, message) => ({
		ok: /** @type {const} */ (false),
		message,
		redirect: authorizeRedirect(redirectUri, origin, { error, error_description: message, state })
	});
	if (get('response_type') !== 'code')
		return back('unsupported_response_type', 'Solo response_type=code.');
	const challenge = get('code_challenge');
	if (get('code_challenge_method') !== 'S256' || !isChallenge(challenge))
		return back('invalid_request', 'Hace falta PKCE con S256.');
	const scope = get('scope');
	if (scope !== null && !scope.split(' ').includes(SCOPE))
		return back('invalid_scope', `El único permiso es «${SCOPE}».`);
	const resource = get('resource') ?? resourceOf(origin);
	if (resource !== resourceOf(origin))
		return back('invalid_target', 'Este servidor solo autoriza su /mcp.');
	return {
		ok: true,
		req: { redirectUri, challenge: /** @type {string} */ (challenge), state, resource }
	};
}

/**
 * La dirección de vuelta a Claude con los parámetros de la respuesta (y `iss`, RFC 9207).
 * @param {string} redirectUri
 * @param {string} origin
 * @param {Record<string, string | null>} values
 */
export function authorizeRedirect(redirectUri, origin, values) {
	const u = new URL(redirectUri);
	for (const [k, v] of Object.entries(values)) if (v !== null) u.searchParams.set(k, v);
	u.searchParams.set('iss', origin);
	return u.toString();
}

/**
 * El código de autorización para le admin (vale {@link CODE_TTL_MS} y un solo uso).
 * @param {D1Database} db
 * @param {{ id: number }} admin
 * @param {AuthorizeRequest} req
 * @param {number} [now]
 */
export function issueCode(db, admin, req, now = Date.now()) {
	return signToken(db, {
		t: 'code',
		sub: admin.id,
		aud: req.resource,
		iat: now,
		exp: now + CODE_TTL_MS,
		auth: now,
		scope: SCOPE,
		cid: CLIENT_ID,
		ru: req.redirectUri,
		cc: req.challenge
	});
}

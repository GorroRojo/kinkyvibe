/**
 * Conector de Claude: el endpoint de tokens de OAuth (docs/conector-claude.md). Cambia el código de
 * `/mcp/autorizar` (con PKCE) por un token de acceso y uno de renovación, y renueva. Cliente
 * público: sin secreto, lo que autoriza es el código con su verificador o el token de renovación.
 *
 * Claude manda `application/x-www-form-urlencoded` desde sus servidores, sin `Origin`: el Worker
 * le pone el del sitio para que el chequeo CSRF de SvelteKit no lo rechace (worker/index.js,
 * src/lib/server/mcp/tokenPost.js). Esta ruta no mira cookies ni la sesión.
 */
import { logAdminAction } from '$lib/server/admin/audit.js';
import { readTextCapped } from '$lib/server/http/body.js';
import { connectorDB, limitByClient, noStoreJson } from '$lib/server/mcp/http.js';
import {
	CLIENT_ID,
	adminById,
	closeConnections,
	issueTokens,
	pkceMatches,
	readToken,
	resourceOf,
	stillValid,
	useOnce
} from '$lib/server/mcp/oauth.js';

/** Pedidos de tokens por conexión por minuto. */
const TOKEN_RATE_LIMIT = { limit: 60, windowSeconds: 60 };

/** @param {string} error @param {string} description @param {number} [status] */
const oauthError = (error, description, status = 400) =>
	noStoreJson({ error, error_description: description }, status);

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	const { request, url, platform } = event;
	const db = await connectorDB(platform);
	const limited = await limitByClient(db, event, 'token', TOKEN_RATE_LIMIT);
	if (limited) return limited;
	const text = await readTextCapped(request, 8 * 1024);
	if (text === null) return oauthError('invalid_request', 'Pedido demasiado grande.');
	const form = new URLSearchParams(text);
	const clientId = form.get('client_id');
	if (clientId !== null && clientId !== CLIENT_ID)
		return oauthError('invalid_client', 'Cliente desconocido.', 401);
	const resource = form.get('resource');
	if (resource !== null && resource !== resourceOf(url.origin))
		return oauthError('invalid_target', 'Este servidor solo da tokens para su /mcp.');
	const now = Date.now();
	const grant = form.get('grant_type');

	if (grant === 'authorization_code') {
		const code = await readToken(db, form.get('code'), 'code', now);
		if (
			!code ||
			code.ru !== form.get('redirect_uri') ||
			!(await pkceMatches(form.get('code_verifier'), code.cc))
		)
			return oauthError('invalid_grant', 'El código no vale (vencido, usado o de otro pedido).');
		if (!(await useOnce(db, code.jti, now)))
			return oauthError('invalid_grant', 'El código ya se usó.');
		if (!(await stillValid(db, code, now)))
			return oauthError('invalid_grant', 'Esta autorización ya no vale.');
		return noStoreJson(
			await issueTokens(db, { sub: code.sub, aud: code.aud, auth: code.auth, cid: CLIENT_ID }, now)
		);
	}

	if (grant === 'refresh_token') {
		const refresh = await readToken(db, form.get('refresh_token'), 'refresh', now);
		if (!refresh || refresh.aud !== resourceOf(url.origin))
			return oauthError('invalid_grant', 'El token de renovación no vale.');
		if (!(await stillValid(db, refresh, now)))
			return oauthError('invalid_grant', 'Esta conexión se cerró: volvé a conectar.');
		if (!(await useOnce(db, refresh.jti, now))) {
			// Un token de renovación usado dos veces: alguien más lo tiene. Se cierra todo.
			const admin = /** @type {{ id: number, login: string }} */ (adminById(refresh.sub));
			await closeConnections(db, admin, now);
			await logAdminAction(
				db,
				{ user: admin },
				{
					action: 'conector.cerrar',
					summary:
						'Conector de Claude: un token de renovación se usó dos veces; se cerraron tus conexiones'
				}
			);
			return oauthError('invalid_grant', 'El token de renovación ya se usó.');
		}
		return noStoreJson(
			await issueTokens(
				db,
				{ sub: refresh.sub, aud: refresh.aud, auth: refresh.auth, cid: CLIENT_ID },
				now
			)
		);
	}

	return oauthError('unsupported_grant_type', 'Solo authorization_code y refresh_token.');
}

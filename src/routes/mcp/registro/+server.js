/**
 * Conector de Claude: registro dinámico de clientes (RFC 7591; docs/conector-claude.md). No guarda
 * nada: si las direcciones de vuelta son las de Claude (claude.ai, claude.com o un puerto local),
 * devuelve siempre el mismo ID de cliente público. Lo que protege es la sesión de admin en
 * `/mcp/autorizar` y que el código solo vuelva a esas direcciones.
 */
import { readJsonCapped } from '$lib/server/http/body.js';
import { connectorDB, limitByClient, noStoreJson } from '$lib/server/mcp/http.js';
import { CLIENT_ID, SCOPE, isAllowedRedirect } from '$lib/server/mcp/oauth.js';

/** Registros por conexión por hora (Claude registra uno por conexión nueva). */
const REGISTER_RATE_LIMIT = { limit: 30, windowSeconds: 60 * 60 };

/** @param {string} description */
const invalid = (description) =>
	noStoreJson({ error: 'invalid_client_metadata', error_description: description }, 400);

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	const db = await connectorDB(event.platform);
	const limited = await limitByClient(db, event, 'registro', REGISTER_RATE_LIMIT);
	if (limited) return limited;
	const body = await readJsonCapped(event.request, 16 * 1024);
	if (!body.ok || !body.value || typeof body.value !== 'object' || Array.isArray(body.value))
		return invalid('Se espera un objeto JSON.');
	const meta = /** @type {Record<string, unknown>} */ (body.value);
	const uris = meta.redirect_uris;
	if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5)
		return noStoreJson(
			{ error: 'invalid_redirect_uri', error_description: 'Faltan las direcciones de vuelta.' },
			400
		);
	if (!uris.every(isAllowedRedirect))
		return noStoreJson(
			{
				error: 'invalid_redirect_uri',
				error_description:
					'Este servidor solo acepta la vuelta de Claude (claude.ai o un puerto local).'
			},
			400
		);
	const auth = meta.token_endpoint_auth_method;
	if (auth !== undefined && auth !== 'none')
		return invalid('Solo clientes públicos (token_endpoint_auth_method "none", con PKCE).');
	return noStoreJson(
		{
			client_id: CLIENT_ID,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_name: typeof meta.client_name === 'string' ? meta.client_name.slice(0, 100) : 'Claude',
			redirect_uris: uris,
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
			scope: SCOPE
		},
		201
	);
}

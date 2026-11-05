/**
 * Conector de Claude: metadatos del servidor de autorización (RFC 8414; docs/conector-claude.md).
 * El emisor es el sitio (sin camino), así que vive en `/.well-known/oauth-authorization-server`;
 * con `/mcp` al final también contesta, por los clientes que lo buscan así. Apagado, 404.
 */
import { error } from '@sveltejs/kit';
import { connectorDB, noStoreJson } from '$lib/server/mcp/http.js';
import { MCP_PATH, authServerMetadata } from '$lib/server/mcp/oauth.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, url }) {
	if (params.rest !== '' && `/${params.rest}` !== MCP_PATH) error(404, 'No encontrado');
	await connectorDB(platform);
	return noStoreJson(authServerMetadata(url.origin));
}

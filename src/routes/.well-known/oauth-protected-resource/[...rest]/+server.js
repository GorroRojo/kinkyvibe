/**
 * Conector de Claude: metadatos del recurso protegido (RFC 9728; docs/conector-claude.md), en
 * `/.well-known/oauth-protected-resource` y `/.well-known/oauth-protected-resource/mcp` (los dos
 * lugares donde los busca un cliente MCP). Apagado, 404.
 */
import { error } from '@sveltejs/kit';
import { connectorDB, noStoreJson } from '$lib/server/mcp/http.js';
import { MCP_PATH, protectedResourceMetadata } from '$lib/server/mcp/oauth.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, url }) {
	if (params.rest !== '' && `/${params.rest}` !== MCP_PATH) error(404, 'No encontrado');
	await connectorDB(platform);
	return noStoreJson(protectedResourceMetadata(url.origin));
}

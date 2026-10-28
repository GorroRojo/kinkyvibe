/**
 * El servidor MCP del conector de Claude (docs/conector-claude.md). Solo admins, con el token de
 * `/mcp/token`; sin token (o con uno que no vale), 401 con el `WWW-Authenticate` que hace que
 * Claude pida el permiso. Apagado (interruptor `conector_claude`), 404.
 */
import { logDBError } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { readJsonCapped } from '$lib/server/http/body.js';
import { connectorDB, noStoreJson } from '$lib/server/mcp/http.js';
import { bearerAdmin, wwwAuthenticate } from '$lib/server/mcp/oauth.js';
import { PROTOCOL_VERSIONS, RPC, handleMessage, rpcError } from '$lib/server/mcp/rpc.js';

/** Pedidos por admin por minuto (Claude hace unos pocos por pregunta). */
const MCP_RATE_LIMIT = { limit: 60, windowSeconds: 60 };

/** Tope del cuerpo de un mensaje (los pedidos son chicos). */
const MAX_BODY = 64 * 1024;

/**
 * Orígenes de navegador aceptados (la especificación pide mirar `Origin` contra el DNS rebinding).
 * Claude llama desde sus servidores, sin `Origin`.
 * @param {string | null} origin
 * @param {URL} url
 */
function originAllowed(origin, url) {
	return (
		origin === null ||
		origin === url.origin ||
		origin === 'https://claude.ai' ||
		origin === 'https://claude.com'
	);
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	const { request, url, platform, fetch } = event;
	const db = await connectorDB(platform);
	if (!originAllowed(request.headers.get('origin'), url)) {
		return noStoreJson(rpcError(null, RPC.INVALID_REQUEST, 'Origen no permitido.'), 403);
	}
	const user = await bearerAdmin(db, request, url.origin);
	if (!user) {
		const sent = request.headers.has('authorization');
		return noStoreJson(
			{ error: 'invalid_token', error_description: 'Hace falta autorizar el conector.' },
			401,
			{ 'www-authenticate': wwwAuthenticate(url.origin, sent ? 'invalid_token' : undefined) }
		);
	}
	try {
		// El bucket lleva el id de GitHub de le admin (público en auth.js), nunca una IP.
		const rl = await hitRateLimit(db, `mcp:${user.id}`, MCP_RATE_LIMIT);
		if (!rl.allowed) {
			return noStoreJson(
				rpcError(null, RPC.INTERNAL, 'Demasiados pedidos seguidos. Esperá un minuto.'),
				429,
				{
					'retry-after': String(rl.retryAfter)
				}
			);
		}
	} catch (error) {
		logDBError('conector de Claude: límite', error);
	}
	const version = request.headers.get('mcp-protocol-version');
	if (version && !PROTOCOL_VERSIONS.includes(version)) {
		return noStoreJson(
			rpcError(
				null,
				RPC.INVALID_REQUEST,
				`Versión del protocolo no soportada: ${version.slice(0, 20)}`
			),
			400
		);
	}
	const body = await readJsonCapped(request, MAX_BODY);
	if (!body.ok) {
		return noStoreJson(
			rpcError(
				null,
				body.reason === 'too-large' ? RPC.INVALID_REQUEST : RPC.PARSE,
				body.reason === 'too-large' ? 'Mensaje demasiado grande.' : 'JSON inválido.'
			),
			400
		);
	}
	if (Array.isArray(body.value)) {
		return noStoreJson(
			rpcError(null, RPC.INVALID_REQUEST, 'No se aceptan tandas de mensajes.'),
			400
		);
	}
	const reply = await handleMessage(body.value, { db, user, fetch, now: Date.now() });
	if (!reply) return new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } });
	return noStoreJson(reply);
}

/** Sin flujo SSE del servidor ni sesiones: 405 (lo permite la especificación). */
/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	await connectorDB(platform);
	return new Response(null, { status: 405, headers: { allow: 'POST' } });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ platform }) {
	await connectorDB(platform);
	return new Response(null, { status: 405, headers: { allow: 'POST' } });
}

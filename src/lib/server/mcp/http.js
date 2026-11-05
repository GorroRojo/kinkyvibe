/**
 * Lo común a las rutas del conector de Claude (docs/conector-claude.md): el interruptor, las
 * respuestas JSON sin caché y el límite por conexión.
 */
import { error } from '@sveltejs/kit';
import { getDB, logDBError } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { isFlagOn } from '$lib/server/flags.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * La base, si el conector está prendido; si no (o sin base), 404: apagado, no existe.
 * @param {App.Platform | undefined} platform
 * @returns {Promise<D1Database>}
 */
export async function connectorDB(platform) {
	const db = getDB(platform);
	if (!db || !(await isFlagOn(db, 'conector_claude'))) error(404, 'No encontrado');
	return db;
}

/**
 * Respuesta JSON que nunca se guarda en una caché.
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 */
export function noStoreJson(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
			pragma: 'no-cache',
			...headers
		}
	});
}

/**
 * Límite por conexión (hash anónimo del día, como la compra de entradas). Todo Claude sale de unas
 * pocas IPs de Anthropic, así que el tope es generoso: frena un abuso, no a les admins.
 * Si la base falla, deja pasar (como el buscador del panel).
 *
 * @param {D1Database} db
 * @param {{ getClientAddress?: () => string }} event
 * @param {string} name
 * @param {{ limit: number, windowSeconds: number }} rule
 * @returns {Promise<Response | null>} el 429, o `null` si puede seguir
 */
export async function limitByClient(db, event, name, rule) {
	try {
		const who = await clientHash(clientAddress(event));
		const r = await hitRateLimit(db, `mcp-${name}:${who}`, rule);
		if (r.allowed) return null;
		return noStoreJson(
			{ error: 'slow_down', error_description: 'Demasiados pedidos seguidos.' },
			429,
			{ 'retry-after': String(r.retryAfter) }
		);
	} catch (e) {
		logDBError(`conector de Claude: límite ${name}`, e);
		return null;
	}
}

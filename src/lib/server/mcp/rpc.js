/**
 * El protocolo MCP del conector de Claude, a mano (docs/conector-claude.md): JSON-RPC 2.0 sobre
 * «Streamable HTTP» (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
 * sin sesiones y sin SSE: cada POST trae un mensaje y, si es un pedido, la respuesta va en JSON.
 * El SDK oficial pide Node (Express y sus transportes); esto alcanza para cuatro herramientas de
 * lectura y no suma dependencias.
 *
 * Métodos: `initialize`, `ping`, `tools/list` y `tools/call`. Las notificaciones (sin `id`) se
 * aceptan con 202 y no hacen nada.
 */
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import { TOOLS, ToolInputError, toolList } from './tools.js';
import { EDIT_TOOLS } from './edicion.js';
import { editingOn } from './cambios.js';
import { queueBurstAlert } from './avisoCambios.js';

/** Versiones del protocolo que entiende el servidor, la más nueva primero. */
export const PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26']);

/** Códigos de error de JSON-RPC. */
export const RPC = Object.freeze({
	PARSE: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL: -32603
});

const INSTRUCTIONS =
	'Conector de solo lectura del sitio de KinkyVibe (comunidad kinky de Buenos Aires), para les ' +
	'admins. Pedí las cosas por nombre o slug: `buscar` para encontrar, `leer` para ver un objeto, ' +
	'`ventas` para la venta de un evento y `eventos_proximos` para la agenda. Los datos de ' +
	'compradores son privados: usalos solo para lo que pidió le admin y no los repitas de más.';

/** Lo que se suma a las instrucciones con los cambios prendidos. */
const EDIT_INSTRUCTIONS =
	' Con los cambios prendidos, todo cambio va en dos pasos: `vista_previa` (no guarda nada) y, ' +
	'solo después de que la persona vea el resumen y diga que sí, `aplicar` con las mismas ' +
	'entradas más el `hash` y la `version` que dio la vista previa. Nunca apliques algo distinto de ' +
	'lo que se mostró.';

/**
 * Las herramientas que se pueden usar ahora: las de lectura y, con los cambios prendidos y una
 * conexión con permiso de cambiar (`edicion` o una llave), las de cambios.
 * @param {import('./tools.js').ToolContext} ctx
 */
async function availableTools(ctx) {
	const edit = ctx.canEdit === true && (await editingOn(ctx.db).catch(() => false));
	return { edit, tools: edit ? { ...TOOLS, ...EDIT_TOOLS } : TOOLS };
}

/**
 * @param {unknown} id
 * @param {number} code
 * @param {string} message
 */
export const rpcError = (id, code, message) => ({
	jsonrpc: '2.0',
	id: id ?? null,
	error: { code, message }
});

/** @param {unknown} id @param {unknown} result */
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

/**
 * Atiende un mensaje ya parseado. Devuelve la respuesta, o `null` si era una notificación.
 *
 * @param {unknown} msg
 * @param {import('./tools.js').ToolContext} ctx
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function handleMessage(msg, ctx) {
	if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
		return rpcError(null, RPC.INVALID_REQUEST, 'Se espera un objeto JSON-RPC.');
	}
	const m = /** @type {{ jsonrpc?: unknown, id?: unknown, method?: unknown, params?: any }} */ (
		msg
	);
	const isRequest = 'id' in m && (typeof m.id === 'string' || typeof m.id === 'number');
	if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
		// Una respuesta del cliente (no le pedimos nada) o algo mal armado.
		if (!('method' in m)) return null;
		return rpcError(isRequest ? m.id : null, RPC.INVALID_REQUEST, 'Pedido JSON-RPC inválido.');
	}
	if (!isRequest) return null; // notificaciones: notifications/initialized, cancelled…
	const id = m.id;
	const params = m.params && typeof m.params === 'object' ? m.params : {};
	switch (m.method) {
		case 'initialize': {
			const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
			const { edit } = await availableTools(ctx);
			return rpcResult(id, {
				protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: {
					name: 'kinkyvibe',
					title: edit ? 'KinkyVibe' : 'KinkyVibe (solo lectura)',
					version: '1.1.0'
				},
				instructions: edit ? INSTRUCTIONS + EDIT_INSTRUCTIONS : INSTRUCTIONS
			});
		}
		case 'ping':
			return rpcResult(id, {});
		case 'tools/list': {
			const { edit } = await availableTools(ctx);
			return rpcResult(id, { tools: edit ? [...toolList(), ...editToolList()] : toolList() });
		}
		case 'tools/call':
			return rpcResult(id, await callTool(params, ctx));
		default:
			return rpcError(id, RPC.METHOD_NOT_FOUND, `Método desconocido: ${m.method.slice(0, 60)}`);
	}
}

/**
 * Corre una herramienta y la anota en Actividad a nombre de le admin. Un error de la herramienta
 * vuelve como resultado con `isError` (así Claude lo lee y puede corregir el pedido).
 *
 * @param {Record<string, any>} params
 * @param {import('./tools.js').ToolContext} ctx
 */
async function callTool(params, ctx) {
	const name = typeof params.name === 'string' ? params.name : '';
	const { tools } = await availableTools(ctx);
	const tool = Object.hasOwn(tools, name) ? tools[name] : null;
	const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
	const locals = { user: ctx.user };
	if (!tool && Object.hasOwn(EDIT_TOOLS, name) && ctx.canEdit !== true) {
		return errorResult(
			'Esta conexión solo tiene permiso de lectura. Para cambiar, volvé a conectar el conector en Claude y permití también los cambios.'
		);
	}
	if (!tool) return errorResult(`No existe la herramienta «${name.slice(0, 60)}».`);
	try {
		const { result, log, isError = false } = await tool.run(ctx, args);
		await logAdminAction(ctx.db, locals, { action: `conector.${name}`, ...log });
		// Sin tope de cambios: si hay muchos en una hora, aviso por Telegram (nunca traba nada).
		if (name === 'aplicar' && !isError) await queueBurstAlert(ctx);
		return {
			content: [{ type: 'text', text: JSON.stringify(result) }],
			structuredContent: result,
			isError
		};
	} catch (error) {
		if (error instanceof ToolInputError) {
			// Los cambios quedan en Actividad aunque no pasen la validación (sin las entradas).
			if (Object.hasOwn(EDIT_TOOLS, name)) {
				const op = typeof args.operacion === 'string' ? args.operacion.slice(0, 30) : '';
				await logAdminAction(ctx.db, locals, {
					action: `conector.${name}`,
					summary: `Claude: ${name === 'aplicar' ? 'no se aplicó' : 'vista previa rechazada'}${op ? ` (${op})` : ''}: no pasó la validación`,
					detail: { operacion: op }
				});
			}
			return errorResult(error.message);
		}
		logDBError(`conector de Claude: ${name}`, error);
		await logAdminAction(ctx.db, locals, {
			action: `conector.${name}`,
			summary: `Claude: ${name} falló`
		});
		return errorResult(
			Object.hasOwn(EDIT_TOOLS, name)
				? 'No se pudo terminar. Antes de reintentar, fijate con `leer` si el cambio quedó guardado.'
				: 'No se pudo leer eso ahora. Probá de nuevo en un rato.'
		);
	}
}

/** La lista de las de cambios para `tools/list`, cada una con sus anotaciones. */
export function editToolList() {
	return Object.values(EDIT_TOOLS).map((t) => ({ ...t.definition, annotations: t.annotations }));
}

/** @param {string} text */
const errorResult = (text) => ({ content: [{ type: 'text', text }], isError: true });

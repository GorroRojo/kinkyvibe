/**
 * Qué detalle mostrar en la página de error (src/routes/+error.svelte), además del título y el
 * texto de cada estado.
 */

/** Mensajes que SvelteKit pone solo: no dicen nada (y están en inglés). */
const DEFAULT_MESSAGES = new Set([
	'Not Found',
	'Forbidden',
	'Unauthorized',
	'Internal Error',
	'Internal Server Error',
	'Method Not Allowed',
	'Bad Request'
]);

/**
 * ¿Es un mensaje que puso SvelteKit y no nuestro código? Incluye el «Not found: /ruta» de una
 * dirección que no existe y la forma «Not Found: Not found: /ruta» que arma `handleError` en los
 * previews.
 * @param {string} message
 */
export function isDefaultErrorMessage(message) {
	const m = message.trim();
	if (!m) return true;
	if (DEFAULT_MESSAGES.has(m) || /^Error: \d+$/.test(m)) return true;
	return /^(not found|forbidden|unauthorized|method not allowed)\b/i.test(m);
}

/**
 * El detalle del error para mostrar, o `''`. Los 4xx vienen de nuestro código (en castellano); los
 * 5xx pueden traer detalles internos, así que solo en desarrollo.
 * @param {{ status: number, message?: string | null, dev?: boolean }} o
 */
export function errorDetail({ status, message, dev = false }) {
	const m = (message ?? '').trim();
	if (!m || isDefaultErrorMessage(m)) return '';
	return status < 500 || dev ? m : '';
}

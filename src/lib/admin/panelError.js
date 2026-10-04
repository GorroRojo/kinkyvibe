/**
 * Textos de la página de error del panel (`src/routes/(authed)/admin/+error.svelte`).
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
 * Título, texto y detalle para un error del panel. El detalle es el mensaje del error si lo
 * escribimos nosotres (4xx); los de 5xx pueden ser cosas internas, así que solo en dev.
 *
 * @param {number} status
 * @param {string} message `$page.error.message`
 * @param {{ dev?: boolean }} [opts]
 * @returns {{ title: string, text: string, detail: string }}
 */
export function panelErrorCopy(status, message, { dev = false } = {}) {
	const isDefault = DEFAULT_MESSAGES.has(message) || /^Error: \d+$/.test(message);
	const detail = message && !isDefault && (status < 500 || dev) ? message : '';
	if (status === 404) {
		return {
			title: 'No encontramos esta página',
			text: 'La dirección no existe en el panel o lo que buscabas ya no está. Probá con el buscador de arriba o volvé al Inicio.',
			detail
		};
	}
	if (status >= 500) {
		return {
			title: 'Algo se rompió',
			text: 'No pudimos cargar esta página. Probá de nuevo en un rato; si sigue pasando, avisale a gorrite.',
			detail
		};
	}
	return {
		title: 'No se pudo abrir esta página',
		text: 'Algo del pedido no cerró. Revisalo y probá de nuevo.',
		detail
	};
}

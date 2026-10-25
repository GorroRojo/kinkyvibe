/**
 * El `handleError` del sitio (src/hooks.server.js). Vive acá, y no en el hook, para que los tests
 * lo puedan importar sin cargar todo `hooks.server.js`.
 *
 * Cada error (menos los 404) deja UNA línea JSON en los registros del Worker, con un código corto
 * que también llega a la página de error. Si alguien nos escribe con ese código, se busca en los
 * registros de Cloudflare (Workers Logs) y aparece el error exacto.
 */

/** Líneas del stack que se guardan (las primeras: las que dicen dónde pasó). */
const STACK_LINES = 8;
/** Largo máximo del mensaje que llega a la página en los previews. */
const PREVIEW_MESSAGE_MAX = 500;

/**
 * El stack del error, recortado; `undefined` si no tiene.
 * @param {unknown} error
 */
function trimmedStack(error) {
	const stack = /** @type {any} */ (error)?.stack;
	if (typeof stack !== 'string' || !stack) return undefined;
	return stack.split('\n').slice(0, STACK_LINES).join('\n');
}

/**
 * El mensaje del error tal como vino (un `throw 'algo'` no tiene `.message`).
 * @param {unknown} error
 */
function errorMessage(error) {
	const e = /** @type {any} */ (error);
	return String(e?.message ?? e);
}

/**
 * Arma el `handleError` de SvelteKit.
 *
 * - `id`: código corto (8 caracteres) que identifica este error en los registros.
 * - Los 404 no se registran ni llevan código.
 * - En los previews (`preview` es la constante del build y `isPreview()` lo confirma en el deploy)
 *   el mensaje que llega a la página suma el del error (`${message}: ${e.message}`), para poder
 *   diagnosticar sin acceso a los registros (docs/demo.md). En producción, el mensaje genérico.
 *
 * @param {{ preview: boolean, isPreview: () => boolean, log?: Pick<Console, 'error'> }} options
 * @returns {import('@sveltejs/kit').HandleServerError}
 */
export function buildHandleError({ preview, isPreview, log = console }) {
	return ({ error, event, status, message }) => {
		// Una dirección que no existe no es un error para diagnosticar: el 404 de siempre, sin código.
		if (status === 404) return { message };
		const id = crypto.randomUUID().slice(0, 8);
		log.error(
			JSON.stringify({
				area: 'error',
				id,
				status,
				method: event?.request?.method,
				path: event?.url?.pathname,
				ray: event?.request?.headers?.get('cf-ray') ?? undefined,
				message: errorMessage(error),
				stack: trimmedStack(error)
			})
		);
		if (preview && isPreview()) {
			return { message: `${message}: ${errorMessage(error)}`.slice(0, PREVIEW_MESSAGE_MAX), id };
		}
		return { message, id };
	};
}

/**
 * Acción de Svelte para las imágenes que pueden no cargar (avatares de GitHub): llama a
 * `onBroken` cuando la imagen falla, también si falló antes de que Svelte escuchara `error` (la
 * página viene del servidor y el navegador ya intentó cargarla). Así se puede mostrar la inicial
 * en vez del ícono de imagen rota, como el avatar del menú de usuario del panel.
 *
 * Uso: `<img use:brokenImage={() => (failed = true)} …>`.
 *
 * @param {HTMLImageElement} node
 * @param {() => void} onBroken
 */
export function brokenImage(node, onBroken) {
	let callback = onBroken;
	const fail = () => callback?.();
	node.addEventListener('error', fail);
	// `complete` con ancho 0: ya terminó y no cargó (con `src` vacío también).
	if (node.complete && node.naturalWidth === 0) fail();
	return {
		/** @param {() => void} next */
		update(next) {
			callback = next;
		},
		destroy() {
			node.removeEventListener('error', fail);
		}
	};
}

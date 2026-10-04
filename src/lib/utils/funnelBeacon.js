/**
 * Aviso anónimo de los pasos «Tus datos» y «Pagar» de la compra (docs/analiticas.md): manda
 * `{ step, slug }` a `/api/visto` con `navigator.sendBeacon`, una sola vez por paso y por página.
 * No manda nada de lo que se escribe en el formulario. Si el navegador no puede, no pasa nada.
 */

/** @type {Set<string>} */
const sent = new Set();

/**
 * @param {'datos' | 'pagar'} step
 * @param {string} slug
 * @param {{ sendBeacon?: (url: string, data: Blob) => boolean } | undefined} [nav]
 * @returns {boolean} si se mandó
 */
export function sendFunnelStep(step, slug, nav = globalThis.navigator) {
	const key = `${slug}:${step}`;
	if (!slug || sent.has(key) || typeof nav?.sendBeacon !== 'function') return false;
	sent.add(key);
	try {
		const body = new Blob([JSON.stringify({ step, slug })], { type: 'application/json' });
		return nav.sendBeacon('/api/visto', body);
	} catch {
		return false;
	}
}

/** Para los tests. */
export function resetFunnelBeacon() {
	sent.clear();
}

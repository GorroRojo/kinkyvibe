/**
 * Avisos para lectores de pantalla que sobreviven a que el editor se vuelva a armar (al guardar,
 * PostEditor se arma de nuevo con el archivo guardado): una sola región `role="status"` fija en
 * `document.body`, fuera de Svelte. Una región que aparece junto con su texto no siempre se lee;
 * esta ya está cuando cambia.
 */

const ID = 'kv-announcer';

/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;

/**
 * Lee `text` (cortés: espera a que termine lo que se está leyendo). El mismo texto dos veces
 * seguidas no se repite.
 *
 * @param {string} text
 */
export function announce(text) {
	if (typeof document === 'undefined' || !text) return;
	let region = document.getElementById(ID);
	if (!region) {
		region = document.createElement('div');
		region.id = ID;
		region.setAttribute('role', 'status');
		region.setAttribute('aria-live', 'polite');
		region.setAttribute('aria-atomic', 'true');
		region.style.cssText =
			'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
		document.body.appendChild(region);
	}
	if (region.textContent === text) return;
	const target = region;
	clearTimeout(timer);
	// Vaciar y escribir un momento después: así se lee aunque el texto anterior fuera parecido.
	target.textContent = '';
	timer = setTimeout(() => (target.textContent = text), 50);
}

/**
 * Avisos para lectores de pantalla que sobreviven a que el editor se vuelva a armar (al guardar,
 * PostEditor se arma de nuevo con el archivo guardado): regiones vivas fijas en `document.body`,
 * fuera de Svelte. Una región que aparece junto con su texto no siempre se lee; estas ya están
 * cuando cambia.
 *
 * - `announce(text)`: cortés (`role="status"`), espera a que termine lo que se está leyendo.
 * - `announceNow(text)`: urgente (`role="alert"`), interrumpe. Para el resultado de un escaneo en
 *   la puerta o un aviso que no puede esperar; repite el mismo texto si llega dos veces seguidas
 *   (dos escaneos iguales seguidos se leen los dos).
 * - `announceResult(result, key)`: desde el callback de `use:enhance`, lee el `message` que
 *   devolvió la acción (`form[key].message`), salga bien o mal.
 */

const ID = 'kv-announcer';
const ASSERTIVE_ID = 'kv-announcer-assertive';
const HIDDEN =
	'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

/** @type {Record<string, ReturnType<typeof setTimeout> | undefined>} */
const timers = {};

/**
 * La región con ese id, creada la primera vez.
 *
 * @param {string} id
 * @param {boolean} assertive
 */
function region(id, assertive) {
	let el = document.getElementById(id);
	if (!el) {
		el = document.createElement('div');
		el.id = id;
		el.setAttribute('role', assertive ? 'alert' : 'status');
		el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
		el.setAttribute('aria-atomic', 'true');
		el.style.cssText = HIDDEN;
		document.body.appendChild(el);
	}
	return el;
}

/**
 * Vacía la región y escribe el texto un momento después: así se lee aunque el anterior fuera
 * parecido (o igual).
 *
 * @param {HTMLElement} target
 * @param {string} text
 */
function write(target, text) {
	clearTimeout(timers[target.id]);
	target.textContent = '';
	timers[target.id] = setTimeout(() => (target.textContent = text), 50);
}

/**
 * Lee `text` (cortés: espera a que termine lo que se está leyendo). El mismo texto dos veces
 * seguidas no se repite, salvo con `force` (por ejemplo, el mismo resultado de una acción hecha
 * otra vez).
 *
 * @param {string} text
 * @param {{ force?: boolean }} [opts]
 */
export function announce(text, { force = false } = {}) {
	if (typeof document === 'undefined' || !text) return;
	const target = region(ID, false);
	if (!force && target.textContent === text) return;
	write(target, text);
}

/**
 * Lee `text` ya (urgente: corta lo que se esté leyendo). Siempre se lee, aunque sea igual al
 * anterior.
 *
 * @param {string} text
 */
export function announceNow(text) {
	if (typeof document === 'undefined' || !text) return;
	write(region(ASSERTIVE_ID, true), text);
}

/**
 * Para el callback de `use:enhance`, después de `update()`: lee el mensaje de la acción
 * (`result.data[key].message`), salga bien (`success`) o mal (`failure`). Los mensajes que la
 * página muestra con `role="status"` nacen junto con su texto y no siempre se leen.
 *
 * @param {import('@sveltejs/kit').ActionResult} result
 * @param {string} key
 */
export function announceResult(result, key) {
	if (result.type !== 'success' && result.type !== 'failure') return;
	const message = /** @type {any} */ (result.data)?.[key]?.message;
	if (typeof message === 'string' && message) announce(message, { force: true });
}

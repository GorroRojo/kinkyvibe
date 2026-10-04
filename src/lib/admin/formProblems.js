/**
 * «Falta completar» de un formulario largo del panel (crear evento): cada problema sabe en qué
 * campo está, así el resumen es una lista de links, el primer campo con problema recibe el foco y
 * los campos con problema llevan `aria-invalid`.
 *
 * `problemField` (puro) dice el id del campo de un texto de problema conocido; `focusField` y
 * `markInvalid` tocan el DOM.
 */

/**
 * @typedef {{ text: string, field: string }} Problem
 */

/**
 * Para `.filter(isProblem)` sobre una lista con `false`/`''` de los problemas que no están.
 * @param {unknown} p
 * @returns {p is Problem}
 */
export function isProblem(p) {
	return Boolean(p) && typeof p === 'object';
}

/**
 * El campo de un problema de horario (los textos de `scheduleProblems`).
 * @param {string} text
 * @param {string} prefix el `idPrefix` de ScheduleSection (`ev` al crear)
 */
export function scheduleField(text, prefix = 'ev') {
	const end = /\bfin\b|termina/.test(text);
	const time = /hora/.test(text);
	if (end) return `${prefix}-end-${time ? 'time' : 'date'}`;
	return `${prefix}-start-${time ? 'time' : 'date'}`;
}

/**
 * Los ids sin repetir de una lista de problemas, en orden.
 * @param {Problem[]} problems
 */
export function problemFields(problems) {
	return [...new Set(problems.map((p) => p.field).filter(Boolean))];
}

const FOCUSABLE = 'input:not([type=hidden]), select, textarea, button, [tabindex]';

/** @param {Element} el */
const visible = (el) => el instanceof HTMLElement && el.offsetParent !== null;

/**
 * Lleva la pantalla al campo y le pone el foco (si el elemento no se puede enfocar, por ejemplo
 * un fieldset, el primer control visible de adentro).
 * @param {string} id
 * @returns {boolean} si encontró el campo
 */
export function focusField(id) {
	if (typeof document === 'undefined' || !id) return false;
	const el = document.getElementById(id);
	if (!el) return false;
	/** @type {Element | null} */
	let target = el.matches(FOCUSABLE) && visible(el) ? el : null;
	if (!target) target = [...el.querySelectorAll(FOCUSABLE)].find(visible) ?? null;
	const box = target ?? el;
	box.scrollIntoView({ behavior: 'smooth', block: 'center' });
	if (target instanceof HTMLElement) target.focus({ preventScroll: true });
	return true;
}

/** @type {Set<string>} */
let marked = new Set();

/**
 * Pone `aria-invalid="true"` en los campos de la lista y se lo saca a los que ya no están.
 * @param {string[]} ids
 */
export function markInvalid(ids) {
	if (typeof document === 'undefined') return;
	const next = new Set(ids);
	for (const id of marked) {
		if (!next.has(id)) document.getElementById(id)?.removeAttribute('aria-invalid');
	}
	for (const id of next) document.getElementById(id)?.setAttribute('aria-invalid', 'true');
	marked = next;
}

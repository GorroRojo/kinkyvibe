/**
 * Confirmaciones del panel con un diálogo centrado en la página, nunca `window.confirm`.
 * El layout del panel monta un solo <ConfirmDialog /> que se registra acá; las páginas llaman:
 *
 *   import { askConfirm } from '$lib/admin/confirm.js';
 *   if (!(await askConfirm({ title: '¿Borrar esta nota?', confirmLabel: 'Borrar', tone: 'danger' })))
 *     return cancel();
 *
 * `tone`: 'primary' (rosa), 'danger' (rosa oscuro, se puede deshacer) o 'permanent' (rojo, no
 * tiene vuelta atrás). Sin diálogo montado (por ejemplo en una prueba), usa `window.confirm`.
 */

/**
 * @typedef {{ title: string, text?: string, confirmLabel?: string, cancelLabel?: string,
 *   tone?: 'primary' | 'danger' | 'permanent' }} ConfirmOptions
 */

/** @type {((o: ConfirmOptions) => Promise<boolean>) | null} */
let handler = null;

/** @param {((o: ConfirmOptions) => Promise<boolean>) | null} fn */
export function registerConfirm(fn) {
	handler = fn;
}

/**
 * @param {ConfirmOptions} options
 * @returns {Promise<boolean>}
 */
export async function askConfirm(options) {
	if (handler) return handler(options);
	if (typeof window === 'undefined') return false;
	return window.confirm([options.title, options.text].filter(Boolean).join('\n\n'));
}

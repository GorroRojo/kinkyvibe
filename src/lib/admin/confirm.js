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
 *
 * Con `check` el diálogo suma una casilla (por ejemplo «Mandarle un mail») y la pregunta se hace
 * con `askConfirmCheck`, que devuelve también si quedó marcada:
 *
 *   const r = await askConfirmCheck({ title: '…', check: { label: 'Mandarle un mail', checked: true } });
 *   if (!r.ok) return cancel();
 *   if (!r.checked) formData.delete('mail');
 */

/**
 * @typedef {{ title: string, text?: string, confirmLabel?: string, cancelLabel?: string,
 *   tone?: 'primary' | 'danger' | 'permanent', check?: ConfirmCheck }} ConfirmOptions
 * @typedef {{ label: string, checked?: boolean }} ConfirmCheck `checked`: como arranca
 * @typedef {{ ok: boolean, checked: boolean }} ConfirmAnswer
 */

/** @type {((o: ConfirmOptions) => Promise<boolean | ConfirmAnswer>) | null} */
let handler = null;

/** @param {((o: ConfirmOptions) => Promise<boolean | ConfirmAnswer>) | null} fn */
export function registerConfirm(fn) {
	handler = fn;
}

/**
 * @param {ConfirmOptions} options
 * @returns {Promise<boolean>}
 */
export async function askConfirm(options) {
	return (await askConfirmCheck(options)).ok;
}

/**
 * Como `askConfirm`, y además si la casilla (`check`) quedó marcada. Sin diálogo montado, la
 * casilla queda como arranca.
 *
 * @param {ConfirmOptions} options
 * @returns {Promise<ConfirmAnswer>}
 */
export async function askConfirmCheck(options) {
	const initial = Boolean(options.check?.checked);
	/** @type {boolean | ConfirmAnswer} */
	let r = false;
	if (handler) r = await handler(options);
	else if (typeof window !== 'undefined')
		r = window.confirm([options.title, options.text].filter(Boolean).join('\n\n'));
	if (typeof r === 'boolean') return { ok: r, checked: r && initial };
	return { ok: r.ok, checked: r.ok && r.checked };
}

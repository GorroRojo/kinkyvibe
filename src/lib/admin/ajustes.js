/**
 * Ayudas para los formularios de Ajustes. Las pestañas de Ajustes (y de las otras secciones) las
 * pone el layout del panel: `sectionTabs` de `$lib/admin/nav.js`.
 */

/**
 * Valor de un campo: lo que se mandó (si la action devolvió `values`, p. ej. con un error) o lo
 * guardado.
 *
 * @param {Record<string, any> | null | undefined} form
 * @param {Record<string, any> | null | undefined} settings
 * @param {string} key
 */
export function fieldValue(form, settings, key) {
	if (form && 'values' in form && form.values) return String(form.values[key] ?? '');
	return String(settings?.[key] ?? '');
}

/**
 * Errores por campo de la última action.
 * @param {Record<string, any> | null | undefined} form
 * @returns {Record<string, string>}
 */
export function fieldErrors(form) {
	return form && 'errors' in form ? (form.errors ?? {}) : {};
}

/**
 * Formatea pesos argentinos enteros, p. ej. `$ 8.000`.
 *
 * @param {number} amount
 */
export function formatARS(amount) {
	return new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'ARS',
		maximumFractionDigits: 0
	}).format(amount);
}

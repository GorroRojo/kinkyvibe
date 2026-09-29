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

/**
 * Pesos con signo explícito (`+$ 2.000`, `−$ 4.000`, `$ 0`), para saldos que pueden ser
 * negativos (p. ej. el neto del Fondo KinkyVibe). Usa el signo menos tipográfico.
 *
 * @param {number} amount
 */
export function formatSignedARS(amount) {
	if (amount === 0) return formatARS(0);
	return `${amount > 0 ? '+' : '−'}${formatARS(Math.abs(amount))}`;
}

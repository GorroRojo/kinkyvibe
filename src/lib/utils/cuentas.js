/**
 * Link de cuentas del encabezado del sitio (docs/cuentas.md): "Ingresar" sin sesión, "Mi rincón"
 * con sesión, y nada si el interruptor `cuentas` está apagado.
 *
 * @param {{ cuentas?: boolean, member?: boolean } | null | undefined} data datos del layout raíz
 * @returns {{ href: string, label: string } | null}
 */
export function accountLink(data) {
	if (!data?.cuentas) return null;
	return data.member
		? { href: '/mi-rincon', label: 'Mi rincón' }
		: { href: '/ingresar', label: 'Ingresar' };
}

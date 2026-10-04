/**
 * Link de cuentas del encabezado del sitio (docs/cuentas.md): "Ingresar" sin sesión, "Mi rincón"
 * con sesión (el interruptor `cuentas` quedó prendido para siempre).
 *
 * @param {{ member?: boolean } | null | undefined} data datos del layout raíz
 * @returns {{ href: string, label: string }}
 */
export function accountLink(data) {
	return data?.member
		? { href: '/mi-rincon', label: 'Mi rincón' }
		: { href: '/ingresar', label: 'Entrar' };
}

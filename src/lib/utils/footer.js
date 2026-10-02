/**
 * Links del pie de página que dependen de los interruptores (datos del layout raíz).
 */

/**
 * Cómo apoyar a KinkyVibe: "Dejá una propina" (/propinas) con el interruptor `propinas` prendido
 * (docs/propinas.md), Cafecito si está apagado.
 *
 * @param {{ propinas?: boolean } | null | undefined} data datos del layout raíz
 * @returns {{ href: string, label: string, external: boolean }}
 */
export function supportLink(data) {
	return data?.propinas
		? { href: '/propinas', label: 'Dejá una propina', external: false }
		: { href: 'https://cafecito.app/kinkyvibe', label: 'CafecitoApp', external: true };
}

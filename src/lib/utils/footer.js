/**
 * Links del pie de página que dependen de los interruptores (datos del layout raíz).
 */

/**
 * Cómo apoyar a KinkyVibe: "Dejá una propina" al Fondo (fondo.kinkyvibe.ar, adonde van las propinas
 * según la decisión 0018) con el interruptor `propinas` prendido, Cafecito si está apagado. No va a
 * /propinas porque esa página solo deja propinas desde un post (decisión de gorrite, 2/10).
 *
 * @param {{ propinas?: boolean } | null | undefined} data datos del layout raíz
 * @returns {{ href: string, label: string, kind: 'fondo' | 'cafecito' }}
 */
export function supportLink(data) {
	return data?.propinas
		? { href: 'https://fondo.kinkyvibe.ar', label: 'Dejá una propina', kind: 'fondo' }
		: { href: 'https://cafecito.app/kinkyvibe', label: 'CafecitoApp', kind: 'cafecito' };
}

/**
 * Links del pie de página.
 */

/**
 * Cómo apoyar a KinkyVibe: "Dejá una propina" al Fondo (fondo.kinkyvibe.ar, adonde van las propinas
 * según la decisión 0018; el interruptor `propinas` quedó prendido para siempre). No va a
 * /propinas porque esa página solo deja propinas desde un post (decisión de gorrite, 2/10).
 *
 * @returns {{ href: string, label: string, kind: 'fondo' }}
 */
export function supportLink() {
	return { href: 'https://fondo.kinkyvibe.ar', label: 'Dejá una propina', kind: 'fondo' };
}

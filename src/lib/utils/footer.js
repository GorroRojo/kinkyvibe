/**
 * Links del pie de página.
 */
import { DEFAULT_CONTACT_EMAIL } from './tickets.js';

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

/**
 * «Contacto»: un mail a la casilla pública de la organización (`DEFAULT_CONTACT_EMAIL`, la de las
 * entradas y el organizador de los calendarios; gorrite, 26/10).
 *
 * @returns {{ href: string, label: string, email: string }}
 */
export function contactLink() {
	return {
		href: `mailto:${DEFAULT_CONTACT_EMAIL}`,
		label: 'Contacto',
		email: DEFAULT_CONTACT_EMAIL
	};
}

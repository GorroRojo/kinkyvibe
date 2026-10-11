/**
 * /.well-known/security.txt (RFC 9116): a quién avisar de un problema de seguridad del sitio.
 * El contacto es el público de la organización (el mismo de los mails, DEFAULT_CONTACT_EMAIL),
 * nunca uno personal. `Expires` se calcula en cada pedido (la RFC pide menos de un año): así el
 * archivo nunca queda vencido.
 */
import { DEFAULT_CONTACT_EMAIL } from './tickets.js';
import { SITE_URL } from './jsonLd.js';

/** Cuántos días adelante vence. */
export const SECURITY_TXT_DAYS = 180;

/**
 * @param {{ now?: number, contact?: string }} [opts]
 * @returns {string}
 */
export function securityTxt({ now = Date.now(), contact = DEFAULT_CONTACT_EMAIL } = {}) {
	const day = new Date(now);
	day.setUTCHours(0, 0, 0, 0);
	const expires = new Date(day.getTime() + SECURITY_TXT_DAYS * 24 * 60 * 60 * 1000);
	return [
		`Contact: mailto:${contact}`,
		`Expires: ${expires.toISOString()}`,
		'Preferred-Languages: es, en',
		`Canonical: ${SITE_URL}/.well-known/security.txt`,
		''
	].join('\n');
}

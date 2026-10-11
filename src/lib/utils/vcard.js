/**
 * La tarjeta de contacto (vCard 3.0, la que leen todos los teléfonos) de un perfil de amigues:
 * /amigues/<perfil>/contacto.vcf. Solo lo que la página del perfil ya muestra: nombre, bio,
 * imagen, la página, sus links, el mail y el teléfono públicos (decisión 0023) y, de un lugar,
 * la dirección si su nivel de privacidad la deja ver.
 */
import { contactItems } from './perfiles.js';
import { absoluteUrl } from './jsonLd.js';

const BACKSLASH = '\\';

/**
 * Escapa un valor de texto (RFC 6350, 3.4): barra invertida, coma, punto y coma y saltos de
 * línea.
 * @param {string} s
 */
export function vcardEscape(s) {
	return String(s)
		.replace(/\\/g, BACKSLASH + BACKSLASH)
		.replace(/,/g, BACKSLASH + ',')
		.replace(/;/g, BACKSLASH + ';')
		.replace(/\r\n|\r|\n/g, BACKSLASH + 'n');
}

/**
 * Corta una línea en pedazos de hasta 75 bytes (RFC 6350, 3.2), sin partir un carácter.
 * @param {string} line
 */
export function foldLine(line) {
	const enc = new TextEncoder();
	const out = [];
	let current = '';
	let bytes = 0;
	for (const ch of line) {
		const size = enc.encode(ch).length;
		const limit = out.length ? 74 : 75; // las que siguen empiezan con un espacio
		if (bytes + size > limit) {
			out.push(current);
			current = '';
			bytes = 0;
		}
		current += ch;
		bytes += size;
	}
	out.push(current);
	return out.join('\r\n ');
}

/**
 * ¿El perfil muestra algún contacto? Sin contacto, no hay tarjeta.
 * @param {{ links?: string[], email?: string | null, tel?: string | null }} profile
 */
export function hasContact(profile) {
	return contactItems(profile).length > 0;
}

/**
 * @param {{
 *   profile: { title: string, kind?: string, bio?: string | null, image?: string | null,
 *     links?: string[], email?: string | null, tel?: string | null },
 *   canonical: string,
 *   location?: import('./venues.js').VenueView | null
 * }} input
 * @returns {string}
 */
export function profileVcard({ profile: p, canonical, location = null }) {
	const contact = contactItems(p);
	const page = absoluteUrl(canonical);
	const name = vcardEscape(p.title);
	const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`];
	if (p.kind === 'persona' || !p.kind) lines.push(`N:;${name};;;`);
	else lines.push('N:;;;;', `ORG:${name}`, 'X-ABShowAs:COMPANY');
	if (p.bio) lines.push(`NOTE:${vcardEscape(p.bio)}`);
	const photo = absoluteUrl(p.image);
	if (photo) lines.push(`PHOTO;VALUE=URI:${photo}`);
	if (page) lines.push(`URL:${page}`);
	for (const c of contact) {
		if (c.kind === 'link') lines.push(`URL:${c.href}`);
		else if (c.kind === 'email') lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(c.label)}`);
		else lines.push(`TEL:${c.href.slice('tel:'.length)}`);
	}
	// La dirección, solo si el nivel del lugar la muestra (nombre + dirección, o solo dirección).
	if (location && (location.level === 'public' || location.level === 'address')) {
		const locality = [location.area, location.city].filter(Boolean).join(', ');
		if (location.address || locality) {
			const adr = ['', '', location.address ?? '', locality, '', '', 'Argentina'];
			lines.push(`ADR;TYPE=WORK:${adr.map(vcardEscape).join(';')}`);
		}
	}
	lines.push('END:VCARD');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}

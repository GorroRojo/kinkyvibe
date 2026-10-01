/**
 * Textos de las páginas de perfiles (Mi rincón → Perfiles), compartidos entre páginas.
 */

/** @type {Record<string, string>} */
export const KIND_LABELS = { persona: 'Persona', proyecto: 'Proyecto', lugar: 'Lugar' };

/** @type {Record<string, string>} */
export const ROLE_LABELS = { owner: 'Dueñe', manager: 'Gestiona' };

/** Visibilidades de un perfil (las del modelo de objetos), con su explicación. */
export const VISIBILITY_OPTIONS = Object.freeze([
	{ value: 'public', label: 'Público', hint: '(lo puede ver cualquiera)' },
	{ value: 'members', label: 'Solo personas con cuenta', hint: '(hay que ingresar para verlo)' },
	{
		value: 'hidden',
		label: 'Oculto',
		hint: '(no aparece en ningún lado; lo ven solo quienes lo gestionan y les admins del sitio)'
	}
]);

/**
 * @typedef {{ kind: 'link' | 'email' | 'tel', href: string, label: string }} ContactItem
 */

/** @param {string} url */
function linkLabel(url) {
	try {
		const u = new URL(url);
		const path = u.pathname.replace(/\/+$/, '');
		return `${u.hostname.replace(/^www\./, '')}${path}`;
	} catch {
		return url;
	}
}

/**
 * El contacto público de un perfil, listo para mostrar (decisión de gorrite: el de las fichas de
 * amigues es público a propósito, docs/decisiones/0023-contacto-publico.md). Solo links web, un
 * mail y un teléfono; lo demás no se arma (ni `javascript:` ni otros esquemas).
 *
 * @param {{ links?: string[], email?: string | null, tel?: string | null }} p
 * @param {{ skipFirstLink?: boolean }} [opts] `skipFirstLink`: el primer link ya se muestra como
 *   botón
 * @returns {ContactItem[]}
 */
export function contactItems(
	{ links = [], email = null, tel = null },
	{ skipFirstLink = false } = {}
) {
	/** @type {ContactItem[]} */
	const items = [];
	for (const link of links.slice(skipFirstLink ? 1 : 0)) {
		if (/^https?:\/\//i.test(link))
			items.push({ kind: 'link', href: link, label: linkLabel(link) });
	}
	const mail = email?.trim();
	if (mail && /^[^\s@<>"]+@[^\s@<>"]+$/.test(mail)) {
		items.push({ kind: 'email', href: `mailto:${mail}`, label: mail });
	}
	const phone = tel?.trim();
	const digits = phone?.replace(/[^\d+]/g, '') ?? '';
	if (phone && /^\+?\d{6,}$/.test(digits))
		items.push({ kind: 'tel', href: `tel:${digits}`, label: phone });
	return items;
}

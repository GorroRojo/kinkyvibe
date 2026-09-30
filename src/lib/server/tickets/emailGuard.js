/**
 * A quién se le puede mandar un mail de verdad. En producción, a cualquiera. En un preview (que
 * es público y usa datos inventados), solo a las direcciones de EMAIL_ALLOWLIST: cualquier otra
 * se desvía a la primera de la lista, con la original en el asunto. Sin EMAIL_ALLOWLIST, un
 * preview no manda ningún mail (falla cerrado).
 */

/**
 * Direcciones de EMAIL_ALLOWLIST (separadas por comas o espacios), en minúsculas.
 *
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseAllowlist(raw) {
	return (raw ?? '')
		.split(/[\s,;]+/)
		.map((s) => s.trim().toLowerCase())
		.filter((s) => s.includes('@'));
}

/**
 * Destinatario y asunto finales, o `null` si el mail no se tiene que mandar.
 *
 * @param {{ to: string, subject: string, preview: boolean, allowlist: string[] }} input
 * @returns {{ to: string, subject: string } | null}
 */
export function routeEmail({ to, subject, preview, allowlist }) {
	if (allowlist.length === 0) return preview ? null : { to, subject };
	const tag = preview ? '[DEMO]' : '[desviado]';
	if (allowlist.includes(to.trim().toLowerCase())) {
		return { to, subject: preview ? `${tag} ${subject}` : subject };
	}
	return { to: allowlist[0], subject: `${tag} para ${to} · ${subject}` };
}

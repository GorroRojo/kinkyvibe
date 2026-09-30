/**
 * Editor de plantillas de los mails (/admin/ajustes/mails/plantillas): a quién se le puede
 * mandar una prueba y cómo se arma la vista previa.
 */
import { env } from '$env/dynamic/private';
import { contactEmail, emailSettings } from '$lib/server/tickets/index.js';
import { parseAllowlist } from '$lib/server/tickets/emailGuard.js';

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

/**
 * El email público de la cuenta de GitHub de le admin (o `null`). El login pide solo
 * `public_repo`, así que es el email público del perfil, si lo puso.
 *
 * @param {string} token
 * @param {typeof fetch} fetchFn
 */
async function githubPublicEmail(token, fetchFn) {
	if (!token) return null;
	try {
		const res = await fetchFn('https://api.github.com/user', {
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'User-Agent': 'kinkyvibe'
			},
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) return null;
		const u = /** @type {{ email?: unknown }} */ (await res.json());
		return typeof u.email === 'string' && EMAIL_RE.test(u.email) ? u.email.toLowerCase() : null;
	} catch {
		return null;
	}
}

/**
 * Direcciones a las que "Mandarme una prueba" puede mandar: las de la organización o de le
 * admin (su email público de GitHub, la de respuesta de los mails, el contacto y, si hay, las de
 * EMAIL_ALLOWLIST). Nunca una dirección cualquiera: el panel no sirve para mandarle mails a
 * terceros.
 *
 * @param {{ db: import('@cloudflare/workers-types').D1Database | null | undefined,
 *   token: string, fetch: typeof fetch }} input
 * @returns {Promise<{ address: string, label: string }[]>}
 */
export async function testRecipients({ db, token, fetch: fetchFn }) {
	/** @type {{ address: string, label: string }[]} */
	const out = [];
	/** @param {string | null | undefined} address @param {string} label */
	const add = (address, label) => {
		const a = address?.trim().toLowerCase();
		if (a && EMAIL_RE.test(a) && !out.some((x) => x.address === a)) out.push({ address: a, label });
	};
	add(await githubPublicEmail(token, fetchFn), 'tu email de GitHub');
	add((await emailSettings(db)).replyTo, 'dirección de respuesta de los mails');
	add(contactEmail(), 'contacto de la organización');
	for (const a of parseAllowlist(env.EMAIL_ALLOWLIST)) add(a, 'lista de mails permitidos');
	return out;
}

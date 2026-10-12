/**
 * Apagar la lista de espera de un evento desde el panel: «Cerrar la lista» termina las
 * anotaciones y además saca la clave `lista_espera` del evento (gorrite, 12/10), así nadie más se
 * anota. Guarda el evento por el mismo camino que el editor (la base de contenido, contra el sha
 * que leyó: si alguien guardó en el medio, falla y no se pisa nada).
 */
import { getRepoClient } from '$lib/server/eventos';
import { readDbPostFile } from '$lib/server/contenido/repo.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { markdownWithoutWaitlist } from '$lib/utils/ticketsEditor.js';

/**
 * Saca `lista_espera` del archivo del evento. `{ ok: true, changed: false }` si ya no la tenía;
 * `{ ok: false }` si el evento no está en la base o no se pudo leer o guardar (nunca tira).
 *
 * @param {string} slug
 * @param {{ token?: string, actor: string, userName?: string }} who
 * @returns {Promise<{ ok: true, changed: boolean } | { ok: false }>}
 */
export async function turnOffEventWaitlist(slug, { token = '', actor, userName }) {
	try {
		const path = postFilePath('calendario', slug);
		const file = path ? await readDbPostFile(path) : null;
		if (!path || !file || 'deleted' in file) return { ok: false };
		const content = markdownWithoutWaitlist(file.raw);
		if (content === null) return { ok: true, changed: false };
		const who = userName || actor;
		const client = await getRepoClient();
		await client.commitFiles(token, {
			files: [{ path, content }],
			message: `[admin] ${who} closed the waitlist of calendario/${slug}`,
			actor,
			unchanged: [{ path, sha: file.sha }],
			pr: { action: 'edita', who }
		});
		return { ok: true, changed: true };
	} catch (e) {
		console.error(`[lista de espera] no se pudo apagar la lista de ${slug}:`, e);
		return { ok: false };
	}
}

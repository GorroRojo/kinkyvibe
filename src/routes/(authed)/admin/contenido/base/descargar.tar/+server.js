/**
 * «Descargar todo» (decisión 0004: git no guarda una copia del contenido; lo resguardan los
 * backups y este botón): los eventos y el material que están en la base, como archivos .md
 * (`calendario/<slug>.md`, `material/<slug>.md`), en un .tar. Incluye los ocultos (con
 * `force_unpublished: true`); no los borrados. Sirve también para volver a los .md si se apaga el
 * interruptor `contenido_db`. Solo admins; queda en el registro.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { allDbPosts } from '$lib/server/contenido/repo.js';
import { CONTENT_CATEGORIES } from '$lib/server/contenido/categories.js';
import { makeTar } from '$lib/utils/tar.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	/** @type {{ name: string, content: string }[]} */
	const files = [];
	for (const category of Object.keys(CONTENT_CATEGORIES)) {
		for (const [slug, e] of await allDbPosts(db, category)) {
			if (e.deleted) continue;
			const name = `${category}/${slug}.md`;
			files.push({
				name:
					/^[\w./-]+$/.test(name) && name.length <= 100 ? name : `${category}/${e.object.id}.md`,
				content: e.raw
			});
		}
	}
	files.sort((a, b) => a.name.localeCompare(b.name));
	await logAdminAction(db, locals, {
		action: 'contenido.download',
		targetType: 'settings',
		targetId: 'contenido',
		summary: `Descargó el contenido de la base (${files.length} archivos)`
	});
	return new Response(makeTar(files), {
		headers: {
			'content-type': 'application/x-tar',
			'content-disposition': `attachment; filename="kinkyvibe-contenido-${todayInArgentina()}.tar"`,
			'cache-control': 'private, no-store'
		}
	});
}

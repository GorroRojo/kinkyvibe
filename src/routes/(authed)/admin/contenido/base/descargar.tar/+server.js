/**
 * «Descargar todo» (decisión 0004: git no guarda una copia del contenido; lo resguardan los
 * backups y este botón): los eventos y el material que están en la base, como archivos .md
 * (`calendario/<slug>.md`, `material/<slug>.md`), en un .tar. Incluye los ocultos (con
 * `force_unpublished: true`); no los borrados. Los arma la base ($lib/server/contenido/markdown.js),
 * con los interactivos como en los .md del repo. Solo admins; queda en el registro.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { contentArchiveFiles } from '$lib/server/contenido/download.js';
import { makeTar } from '$lib/utils/tar.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const files = await contentArchiveFiles(db);
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

/**
 * POST /api/preview-seed: vuelve a cargar los datos inventados del modo demo en la base del
 * preview (scripts/demo/generated/*.sql, generados con scripts/demo/seed.js). SOLO rama `demo`:
 * este archivo no se mergea. En producción (y fuera de Pages) responde 404; pide sesión de admin.
 */
import { error, json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { isAdmin } from '$lib/server/auth.js';

const FILES = import.meta.glob('/scripts/demo/generated/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});

/** @param {string} text */
function statements(text) {
	return text
		.split('\n')
		.filter((l) => !l.trim().startsWith('--'))
		.join('\n')
		.split(/;\s*\n/)
		.map((s) => s.trim().replace(/;$/, ''))
		.filter(Boolean);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ platform, locals }) {
	if (!isPreviewDeploy()) error(404, 'Not found');
	if (!isAdmin(locals.user)) error(403, 'Solo admins');
	const db = getDB(platform);
	if (!db) error(503, 'Sin base de datos');
	const done = [];
	for (const [path, text] of Object.entries(FILES).sort(([a], [b]) => a.localeCompare(b))) {
		const list = statements(/** @type {string} */ (text));
		for (let i = 0; i < list.length; i += 40) {
			await db.batch(list.slice(i, i + 40).map((s) => db.prepare(s)));
		}
		done.push({ file: path.split('/').pop(), statements: list.length });
	}
	const counts = await db
		.prepare(
			`SELECT (SELECT COUNT(*) FROM orders) orders, (SELECT COUNT(*) FROM tickets) tickets,
			(SELECT COUNT(*) FROM tickets WHERE checked_in_at IS NOT NULL) checked_in,
			(SELECT COUNT(*) FROM admin_audit) audit, (SELECT COUNT(*) FROM person_notes) notes`
		)
		.first();
	return json({ done, counts });
}

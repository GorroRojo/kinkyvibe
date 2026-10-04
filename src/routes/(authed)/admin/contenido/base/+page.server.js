/**
 * Contenido → En la base: importar los eventos y el material (.md) a la base de este entorno
 * (preview o producción) y ver si coinciden con sus .md. Es la forma de correr la importación en
 * las bases remotas: idempotente, se puede repetir, va de a tandas (D1 tiene un máximo de
 * consultas por pedido; la página sigue sola hasta terminar). El sitio lee los eventos y el
 * material solo de la base: importar trae a la base lo que llega al repo como .md (sin pisar lo
 * editado en el panel). Solo admins; queda en el registro.
 * Ver src/lib/server/contenido/importer.js y docs/contenido.md («En la base»).
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { bundledSourceFiles } from '$lib/server/contenido/bundle.js';
import {
	IMPORT_CHUNK,
	planImport,
	publicRow,
	runImport,
	summarizeImport
} from '$lib/server/contenido/importer.js';
import {
	ACTION_LABELS,
	IMPORT_CATEGORIES,
	countOnlyInDb,
	summarizeStatus
} from '$lib/server/contenido/status.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const categories = [];
	for (const c of IMPORT_CATEGORIES) {
		const [plan, onlyInDb] = await Promise.all([
			planImport(db, c.key, await bundledSourceFiles(c.key)),
			countOnlyInDb(db, c.key)
		]);
		const rows = plan.map(publicRow);
		const summary = summarizeImport(rows);
		categories.push({
			...c,
			status: summarizeStatus(rows, onlyInDb),
			toDo: summary.created + summary.updated,
			// Lo que hay que mirar: lo que no coincide, lo que no se puede importar y lo pendiente.
			rows: rows.filter(
				(r) => r.action !== 'unchanged' || r.changed.length > 0 || r.warnings.length > 0
			)
		});
	}
	return {
		categories,
		labels: ACTION_LABELS,
		chunk: IMPORT_CHUNK
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Una tanda (IMPORT_CHUNK como mucho) de una categoría. La página la repite mientras quede algo.
	importar: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { importResult: null, error: 'Sin base de datos.' });
		const asked = String((await request.formData()).get('categoria') ?? 'calendario');
		const category = IMPORT_CATEGORIES.find((c) => c.key === asked);
		if (!category) return fail(400, { importResult: null, error: 'Categoría inválida.' });
		const { results, remaining } = await runImport(
			db,
			category.key,
			await bundledSourceFiles(category.key),
			{ actor: admin.login }
		);
		const summary = summarizeImport(results);
		if (results.length) {
			await logAdminAction(db, locals, {
				action: 'contenido.import',
				targetType: 'settings',
				targetId: category.key,
				summary: `Importó ${category.many} a la base: ${summary.created} nuevos, ${summary.updated} actualizados${summary.error ? `, ${summary.error} con error` : ''}`,
				detail: { ...summary, remaining }
			});
		}
		return {
			importResult: {
				category: category.key,
				summary,
				remaining,
				problems: results
					.filter((r) => r.action === 'error')
					.map((r) => ({ legacySlug: r.legacySlug, message: r.message ?? '' }))
			}
		};
	}
};

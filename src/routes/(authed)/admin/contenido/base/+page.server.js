/**
 * Contenido → En la base: importar los eventos (.md de calendario) a la base de este entorno
 * (preview o producción) y ver si coinciden con sus .md. Es la forma de correr la importación en
 * las bases remotas: idempotente, se puede repetir, va de a tandas (D1 tiene un máximo de
 * consultas por pedido; la página sigue sola hasta terminar). Funciona con el interruptor
 * `contenido_db` apagado, para revisar antes de prenderlo. Solo admins; queda en el registro.
 * Ver src/lib/server/contenido/importer.js y docs/contenido.md («En la base»).
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { contenidoDbEnabled } from '$lib/server/flags.js';
import { bundledSourceFiles } from '$lib/server/contenido/bundle.js';
import {
	IMPORT_CHUNK,
	planImport,
	publicRow,
	runImport,
	summarizeImport
} from '$lib/server/contenido/importer.js';
import { ACTION_LABELS, countOnlyInDb, summarizeStatus } from '$lib/server/contenido/status.js';

const CATEGORY = 'calendario';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const [plan, onlyInDb] = await Promise.all([
		planImport(db, CATEGORY, await bundledSourceFiles(CATEGORY)),
		countOnlyInDb(db, CATEGORY)
	]);
	const rows = plan.map(publicRow);
	return {
		status: summarizeStatus(rows, onlyInDb),
		summary: summarizeImport(rows),
		// Lo que hay que mirar: lo que no coincide, lo que no se puede importar y lo pendiente.
		rows: rows.filter(
			(r) => r.action !== 'unchanged' || r.changed.length > 0 || r.warnings.length > 0
		),
		labels: ACTION_LABELS,
		chunk: IMPORT_CHUNK,
		flagOn: await contenidoDbEnabled(platform)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Una tanda (IMPORT_CHUNK eventos como mucho). La página la repite mientras quede algo.
	importar: async ({ locals, url, platform }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { importResult: null, error: 'Sin base de datos.' });
		const { results, remaining } = await runImport(
			db,
			CATEGORY,
			await bundledSourceFiles(CATEGORY),
			{ actor: admin.login }
		);
		const summary = summarizeImport(results);
		if (results.length) {
			await logAdminAction(db, locals, {
				action: 'contenido.import',
				targetType: 'settings',
				targetId: CATEGORY,
				summary: `Importó eventos a la base: ${summary.created} nuevos, ${summary.updated} actualizados${summary.error ? `, ${summary.error} con error` : ''}`,
				detail: { ...summary, remaining }
			});
		}
		return {
			importResult: {
				summary,
				remaining,
				problems: results
					.filter((r) => r.action === 'error')
					.map((r) => ({ legacySlug: r.legacySlug, message: r.message ?? '' }))
			}
		};
	}
};

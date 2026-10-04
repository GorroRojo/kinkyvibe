/**
 * Etiquetas → Importar etiquetas: pasa el archivo de etiquetas y los textos de la wiki de este
 * deploy a objetos `etiqueta` en la base de este entorno (preview o producción). Idempotente, se
 * puede repetir (src/lib/server/etiquetas/importer.js): una base nueva (un preview) lo necesita
 * antes de poder editar etiquetas. Corre por tandas (`BUDGET` escrituras por pedido, por
 * el límite de consultas de un Worker): la página vuelve a pedir sola hasta terminar.
 * Solo admins; queda en el registro.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { importTags, summarizeTagImport } from '$lib/server/etiquetas/importer.js';
import { bundledTagSource } from '$lib/server/etiquetas/bundled.js';

/** Escrituras por pedido (cada una son ~4 consultas). */
const BUDGET = 120;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	const admin = requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	let preview;
	try {
		preview = await importTags(db, bundledTagSource(), { actor: admin.login, dryRun: true });
	} catch (e) {
		// Sin la migración 0029 todavía (no existe `tag_sources`); cualquier otro error, sigue.
		if (!/no such table/i.test(String(e instanceof Error ? e.message : e))) throw e;
		return { missing: true, preview: [], warnings: [], summary: summarizeTagImport([]) };
	}
	return {
		missing: false,
		preview: preview.results.map((r) => ({
			key: r.key,
			action: r.action,
			alias: r.alias,
			message: r.message ?? ''
		})),
		warnings: preview.warnings,
		summary: summarizeTagImport(preview.results)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	importar: async ({ locals, url, platform }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { importResult: null, error: 'Sin base de datos.' });
		const { results, pending } = await importTags(db, bundledTagSource(), {
			actor: admin.login,
			budget: BUDGET
		});
		const summary = summarizeTagImport(results);
		if (summary.created || summary.updated || summary.error) {
			await logAdminAction(db, locals, {
				action: 'tags.import',
				targetType: 'tags',
				targetId: 'etiquetas',
				summary: `Importó etiquetas: ${summary.created} nuevas, ${summary.updated} actualizadas, ${summary.error} con error${pending ? `, faltan ${pending}` : ''}`,
				detail: summary
			});
		}
		return {
			importResult: {
				summary,
				pending,
				problems: results
					.filter((r) => r.action === 'error' || r.warnings.length)
					.map((r) => ({
						key: r.key,
						action: r.action,
						message: [r.message, ...r.warnings].filter(Boolean).join('; ')
					}))
			}
		};
	}
};

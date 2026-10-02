/**
 * Lo que comparten las páginas del panel que editan etiquetas (Etiquetas, Eventos → Series) con
 * el interruptor `etiquetas_db`: si se edita la base o el archivo, y guardar en la base.
 * Con el interruptor apagado (o la base sin etiquetas), cada página sigue con su commit al archivo.
 */
import { getDB } from '$lib/server/db';
import { etiquetasDbEnabled } from '$lib/server/flags.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { applyDbTagPlan, planDbTagEdit } from './editor.js';
import { loadTagRecords } from './read.js';
import { clearTagSourceCache } from './source.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./editor.js').StoredTag} StoredTag */

/**
 * Interruptor prendido y la base con etiquetas: las etiquetas de la base (TODAS, también las
 * ocultas, que el editor no tiene que borrar). Si no, `null`: se edita el archivo.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} login
 * @returns {Promise<{ db: D1Database, records: StoredTag[] } | null>}
 */
export async function dbTagsForAdmin(platform, login) {
	const db = getDB(platform);
	if (!db || !(await etiquetasDbEnabled(platform))) return null;
	try {
		const records = await loadTagRecords(db, { role: 'admin', id: login });
		return records.length ? { db, records } : null;
	} catch {
		return null; // sin la migración 0029: el archivo
	}
}

/**
 * Guarda operaciones del editor (src/lib/utils/tagConfig.js) en la base, al momento, y lo anota
 * en Actividad. No tira: devuelve el resultado.
 *
 * @param {{ db: D1Database, records: StoredTag[] }} from lo de `dbTagsForAdmin`
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 * @param {{ locals: App.Locals, login: string, label?: string, targetId?: string | null }} ctx
 *   `label`: con qué empieza el resumen en Actividad («Etiquetas», «Series»…)
 * @returns {Promise<{ ok: true, written: number, summary: string[] } | { ok: false, status: number, error: string }>}
 */
export async function saveTagOpsToDb(
	{ db, records },
	ops,
	{ locals, login, label = 'Etiquetas', targetId }
) {
	let plan;
	try {
		plan = planDbTagEdit(records, ops);
	} catch (e) {
		return { ok: false, status: 400, error: e instanceof Error ? e.message : String(e) };
	}
	const { written, errors } = await applyDbTagPlan(db, plan, { actor: login });
	clearTagSourceCache();
	if (written) {
		await logAdminAction(db, locals, {
			action: 'tags.edit',
			targetType: 'tags',
			targetId:
				targetId !== undefined
					? targetId
					: plan.summary.length === 1
						? plan.summary[0].slice(0, 120)
						: null,
			summary: `${label} (base): ${plan.summary.join('; ')}`,
			detail: {
				written,
				errors: errors.slice(0, 10),
				tags: plan.changes.map((c) => c.key).slice(0, 30)
			}
		});
	}
	if (errors.length) {
		return {
			ok: false,
			status: 409,
			error: `${written ? 'Se guardó una parte. ' : ''}No se pudo guardar: ${errors.join('; ')}.`
		};
	}
	return { ok: true, written, summary: plan.summary };
}

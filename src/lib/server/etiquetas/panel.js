/**
 * Lo que comparten las páginas del panel que editan etiquetas (Etiquetas, Eventos → Series, el
 * evento nuevo con serie nueva): las etiquetas se guardan siempre en la base (el interruptor
 * `etiquetas_db` quedó prendido para siempre; ya no hay commits al archivo de etiquetas). Si la
 * base todavía no tiene etiquetas, hay que importarlas primero ({@link NEEDS_IMPORT}).
 */
import { getDB } from '$lib/server/db';
import { getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { dbPostsOnlyClient } from '$lib/server/contenido/repo.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { tagDeletionStatement } from '$lib/server/admin/deletions.js';
import { SERIES_PARENT } from '$lib/utils/series.js';
import { commitTagEdit, previewOf } from '$lib/server/admin/tagEditor.js';
import { FileChangedError, PendingChangeError } from '$lib/server/eventos/github.js';
import { applyDbTagPlan, dbPreviewOf, planDbTagEdit } from './editor.js';
import { loadTagRecords } from './read.js';
import { planTagRenameInPosts, renamesPosts } from './rename.js';
import { clearTagSourceCache } from './source.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./editor.js').StoredTag} StoredTag */
/** @typedef {import('$lib/utils/tagConfig.js').TagOp} TagOp */
/**
 * Con qué escribir las publicaciones (renombrar sin alias): el cliente del repo y quién firma.
 * En el panel es siempre {@link dbRepoAccess} (solo la base); `null` solo en las pruebas.
 * @typedef {{ client: import('$lib/server/admin/tagEditor.js').TagClient, token: string, who: string } | null} RepoAccess
 */

/**
 * Con qué reescribir las publicaciones al renombrar una etiqueta o una serie: solo el contenido de
 * la base (eventos, material, perfiles de amigues y páginas de la wiki), nunca GitHub
 * (`dbPostsOnlyClient`, src/lib/server/contenido/repo.js). Quien guarda queda con su login
 * (src/lib/server/contenido/author.js).
 * @param {App.Locals} locals
 * @returns {Promise<RepoAccess>}
 */
export async function dbRepoAccess(locals) {
	const admin = getEventAdmin(locals);
	return {
		client: dbPostsOnlyClient(await getRepoClient()),
		token: admin?.token ?? '',
		who: admin?.name ?? locals.user?.login ?? 'panel'
	};
}

/** La base todavía no tiene etiquetas (o no se puede leer): no hay dónde guardar. */
export const NEEDS_IMPORT =
	'Las etiquetas todavía no están en la base: importalas primero en Etiquetas → «Importar a la ' +
	'base» (/admin/etiquetas/importar).';

/** Renombrar sin alias sin con qué guardar las publicaciones (no pasa en el panel). */
export const NEEDS_REPO =
	'No se pueden cambiar las publicaciones ahora. Elegí «Dejar el nombre viejo como alias» o probá de nuevo.';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Las etiquetas de la base (TODAS, también las ocultas, que el editor no tiene que borrar), o
 * `null` si no hay base, no tiene etiquetas o no se puede leer (entonces no se puede editar:
 * {@link NEEDS_IMPORT}).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} login
 * @returns {Promise<{ db: D1Database, records: StoredTag[] } | null>}
 */
export async function dbTagsForAdmin(platform, login) {
	const db = getDB(platform);
	if (!db) return null;
	try {
		const records = await loadTagRecords(db, { role: 'admin', id: login });
		return records.length ? { db, records } : null;
	} catch {
		return null; // sin la migración 0029
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
	const series = seriesIdsOf(records);
	const { written, errors } = await applyDbTagPlan(db, plan, {
		actor: login,
		// Lo que se borra queda para «Recuperar» en Actividad (en la misma tanda que el borrado).
		onDelete: async (tag, now) => [
			await tagDeletionStatement(db, tag, { login, now, series: series.has(tag.id) })
		]
	});
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

/**
 * Las etiquetas que son series: hijas o nietas (sin límite) de «evento recurrente», sin los
 * alias (como `seriesTagIds` de $lib/utils/series.js, pero sobre los registros de la base).
 * @param {readonly StoredTag[]} records
 * @returns {Set<number>}
 */
export function seriesIdsOf(records) {
	const byKey = new Map(records.map((r) => [r.key, r]));
	/** @type {Set<number>} */
	const out = new Set();
	for (const r of records) {
		if (r.aliasOf) continue;
		const seen = new Set([r.key]);
		const stack = r.parents.map((p) => p.key);
		while (stack.length) {
			const k = /** @type {string} */ (stack.pop());
			if (k === SERIES_PARENT) {
				out.add(r.id);
				break;
			}
			if (seen.has(k)) continue;
			seen.add(k);
			stack.push(...(byKey.get(k)?.parents.map((p) => p.key) ?? []));
		}
	}
	return out;
}

/**
 * La vista previa de un cambio en la base: las etiquetas que cambian y, si se renombra sin alias,
 * las publicaciones que se reescriben (cuántas y cómo), para verlo antes de confirmar.
 *
 * @param {{ db: D1Database, records: StoredTag[] }} from lo de `dbTagsForAdmin`
 * @param {readonly TagOp[]} ops
 * @param {RepoAccess} repo
 * @returns {Promise<{ ok: true, preview: ReturnType<typeof dbPreviewOf> & { posts: ReturnType<typeof previewOf> | null } } | { ok: false, status: number, error: string }>}
 */
export async function previewDbTagEdit({ records }, ops, repo) {
	let preview;
	try {
		preview = dbPreviewOf(planDbTagEdit(records, ops));
	} catch (e) {
		return { ok: false, status: 400, error: describe(e) };
	}
	if (!renamesPosts(ops)) return { ok: true, preview: { ...preview, posts: null } };
	if (!repo) return { ok: false, status: 403, error: NEEDS_REPO };
	try {
		const posts = await planTagRenameInPosts(repo.client, repo.token, ops);
		return { ok: true, preview: { ...preview, posts: previewOf(posts) } };
	} catch (e) {
		return {
			ok: false,
			status: 502,
			error: 'No se pudieron leer las publicaciones: ' + describe(e)
		};
	}
}

/**
 * Guarda un cambio en la base y, si se renombra sin alias, primero reescribe las publicaciones
 * (todas en la base: {@link dbRepoAccess}; el mismo camino que el editor del archivo). Si eso
 * falla, no se tocan las etiquetas.
 *
 * @param {{ db: D1Database, records: StoredTag[] }} from lo de `dbTagsForAdmin`
 * @param {TagOp[]} ops
 * @param {{ locals: App.Locals, login: string, label?: string, targetId?: string | null, repo: RepoAccess }} ctx
 * @returns {Promise<{ ok: true, written: number, summary: string[], posts: number, commit: string | null, publish: any } | { ok: false, status: number, error: string }>}
 */
export async function saveDbTagEdit(from, ops, { repo, ...ctx }) {
	try {
		planDbTagEdit(from.records, ops); // valida antes de tocar nada
	} catch (e) {
		return { ok: false, status: 400, error: describe(e) };
	}
	/** @type {{ url: string, pr?: any } | null} */
	let commit = null;
	let posts = 0;
	if (renamesPosts(ops)) {
		if (!repo) return { ok: false, status: 403, error: NEEDS_REPO };
		try {
			const plan = await planTagRenameInPosts(repo.client, repo.token, ops);
			posts = plan.files.length;
			if (posts) commit = await commitTagEdit(repo.client, repo.token, plan, repo.who);
		} catch (e) {
			if (e instanceof FileChangedError)
				return {
					ok: false,
					status: 409,
					error: `${e.path} cambió mientras tanto. Volvé a hacer la vista previa y guardá de nuevo.`
				};
			if (e instanceof PendingChangeError)
				return { ok: false, status: 409, error: e.message + '.' };
			return {
				ok: false,
				status: 502,
				error: 'No se pudieron cambiar las publicaciones (no se guardó nada): ' + describe(e)
			};
		}
	}
	const res = await saveTagOpsToDb(from, ops, ctx);
	if (!res.ok) {
		return commit
			? {
					...res,
					error: `Las publicaciones ya se cambiaron (${commit.url}), pero la base no. ${res.error}`
				}
			: res;
	}
	return { ...res, posts, commit: commit?.url ?? null, publish: commit?.pr ?? null };
}

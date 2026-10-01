import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { contentMetas, tagUsage } from '$lib/server/admin/content.js';
import {
	commitTagEdit,
	planTagEdit,
	previewOf,
	readTagSource
} from '$lib/server/admin/tagEditor.js';
import { getEventAdmin, getRepoClient, isMockMode } from '$lib/server/eventos';
import { FileChangedError, PendingChangeError } from '$lib/server/eventos/github.js';
import { USAGE_CATEGORIES, parseTagSource, readOps } from '$lib/utils/tagConfig.js';
import { etiquetasDbEnabled, seriesEnabled } from '$lib/server/flags.js';
import { recordsToRawTags } from '$lib/server/etiquetas/model.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';
import { applyDbTagPlan, dbPreviewOf, planDbTagEdit } from '$lib/server/etiquetas/editor.js';
import { clearTagSourceCache } from '$lib/server/etiquetas/source.js';
// The copy of the tag file in this deploy (fallback when the repo client doesn't have it).
import bundledSource from '$lib/utils/hardcodedTags.js?raw';

const NO_PERMISSION =
	'No tenés permiso para editar etiquetas. Probá cerrar sesión y volver a entrar.';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Interruptor `etiquetas_db` prendido y la base con etiquetas: el editor trabaja sobre la base
 * (src/lib/server/etiquetas/editor.js). Si no, sobre el archivo, con commits como siempre.
 * Devuelve las etiquetas de la base (TODAS: también las ocultas) o `null`.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} login
 */
async function dbTags(platform, login) {
	const db = getDB(platform);
	if (!db || !(await etiquetasDbEnabled(platform))) return null;
	try {
		const records = await loadTagRecords(db, { role: 'admin', id: login });
		return records.length ? { db, records } : null;
	} catch {
		return null; // sin la migración 0029: el archivo
	}
}

/** @param {{locals: App.Locals, url: URL, platform?: App.Platform}} event */
export async function load({ locals, url, platform }) {
	const login = requireAdmin(locals, url).login;
	// Interruptor `series`: el campo "Imagen" (la de la serie) solo se muestra prendido.
	const seriesOn = await seriesEnabled(platform);
	const counts = await usageAndWiki();
	const fromDb = await dbTags(platform, login);
	if (fromDb) {
		return {
			entries: recordsToRawTags(fromDb.records),
			...counts,
			fromRepo: false,
			mock: false,
			seriesOn,
			dbMode: true
		};
	}
	const admin = getEventAdmin(locals);
	if (!admin) throw error(403, NO_PERMISSION);
	// The tree as it is on the repo now (so a change just saved shows before the deploy ends).
	let source = bundledSource;
	let fromRepo = false;
	try {
		({ source, fromRepo } = await readTagSource(await getRepoClient(), admin.token, bundledSource));
	} catch (e) {
		// GitHub down: the deploy's copy.
	}
	let entries;
	try {
		entries = parseTagSource(source).items.map((i) => i.value);
	} catch (e) {
		throw error(500, describe(e));
	}
	return { entries, ...counts, fromRepo, mock: isMockMode(), seriesOn, dbMode: false };
}

/** Cuánto se usa cada etiqueta (en los posts del deploy) y qué etiquetas tienen entrada en la wiki. */
async function usageAndWiki() {
	/** @type {Record<string, Record<string, number>>} */
	const usage = {};
	for (const c of USAGE_CATEGORIES) usage[c] = await tagUsage(c);
	/** @type {Record<string, string>} */
	const wikiPosts = {};
	for (const p of await contentMetas()) {
		if (p.category === 'wiki' && p.meta?.wiki) wikiPosts[String(p.meta.wiki)] = p.slug;
	}
	return { usage, wikiPosts };
}

/**
 * @param {FormData} data
 */
function opsFrom(data) {
	try {
		return { ops: readOps(JSON.parse(String(data.get('ops') ?? '[]'))) };
	} catch (e) {
		return { error: describe(e) };
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	previsualizar: async ({ locals, request, url, platform }) => {
		const login = requireAdmin(locals, url).login;
		const r = opsFrom(await request.formData());
		if (!r.ops) return fail(400, { error: r.error });
		const fromDb = await dbTags(platform, login);
		if (fromDb) {
			try {
				return { preview: dbPreviewOf(planDbTagEdit(fromDb.records, r.ops)) };
			} catch (e) {
				return fail(400, { error: describe(e) });
			}
		}
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		try {
			const plan = await planTagEdit(await getRepoClient(), admin.token, r.ops, bundledSource);
			return { preview: previewOf(plan) };
		} catch (e) {
			return fail(400, { error: describe(e) });
		}
	},
	guardar: async ({ locals, request, url, platform }) => {
		const login = requireAdmin(locals, url).login;
		const r = opsFrom(await request.formData());
		if (!r.ops) return fail(400, { error: r.error });
		const fromDb = await dbTags(platform, login);
		if (fromDb) return saveToDb(fromDb.db, fromDb.records, r.ops, locals, login);
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const client = await getRepoClient();
		let plan;
		try {
			plan = await planTagEdit(client, admin.token, r.ops, bundledSource);
		} catch (e) {
			return fail(400, { error: describe(e) });
		}
		try {
			const commit = await commitTagEdit(client, admin.token, plan, admin.name);
			await logAdminAction(getDB(platform), locals, {
				action: 'tags.edit',
				targetType: 'tags',
				targetId: plan.summary.length === 1 ? plan.summary[0].slice(0, 120) : null,
				summary: `Etiquetas: ${plan.summary.join('; ')}`,
				detail: { commit: commit.url, files: plan.files.map((f) => f.path).slice(0, 30) }
			});
			return {
				saved: {
					commit: commit.url,
					publish: commit.pr ?? null,
					summary: plan.summary,
					files: plan.files.length
				}
			};
		} catch (e) {
			if (e instanceof FileChangedError)
				return fail(409, {
					error: `${e.path} cambió en GitHub mientras tanto. Volvé a hacer la vista previa y guardá de nuevo.`
				});
			if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
			return fail(502, { error: 'No se pudo guardar: ' + describe(e) });
		}
	}
};

/**
 * Guardar en la base (interruptor `etiquetas_db`): al momento, sin commit.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {import('$lib/server/etiquetas/editor.js').StoredTag[]} records
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 * @param {App.Locals} locals
 * @param {string} login
 */
async function saveToDb(db, records, ops, locals, login) {
	let plan;
	try {
		plan = planDbTagEdit(records, ops);
	} catch (e) {
		return fail(400, { error: describe(e) });
	}
	const { written, errors } = await applyDbTagPlan(db, plan, { actor: login });
	clearTagSourceCache();
	if (written) {
		await logAdminAction(db, locals, {
			action: 'tags.edit',
			targetType: 'tags',
			targetId: plan.summary.length === 1 ? plan.summary[0].slice(0, 120) : null,
			summary: `Etiquetas (base): ${plan.summary.join('; ')}`,
			detail: {
				written,
				errors: errors.slice(0, 10),
				tags: plan.changes.map((c) => c.key).slice(0, 30)
			}
		});
	}
	if (errors.length) {
		return fail(409, {
			error: `${written ? 'Se guardó una parte. ' : ''}No se pudo guardar: ${errors.join('; ')}.`
		});
	}
	return { saved: { db: true, commit: '', publish: null, summary: plan.summary, files: written } };
}

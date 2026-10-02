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
import { seriesEnabled } from '$lib/server/flags.js';
import { recordsToRawTags } from '$lib/server/etiquetas/model.js';
import { dbTagsForAdmin, previewDbTagEdit, saveDbTagEdit } from '$lib/server/etiquetas/panel.js';
// The copy of the tag file in this deploy (fallback when the repo client doesn't have it).
import bundledSource from '$lib/utils/hardcodedTags.js?raw';

const NO_PERMISSION =
	'No tenés permiso para editar etiquetas. Probá cerrar sesión y volver a entrar.';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** @param {{locals: App.Locals, url: URL, platform?: App.Platform}} event */
export async function load({ locals, url, platform }) {
	const login = requireAdmin(locals, url).login;
	// Interruptor `series`: el campo "Imagen" (la de la serie) solo se muestra prendido.
	const seriesOn = await seriesEnabled(platform);
	const counts = await usageAndWiki();
	const fromDb = await dbTagsForAdmin(platform, login);
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
	// Una sola lectura de todas las publicaciones (con `contenido_db`, cada una lee la base).
	const metas = await contentMetas();
	for (const c of USAGE_CATEGORIES) usage[c] = await tagUsage(c, metas);
	/** @type {Record<string, string>} */
	const wikiPosts = {};
	for (const p of metas) {
		if (p.category === 'wiki' && p.meta?.wiki) wikiPosts[String(p.meta.wiki)] = p.slug;
	}
	return { usage, wikiPosts };
}

/**
 * Con qué hacer el commit de las publicaciones (renombrar sin alias), o null si no se puede.
 * @param {App.Locals} locals
 * @returns {Promise<import('$lib/server/etiquetas/panel.js').RepoAccess>}
 */
async function repoAccess(locals) {
	const admin = getEventAdmin(locals);
	return admin ? { client: await getRepoClient(), token: admin.token, who: admin.name } : null;
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
		const fromDb = await dbTagsForAdmin(platform, login);
		if (fromDb) {
			// Renombrar sin alias: también cuántas publicaciones cambian (y cómo).
			const res = await previewDbTagEdit(fromDb, r.ops, await repoAccess(locals));
			if (!res.ok) return fail(res.status, { error: res.error });
			return { preview: res.preview };
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
		const fromDb = await dbTagsForAdmin(platform, login);
		if (fromDb) {
			// Interruptor `etiquetas_db`: al momento en la base. Renombrar sin alias, además, un
			// commit que cambia las publicaciones (antes de tocar la base).
			const res = await saveDbTagEdit(fromDb, r.ops, {
				locals,
				login,
				repo: await repoAccess(locals)
			});
			if (!res.ok) return fail(res.status, { error: res.error });
			return {
				saved: {
					db: true,
					commit: res.commit ?? '',
					publish: res.publish,
					summary: res.summary,
					files: res.written,
					posts: res.posts
				}
			};
		}
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

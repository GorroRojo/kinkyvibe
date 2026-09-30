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
// The copy of the tag file in this deploy (fallback when the repo client doesn't have it).
import bundledSource from '$lib/utils/hardcodedTags.js?raw';

const NO_PERMISSION =
	'No tenés permiso para editar etiquetas. Probá cerrar sesión y volver a entrar.';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** @param {{locals: App.Locals, url: URL}} event */
export async function load({ locals, url }) {
	requireAdmin(locals, url);
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
	/** @type {Record<string, Record<string, number>>} */
	const usage = {};
	for (const c of USAGE_CATEGORIES) usage[c] = await tagUsage(c);
	/** @type {Record<string, string>} */
	const wikiPosts = {};
	for (const p of await contentMetas()) {
		if (p.category === 'wiki' && p.meta?.wiki) wikiPosts[String(p.meta.wiki)] = p.slug;
	}
	return { entries, usage, wikiPosts, fromRepo, mock: isMockMode() };
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
	previsualizar: async ({ locals, request, url }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const r = opsFrom(await request.formData());
		if (!r.ops) return fail(400, { error: r.error });
		try {
			const plan = await planTagEdit(await getRepoClient(), admin.token, r.ops, bundledSource);
			return { preview: previewOf(plan) };
		} catch (e) {
			return fail(400, { error: describe(e) });
		}
	},
	guardar: async ({ locals, request, url, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const r = opsFrom(await request.formData());
		if (!r.ops) return fail(400, { error: r.error });
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

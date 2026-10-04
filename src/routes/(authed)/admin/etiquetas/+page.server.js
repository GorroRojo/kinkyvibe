import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { contentMetas, tagUsage } from '$lib/server/admin/content.js';
import { USAGE_CATEGORIES, readOps } from '$lib/utils/tagConfig.js';
import { recordsToRawTags } from '$lib/server/etiquetas/model.js';
import {
	NEEDS_IMPORT,
	dbRepoAccess,
	dbTagsForAdmin,
	previewDbTagEdit,
	saveDbTagEdit
} from '$lib/server/etiquetas/panel.js';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** @param {{locals: App.Locals, url: URL, platform?: App.Platform}} event */
export async function load({ locals, url, platform }) {
	const login = requireAdmin(locals, url).login;
	const counts = await usageAndWiki();
	// Las etiquetas se editan solo en la base (ya no hay commits al archivo de etiquetas).
	const fromDb = await dbTagsForAdmin(platform, login);
	if (!fromDb) throw error(503, NEEDS_IMPORT);
	return {
		entries: recordsToRawTags(fromDb.records),
		...counts,
		fromRepo: false,
		mock: false,
		dbMode: true
	};
}

/** Cuánto se usa cada etiqueta (en los posts del deploy) y qué etiquetas tienen entrada en la wiki. */
async function usageAndWiki() {
	/** @type {Record<string, Record<string, number>>} */
	const usage = {};
	// Una sola lectura de todas las publicaciones (los eventos y el material, de la base).
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
		if (!fromDb) return fail(503, { error: NEEDS_IMPORT });
		// Renombrar sin alias: también cuántas publicaciones cambian (y cómo).
		const res = await previewDbTagEdit(fromDb, r.ops, await dbRepoAccess(locals));
		if (!res.ok) return fail(res.status, { error: res.error });
		return { preview: res.preview };
	},
	guardar: async ({ locals, request, url, platform }) => {
		const login = requireAdmin(locals, url).login;
		const r = opsFrom(await request.formData());
		if (!r.ops) return fail(400, { error: r.error });
		const fromDb = await dbTagsForAdmin(platform, login);
		if (!fromDb) return fail(503, { error: NEEDS_IMPORT });
		// Al momento en la base. Renombrar sin alias, además, cambia las publicaciones (los eventos,
		// el material, los perfiles y la wiki, también en la base: nunca GitHub).
		const res = await saveDbTagEdit(fromDb, r.ops, {
			locals,
			login,
			repo: await dbRepoAccess(locals)
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
};

import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { readOps } from '$lib/utils/tagConfig.js';
import { recordsToRawTags } from '$lib/server/etiquetas/model.js';
import {
	NEEDS_IMPORT,
	dbRepoAccess,
	dbTagsForAdmin,
	previewDbTagEdit,
	saveDbTagEdit
} from '$lib/server/etiquetas/panel.js';
import { tagUsageAndWiki } from '$lib/server/etiquetas/review.js';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** @param {{locals: App.Locals, url: URL, platform?: App.Platform}} event */
export async function load({ locals, url, platform }) {
	const login = requireAdmin(locals, url).login;
	// Lo mismo que cuenta la fila de etiquetas de «Para revisar» (src/lib/server/etiquetas/review.js).
	const counts = await tagUsageAndWiki();
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

/**
 * El cambio que llega del formulario: UNO por vez (decisión de gorrite: cada etiqueta se guarda
 * al momento con su propio «Guardar», sin lista de cambios por guardar). El campo `op` es un solo
 * cambio en JSON (los de src/lib/utils/tagConfig.js); una lista no se acepta.
 * @param {FormData} data
 * @returns {{ ops: import('$lib/utils/tagConfig.js').TagOp[], error?: undefined } | { ops?: undefined, error: string }}
 */
function opFrom(data) {
	let raw;
	try {
		raw = JSON.parse(String(data.get('op') ?? 'null'));
	} catch {
		return { error: 'Cambio inválido.' };
	}
	if (Array.isArray(raw)) return { error: 'Guardá de a un cambio por vez.' };
	if (!raw) return { error: 'No hay cambios.' };
	try {
		return { ops: readOps([raw]) };
	} catch (e) {
		return { error: describe(e) };
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	previsualizar: async ({ locals, request, url, platform }) => {
		const login = requireAdmin(locals, url).login;
		const r = opFrom(await request.formData());
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
		const r = opFrom(await request.formData());
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

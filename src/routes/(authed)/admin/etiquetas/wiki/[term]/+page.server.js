import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { panelAuthor } from '$lib/server/contenido/author.js';
import { loadWikiEditor, readWikiForm, saveWikiPage } from '$lib/server/etiquetas/wikiEditor.js';

/**
 * Etiquetas › «Entrada de la Kinkipedia»: el texto de la wiki de una etiqueta, en la base (se
 * publica al guardar, sin GitHub). Solo admins: el `load` y cada action llaman a `requireAdmin`.
 * La lógica está en src/lib/server/etiquetas/wikiEditor.js.
 */

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'Sin base de datos: no hay dónde guardar la Kinkipedia.');
	const found = await loadWikiEditor(db, params.term);
	if (!found) error(404, 'No hay ninguna etiqueta con esa dirección. Creala primero en Etiquetas.');
	return { tag: found.tag, exists: found.exists, values: found.values };
}

/**
 * @param {import('./$types').RequestEvent} event
 * @param {boolean} remove
 */
async function save({ locals, url, params, platform, request }, remove) {
	const admin = requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) return fail(503, { wiki: { ok: false, message: 'Sin base de datos.' } });
	const found = await loadWikiEditor(db, params.term);
	if (!found) return fail(404, { wiki: { ok: false, message: 'Esa etiqueta ya no existe.' } });
	const values = readWikiForm(await request.formData());
	const result = await saveWikiPage(db, found.object, values, {
		actor: admin.login,
		superadmin: panelAuthor()?.superadmin ?? true,
		remove
	});
	if (!result.ok) {
		return fail(result.status, {
			wiki: { ok: false, message: result.message, conflict: result.conflict ?? false, values }
		});
	}
	await logAdminAction(db, locals, {
		action: remove ? 'wiki.delete' : 'wiki.update',
		targetType: 'tag',
		targetId: found.tag.id,
		summary: remove
			? `Sacó la entrada de la Kinkipedia de «${found.tag.key}»`
			: `Editó la entrada de la Kinkipedia de «${found.tag.key}»`
	});
	return {
		wiki: {
			ok: true,
			message: remove
				? 'Listo: la entrada se sacó (la etiqueta queda).'
				: 'Listo: guardado y publicado.',
			values: null
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	guardar: (event) => save(event, false),
	sacar: (event) => save(event, true)
};
